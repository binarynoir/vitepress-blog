import MarkdownIt from 'markdown-it';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  build,
  type HeadConfig,
  type PageData,
  type SiteConfig,
  type TransformContext,
  type UserConfig,
} from 'vitepress';
import { blogHead, blogPageData, withBlog, writeBlogFeeds } from '../src/vitepress.js';
import { frontmatter, Site } from './helpers.js';

// VitePress 2 types `markdown.config` against `markdown-it-async`'s MarkdownIt,
// a structural superset of plain markdown-it's. A real `markdown-it` instance
// is fine at runtime, so these helpers just bridge the two types.
type Md = InstanceType<typeof MarkdownIt>;

const site = new Site();
const outDir = mkdtempSync(path.join(tmpdir(), 'vitepress-blog-out-'));

function siteConfig(overrides: Record<string, unknown> = {}): SiteConfig {
  return {
    srcDir: site.root,
    outDir,
    publicDir: path.join(site.root, 'public'),
    cleanUrls: true,
    site: { base: '/', lang: 'en-US', description: 'Site description' },
    userConfig: { sitemap: { hostname: 'https://example.com' } },
    rewrites: { map: {}, inv: {} },
    logger: { warn: vi.fn() },
    ...overrides,
  } as unknown as SiteConfig;
}

function head(filePath: string, frontmatterData: Record<string, unknown>, config = siteConfig()): HeadConfig[] {
  return blogHead({
    pageData: { filePath, frontmatter: frontmatterData },
    siteConfig: config,
  } as unknown as TransformContext);
}

beforeAll(() => {
  site
    .write('blog/index.md', frontmatter(['title: Blog', 'blog-index:', '  scope: site'], '# Blog'))
    .write(
      'blog/post.md',
      frontmatter(
        ['blog:', '  date: 2026-10-01', '  summary: Short.', '  image: ./p.png', '  author: Jane', '  category: News'],
        '# Post\n\nFirst paragraph.',
      ),
    )
    .write('blog/p.png', Buffer.from('png'))
    .write('blog/excerpt.md', frontmatter(['blog: true'], '# Excerpt\n\nFrom the first paragraph.'))
    .write('blog/draft.md', frontmatter(['blog:', '  draft: true'], '# Draft'));
});

afterAll(() => {
  site.remove();
  rmSync(outDir, { recursive: true, force: true });
});

describe('blogHead', () => {
  it('links a blog page to its feed', () => {
    expect(head('blog/index.md', { 'blog-index': { scope: 'site' } })).toEqual([
      ['link', { rel: 'alternate', type: 'application/rss+xml', title: 'Blog', href: '/blog/feed.xml' }],
      ['meta', { property: 'og:url', content: 'https://example.com/blog/' }],
    ]);
  });

  it('describes a post for social cards and links its feeds', () => {
    const tags = head('blog/post.md', { blog: {} });
    const content = (key: string) =>
      tags.find(([, attributes]) => attributes.property === key || attributes.name === key)?.[1].content;
    expect(content('og:type')).toBe('article');
    expect(content('og:title')).toBe('Post');
    expect(content('og:description')).toBe('Short.');
    expect(content('og:url')).toBe('https://example.com/blog/post');
    expect(content('og:image')).toMatch(/^https:\/\/example.com\/blog-images\/p-[0-9a-f]{8}\.png$/);
    expect(content('twitter:card')).toBe('summary_large_image');
    expect(content('article:published_time')).toBe('2026-10-01T00:00:00.000Z');
    expect(content('article:author')).toBe('Jane');
    expect(content('article:section')).toBe('News');
    expect(tags).toContainEqual(['link', expect.objectContaining({ rel: 'alternate', href: '/blog/feed.xml' })]);
  });

  it('leaves out absolute URLs without a site URL', () => {
    const tags = head('blog/post.md', { blog: {} }, siteConfig({ userConfig: {} }));
    expect(tags.some(([, attributes]) => attributes.property === 'og:url' || attributes.property === 'og:image')).toBe(
      false,
    );
    expect(tags).toContainEqual(['meta', { name: 'twitter:card', content: 'summary' }]);
  });

  it('adds the base to feed links', () => {
    const tags = head('blog/index.md', { 'blog-index': true }, siteConfig({ site: { base: '/docs/' } }));
    expect(tags[0][1].href).toBe('/docs/blog/feed.xml');
  });

  it('ignores other pages', () => {
    expect(head('other.md', { title: 'x' })).toEqual([]);
  });
});

describe('blogPageData', () => {
  const pageData = (filePath: string, description = '') =>
    ({ filePath, description, frontmatter: { blog: true } }) as unknown as PageData;

  it('uses the summary, or the first paragraph, as the description', () => {
    const post = pageData('blog/post.md');
    blogPageData(post, { siteConfig: siteConfig() } as never);
    expect(post.description).toBe('Short.');

    const excerpt = pageData('blog/excerpt.md');
    blogPageData(excerpt, { siteConfig: siteConfig() } as never);
    expect(excerpt.description).toBe('From the first paragraph.');
  });

  it('keeps a description the page already has', () => {
    const post = pageData('blog/post.md', 'Mine.');
    blogPageData(post, { siteConfig: siteConfig() } as never);
    expect(post.description).toBe('Mine.');
  });
});

describe('writeBlogFeeds', () => {
  it('writes feeds without drafts and copies images', () => {
    writeBlogFeeds(siteConfig());
    const xml = readFileSync(path.join(outDir, 'blog/feed.xml'), 'utf8');
    expect(xml).toContain('<title>Post</title>');
    expect(xml).not.toContain('Draft');
    const image = /blog-images\/(p-[0-9a-f]{8}\.png)/.exec(xml)?.[1];
    expect(image && existsSync(path.join(outDir, 'blog-images', image))).toBe(true);
  });

  it('warns and writes nothing without a site URL', () => {
    const config = siteConfig({ userConfig: {}, outDir: path.join(outDir, 'none') });
    writeBlogFeeds(config);
    expect(config.logger.warn).toHaveBeenCalledWith(expect.stringContaining('no feeds written'));
    expect(existsSync(path.join(outDir, 'none'))).toBe(false);
  });
});

describe('withBlog', () => {
  it('runs existing hooks after its own', async () => {
    const calls: string[] = [];
    const config = withBlog({
      markdown: { config: () => calls.push('markdown') },
      transformHead: () => {
        calls.push('head');
        return [['meta', { name: 'mine', content: 'x' }]];
      },
      transformPageData: () => {
        calls.push('pageData');
      },
      buildEnd: () => {
        calls.push('buildEnd');
      },
    } as unknown as UserConfig);

    (config.markdown!.config as unknown as (md: Md) => void)(new MarkdownIt());
    const tags = await config.transformHead!({
      pageData: { filePath: '', frontmatter: {} },
      siteConfig: siteConfig(),
    } as never);
    await config.transformPageData!({ frontmatter: {} } as PageData, { siteConfig: siteConfig() } as never);
    await config.buildEnd!(siteConfig({ userConfig: {} }));

    expect(calls).toEqual(['markdown', 'head', 'pageData', 'buildEnd']);
    expect(tags).toEqual([['meta', { name: 'mine', content: 'x' }]]);
    expect(config.vite?.plugins).toHaveLength(1);
  });
});

describe('a real VitePress build', () => {
  it('builds the fixture site with lists, posts and feeds', async () => {
    const root = path.join(import.meta.dirname, 'fixtures/site');
    const out = mkdtempSync(path.join(tmpdir(), 'vitepress-blog-build-'));
    try {
      await build(root, { outDir: out });
      const blogPage = readFileSync(path.join(out, 'blog/index.html'), 'utf8');
      expect(blogPage).toContain('<a href="/team-a/launch">We launched</a>');
      expect(blogPage).toContain('<a href="/notes/orphan">Orphan post</a>');
      expect(blogPage).not.toContain('Internal notes');
      expect(blogPage).toContain('<span>The first post, with a {{ brace }} in it.</span>');
      // Keyword links keep their query string through VitePress's link handling.
      expect(blogPage).toContain('<a href="/blog/?tag=news">news</a>');
      expect(blogPage).toContain('data-vp-blog-sticky');
      // The Subscribe link to the blog's own feed, with VitePress's link handling.
      expect(blogPage).toMatch(/<span class="vp-blog-rss"><a href="\/blog\/feed.xml" title="RSS feed for Blog">/);

      const teamFeed = readFileSync(path.join(out, 'team-a/feed.xml'), 'utf8');
      expect(teamFeed).toContain('<title>Internal notes</title>');
      expect(teamFeed).not.toContain('Unfinished');

      // A `::: blog-posts` block on the home page: the main blog's two latest, pinned first, and a link.
      const home = readFileSync(path.join(out, 'index.html'), 'utf8');
      expect(home).toContain('class="vp-blog-widget"');
      expect(home).toContain('<a href="/team-a/launch">We launched</a>');
      expect(home).toContain('<a href="/blog/">Everything on the blog</a>');

      // The announcement banner, rendered on the server above the nav bar: the newest, and a count of both.
      expect(home).toMatch(
        /<div class="vp-blog-announcement" role="region" aria-label="Announcement"><div class="vp-blog-announcement__content"><a class="vp-blog-announcement__text" href="\/team-a\/launch">Team A shipped the thing<\/a><a class="vp-blog-announcement__count" href="\/blog\/\?announcements" title="2 announcements" aria-label="2 announcements">2<\/a>/,
      );
      expect(home.indexOf('vp-blog-announcement"')).toBeLessThan(home.indexOf('class="VPNav'));
      // VitePress minifies the script, so its quotes may change.
      expect(home).toMatch(/<script data-vp-blog-announcement="">try\{.*team-a\/launch\.md@2026-10-01T00:00:00\.000Z/);
      expect(blogPage.match(/ data-announcement>/g)).toHaveLength(2);

      const post = readFileSync(path.join(out, 'team-a/launch.html'), 'utf8');
      expect(post).toContain('<meta property="og:type" content="article">');
      expect(post).toContain('class="vp-blog-byline"');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
