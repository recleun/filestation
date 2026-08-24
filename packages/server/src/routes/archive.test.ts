import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type Station } from '../app.js';

let dir: string;
let station: Station;
let baseUrl: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'filestation-archive-'));
  station = createApp({ storageDir: dir });
  await station.storage.init();
  await station.app.listen({ port: 0, host: '127.0.0.1' });
  const address = station.app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await station.app.close();
  await rm(dir, { recursive: true, force: true });
});

const SENDER_ID = '11111111-2222-4333-8444-555555555555';
const CLIENT_ID = '22222222-3333-4444-8555-666666666666';

async function upload(payload: string, name: string): Promise<void> {
  const params = new URLSearchParams({
    name,
    senderId: SENDER_ID,
    senderName: 'Alice',
  });
  const res = await station.app.inject({
    method: 'POST',
    url: `/api/files?${params}`,
    payload,
    headers: { 'content-type': 'application/octet-stream' },
  });
  if (res.statusCode !== 201) {
    throw new Error(`upload failed: ${res.statusCode}`);
  }
}

async function fetchArchive(clientId?: string): Promise<Response> {
  const query = clientId === undefined ? '' : `?clientId=${clientId}`;
  return fetch(`${baseUrl}/api/files/archive${query}`);
}

async function responseEntries(res: Response): Promise<Record<string, string>> {
  const raw = new Uint8Array(await res.arrayBuffer());
  expect(Buffer.from(raw).subarray(0, 2).toString('latin1')).toBe('PK');
  const decoded: Record<string, string> = {};
  const decoder = new TextDecoder();
  for (const [name, content] of Object.entries(unzipSync(raw))) {
    decoded[name] = decoder.decode(content);
  }
  return decoded;
}

async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!fn()) {
    if (Date.now() > deadline) {
      throw new Error('condition not met within timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('GET /api/files/archive', () => {
  it('streams a zip containing every stored file', async () => {
    await upload('alpha-payload-123', 'alpha.txt');
    await upload('beta-payload-456', 'beta notes.md');

    const res = await fetchArchive(CLIENT_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');

    const entries = await responseEntries(res);
    expect(Object.keys(entries).sort()).toEqual(['alpha.txt', 'beta notes.md']);
    expect(entries['alpha.txt']).toBe('alpha-payload-123');
    expect(entries['beta notes.md']).toBe('beta-payload-456');

    await waitFor(() => station.inbox.list().every((file) => file.receivers.includes(CLIENT_ID)));
  });

  it('deduplicates identical entry names', async () => {
    await upload('one', 'same.txt');
    await upload('two', 'same.txt');

    const entries = await responseEntries(await fetchArchive());
    expect(Object.keys(entries).sort()).toEqual(['same (2).txt', 'same.txt']);
    expect(Object.values(entries).sort()).toEqual(['one', 'two']);
  });

  it('returns a valid empty zip when the inbox is empty', async () => {
    const res = await fetchArchive();
    expect(res.status).toBe(200);
    const entries = await responseEntries(res);
    expect(Object.keys(entries)).toHaveLength(0);
  });

  it('does not shadow the single-file download route', async () => {
    await upload('payload', 'notes.txt');
    const meta = station.inbox.list()[0];
    if (!meta) {
      throw new Error('expected one file');
    }
    const res = await fetch(`${baseUrl}/api/files/${meta.id}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('payload');
  });
});
