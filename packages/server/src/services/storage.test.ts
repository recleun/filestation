import { randomFillSync } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../lib/ids.js';
import type { StoredFile } from '../types.js';
import { FileStorage } from './storage.js';

let dir: string;
let storage: FileStorage;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'filestation-storage-'));
  storage = new FileStorage(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeMeta(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    id: newId(),
    name: 'test.txt',
    size: 11,
    mimeType: 'text/plain',
    senderId: 'sender-1',
    senderName: 'Sender',
    createdAt: Date.now(),
    receivers: [],
    ...overrides,
  };
}

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

describe('init', () => {
  it('creates a fresh directory', async () => {
    await rm(dir, { recursive: true });
    const result = await storage.init();
    expect(result.leftoversRemoved).toBe(0);
    expect(await readdir(dir)).toEqual([]);
  });

  it('wipes leftovers from previous runs and reports the count', async () => {
    await writeFile(join(dir, 'stale.bin'), 'x');
    await writeFile(join(dir, 'stale.json'), '{}');
    await mkdir(join(dir, 'stale-dir'));
    const result = await storage.init();
    expect(result.leftoversRemoved).toBe(3);
    expect(await readdir(dir)).toEqual([]);
  });
});

describe('blobs', () => {
  it('round-trips small blobs and reports their size', async () => {
    await storage.init();
    const id = newId();
    const payload = Buffer.from('hello world');
    const size = await storage.importBlob(id, Readable.from(payload));
    expect(size).toBe(payload.length);
    expect(await storage.has(id)).toBe(true);
    const out = await drain(storage.blobStream(id));
    expect(out.equals(payload)).toBe(true);
  });

  it('round-trips multi-chunk payloads byte for byte', async () => {
    await storage.init();
    const id = newId();
    const payload = randomFillSync(Buffer.alloc(3 * 1024 * 1024 + 7));
    const size = await storage.importBlob(id, Readable.from(payload));
    expect(size).toBe(payload.length);
    const out = await drain(storage.blobStream(id));
    expect(out.equals(payload)).toBe(true);
  });

  it('leaves no part files when the source fails mid-stream', async () => {
    await storage.init();
    const id = newId();
    const source = new PassThrough();
    const promise = storage.importBlob(id, source);
    source.write(Buffer.from('partial data'));
    source.destroy(new Error('aborted'));
    await expect(promise).rejects.toThrow();
    expect(await storage.has(id)).toBe(false);
    const parts = (await readdir(dir)).filter((entry) => entry.endsWith('.part'));
    expect(parts).toEqual([]);
  });
});

describe('metadata', () => {
  it('writes, reads, and lists metadata', async () => {
    await storage.init();
    const a = makeMeta({ createdAt: 1 });
    const b = makeMeta({ createdAt: 2 });
    await storage.writeMeta(a);
    await storage.writeMeta(b);

    expect(await storage.readMeta(a.id)).toEqual(a);

    const listed = await storage.listMeta();
    expect(listed).toHaveLength(2);
    expect(listed.map((meta) => meta.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('returns null for missing or invalid ids', async () => {
    await storage.init();
    expect(await storage.readMeta(newId())).toBeNull();
    expect(await storage.readMeta('../escape')).toBeNull();
  });

  it('ignores junk json entries when listing', async () => {
    await storage.init();
    await writeFile(join(dir, 'not-an-id.json'), '{"broken":true}');
    expect(await storage.listMeta()).toEqual([]);
  });

  it('removes blob and sidecar together', async () => {
    await storage.init();
    const id = newId();
    await storage.importBlob(id, Readable.from(Buffer.from('data')));
    await storage.writeMeta(makeMeta({ id }));
    await storage.remove(id);
    expect(await storage.has(id)).toBe(false);
    expect(await storage.readMeta(id)).toBeNull();
  });
});

describe('validation', () => {
  it('rejects invalid ids on every path-taking operation', async () => {
    await storage.init();
    expect(() => storage.blobStream('../evil')).toThrow();
    await expect(storage.writeMeta(makeMeta({ id: 'nope' }))).rejects.toThrow();
    await expect(storage.remove('../evil')).rejects.toThrow();
    await expect(storage.importBlob('nope', Readable.from(Buffer.from('x')))).rejects.toThrow();
    expect(await storage.has('../evil')).toBe(false);
  });
});
