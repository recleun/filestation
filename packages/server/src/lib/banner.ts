import { toString as generateQr } from 'qrcode';
import { getLanAddresses } from './net.js';

export interface BannerInput {
  port: number;
  storageDir: string;
}

export async function buildBannerLines(
  input: BannerInput,
  lanAddresses = getLanAddresses(),
): Promise<string[]> {
  const lines: string[] = [];

  lines.push('FileStation is running');
  lines.push('');
  lines.push(`  Local:   http://localhost:${input.port}`);
  if (lanAddresses.length === 0) {
    lines.push('  Network: (no external network interface detected)');
  } else {
    for (const entry of lanAddresses) {
      lines.push(`  Network: http://${entry.address}:${input.port}  (${entry.iface})`);
    }
  }

  const target = lanAddresses[0]?.address ?? 'localhost';
  try {
    const qr = await generateQr(`http://${target}:${input.port}`, {
      type: 'terminal',
      small: true,
    });
    lines.push('');
    lines.push('  Scan to connect:');
    for (const line of qr.split('\n')) {
      lines.push(`  ${line}`);
    }
  } catch {
    lines.push('');
    lines.push(`  Open from any device: http://${target}:${input.port}`);
  }

  lines.push('');
  lines.push(`  Uploads: ${input.storageDir}`);
  lines.push('  Ctrl-C stops the server and removes stored files.');
  return lines;
}

export async function printBanner(input: BannerInput): Promise<void> {
  console.log((await buildBannerLines(input)).join('\n'));
}
