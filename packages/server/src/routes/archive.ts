import archiver from 'archiver';
import type { FastifyInstance } from 'fastify';
import { isValidClientId } from '../lib/ids.js';
import { contentDisposition, sanitizeFileName } from '../lib/sanitize.js';
import type { RouteContext } from './files.js';

interface ArchiveQuery {
  clientId?: string | string[];
}

function queryString(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function uniqueEntryName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function registerArchiveRoute(app: FastifyInstance, ctx: RouteContext): void {
  const { storage, inbox } = ctx;

  app.get<{ Querystring: ArchiveQuery }>('/api/files/archive', async (req, reply) => {
    const files = inbox.list();
    const rawClientId = queryString(req.query.clientId);
    const markAll = rawClientId !== null && isValidClientId(rawClientId) ? rawClientId : null;

    reply.hijack();
    req.raw.on('error', () => undefined);
    req.raw.on('close', () => archive.abort());

    const archive = archiver('zip');
    archive.on('warning', () => undefined);
    archive.on('error', () => {
      reply.raw.destroy();
    });

    reply.raw.setHeader('content-type', 'application/zip');
    reply.raw.setHeader(
      'content-disposition',
      contentDisposition(sanitizeFileName(`filestation-${stamp()}.zip`)),
    );
    archive.pipe(reply.raw);

    const usedNames = new Set<string>();
    for (const meta of files) {
      if (!(await storage.has(meta.id))) {
        continue;
      }
      archive.append(storage.blobStream(meta.id), {
        name: uniqueEntryName(meta.name, usedNames),
      });
      if (markAll !== null) {
        void inbox.markReceived(meta.id, markAll).catch(() => undefined);
      }
    }

    await archive.finalize();
  });
}
