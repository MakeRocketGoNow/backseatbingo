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
  test: {
    include: ['game/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
