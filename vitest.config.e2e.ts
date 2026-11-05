import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Las pruebas e2e comparten la base local: un archivo a la vez.
    fileParallelism: false,
  },
});
