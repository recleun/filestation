import type { ConnectionStatus } from '../types';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  status: ConnectionStatus;
  clientName: string;
  onRename: (name: string) => void;
  shareOpen: boolean;
  onToggleShare: () => void;
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  online: 'Live',
  offline: 'Offline',
};

export function Header({ status, clientName, onRename, shareOpen, onToggleShare }: HeaderProps) {
  return (
    <>
      <header className="app-header">
        <div className="brand">
          <h1>FileStation</h1>
          <span className={`status-dot ${status}`} title={STATUS_LABELS[status]} />
          <span className="status-label">{STATUS_LABELS[status]}</span>
        </div>
        <div className="header-actions">
          <label className="name-label">
            You are
            <input
              value={clientName}
              maxLength={64}
              onChange={(event) => onRename(event.target.value)}
              aria-label="Your display name"
            />
          </label>
          <ThemeToggle />
          <button type="button" className="btn" onClick={onToggleShare}>
            {shareOpen ? 'Hide invite' : 'Invite devices'}
          </button>
        </div>
      </header>
      {status === 'offline' && (
        <div role="alert" className="offline-bar">
          Connection lost — retrying…
        </div>
      )}
    </>
  );
}
