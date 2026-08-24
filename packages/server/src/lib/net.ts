import { networkInterfaces } from 'node:os';
import type { NetworkInterfaceInfo } from 'node:os';

export interface LanAddress {
  address: string;
  iface: string;
}

export function getLanAddresses(
  interfaces: Record<string, readonly NetworkInterfaceInfo[] | undefined> = networkInterfaces(),
): LanAddress[] {
  const results: LanAddress[] = [];
  for (const [iface, addresses] of Object.entries(interfaces)) {
    for (const info of addresses ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        results.push({ address: info.address, iface });
      }
    }
  }
  return results;
}
