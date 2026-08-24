import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../lib/ids.js';
import type { InboxEvent, StoredFile } from '../types.js';
import { Inbox } from './inbox.js';
import { FileStorage } from './storage.js';

let dir: string;
let storage: FileStorage;
let inbox: Inbox;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'filestation-inbox-'));
  storage = new FileStorage(dir);
  await storage.init();
  inbox = new Inbox(storage);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeMeta(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    id: newId(),
    name: 'test.txt',
    size: 42,
    mimeType: 'text/plain',
    senderId: 'sender-1',
    senderName: 'Sender',
    createdAt: Date.now(),
    receivers: [],
    ...overrides,
  };
}

describe('add/get/list/count', () => {
  it('stores and retrieves files', async () => {
    const meta = makeMeta();
    await inbox.add(meta);
    expect(inbox.get(meta.id)?.id).toBe(meta.id);
    expect(inbox.count()).toBe(1);
  });

  it('lists newest first', async () => {
    const older = makeMeta({ createdAt: 1000 });
    const newer = makeMeta({ createdAt: 2000 });
    await inbox.add(older);
    await inbox.add(newer);
    expect(inbox.list().map((file) => file.id)).toEqual([newer.id, older.id]);
  });

  it('returns undefined for unknown ids', async () => {
    expect(inbox.get(newId())).toBeUndefined();
  });
});

describe('markReceived', () => {
  it('records each receiver once and persists them', async () => {
    const meta = makeMeta();
    await inbox.add(meta);

    const afterFirst = (await inbox.markReceived(meta.id, 'device-a'))?.receivers.slice();
    const afterRepeat = (await inbox.markReceived(meta.id, 'device-a'))?.receivers.slice();
    const afterSecond = (await inbox.markReceived(meta.id, 'device-b'))?.receivers.slice();

    expect(afterFirst).toEqual(['device-a']);
    expect(afterRepeat).toEqual(['device-a']);
    expect(afterSecond).toEqual(['device-a', 'device-b']);

    const persisted = await storage.readMeta(meta.id);
    expect(persisted?.receivers).toEqual(['device-a', 'device-b']);
  });

  it('returns null for unknown files', async () => {
    expect(await inbox.markReceived(newId(), 'device-a')).toBeNull();
  });
});

describe('remove', () => {
  it('deletes from memory and disk and reports duplicates as false', async () => {
    const meta = makeMeta();
    await inbox.add(meta);

    expect(await inbox.remove(meta.id)).toBe(true);
    expect(inbox.get(meta.id)).toBeUndefined();
    expect(await storage.has(meta.id)).toBe(false);
    expect(await inbox.remove(meta.id)).toBe(false);
  });
});

describe('events', () => {
  it('emits added/received/removed to subscribers in order', async () => {
    const events: InboxEvent[] = [];
    inbox.onChange((event) => events.push(event));

    const meta = makeMeta();
    await inbox.add(meta);
    await inbox.markReceived(meta.id, 'device-a');
    await inbox.remove(meta.id);

    expect(events.map((event) => event.type)).toEqual([
      'file.added',
      'file.received',
      'file.removed',
    ]);
    expect(events[0]).toMatchObject({ type: 'file.added', file: meta });
    expect(events[1]).toMatchObject({ fileId: meta.id, clientId: 'device-a' });
    expect(events[2]).toMatchObject({ fileId: meta.id });
  });

  it('stops emitting after unsubscribe and survives throwing listeners', async () => {
    const events: InboxEvent[] = [];
    const unsubscribe = inbox.onChange((event) => events.push(event));
    inbox.onChange(() => {
      throw new Error('broken listener');
    });

    await inbox.add(makeMeta());
    unsubscribe();
    await inbox.add(makeMeta());

    expect(events).toHaveLength(1);
  });
});
