import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createGameServer } from './lib/server.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const handle = await createGameServer({ root, host, port });
console.log(`DUSTBOWL web build running on ${handle.url}`);
