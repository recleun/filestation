import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import { isValidId } from '../lib/ids.js';
import type { StoredFile } from '../types.js';

export class FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async init(): Promise<{ leftoversRemoved: number }> {
    await mkdir(this.root, { recursive: true });
    const leftoversRemoved = await this.wipe();
    return { leftoversRemoved };
  }

  async wipe(): Promise<number> {
    const entries = await readdir(this.root).catch(() => [] as string[]);
    for (const entry of entries) {
      await rm(join(this.root, entry), { recursive: true, force: true });
    }
    return entries.length;
  }

  async importBlob(id: string, source: Readable): Promise<number> {
    this.assertValidId(id);
    let size = 0;
    const counter = new Transform({
      transform(chunk: unknown, _encoding: BufferEncoding, callback) {
        size += (chunk as Buffer).length;
        callback(null, chunk);
      },
    });
    const partPath = this.partPath(id);
    try {
      await pipeline(source, counter, createWriteStream(partPath));
      await rename(partPath, this.blobPath(id));
    } catch (err) {
      await rm(partPath, { force: true });
      throw err;
    }
    return size;
  }

  blobStream(id: string): Readable {
    this.assertValidId(id);
    return createReadStream(this.blobPath(id));
  }

  async has(id: string): Promise<boolean> {
    if (!isValidId(id)) {
      return false;
    }
    try {
      await stat(this.blobPath(id));
      return true;
    } catch {
      return false;
    }
  }

  async writeMeta(meta: StoredFile): Promise<void> {
    this.assertValidId(meta.id);
    await writeFile(this.metaPath(meta.id), JSON.stringify(meta), 'utf8');
  }

  async readMeta(id: string): Promise<StoredFile | null> {
    if (!isValidId(id)) {
      return null;
    }
    try {
      const raw = await readFile(this.metaPath(id), 'utf8');
      return JSON.parse(raw) as StoredFile;
    } catch {
      return null;
    }
  }

  async listMeta(): Promise<StoredFile[]> {
    const entries = await readdir(this.root).catch(() => [] as string[]);
    const metas: StoredFile[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue;
      }
      const meta = await this.readMeta(entry.slice(0, -'.json'.length));
      if (meta !== null) {
        metas.push(meta);
      }
    }
    return metas;
  }

  async remove(id: string): Promise<void> {
    this.assertValidId(id);
    await rm(this.blobPath(id), { force: true });
    await rm(this.metaPath(id), { force: true });
  }

  private partPath(id: string): string {
    return join(this.root, `${id}.bin.part`);
  }

  private blobPath(id: string): string {
    return join(this.root, `${id}.bin`);
  }

  private metaPath(id: string): string {
    return join(this.root, `${id}.json`);
  }

  private assertValidId(id: string): void {
    if (!isValidId(id)) {
      throw new Error(`invalid file id: ${String(id)}`);
    }
  }
}
