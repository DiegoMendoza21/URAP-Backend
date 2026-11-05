import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resuelve los alias de rutas declarados en tsconfig.json (por ejemplo, los que agrega
  // `nest g library`).
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
