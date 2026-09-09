import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5198, strictPort: true, fs: { allow: [fileURLToPath(new URL('../../../..', import.meta.url))] } }, esbuild: { jsx: 'automatic' } });
await server.listen();
server.printUrls();

