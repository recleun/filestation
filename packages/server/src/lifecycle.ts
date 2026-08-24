import { FileStorage } from './services/storage.js';

export async function prepareStorage(dir: string): Promise<number> {
  const storage = new FileStorage(dir);
  const { leftoversRemoved } = await storage.init();
  return leftoversRemoved;
}

export interface ShutdownHooks {
  runCleanup: () => Promise<void>;
}

export function installShutdownHooks(hooks: ShutdownHooks): void {
  let cleaningUp = false;

  const handleSignal = (signal: NodeJS.Signals): void => {
    if (cleaningUp) {
      console.error(`received ${signal} during shutdown, forcing exit`);
      process.exit(1);
    }
    cleaningUp = true;
    console.log(`received ${signal}, shutting down...`);
    hooks
      .runCleanup()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        console.error('cleanup failed:', err);
        process.exit(1);
      });
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
}
