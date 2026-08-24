import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerArchiveRoute } from './routes/archive.js';
import { registerEventRoutes } from './routes/events.js';
import { registerFileRoutes } from './routes/files.js';
import { Inbox } from './services/inbox.js';
import { FileStorage } from './services/storage.js';
import { SseHub } from './services/sseHub.js';

export interface CreateAppOptions {
  storageDir: string;
  logger?: boolean;
  sseHeartbeatMs?: number;
  staticRoot?: string;
}

export interface Station {
  app: FastifyInstance;
  storage: FileStorage;
  inbox: Inbox;
  hub: SseHub;
  staticEnabled: boolean;
}

function defaultWebDist(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), 'public');
}

export function createApp(options: CreateAppOptions): Station {
  const app = Fastify({
    logger: options.logger ?? false,
    forceCloseConnections: true,
  });

  app.addContentTypeParser('*', (_req, body, done) => {
    done(null, body);
  });

  app.addContentTypeParser('text/plain', (_req, body, done) => {
    done(null, body);
  });

  const storage = new FileStorage(options.storageDir);
  const inbox = new Inbox(storage);
  const hub = new SseHub(options.sseHeartbeatMs ?? 25000);

  registerFileRoutes(app, { storage, inbox });
  registerArchiveRoute(app, { storage, inbox });
  registerEventRoutes(app, { inbox, hub });

  const staticRoot = options.staticRoot ?? defaultWebDist();
  let staticEnabled = false;
  if (existsSync(staticRoot)) {
    app.register(fastifyStatic, { root: staticRoot, prefix: '/' });
    staticEnabled = true;
  }

  app.setNotFoundHandler((req, reply) => {
    if (staticEnabled && req.method === 'GET' && !(req.raw.url ?? '').startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found' });
  });

  app.addHook('onClose', async () => {
    hub.closeAll();
  });

  return { app, storage, inbox, hub, staticEnabled };
}
