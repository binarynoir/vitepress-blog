import type { MarkdownIt, StateCore } from 'markdown-it';
import path from 'node:path';
import { findHomeBlog, isIndex, isPost, listBlogPosts, pinPosts } from './collect.js';
import {
  BLOG_POSTS_PLACEHOLDER,
  createRenderContext,
  renderPostHeader,
  renderPostList,
  renderPostNav,
} from './render.js';
import { loadBlogPages, type BlogPage, type SourceInfo } from './scan.js';
import type { BlogOptions } from './types.js';
import { applyWidgets, hasWidget, widgetPages } from './widget.js';

const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const HEADING_1 = /^ {0,3}#[ \t]+\S/;

/**
 * VitePress's resolved rewrites (`README.md` served as `index.md`, say) and
 * the pages it builds, so links point where pages are served and pages kept
 * out by `srcExclude` aren't listed. VitePress keeps its config on this
 * global while it runs; `createContentLoader` reads it the same way.
 */
export function readSourceInfo(): SourceInfo {
  return (globalThis as { VITEPRESS_CONFIG?: SourceInfo }).VITEPRESS_CONFIG ?? {};
}

/** Puts `insert` on its own after the first level-1 heading outside code, or at the top if there is none. */
export function insertAfterTitle(source: string, insert: string): string {
  const lines = source.split('\n');
  let fence = '';
  for (const [index, line] of lines.entries()) {
    const marker = FENCE.exec(line)?.[1];
    if (marker && (!fence || marker[0] === fence[0])) {
      fence = fence ? '' : marker;
      continue;
    }
    if (!fence && HEADING_1.test(line)) {
      return [...lines.slice(0, index + 1), '', insert, '', ...lines.slice(index + 1)].join('\n');
    }
  }
  return `${insert}\n\n${source}`;
}

/** Whether the build writes feeds: they need a site URL, from the options or VitePress's `sitemap.hostname`. */
function hasFeeds(options: BlogOptions): boolean {
  return !!(options.siteUrl ?? readSourceInfo().userConfig?.sitemap?.hostname);
}

function withPostList(source: string, page: BlogPage, pages: BlogPage[], options: BlogOptions): string {
  if (!isIndex(page)) return source;
  const posts = listBlogPosts(pages, page, { drafts: options.drafts ?? false, pinnedFirst: true, applyLimit: true });
  const { pinned, rest } = pinPosts(posts, page.index.pinLimit);
  const context = createRenderContext(options, path.dirname(page.absolutePath), hasFeeds(options));
  const generated = renderPostList(pinned, rest, page, context);
  return source.includes(BLOG_POSTS_PLACEHOLDER)
    ? source.replace(BLOG_POSTS_PLACEHOLDER, () => `\n${generated}\n`)
    : `${source.replace(/\s*$/, '')}\n\n${generated}`;
}

function withPostDecorations(
  source: string,
  page: BlogPage,
  pages: BlogPage[],
  options: BlogOptions,
  frontmatter: Record<string, unknown> | undefined,
): string {
  if (!isPost(page)) return source;
  const context = createRenderContext(options, path.dirname(page.absolutePath));
  const drafts = options.drafts ?? false;
  // The post's own blog: its keywords link there, and its newer / older links stay inside it.
  const blog = findHomeBlog(pages, page, drafts);
  const header = renderPostHeader(
    page,
    context,
    { byline: page.post.byline ?? options.byline ?? true, cover: page.post.cover ?? options.cover ?? false },
    blog?.routePath ?? null,
  );
  let result = header ? insertAfterTitle(source, header) : source;

  if (page.post.postNav ?? options.postNav ?? true) {
    if (blog) {
      const posts = listBlogPosts(pages, blog, { drafts, pinnedFirst: false, applyLimit: false });
      result = `${result.replace(/\s*$/, '')}\n\n${renderPostNav(page, posts, blog, context)}\n`;
      // One set of links per page: VitePress's own previous / next in the doc
      // footer follow the sidebar, not the post dates. A post's own `prev` /
      // `next` still win. VitePress reads `env.frontmatter` after rendering.
      if (frontmatter) {
        frontmatter.prev ??= false;
        frontmatter.next ??= false;
      }
    }
  }
  return result;
}

const warned = new Set<string>();

function applyBlog({ src, env }: StateCore, options: BlogOptions): string {
  const frontmatter = env?.frontmatter as Record<string, unknown> | undefined;
  const isBlogPage = !!(frontmatter?.blog || frontmatter?.['blog-index']);
  const widgets = hasWidget(src);
  if (!isBlogPage && !widgets) return src;
  if (typeof env.path !== 'string' || typeof env.relativePath !== 'string') return src;

  // `env.path` is the page's served path (after rewrites), absolute, and
  // `env.relativePath` that same path from the source directory.
  const sourceDirectory = path.resolve(env.path, ...env.relativePath.split('/').map(() => '..'));
  const realPath = typeof env.realPath === 'string' ? env.realPath : env.path;
  const relativePath = path.relative(sourceDirectory, realPath).split(path.sep).join('/');

  const pages = loadBlogPages(sourceDirectory, options, readSourceInfo());
  let result = src;
  if (widgets) {
    // Remembered so `vitepress dev` can refresh this page when a post changes.
    widgetPages.add(realPath);
    result = applyWidgets(result, {
      pages,
      pageRelativePath: relativePath,
      drafts: options.drafts ?? false,
      context: createRenderContext(options, path.dirname(realPath), hasFeeds(options)),
      warn: (message) => {
        const key = `${relativePath}: ${message}`;
        if (warned.has(key)) return;
        warned.add(key);
        console.warn(`[vitepress-blog] ${relativePath}: ${message}`);
      },
    });
  }

  const page = pages.find((candidate) => candidate.relativePath === relativePath);
  if (!page) return result;
  return page.index
    ? withPostList(result, page, pages, options)
    : withPostDecorations(result, page, pages, options, frontmatter);
}

/**
 * A markdown-it plugin that turns pages into a blog.
 *
 * ```ts
 * // .vitepress/config.mts
 * import { blogMarkdown } from '@binarynoir/vitepress-blog';
 *
 * export default defineConfig({
 *   markdown: {
 *     config(md) {
 *       md.use(blogMarkdown, { locale: 'en-US' });
 *     },
 *   },
 * });
 * ```
 *
 * A page with `blog-index` in its frontmatter gets a list of posts; a page
 * with `blog` gets a byline and links to the posts around it; and any page
 * can show a blog's latest posts with a `::: blog-posts` block. Runs on the raw
 * source before markdown-it's `normalize` rule, so the Markdown it writes is
 * parsed like the rest of the page and its links are checked and given the
 * site's base by VitePress. It needs VitePress's `env.path`,
 * `env.relativePath` and `env.frontmatter`, so it does nothing under plain
 * markdown-it.
 */
export function blogMarkdown(md: MarkdownIt, options: BlogOptions = {}): void {
  md.core.ruler.before('normalize', 'vitepress_blog', (state: StateCore) => {
    state.src = applyBlog(state, options);
  });
}
