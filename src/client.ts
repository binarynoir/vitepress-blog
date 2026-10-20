// A namespace import, not named ones: during the server-side build Node loads
// VitePress's node entry, which has no `inBrowser`, `useRoute` or
// `onContentUpdated`. Named imports would fail to link there; on the
// namespace they are just `undefined`.
import * as vitepress from 'vitepress';
import { nextTick, onMounted, watch } from 'vue';
import { applyBlogViews } from './view.js';

/**
 * Turns on keyword filtering (`?tag=`) and pagination (`?page=`) on blog
 * pages. Call it from your theme's `setup()`:
 *
 * ```ts
 * // .vitepress/theme/index.ts
 * import DefaultTheme from 'vitepress/theme';
 * import { useBlog } from '@binarynoir/vitepress-blog/client';
 * import '@binarynoir/vitepress-blog/style.css';
 *
 * export default {
 *   extends: DefaultTheme,
 *   setup() {
 *     useBlog();
 *   },
 * };
 * ```
 *
 * Keyword and page links are ordinary links: VitePress's router follows them
 * without reloading the page, and this re-applies the view whenever the path
 * or query string changes. It runs after the page has hydrated, so the
 * server-rendered HTML (every post) and the first client render agree.
 * Does nothing during the server-side build.
 */
export function useBlog(): void {
  if (!vitepress.inBrowser) return;
  const route = vitepress.useRoute();
  const apply = () => nextTick(() => applyBlogViews());
  onMounted(() => {
    watch(() => [route.path, route.query], apply, { immediate: true });
  });
  // `vitepress dev` swaps a page's content in place when it is edited.
  vitepress.onContentUpdated(apply);
}

export { applyBlogView, applyBlogViews, type BlogViewState } from './view.js';
