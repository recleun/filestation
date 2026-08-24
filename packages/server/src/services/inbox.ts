import type { FileStorage } from './storage.js';
import type { InboxEvent, StoredFile } from '../types.js';

export type ChangeListener = (event: InboxEvent) => void;

export class Inbox {
  private readonly files = new Map<string, StoredFile>();
  private readonly listeners = new Set<ChangeListener>();

  constructor(private readonly storage: FileStorage) {}

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: InboxEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // a broken subscriber must not break inbox operations
      }
    }
  }

  async add(meta: StoredFile): Promise<void> {
    await this.storage.writeMeta(meta);
    this.files.set(meta.id, meta);
    this.emit({ type: 'file.added', file: meta });
  }

  get(id: string): StoredFile | undefined {
    return this.files.get(id);
  }

  list(): StoredFile[] {
    return [...this.files.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  count(): number {
    return this.files.size;
  }

  async markReceived(fileId: string, clientId: string): Promise<StoredFile | null> {
    const file = this.files.get(fileId);
    if (!file) {
      return null;
    }
    if (!file.receivers.includes(clientId)) {
      file.receivers.push(clientId);
      await this.storage.writeMeta(file);
      this.emit({ type: 'file.received', fileId, clientId });
    }
    return file;
  }

  async remove(fileId: string): Promise<boolean> {
    if (!this.files.has(fileId)) {
      return false;
    }
    await this.storage.remove(fileId);
    this.files.delete(fileId);
    this.emit({ type: 'file.removed', fileId });
    return true;
  }
}
