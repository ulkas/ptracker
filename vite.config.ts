import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import packageJson from './package.json';
import release from './release.json';

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  base: '/ptracker/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_ID__: JSON.stringify(process.env.PTRACKER_BUILD_ID ?? 'development'),
    __DB_VERSION__: JSON.stringify(release.databaseVersion),
  },
  build: { target: 'es2020', sourcemap: true },
  test: { environment: 'node', globals: true },
});
