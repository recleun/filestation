import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type Station } from '../app.js';
import { newId } from '../lib/ids.js';

let dir: string;
let station: Station;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'filestation-routes-'));
  station = createApp({ storageDir: dir });
  await station.storage.init();
});

afterEach(async () => {
  await station.app.close();
  await rm(dir, { recursive: true, force: true });
});

const SENDER_ID = '11111111-2222-4333-8444-555555555555';

async function upload(
  payload: Buffer | string,
  query: Record<string, string>,
  contentType = 'application/octet-stream',
) {
  const params = new URLSearchParams(query).toString();
  return station.app.inject({
    method: 'POST',
    url: `/api/files?${params}`,
    payload,
    headers: { 'content-type': contentType },
  });
}

async function untilDefined<T>(fn: () => T | undefined, timeoutMs = 2000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = fn();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error('condition not met within timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('POST /api/files', () => {
  it('stores an upload and returns its metadata', async () => {
    const payload = Buffer.from('file body here');
    const res = await upload(
      payload,
      {
        name: 'notes.txt',
        senderId: SENDER_ID,
        senderName: 'Alice',
      },
      'text/plain',
    );

    expect(res.statusCode).toBe(201);
    const meta = res.json();
    expect(meta.name).toBe('notes.txt');
    expect(meta.size).toBe(payload.length);
    expect(meta.mimeType).toBe('text/plain');
    expect(meta.senderName).toBe('Alice');
    expect(meta.receivers).toEqual([]);
    expect(station.inbox.count()).toBe(1);
  });

  it('sanitizes hostile file names', async () => {
    const res = await upload(Buffer.from('x'), {
      name: '../../evil name.txt',
      senderId: SENDER_ID,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('evil name.txt');
  });

  it('defaults the sender name when absent', async () => {
    const res = await upload(Buffer.from('x'), { name: 'a.txt', senderId: SENDER_ID });
    expect(res.json().senderName).toBe('anonymous');
  });

  it('requires the name and senderId parameters', async () => {
    const noName = await upload(Buffer.from('x'), { senderId: SENDER_ID });
    expect(noName.statusCode).toBe(400);

    const noSender = await upload(Buffer.from('x'), { name: 'a.txt' });
    expect(noSender.statusCode).toBe(400);
  });
});

describe('GET /api/state', () => {
  it('lists uploaded files with server time', async () => {
    await upload(Buffer.from('one'), { name: 'one.txt', senderId: SENDER_ID });
    await upload(Buffer.from('two'), { name: 'two.txt', senderId: SENDER_ID });

    const res = await station.app.inject({ method: 'GET', url: '/api/state' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.serverTime).toBe('number');
    expect(body.files.map((file: { name: string }) => file.name).sort()).toEqual([
      'one.txt',
      'two.txt',
    ]);
  });
});

describe('GET /api/files/:id', () => {
  it('streams the blob with download headers and marks received', async () => {
    const payload = Buffer.from('download me');
    const upRes = await upload(
      payload,
      {
        name: 'résumé.txt',
        senderId: SENDER_ID,
      },
      'text/plain',
    );
    const meta = upRes.json();

    const dl = await station.app.inject({
      method: 'GET',
      url: `/api/files/${meta.id}?clientId=device-1`,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toBe('text/plain');
    expect(dl.headers['content-length']).toBe(String(payload.length));
    expect(String(dl.headers['content-disposition'])).toContain(
      `filename*=UTF-8''${encodeURIComponent('résumé.txt')}`,
    );
    expect(dl.rawPayload.equals(payload)).toBe(true);

    const state = await station.app.inject({ method: 'GET', url: '/api/state' });
    const files: Array<{ id: string; receivers: string[] }> = state.json().files;
    const match = await untilDefined(() =>
      files.find((file) => file.id === meta.id)?.receivers.includes('device-1')
        ? files.find((file) => file.id === meta.id)
        : undefined,
    );
    expect(match?.receivers).toEqual(['device-1']);
  });

  it('does not mark received without a clientId', async () => {
    const upRes = await upload(Buffer.from('y'), { name: 'b.txt', senderId: SENDER_ID });
    const meta = upRes.json();
    await station.app.inject({ method: 'GET', url: `/api/files/${meta.id}` });
    const state = await station.app.inject({ method: 'GET', url: '/api/state' });
    expect(state.json().files[0]?.receivers).toEqual([]);
  });

  it('responds 404 for unknown or malformed ids', async () => {
    const malformed = await station.app.inject({
      method: 'GET',
      url: '/api/files/not-a-uuid',
    });
    expect(malformed.statusCode).toBe(404);

    const unknown = await station.app.inject({
      method: 'GET',
      url: `/api/files/${newId()}`,
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('POST /api/files/:id/received', () => {
  it('acks downloads idempotently and validates input', async () => {
    const upRes = await upload(Buffer.from('z'), { name: 'c.txt', senderId: SENDER_ID });
    const meta = upRes.json();

    const first = await station.app.inject({
      method: 'POST',
      url: `/api/files/${meta.id}/received`,
      payload: { clientId: 'device-9' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().receivers).toEqual(['device-9']);

    const again = await station.app.inject({
      method: 'POST',
      url: `/api/files/${meta.id}/received`,
      payload: { clientId: 'device-9' },
    });
    expect(again.json().receivers).toEqual(['device-9']);

    const badBody = await station.app.inject({
      method: 'POST',
      url: `/api/files/${meta.id}/received`,
      payload: {},
    });
    expect(badBody.statusCode).toBe(400);

    const missing = await station.app.inject({
      method: 'POST',
      url: `/api/files/${newId()}/received`,
      payload: { clientId: 'device-1' },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('DELETE /api/files/:id', () => {
  it('removes the file and then responds 404', async () => {
    const upRes = await upload(Buffer.from('d'), { name: 'd.txt', senderId: SENDER_ID });
    const meta = upRes.json();

    const del = await station.app.inject({
      method: 'DELETE',
      url: `/api/files/${meta.id}`,
    });
    expect(del.statusCode).toBe(200);
    expect(station.inbox.count()).toBe(0);

    const gone = await station.app.inject({ method: 'GET', url: `/api/files/${meta.id}` });
    expect(gone.statusCode).toBe(404);

    const repeat = await station.app.inject({
      method: 'DELETE',
      url: `/api/files/${meta.id}`,
    });
    expect(repeat.statusCode).toBe(404);
  });
});
