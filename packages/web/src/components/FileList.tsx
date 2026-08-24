import { useState } from 'react';
import { downloadPath } from '../api';
import { formatAge, formatBytes } from '../format';
import type { StoredFile } from '../types';

interface FileListProps {
  files: StoredFile[];
  clientId: string;
  onDelete: (fileId: string) => Promise<void>;
}

export function FileList({ files, clientId, onDelete }: FileListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (files.length === 0) {
    return <p className="empty">No files yet — drop something above.</p>;
  }

  const handleDelete = async (file: StoredFile) => {
    if (!window.confirm(`Remove "${file.name}" for everyone?`)) {
      return;
    }
    setDeletingId(file.id);
    try {
      await onDelete(file.id);
    } catch {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="list-toolbar">
        <span className="file-count">
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </span>
        <a
          className="btn"
          href={`/api/files/archive?clientId=${encodeURIComponent(clientId)}`}
          download="filestation.zip"
        >
          Download all
        </a>
      </div>
      <ul className="file-list">
        {files.map((file) => {
          const mine = file.receivers.includes(clientId);
          const grabbedByOthers = file.receivers.filter((id) => id !== clientId).length;
          return (
            <li key={file.id} className="file-row">
              <div className="file-main">
                <span className="file-name">{file.name}</span>
                <span className="file-meta">
                  {formatBytes(file.size)} · from {file.senderName} · {formatAge(file.createdAt)}
                </span>
              </div>
              <span className={`grabbed${mine ? ' mine' : ''}`}>
                {mine ? '✓ you have it' : grabbedByOthers > 0 ? `${grabbedByOthers} grabbed` : ''}
              </span>
              <div className="file-actions">
                <a className="btn" href={downloadPath(file.id, clientId)} download={file.name}>
                  Download
                </a>
                <button
                  type="button"
                  className="btn danger"
                  disabled={deletingId === file.id}
                  onClick={() => void handleDelete(file)}
                >
                  {deletingId === file.id ? '…' : 'Delete'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
