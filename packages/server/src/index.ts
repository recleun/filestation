#!/usr/bin/env node
import { printBanner } from './lib/banner.js';
import { createApp } from './app.js';
import { printHelp, resolveConfig } from './config.js';
import { installShutdownHooks } from './lifecycle.js';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

const config = resolveConfig(argv);
const { app, storage, hub } = createApp({ storageDir: config.storageDir });

const { leftoversRemoved } = await storage.init();
if (leftoversRemoved > 0) {
  console.log(`cleaned ${leftoversRemoved} leftover upload(s) from a previous run`);
}

installShutdownHooks({
  runCleanup: async () => {
    hub.closeAll();
    await app.close();
    const removed = await storage.wipe();
    console.log(`removed ${removed} file(s) from ${config.storageDir}`);
  },
});

await app.listen({ port: config.port, host: '0.0.0.0' });

const address = app.server.address();
await printBanner({
  port: address !== null && typeof address === 'object' ? address.port : config.port,
  storageDir: config.storageDir,
});
