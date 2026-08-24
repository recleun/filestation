import { describe, expect, it } from 'vitest';
import type { NetworkInterfaceInfo } from 'node:os';
import { getLanAddresses } from './net.js';

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  } as unknown as NetworkInterfaceInfo;
}

function ipv6(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: 'ffff:ffff:ffff:ffff::',
    family: 'IPv6',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/64`,
    scopeid: 0,
  } as unknown as NetworkInterfaceInfo;
}

describe('getLanAddresses', () => {
  it('collects external IPv4 addresses with their interface names', () => {
    const result = getLanAddresses({
      lo: [ipv4('127.0.0.1', true), ipv6('::1', true)],
      eth0: [ipv4('192.168.1.10'), ipv6('fe80::1234')],
      wlan0: [ipv4('10.0.0.5')],
    });

    expect(result).toEqual([
      { address: '192.168.1.10', iface: 'eth0' },
      { address: '10.0.0.5', iface: 'wlan0' },
    ]);
  });

  it('returns an empty list when nothing qualifies', () => {
    expect(getLanAddresses({ lo: [ipv4('127.0.0.1', true)] })).toEqual([]);
    expect(getLanAddresses({})).toEqual([]);
  });

  it('tolerates undefined interface entries', () => {
    expect(getLanAddresses({ eth0: undefined })).toEqual([]);
  });
});
