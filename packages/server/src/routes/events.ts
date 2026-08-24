import type { FastifyInstance } from 'fastify';
import type { Inbox } from '../services/inbox.js';
import type { SseHub } from '../services/sseHub.js';

export interface EventRouteContext {
  inbox: Inbox;
  hub: SseHub;
}

export function registerEventRoutes(app: FastifyInstance, ctx: EventRouteContext): void {
  const { inbox, hub } = ctx;

  const unsubscribe = inbox.onChange((event) => {
    hub.broadcast(event);
  });

  app.addHook('onClose', async () => {
    unsubscribe();
  });

  app.get('/api/events', (_req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const connectionId = hub.attach(res);
    hub.sendSnapshot(connectionId, { type: 'state', files: inbox.list() });
  });
}
