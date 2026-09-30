import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/ptracker/',
  build: { target: 'es2020', sourcemap: true },
  test: { environment: 'node', globals: true },
});
