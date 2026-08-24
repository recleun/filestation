import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

const serverRoot = fileURLToPath(new URL('..', import.meta.url));
const tsxBin = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url));

function waitForMatch(stream: Readable, pattern: RegExp, timeoutMs = 15000): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${pattern}; got: ${buffer.slice(-500)}`));
    }, timeoutMs);

    function onData(chunk: Buffer): void {
      buffer += chunk.toString();
      const match = buffer.match(pattern);
      if (match?.[1]) {
        cleanup();
        resolve(Number(match[1]));
      }
    }

    function onEnd(): void {
      cleanup();
      reject(new Error(`stream ended before match; got: ${buffer.slice(-500)}`));
    }

    function cleanup(): void {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('end', onEnd);
    }

    stream.on('data', onData);
    stream.on('end', onEnd);
  });
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('exit', (code) => resolve(code));
    child.once('error', reject);
  });
}

function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

describe('server lifecycle (integration)', () => {
  it('wipes all uploads on SIGINT and exits cleanly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filestation-integration-'));
    const child = spawn(tsxBin, ['src/index.ts', '--dir', dir, '--port', '0'], {
      cwd: serverRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      const port = await waitForMatch(child.stdout, /http:\/\/localhost:(\d+)/);

      const upload = await fetch(
        `http://127.0.0.1:${port}/api/files?name=integration.txt&senderId=11111111-2222-4333-8444-555555555555&senderName=tester`,
        { method: 'POST', body: 'integration payload', headers: { 'content-type': 'text/plain' } },
      );
      expect(upload.status).toBe(201);

      child.kill('SIGINT');
      const exitCode = await waitForExit(child);
      expect(exitCode).toBe(0);

      expect(await readdir(dir)).toEqual([]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }, 30000);

  it('shuts down cleanly with an open SSE connection', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filestation-sse-shutdown-'));
    const child = spawn(tsxBin, ['src/index.ts', '--dir', dir, '--port', '0'], {
      cwd: serverRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      const port = await waitForMatch(child.stdout, /http:\/\/localhost:(\d+)/);

      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${port}/api/events`, {
        signal: controller.signal,
      });
      expect(response.status).toBe(200);

      child.kill('SIGINT');
      const exitCode = await raceWithTimeout(
        waitForExit(child),
        10000,
        'server did not exit with an open SSE connection',
      );
      expect(exitCode).toBe(0);

      controller.abort();
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }, 30000);
});
