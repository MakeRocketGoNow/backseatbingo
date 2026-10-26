import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
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
    include: ['game/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
