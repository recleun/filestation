import type { ConnectionStatus, ServerEvent, StoredFile } from './types';

function safeParseEvent(raw: string): ServerEvent | null {
  try {
    return JSON.parse(raw) as ServerEvent;
  } catch {
    return null;
  }
}

export function downloadPath(fileId: string, clientId: string): string {
  return `/api/files/${fileId}?clientId=${encodeURIComponent(clientId)}`;
}

export async function deleteRequest(fileId: string): Promise<void> {
  const response = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Delete failed (${response.status})`);
  }
}

export interface UploadOptions {
  senderId: string;
  senderName: string;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export function uploadFile(file: File, options: UploadOptions): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      name: file.name,
      senderId: options.senderId,
      senderName: options.senderName,
    });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/files?${params.toString()}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(event.loaded / event.total);
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as StoredFile);
        } catch {
          reject(new Error('Server returned an invalid upload receipt'));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')));
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}

export interface EventsHandlers {
  onEvent: (event: ServerEvent) => void;
  onStatus: (status: ConnectionStatus) => void;
}

export function connectEvents(handlers: EventsHandlers): () => void {
  let source: EventSource | null = null;
  let retryTimer: number | undefined;
  let retryDelayMs = 1000;
  let disposed = false;

  const open = (): void => {
    handlers.onStatus('connecting');
    source = new EventSource('/api/events');
    source.onopen = () => {
      retryDelayMs = 1000;
      handlers.onStatus('online');
    };
    source.onmessage = (message: MessageEvent<string>) => {
      const event = safeParseEvent(message.data);
      if (event !== null) {
        handlers.onEvent(event);
      }
    };
    source.onerror = () => {
      handlers.onStatus('offline');
      if (source !== null && source.readyState === EventSource.CLOSED) {
        source.close();
        source = null;
        retryTimer = window.setTimeout(() => {
          if (!disposed) {
            open();
          }
        }, retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, 15000);
      }
    };
  };

  open();

  return () => {
    disposed = true;
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
    }
    source?.close();
  };
}
