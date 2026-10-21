import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { MarkdownIt } from 'markdown-it';
import type { Plugin, ViteDevServer } from 'vite';
import type { HeadConfig, PageData, SiteConfig, TransformContext, TransformPageContext, UserConfig } from 'vitepress';
import { renderDismissedScript, resolveAnnouncements } from './announcements.js';
import { findBlogsListing, isIndex, isPost, listBlogPosts, type IndexPage, type PostPage } from './collect.js';
import { mayHaveBlogFrontmatter } from './frontmatter.js';
import { renderFeed, resolvePostImage, toFeedPath, toPageUrl, type SiteLocation } from './feed.js';
import { blogMarkdown } from './plugin.js';
import { hasWidget, widgetPages } from './widget.js';
import { fingerprintBlogSource, loadBlogPages, type BlogPage } from './scan.js';
import type { BlogOptions } from './types.js';
import { ANNOUNCEMENTS_KEY, joinUrl } from './util.js';

const DEFAULT_FEED_LIMIT = 20;
const PACKAGE_NAME = '@binarynoir/vitepress-blog';
// VitePress's id for the module that serves the site data to the browser.
const SITE_DATA_MODULE = '/@siteData';
// Marks the `<head>` script this adds, so it is replaced rather than added twice.
const SCRIPT_MARKER = 'data-vp-blog-announcement';

/** Where the site is published, or `null` without a site URL: feeds need absolute links. */
export function resolveSiteLocation(siteConfig: SiteConfig, options: BlogOptions): SiteLocation | null {
  const siteUrl = options.siteUrl ?? siteConfig.userConfig?.sitemap?.hostname ?? siteConfig.sitemap?.hostname;
  if (!siteUrl) return null;
  return {
    siteUrl: siteUrl.replace(/\/+$/, ''),
    base: siteConfig.site?.base ?? '/',
    cleanUrls: !!siteConfig.cleanUrls,
    publicDir: siteConfig.publicDir ?? path.join(siteConfig.srcDir, 'public'),
    imagesDir: (options.imagesDir ?? 'blog-images').replace(/^\/+|\/+$/g, ''),
  };
}

function loadPages(siteConfig: SiteConfig, options: BlogOptions): BlogPage[] {
  return loadBlogPages(siteConfig.srcDir, options, siteConfig);
}

/**
 * Puts the announcement banner's data on VitePress's site data, where
 * `useData().site` reads it on every page, and adds the `<head>` script that
 * hides a dismissed banner before the page hydrates. Returns whether the
 * data changed.
 */
export function attachAnnouncements(siteConfig: SiteConfig, options: BlogOptions = {}): boolean {
  const site = siteConfig.site as SiteConfig['site'] & Record<string, unknown>;
  const data = resolveAnnouncements(loadPages(siteConfig, options), options, !!siteConfig.cleanUrls);
  const changed = JSON.stringify(site[ANNOUNCEMENTS_KEY] ?? null) !== JSON.stringify(data);
  if (data) site[ANNOUNCEMENTS_KEY] = data;
  else delete site[ANNOUNCEMENTS_KEY];
  site.head = (site.head ?? []).filter(([, attributes]) => !(SCRIPT_MARKER in (attributes ?? {})));
  if (data) site.head.push(['script', { [SCRIPT_MARKER]: '' }, renderDismissedScript(data)]);
  return changed;
}

/** The posts in a blog's feed: no drafts, newest first, up to the feed's limit. */
function listFeedPosts(pages: BlogPage[], index: IndexPage, options: BlogOptions): PostPage[] {
  const limit = index.index.feed?.limit ?? options.feedLimit ?? DEFAULT_FEED_LIMIT;
  return listBlogPosts(pages, index, { drafts: false, pinnedFirst: false, applyLimit: false }).slice(0, limit);
}

function renderIndexFeed(
  pages: BlogPage[],
  index: IndexPage,
  site: SiteLocation,
  siteConfig: SiteConfig,
  options: BlogOptions,
) {
  return renderFeed({
    index,
    posts: listFeedPosts(pages, index, options),
    site,
    language: siteConfig.site?.lang,
    siteDescription: siteConfig.site?.description,
  });
}

function feedLink(index: IndexPage, base: string): HeadConfig {
  const href = joinUrl(base, toFeedPath(index));
  return [
    'link',
    { rel: 'alternate', type: 'application/rss+xml', title: index.index.feed?.title ?? index.title, href },
  ];
}

/**
 * `<head>` tags for blog pages: a feed link on each blog page, and on each
 * post Open Graph and Twitter card tags (title, summary, image, dates) plus
 * links to the feeds that carry it. Use it from VitePress's `transformHead`:
 *
 * ```ts
 * transformHead: (context) => blogHead(context, options),
 * ```
 *
 * Social tags need absolute URLs, so `og:url` and `og:image` are left out
 * without a site URL (the `siteUrl` option or `sitemap.hostname`).
 */
export function blogHead(context: TransformContext, options: BlogOptions = {}): HeadConfig[] {
  const { pageData, siteConfig } = context;
  const frontmatter = pageData.frontmatter ?? {};
  if (!pageData.filePath || (!frontmatter.blog && !frontmatter['blog-index'])) return [];
  const pages = loadPages(siteConfig, options);
  const page = pages.find((candidate) => candidate.relativePath === pageData.filePath);
  if (!page) return [];
  const site = resolveSiteLocation(siteConfig, options);
  const base = siteConfig.site?.base ?? '/';
  const head: HeadConfig[] = [];

  if (isIndex(page)) {
    if (page.index.feed) head.push(feedLink(page, base));
    if (site) head.push(['meta', { property: 'og:url', content: toPageUrl(page.routePath, site) }]);
    return head;
  }
  if (!isPost(page)) return head;

  const { post } = page;
  head.push(
    ['meta', { property: 'og:type', content: 'article' }],
    ['meta', { property: 'og:title', content: post.title }],
  );
  if (post.summary) head.push(['meta', { property: 'og:description', content: post.summary }]);
  if (site) head.push(['meta', { property: 'og:url', content: toPageUrl(page.routePath, site) }]);

  const image = site ? resolvePostImage(page, site) : null;
  if (image) {
    head.push(['meta', { property: 'og:image', content: image.url }]);
    if (post.imageAlt) head.push(['meta', { property: 'og:image:alt', content: post.imageAlt }]);
  }
  head.push(['meta', { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' }]);
  if (post.date) head.push(['meta', { property: 'article:published_time', content: post.date.toISOString() }]);
  if (post.updated) head.push(['meta', { property: 'article:modified_time', content: post.updated.toISOString() }]);
  if (post.authors.length) {
    head.push(['meta', { property: 'article:author', content: post.authors.map((author) => author.name).join(', ') }]);
  }
  if (post.category) head.push(['meta', { property: 'article:section', content: post.category }]);
  if (!post.draft) {
    for (const blog of findBlogsListing(pages, page)) if (blog.index.feed) head.push(feedLink(blog, base));
  }
  return head;
}

/**
 * Gives a post without a `description` its summary (or the first paragraph,
 * when it has no summary) as one, so VitePress writes it into the page's
 * `<meta name="description">`. Use it from `transformPageData`:
 *
 * ```ts
 * transformPageData: (pageData, context) => blogPageData(pageData, context, options),
 * ```
 */
export function blogPageData(pageData: PageData, context: TransformPageContext, options: BlogOptions = {}): void {
  if (!pageData.frontmatter?.blog || pageData.description || !pageData.filePath) return;
  const page = loadPages(context.siteConfig, options).find((candidate) => candidate.relativePath === pageData.filePath);
  if (page?.post?.summary) pageData.description = page.post.summary;
}

/**
 * Writes an RSS feed for every blog page whose feed isn't turned off, and
 * copies post images to `imagesDir` for the feeds and social cards to link.
 * Use it from VitePress's `buildEnd`.
 */
export function writeBlogFeeds(siteConfig: SiteConfig, options: BlogOptions = {}): void {
  const pages = loadPages(siteConfig, options);
  const indexes = pages.filter(isIndex).filter((index) => index.index.feed);
  const site = resolveSiteLocation(siteConfig, options);
  if (!site) {
    if (indexes.length) {
      siteConfig.logger?.warn(
        '[vitepress-blog] no feeds written: set the siteUrl option or sitemap.hostname so feeds can use absolute links.',
      );
    }
    return;
  }

  const written = new Map<string, string>();
  for (const index of indexes) {
    const feedPath = toFeedPath(index);
    if (written.has(feedPath)) {
      siteConfig.logger?.warn(
        `[vitepress-blog] ${index.relativePath} and ${written.get(feedPath)} both write ${feedPath}; set feed.path on one of them.`,
      );
      continue;
    }
    written.set(feedPath, index.relativePath);
    const file = path.join(siteConfig.outDir, feedPath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, renderIndexFeed(pages, index, site, siteConfig, options));
  }

  for (const post of pages.filter(isPost)) {
    if (post.post.draft) continue;
    const image = resolvePostImage(post, site);
    if (!image?.file || !image.outputPath) continue;
    const target = path.join(siteConfig.outDir, image.outputPath);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(image.file, target);
  }
}

/**
 * The Vite side of the blog, for `vitepress dev`:
 *
 * - VitePress caches a page's rendered output by its own source, so a new or
 *   edited post would leave blog lists and "newer / older" links stale. This
 *   adds a fingerprint of every post to blog pages and posts (busting the
 *   cache) and reloads them when any of them changes.
 * - Serves each blog's feed and the copied post images, which the build
 *   writes in `buildEnd`, so feed links work in development too.
 * - Gives every page the announcement banner's data (see `attachAnnouncements`),
 *   kept current while posts change, and has Vite bundle this package for the
 *   server-side build, so the banner can read it there too.
 */
export function blogVitePlugin(options: BlogOptions = {}): Plugin {
  let siteConfig: SiteConfig | undefined;
  const currentPages = () => (siteConfig ? loadPages(siteConfig, options) : []);
  // Every file whose output shows posts: blog pages, posts, and pages with a `::: blog-posts` block.
  const dependentFiles = () => [...currentPages().map((page) => page.absolutePath), ...widgetPages];
  const invalidate = (server: ViteDevServer, files: string[]) => {
    for (const file of files) {
      for (const module of server.moduleGraph.getModulesByFile(file) ?? []) server.moduleGraph.invalidateModule(module);
    }
  };
  /** Re-reads the announcements; when they changed, the site data is served afresh. */
  const refreshAnnouncements = (server: ViteDevServer): boolean => {
    if (!siteConfig || !attachAnnouncements(siteConfig, options)) return false;
    const module = server.moduleGraph.getModuleById(SITE_DATA_MODULE);
    if (module) server.moduleGraph.invalidateModule(module);
    return true;
  };

  return {
    name: 'vitepress-blog',
    enforce: 'pre',
    config() {
      // Bundled rather than loaded by Node, the client entry gets VitePress's
      // client (`useData`) on the server too, so the banner renders there.
      return { ssr: { noExternal: [PACKAGE_NAME] } };
    },
    configResolved(config) {
      siteConfig = (config as { vitepress?: SiteConfig }).vitepress;
      if (siteConfig) attachAnnouncements(siteConfig, options);
    },
    transform(code, id) {
      if (!siteConfig || !id.endsWith('.md') || !(mayHaveBlogFrontmatter(code) || hasWidget(code))) return null;
      return { code: `${code}\n<!-- vitepress-blog:${fingerprintBlogSource(currentPages())} -->\n`, map: null };
    },
    configureServer(server) {
      // Vite only calls handleHotUpdate for edits; a post added or deleted changes the lists too.
      const refresh = (file: string) => {
        if (!siteConfig || !file.endsWith('.md')) return;
        invalidate(server, dependentFiles());
        refreshAnnouncements(server);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh).on('unlink', refresh);

      server.middlewares.use((request, response, next) => {
        if (!siteConfig || !request.url) return next();
        const base = siteConfig.site?.base ?? '/';
        const pathname = decodeURIComponent(request.url.split('?')[0]);
        if (!pathname.startsWith(base)) return next();
        const relative = pathname.slice(base.length);
        const pages = currentPages();
        // Feeds link to the live site, or to the dev server without a site URL.
        const site =
          resolveSiteLocation(siteConfig, options) ??
          resolveSiteLocation(siteConfig, { ...options, siteUrl: `http://${request.headers.host ?? 'localhost'}` })!;

        const index = pages.filter(isIndex).find((page) => page.index.feed && toFeedPath(page) === relative);
        if (index) {
          response.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
          response.end(renderIndexFeed(pages, index, site, siteConfig, options));
          return;
        }
        for (const post of pages.filter(isPost)) {
          const image = resolvePostImage(post, site);
          if (image?.outputPath === relative && image.file) {
            if (image.type) response.setHeader('Content-Type', image.type);
            response.end(readFileSync(image.file));
            return;
          }
        }
        next();
      });
    },
    handleHotUpdate({ file, modules, server }) {
      if (!siteConfig || !file.endsWith('.md')) return;
      // Every page shows the banner, so a change to it reloads them all. Checked
      // first: a page that stops being an announcement is no longer a post.
      if (refreshAnnouncements(server)) {
        invalidate(server, dependentFiles());
        server.ws.send({ type: 'full-reload' });
        return [];
      }
      const pages = currentPages();
      if (!pages.some((page) => page.absolutePath === file)) return;
      const affected = dependentFiles()
        .filter((dependent) => dependent !== file)
        .flatMap((dependent) => [...(server.moduleGraph.getModulesByFile(dependent) ?? [])]);
      return affected.length ? [...modules, ...affected] : undefined;
    },
  };
}

/**
 * Wraps a VitePress config with the whole blog: the Markdown plugin, the Vite
 * plugin (dev server and announcements), `<head>` tags, descriptions from
 * summaries, and feeds at the end of the build.
 *
 * ```ts
 * // .vitepress/config.mts
 * import { defineConfig } from 'vitepress';
 * import { withBlog } from '@binarynoir/vitepress-blog/vitepress';
 *
 * export default withBlog(defineConfig({ /* ...your config... *\/ }), { siteUrl: 'https://example.com' });
 * ```
 *
 * Hooks you already have (`markdown.config`, `transformHead`,
 * `transformPageData`, `buildEnd`) are not replaced: the blog's runs and
 * then yours, so it composes with other `withX()` wrappers in any order.
 */
export function withBlog(config: UserConfig, options: BlogOptions = {}): UserConfig {
  config.markdown ??= {};
  const existingMarkdownConfig = config.markdown.config ?? (() => {});
  config.markdown.config = (md) => {
    // VitePress 2 types this callback against `markdown-it-async`'s MarkdownIt,
    // a structural superset of plain markdown-it's; the cast bridges the two.
    blogMarkdown(md as unknown as MarkdownIt, options);
    existingMarkdownConfig(md);
  };

  config.vite ??= {};
  config.vite.plugins = [...(config.vite.plugins ?? []), blogVitePlugin(options)];

  const existingTransformHead = config.transformHead;
  config.transformHead = async (context) => [
    ...blogHead(context, options),
    ...((await existingTransformHead?.(context)) ?? []),
  ];

  const existingTransformPageData = config.transformPageData;
  config.transformPageData = (pageData, context) => {
    blogPageData(pageData, context, options);
    return existingTransformPageData?.(pageData, context);
  };

  const existingBuildEnd = config.buildEnd;
  config.buildEnd = async (siteConfig) => {
    writeBlogFeeds(siteConfig, options);
    await existingBuildEnd?.(siteConfig);
  };

  return config;
}

export { blogMarkdown };
export type { BlogOptions };
