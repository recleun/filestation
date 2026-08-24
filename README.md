# FileStation

A self-hosted file exchange for your local network. Run it on one machine and it
hosts a small website; any browser on the same network (phone, tablet, laptop)
can open the link (or scan the QR code) and instantly send or receive files. No
accounts, no cloud, no uploads leaving the room.

## Quickstart

Requires Node.js 20+.

```sh
# development (server + Vite dev server with hot reload)
npm install
npm run dev

# production
npm run build
npm start
```

Then open the printed URL from any device in the same network. The startup banner
shows a QR code you can scan straight from the host machine's terminal.

## CLI options

```
filestation [--port <port>] [--dir <directory>] [-h | --help]

--port   Port to listen on (default: 4747, env: PORT)
--dir    Storage directory (default: ~/.filestation/uploads)
-h       Show help
```

## How it works

- The server keeps an **ephemeral inbox** of uploaded files.
- Every connected browser gets live updates over Server-Sent Events: new files
  appear immediately, downloads are marked, deletions propagate to everyone.
- Transfers stream directly through the server (`blob → disk` on upload,
  `disk → response` on download), so large files never sit in memory.
- Each client picks a friendly display name (e.g. `purple-otter`) stored in its
  own browser; senders and receivers are shown by name, not IP.

### Retention

There is **no TTL and no quota**: files stay until someone deletes them or the
server stops. When the server shuts down (Ctrl+C) it wipes the entire storage
directory — including anything left behind by a previous crashed run at next
boot. Treat FileStation as a hand-off point, not an archive.

## API

| Method   | Path                                     | Purpose                                                          |
| -------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `GET`    | `/api/state`                             | Snapshot of all files                                            |
| `POST`   | `/api/files?name=&senderId=&senderName=` | Upload (raw streamed body)                                       |
| `GET`    | `/api/files/:id?clientId=`               | Download; marks the client as receiver                           |
| `GET`    | `/api/files/archive?clientId=`           | Download all files as one zip; marks each as received            |
| `DELETE` | `/api/files/:id`                         | Remove a file for everyone                                       |
| `GET`    | `/api/events`                            | SSE feed: `state`, `file.added`, `file.received`, `file.removed` |

## Security notes

- There is no authentication: anyone who can reach the port can read and delete
  everything in the inbox. FileStation is designed for trusted home/office LANs.
- Uploaded filenames are sanitized; downloads use RFC 5987 content-disposition
  so non-ASCII names survive.
- The server binds to `0.0.0.0` but only ever advertises private/LAN addresses
  in its banner and QR code.

## Development

```sh
npm run lint        # eslint across workspaces
npm run typecheck   # tsc across workspaces
npm test            # vitest (server suite)
npm run format      # prettier
```

The repo is an npm-workspaces monorepo:

- `packages/server` — Fastify server, storage, SSE hub (published to npm as `filestation`)
- `packages/web` — React + Vite frontend served statically in production

## Limitations / future work

- No resumable or chunked uploads; a dropped connection restarts a transfer.
- No authentication, TLS, or access control.
- One storage directory per instance; no multi-inbox support.
