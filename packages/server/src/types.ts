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

export type InboxEvent =
  | { type: 'file.added'; file: StoredFile }
  | { type: 'file.removed'; fileId: string }
  | { type: 'file.received'; fileId: string; clientId: string };
