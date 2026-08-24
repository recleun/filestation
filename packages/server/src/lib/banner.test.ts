import { describe, expect, it } from 'vitest';
import { buildBannerLines } from './banner.js';

describe('buildBannerLines', () => {
  it('lists local and network URLs plus usage hints', async () => {
    const lines = await buildBannerLines({ port: 4747, storageDir: '/tmp/uploads' }, [
      { address: '192.168.7.7', iface: 'eth1' },
    ]);
    const text = lines.join('\n');

    expect(text).toContain('Local:   http://localhost:4747');
    expect(text).toContain('Network: http://192.168.7.7:4747  (eth1)');
    expect(text).toContain('Scan to connect:');
    expect(text).toContain('Uploads: /tmp/uploads');
    expect(text).toContain('Ctrl-C stops the server and removes stored files.');
  });

  it('renders a QR code block for the preferred address', async () => {
    const lines = await buildBannerLines({ port: 5000, storageDir: '/tmp/uploads' }, [
      { address: '192.168.0.2', iface: 'wlan0' },
    ]);
    const text = lines.join('\n');

    const scanIndex = lines.findIndex((line) => line.includes('Scan to connect:'));
    expect(scanIndex).toBeGreaterThan(-1);
    const qrLines = lines.slice(scanIndex + 1);
    expect(qrLines.some((line) => line.trim().length > 10)).toBe(true);
    expect(text).not.toContain('Open from any device');
  });

  it('falls back gracefully with no network interfaces', async () => {
    const lines = await buildBannerLines({ port: 4747, storageDir: '/tmp/uploads' }, []);
    const text = lines.join('\n');

    expect(text).toContain('(no external network interface detected)');
    expect(text).toContain('http://localhost:4747');
  });
});
