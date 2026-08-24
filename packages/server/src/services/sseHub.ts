import type { ServerResponse } from 'node:http';

export class SseHub {
  private readonly connections = new Map<number, ServerResponse>();
  private nextId = 1;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(private readonly heartbeatMs = 25000) {}

  get size(): number {
    return this.connections.size;
  }

  attach(res: ServerResponse): number {
    const id = this.nextId++;
    this.connections.set(id, res);
    res.once('close', () => {
      this.detach(id);
    });
    this.ensureHeartbeat();
    return id;
  }

  detach(id: number): void {
    this.connections.delete(id);
    if (this.connections.size === 0) {
      this.stopHeartbeat();
    }
  }

  sendSnapshot(id: number, payload: unknown): void {
    this.writeTo(id, formatData(payload));
  }

  broadcast(payload: unknown): void {
    const chunk = formatData(payload);
    for (const id of [...this.connections.keys()]) {
      this.writeTo(id, chunk);
    }
  }

  closeAll(): void {
    this.stopHeartbeat();
    for (const [, res] of this.connections) {
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
    this.connections.clear();
  }

  private writeTo(id: number, chunk: string): void {
    const res = this.connections.get(id);
    if (!res) {
      return;
    }
    if (res.writableEnded || res.destroyed) {
      this.detach(id);
      return;
    }
    res.write(chunk);
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer || this.heartbeatMs <= 0) {
      return;
    }
    this.heartbeatTimer = setInterval(() => {
      for (const id of [...this.connections.keys()]) {
        this.writeTo(id, ': ping\n\n');
      }
    }, this.heartbeatMs);
    this.heartbeatTimer.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}

function formatData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
