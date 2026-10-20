// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A site's server-side build loads this package with plain Node, where
// `vitepress` resolves to VitePress's node entry, not the client one. Vitest
// rewrites imports, so this builds the package and loads it in a real Node
// process instead. The output sits inside the project so `vue` and `vitepress`
// resolve from its node_modules.
const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(projectRoot, 'test/.ssr-dist');

/** Runs `script` in Node and returns what it prints. */
function runNode(script: string, type: 'module' | 'commonjs'): string {
  return execFileSync(process.execPath, [`--input-type=${type}`, '--eval', script], {
    cwd: projectRoot,
    encoding: 'utf-8',
  }).trim();
}

/** Renders an app whose setup calls `useBlog`, as a theme's `setup` would. */
const renderApp = `
  const app = createSSRApp({ setup: () => { useBlog(); return () => h('p', 'rendered'); } });
  console.log(await renderToString(app));
`;

beforeAll(async () => {
  await build({
    config: false,
    entry: ['src/client.ts'],
    format: ['esm', 'cjs'],
    external: ['vitepress', 'vue'],
    outDir,
    silent: true,
  });
}, 60_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('server-side rendering', () => {
  it('loads and renders from the ESM build', () => {
    const output = runNode(
      `import { createSSRApp, h } from 'vue';
       import { renderToString } from 'vue/server-renderer';
       import { useBlog } from './test/.ssr-dist/client.js';
       ${renderApp}`,
      'module',
    );
    expect(output).toBe('<p>rendered</p>');
  });

  it('loads and renders from the CJS build', () => {
    const output = runNode(
      `const { createSSRApp, h } = require('vue');
       const { renderToString } = require('vue/server-renderer');
       const { useBlog } = require('./test/.ssr-dist/client.cjs');
       (async () => { ${renderApp} })();`,
      'commonjs',
    );
    expect(output).toBe('<p>rendered</p>');
  });
});
