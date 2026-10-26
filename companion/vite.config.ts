/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable to GitHub Pages / Netlify / any static host subpath.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The bundle is mostly the static game dataset (~135 kB gzipped); one chunk keeps it simple.
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['src/tests/**/*.test.ts'] },
});
