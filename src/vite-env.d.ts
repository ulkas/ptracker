/// <reference types="vite/client" />

export {};

declare global {
  const __APP_VERSION__: string;
  const __BUILD_ID__: string;
  const __DB_VERSION__: number;
}
