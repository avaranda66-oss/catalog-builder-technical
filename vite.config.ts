import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

let commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_GIT_COMMIT_SHA || '';
if (!commitSha) {
  try {
    commitSha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    commitSha = '8415bb0';
  }
}

// The "Criar com IA — protótipo local" page (ai-catalog-prototype.html) uses simulated generation
// and local storage only. It must never ship to production: it is built only for the E2E proofs
// (VITE_E2E_BUILD=true). BUILD_OUT_DIR lets CI keep that E2E build apart from the production dist.
const isE2EBuild = process.env.VITE_E2E_BUILD === 'true';
const buildInput: Record<string, string> = {
  main: path.resolve(__dirname, 'index.html'),
  ...(isE2EBuild ? { aiPrototype: path.resolve(__dirname, 'ai-catalog-prototype.html') } : {}),
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: process.env.BUILD_OUT_DIR || 'dist',
    rollupOptions: { input: buildInput },
  },
  define: {
    'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(commitSha)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
