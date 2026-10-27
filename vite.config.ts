import { defineConfig } from 'vitest/config';
import { transformWithEsbuild, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

/**
 * Emits `sw.js` from `sw/sw.ts` with the production bundle's file list and a
 * cache name derived from it, so every deploy gets a fresh cache and the
 * worker never has to guess at hashed asset names. Build only; the dev server
 * never registers a worker.
 */
function serviceWorker(): Plugin {
  return {
    name: 'backseat-service-worker',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map') && name !== 'index.html')
        .map((name) => `/${name}`)
        .sort();
      const precache = ['/manifest.webmanifest', ...files];
      const source = await readFile(fileURLToPath(new URL('./sw/sw.ts', import.meta.url)), 'utf8');
      const version = createHash('sha256').update(source).update(precache.join('\n')).digest('hex').slice(0, 12);
      const { code } = await transformWithEsbuild(source, 'sw.ts', {
        define: {
          __PRECACHE__: JSON.stringify(precache),
          __CACHE_NAME__: JSON.stringify(`bb-${version}`),
        },
        minify: true,
        target: 'es2022',
        // Classic worker script: no module syntax may survive.
        format: 'iife',
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  resolve: {
    alias: {
      '@game': fileURLToPath(new URL('./game', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
  server: {
    // The Worker runs on 8787 in development (`pnpm api`); Vite serves the client.
    proxy: {
      '/api': { target: 'http://localhost:8787', ws: true, changeOrigin: true },
    },
  },
  test: {
    include: ['game/**/*.test.ts', 'shared/**/*.test.ts', 'src/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
  },
});
