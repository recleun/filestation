import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type Station } from '../app.js';
import { newId } from '../lib/ids.js';
import type { StoredFile } from '../types.js';

let dir: string;
let station: Station;
let baseUrl: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'filestation-sse-'));
  station = createApp({ storageDir: dir, sseHeartbeatMs: 60 });
  await station.storage.init();
  await station.app.listen({ port: 0, host: '127.0.0.1' });
  const address = station.app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  station.hub.closeAll();
  try {
    await station.app.close();
  } catch {
    // already closed by the test itself
  }
  await rm(dir, { recursive: true, force: true });
});

function makeMeta(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    id: newId(),
    name: 'sse-test.txt',
    size: 3,
    mimeType: 'text/plain',
    senderId: 'sender-1',
    senderName: 'Sender',
    createdAt: Date.now(),
    receivers: [],
    ...overrides,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class SseReader {
  private buffer = '';
  private readonly decoder = new TextDecoder();

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async nextFrame(): Promise<string | null> {
    for (;;) {
      const boundary = this.buffer.indexOf('\n\n');
      if (boundary !== -1) {
        const frame = this.buffer.slice(0, boundary);
        this.buffer = this.buffer.slice(boundary + 2);
        return frame;
      }
      const { done, value } = await this.reader.read();
      if (done) {
        return null;
      }
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  rawRead() {
    return this.reader.read();
  }

  async nextData<T>(): Promise<T | null> {
    for (;;) {
      const frame = await this.nextFrame();
      if (frame === null) {
        return null;
      }
      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine) {
        continue;
      }
      return JSON.parse(dataLine.slice('data:'.length).trim()) as T;
    }
  }

  async readRaw(onChunk: (text: string) => boolean, timeoutMs = 3000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (onChunk(this.buffer)) {
        const matched = this.buffer;
        this.buffer = '';
        return matched;
      }
      if (Date.now() > deadline) {
        throw new Error('timed out waiting for matching chunk');
      }
      const { done, value } = await this.reader.read();
      if (done) {
        throw new Error('stream ended before matching chunk');
      }
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }
}

async function openEvents(): Promise<{
  response: Response;
  reader: SseReader;
  abort: () => void;
}> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/events`, {
    signal: controller.signal,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const reader = new SseReader(response.body!.getReader());
  return { response, reader, abort: () => controller.abort() };
}

describe('/api/events', () => {
  it('sends an initial snapshot then broadcasts inbox events live', async () => {
    const { reader, abort } = await openEvents();

    const snapshot = await reader.nextData<{ type: string; files: unknown[] }>();
    expect(snapshot?.type).toBe('state');
    expect(snapshot?.files).toEqual([]);

    const meta = makeMeta();
    await station.inbox.add(meta);

    const added = await reader.nextData<{ type: string; file: { id: string } }>();
    expect(added?.type).toBe('file.added');
    expect(added?.file.id).toBe(meta.id);

    await station.inbox.markReceived(meta.id, 'device-a');
    const received = await reader.nextData<{ type: string }>();
    expect(received).toMatchObject({
      type: 'file.received',
      fileId: meta.id,
      clientId: 'device-a',
    });

    await station.inbox.remove(meta.id);
    const removed = await reader.nextData<{ type: string }>();
    expect(removed).toMatchObject({ type: 'file.removed', fileId: meta.id });

    abort();
  });

  it('delivers broadcasts to multiple clients at once', async () => {
    const first = await openEvents();
    const second = await openEvents();

    await first.reader.nextData();
    await second.reader.nextData();
    expect(station.hub.size).toBe(2);

    const meta = makeMeta();
    await station.inbox.add(meta);

    const fromFirst = await first.reader.nextData<{ type: string }>();
    const fromSecond = await second.reader.nextData<{ type: string }>();
    expect(fromFirst?.type).toBe('file.added');
    expect(fromSecond?.type).toBe('file.added');

    first.abort();
    second.abort();
  });

  it('cleans up hub state when a client disconnects', async () => {
    const first = await openEvents();
    const second = await openEvents();
    await first.reader.nextData();
    await second.reader.nextData();
    expect(station.hub.size).toBe(2);

    first.abort();

    const deadline = Date.now() + 2000;
    while (station.hub.size !== 1 && Date.now() < deadline) {
      await sleep(20);
    }
    expect(station.hub.size).toBe(1);

    second.abort();
  });

  it('sends heartbeat comments on idle connections', async () => {
    const { reader, abort } = await openEvents();

    let sawPing = false;
    let sawSnapshot = false;
    await reader.readRaw((text) => {
      if (text.includes(': ping')) {
        sawPing = true;
      }
      if (text.includes('"type":"state"')) {
        sawSnapshot = true;
      }
      return sawPing && sawSnapshot;
    });

    expect(sawSnapshot).toBe(true);
    expect(sawPing).toBe(true);
    abort();
  });

  it('ends client streams when the hub closes', async () => {
    const { reader, abort } = await openEvents();
    await reader.nextData();

    station.hub.closeAll();

    const result = await reader.rawRead();
    expect(result.done).toBe(true);
    expect(station.hub.size).toBe(0);
    abort();
  });

  it('does not block server close while streams are open', async () => {
    const { abort } = await openEvents();

    await station.app.close();

    expect(station.hub.size).toBe(0);
    abort();
  });
});
