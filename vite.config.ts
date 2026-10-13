import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the same build works from the Capacitor WebView.
  base: './',
  build: { target: 'es2022' },
  // The Maia worker imports the ONNX runtime, which needs module workers.
  worker: { format: 'es' },
  // Build output and the Android project's copy of it are not source edits.
  server: { port: 5173, host: true, watch: { ignored: ['**/android/**', '**/dist/**', '**/models/**'] } },
});
