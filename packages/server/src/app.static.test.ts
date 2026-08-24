import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type Station } from './app.js';

let dir: string;
let webDir: string;
let station: Station;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fs-static-store-'));
  webDir = await mkdtemp(join(tmpdir(), 'fs-static-web-'));
  await writeFile(join(webDir, 'index.html'), '<html><body>SPA</body></html>');
  await writeFile(join(webDir, 'style.css'), 'body{color:red}');
  station = createApp({ storageDir: dir, staticRoot: webDir });
  await station.storage.init();
});

afterEach(async () => {
  await station.app.close();
  await rm(dir, { recursive: true, force: true });
  await rm(webDir, { recursive: true, force: true });
});

describe('static SPA serving', () => {
  it('reports staticEnabled when the directory exists', () => {
    expect(station.staticEnabled).toBe(true);
  });

  it('serves index.html at /', async () => {
    const res = await station.app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('SPA');
  });

  it('serves assets with correct content types', async () => {
    const res = await station.app.inject({ method: 'GET', url: '/style.css' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
  });

  it('falls back to index.html for client-side routes', async () => {
    const res = await station.app.inject({ method: 'GET', url: '/some/deep/link' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('SPA');
  });

  it('returns a JSON 404 for unknown api routes', async () => {
    const res = await station.app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not found' });
  });

  it('returns a JSON 404 for unknown non-GET routes', async () => {
    const res = await station.app.inject({ method: 'POST', url: '/whatever' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not found' });
  });

  it('keeps api routes working alongside static serving', async () => {
    const res = await station.app.inject({ method: 'GET', url: '/api/state' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('files');
  });

  it('skips static serving when the directory is missing', async () => {
    const plain = createApp({ storageDir: dir, staticRoot: join(webDir, 'missing') });
    try {
      expect(plain.staticEnabled).toBe(false);
      const res = await plain.app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not found' });
    } finally {
      await plain.app.close();
    }
  });
});
