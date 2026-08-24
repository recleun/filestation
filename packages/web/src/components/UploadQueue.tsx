import { formatBytes } from '../format';

export interface UploadTask {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  controller: AbortController;
}

interface UploadQueueProps {
  tasks: UploadTask[];
  onCancel: (key: string) => void;
  onDismiss: (key: string) => void;
}

export function UploadQueue({ tasks, onCancel, onDismiss }: UploadQueueProps) {
  if (tasks.length === 0) {
    return null;
  }
  return (
    <ul className="upload-list" aria-label="Uploads in progress">
      {tasks.map((task) => (
        <li key={task.key} className={`upload-item ${task.status}`}>
          <div className="upload-info">
            <span className="upload-name">{task.name}</span>
            <span className="upload-meta">{formatBytes(task.size)}</span>
          </div>
          {task.status === 'uploading' && (
            <div
              className="bar"
              role="progressbar"
              aria-valuenow={Math.round(task.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: `${Math.round(task.progress * 100)}%` }} />
            </div>
          )}
          {task.status === 'done' && <span className="upload-done">✓ sent</span>}
          {task.status === 'error' && (
            <span className="upload-error">{task.error ?? 'Failed'}</span>
          )}
          {task.status === 'uploading' ? (
            <button type="button" className="btn small" onClick={() => onCancel(task.key)}>
              Cancel
            </button>
          ) : (
            <button type="button" className="btn small" onClick={() => onDismiss(task.key)}>
              Dismiss
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
