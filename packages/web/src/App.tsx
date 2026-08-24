import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { connectEvents, deleteRequest, uploadFile } from './api';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { Header } from './components/Header';
import { SharePanel } from './components/SharePanel';
import { UploadQueue, type UploadTask } from './components/UploadQueue';
import { loadClientId, loadClientName, saveClientName } from './identity';
import type { ConnectionStatus, ServerEvent, StoredFile } from './types';

function sortByNewest(files: StoredFile[]): StoredFile[] {
  return [...files].sort((a, b) => b.createdAt - a.createdAt);
}

function inboxReducer(files: StoredFile[], event: ServerEvent): StoredFile[] {
  switch (event.type) {
    case 'state':
      return sortByNewest(event.files);
    case 'file.added':
      return sortByNewest([...files.filter((file) => file.id !== event.file.id), event.file]);
    case 'file.removed':
      return files.filter((file) => file.id !== event.fileId);
    case 'file.received':
      return files.map((file) =>
        file.id === event.fileId && !file.receivers.includes(event.clientId)
          ? { ...file, receivers: [...file.receivers, event.clientId] }
          : file,
      );
  }
}

let uploadKeyCounter = 0;

export default function App() {
  const [files, applyEvent] = useReducer(inboxReducer, [] as StoredFile[]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const clientId = useMemo(() => loadClientId(), []);
  const [clientName, setClientName] = useState(() => loadClientName());

  useEffect(() => {
    return connectEvents({ onEvent: applyEvent, onStatus: setStatus });
  }, []);

  const renameClient = useCallback((raw: string) => {
    setClientName(saveClientName(raw));
  }, []);

  const patchTask = useCallback((key: string, patch: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((task) => (task.key === key ? { ...task, ...patch } : task)));
  }, []);

  const startUploads = useCallback(
    (selected: File[]) => {
      if (selected.length === 0) {
        return;
      }
      const newTasks = selected.map((file) => {
        uploadKeyCounter += 1;
        return {
          key: `upload-${uploadKeyCounter}`,
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'uploading' as const,
          controller: new AbortController(),
        };
      });
      setTasks((prev) => [...prev, ...newTasks]);

      selected.forEach((file, index) => {
        const task = newTasks[index];
        if (!task) {
          return;
        }
        uploadFile(file, {
          senderId: clientId,
          senderName: clientName,
          signal: task.controller.signal,
          onProgress: (fraction) => patchTask(task.key, { progress: fraction }),
        })
          .then(() => {
            patchTask(task.key, { status: 'done', progress: 1 });
            window.setTimeout(() => {
              setTasks((prev) => prev.filter((entry) => entry.key !== task.key));
            }, 2500);
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') {
              patchTask(task.key, { status: 'error', error: 'Cancelled' });
            } else {
              patchTask(task.key, {
                status: 'error',
                error: error instanceof Error ? error.message : 'Upload failed',
              });
            }
          });
      });
    },
    [clientId, clientName, patchTask],
  );

  const cancelUpload = useCallback((key: string) => {
    setTasks((prev) => {
      prev.find((task) => task.key === key)?.controller.abort();
      return prev;
    });
  }, []);

  const dismissTask = useCallback((key: string) => {
    setTasks((prev) => prev.filter((task) => task.key !== key));
  }, []);

  const handleDelete = useCallback(async (fileId: string) => {
    await deleteRequest(fileId);
  }, []);

  return (
    <div className="app-shell">
      <Header
        status={status}
        clientName={clientName}
        onRename={renameClient}
        shareOpen={shareOpen}
        onToggleShare={() => setShareOpen((open) => !open)}
      />
      {shareOpen && <SharePanel />}
      <main>
        <DropZone onFiles={startUploads} />
        <UploadQueue tasks={tasks} onCancel={cancelUpload} onDismiss={dismissTask} />
        <FileList files={files} clientId={clientId} onDelete={handleDelete} />
      </main>
    </div>
  );
}
