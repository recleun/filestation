import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface AppConfig {
  port: number;
  storageDir: string;
}

export const DEFAULT_PORT = 4747;

export function printHelp(): void {
  console.log(`filestation — share files across your local network

Usage: filestation [options]

Options:
  --port <n>    TCP port to listen on (default ${DEFAULT_PORT}, env PORT)
  --dir <path>  Directory for temporary uploads
                (default ~/.filestation/uploads)
  -h, --help    Show this help message

Any browser on the same network can open the printed URL to send and
receive files. Stopping the server removes all stored files.`);
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`invalid port: ${value}`);
  }
  return parsed;
}

export function resolveConfig(
  argv: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  let port = DEFAULT_PORT;
  let storageDir = join(homedir(), '.filestation', 'uploads');

  if (env.PORT !== undefined) {
    port = parsePort(env.PORT);
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    let flag: string;
    let value: string | undefined;

    const eqIndex = arg.indexOf('=');
    if (arg.startsWith('--') && eqIndex !== -1) {
      flag = arg.slice(0, eqIndex);
      value = arg.slice(eqIndex + 1);
    } else if (arg.startsWith('--')) {
      flag = arg;
      value = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }

    if (value === undefined || value.length === 0) {
      throw new Error(`missing value for ${flag}`);
    }

    switch (flag) {
      case '--port':
        port = parsePort(value);
        break;
      case '--dir':
        storageDir = resolve(value);
        break;
      default:
        throw new Error(`unknown option: ${flag}`);
    }
  }

  return { port, storageDir };
}
