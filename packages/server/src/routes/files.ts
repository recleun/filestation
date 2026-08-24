import type { FastifyInstance, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { isValidClientId, isValidId, newId } from '../lib/ids.js';
import {
  contentDisposition,
  sanitizeDisplayName,
  sanitizeFileName,
  sanitizeMimeType,
} from '../lib/sanitize.js';
import type { Inbox } from '../services/inbox.js';
import type { FileStorage } from '../services/storage.js';
import type { StoredFile } from '../types.js';

export interface RouteContext {
  storage: FileStorage;
  inbox: Inbox;
}

interface UploadQuery {
  name?: string | string[];
  senderId?: string | string[];
  senderName?: string | string[];
}

interface DownloadQuery {
  clientId?: string | string[];
}

interface FileParams {
  id: string;
}

function queryString(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function fail(reply: FastifyReply, code: number, message: string): FastifyReply {
  return reply.code(code).send({ error: message });
}

export function registerFileRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { storage, inbox } = ctx;

  app.get('/api/state', async () => ({
    serverTime: Date.now(),
    files: inbox.list(),
  }));

  app.post<{ Querystring: UploadQuery }>('/api/files', async (req, reply) => {
    const rawName = queryString(req.query.name);
    if (rawName === null || rawName.trim().length === 0) {
      return fail(reply, 400, 'missing required query parameter: name');
    }
    const rawSenderId = queryString(req.query.senderId);
    if (rawSenderId === null || rawSenderId.trim().length === 0) {
      return fail(reply, 400, 'missing required query parameter: senderId');
    }
    const body = req.body;
    if (!(body instanceof Readable)) {
      return fail(reply, 400, 'expected a binary request body');
    }

    const meta: StoredFile = {
      id: newId(),
      name: sanitizeFileName(rawName),
      size: 0,
      mimeType: sanitizeMimeType(req.headers['content-type']),
      senderId: sanitizeDisplayName(rawSenderId),
      senderName: sanitizeDisplayName(queryString(req.query.senderName) ?? ''),
      createdAt: Date.now(),
      receivers: [],
    };

    try {
      meta.size = await storage.importBlob(meta.id, body);
    } catch {
      return fail(reply, 400, 'upload failed or was aborted');
    }

    try {
      await inbox.add(meta);
    } catch (err) {
      await storage.remove(meta.id).catch(() => undefined);
      throw err;
    }

    return reply.code(201).send(meta);
  });

  app.get<{ Params: FileParams; Querystring: DownloadQuery }>(
    '/api/files/:id',
    async (req, reply) => {
      const { id } = req.params;
      if (!isValidId(id)) {
        return fail(reply, 404, 'file not found');
      }
      const meta = inbox.get(id);
      if (!meta || !(await storage.has(id))) {
        return fail(reply, 404, 'file not found');
      }

      const clientId = queryString(req.query.clientId);
      const stream = storage.blobStream(id);
      if (clientId !== null && isValidClientId(clientId)) {
        stream.on('end', () => {
          void inbox.markReceived(id, clientId).catch(() => undefined);
        });
      }

      reply.header('content-type', meta.mimeType);
      reply.header('content-length', meta.size);
      reply.header('content-disposition', contentDisposition(meta.name));
      return reply.send(stream);
    },
  );

  app.post<{ Params: FileParams }>('/api/files/:id/received', async (req, reply) => {
    const { id } = req.params;
    if (!isValidId(id)) {
      return fail(reply, 404, 'file not found');
    }
    const body = req.body as { clientId?: unknown } | undefined;
    const clientId = typeof body?.clientId === 'string' ? body.clientId : null;
    if (clientId === null || !isValidClientId(clientId)) {
      return fail(reply, 400, 'a valid clientId is required');
    }
    const file = await inbox.markReceived(id, clientId);
    if (!file) {
      return fail(reply, 404, 'file not found');
    }
    return file;
  });

  app.delete<{ Params: FileParams }>('/api/files/:id', async (req, reply) => {
    const { id } = req.params;
    if (!isValidId(id)) {
      return fail(reply, 404, 'file not found');
    }
    const removed = await inbox.remove(id);
    if (!removed) {
      return fail(reply, 404, 'file not found');
    }
    return { ok: true };
  });
}
