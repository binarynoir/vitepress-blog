import { copyFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/vitepress.ts', 'src/client.ts'],
  external: ['vue', 'vitepress'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  // tsup can't pass a stylesheet through its dts build, so ship it verbatim.
  onSuccess: async () => {
    await copyFile('src/style.css', 'dist/style.css');
  },
});
