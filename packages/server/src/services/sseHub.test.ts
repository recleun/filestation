import type { ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { SseHub } from './sseHub.js';

interface FakeResponse extends EventEmitter {
  writableEnded: boolean;
  destroyed: boolean;
  written: string;
  write(chunk: string): boolean;
  end(): void;
}

function fakeResponse(): FakeResponse {
  const res = new EventEmitter() as FakeResponse;
  res.writableEnded = false;
  res.destroyed = false;
  res.written = '';
  res.write = (chunk: string) => {
    if (res.writableEnded || res.destroyed) {
      return false;
    }
    res.written += chunk;
    return true;
  };
  res.end = () => {
    if (!res.writableEnded) {
      res.writableEnded = true;
      queueMicrotask(() => res.emit('close'));
    }
  };
  return res;
}

function asServerResponse(fake: FakeResponse): ServerResponse {
  return fake as unknown as ServerResponse;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SseHub', () => {
  it('sends a targeted snapshot to one connection', () => {
    const hub = new SseHub(0);
    const fake = fakeResponse();
    const id = hub.attach(asServerResponse(fake));

    hub.sendSnapshot(id, { type: 'state', files: [] });

    expect(fake.written).toBe('data: {"type":"state","files":[]}\n\n');
  });

  it('broadcasts to every connected client', () => {
    const hub = new SseHub(0);
    const a = fakeResponse();
    const b = fakeResponse();
    hub.attach(asServerResponse(a));
    hub.attach(asServerResponse(b));

    hub.broadcast({ type: 'file.added' });

    expect(a.written).toBe('data: {"type":"file.added"}\n\n');
    expect(b.written).toBe('data: {"type":"file.added"}\n\n');
  });

  it('detaches connections when their response closes', () => {
    const hub = new SseHub(0);
    const fake = fakeResponse();
    const res = asServerResponse(fake);
    hub.attach(res);
    expect(hub.size).toBe(1);

    fake.emit('close');

    expect(hub.size).toBe(0);
  });

  it('prunes destroyed or ended responses on write attempts', () => {
    const hub = new SseHub(0);
    const fake = fakeResponse();
    hub.attach(asServerResponse(fake));
    fake.destroyed = true;

    hub.broadcast({ type: 'file.removed' });

    expect(hub.size).toBe(0);
  });

  it('ends every stream and clears state on closeAll', async () => {
    const hub = new SseHub(0);
    const fakes = [fakeResponse(), fakeResponse()];
    for (const fake of fakes) {
      hub.attach(asServerResponse(fake));
    }

    await hub.closeAll();

    expect(hub.size).toBe(0);
    for (const fake of fakes) {
      expect(fake.writableEnded).toBe(true);
    }
  });

  it('writes heartbeat comments while clients are connected', async () => {
    const hub = new SseHub(30);
    const fake = fakeResponse();
    hub.attach(asServerResponse(fake));

    await sleep(100);

    expect(fake.written).toContain(': ping\n\n');
    hub.closeAll();
  });

  it('never schedules a heartbeat when heartbeatMs is zero', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const hub = new SseHub(0);
    hub.attach(asServerResponse(fakeResponse()));

    await sleep(40);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
