import { defineConfig } from 'vitest/config';
import { transformWithEsbuild, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

/**
 * Emits `sw.js` from `sw/sw.ts` with the production bundle's file list and a
 * cache name derived from it, so every deploy gets a fresh cache and the
 * worker never has to guess at hashed asset names. Build only; the dev server
 * never registers a worker.
 *
 * The cache name hashes the content of everything the worker can serve, not
 * just the names: `index.html` and `public/` keep their names across deploys,
 * and a byte-identical `sw.js` means the browser never installs an update.
 */
function serviceWorker(): Plugin {
  return {
    name: 'backseat-service-worker',
    apply: 'build',
    generateBundle: {
      // After Vite's HTML plugin, so `index.html` is in the bundle to hash.
      order: 'post',
      async handler(_options, bundle) {
        const files = Object.keys(bundle)
          .filter((name) => !name.endsWith('.map') && name !== 'index.html')
          .map((name) => `/${name}`)
          .sort();
        const precache = ['/manifest.webmanifest', ...files];
        const source = await readFile(fileURLToPath(new URL('./sw/sw.ts', import.meta.url)), 'utf8');
        const hash = createHash('sha256').update(source);
        for (const name of Object.keys(bundle).sort()) {
          const out = bundle[name]!;
          hash.update(name).update(out.type === 'chunk' ? out.code : out.source);
        }
        const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
        const publicFiles = (await readdir(publicDir, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => `${entry.parentPath}/${entry.name}`)
          .sort();
        for (const file of publicFiles) hash.update(file.slice(publicDir.length)).update(await readFile(file));
        const version = hash.digest('hex').slice(0, 12);
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
