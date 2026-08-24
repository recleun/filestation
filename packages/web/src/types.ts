export interface StoredFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  senderId: string;
  senderName: string;
  createdAt: number;
  receivers: string[];
}

export type ServerEvent =
  | { type: 'state'; files: StoredFile[] }
  | { type: 'file.added'; file: StoredFile }
  | { type: 'file.removed'; fileId: string }
  | { type: 'file.received'; fileId: string; clientId: string };

export type ConnectionStatus = 'connecting' | 'online' | 'offline';
