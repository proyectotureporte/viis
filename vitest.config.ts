import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// El alias @/ tiene que existir también para vitest: los tests importan
// @/lib/credito igual que lo hacen los componentes.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
});
