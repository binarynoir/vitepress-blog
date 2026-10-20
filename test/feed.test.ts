import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isIndex, isPost, type IndexPage, type PostPage } from '../src/collect.js';
import { renderFeed, resolvePostImage, toFeedPath, toPageUrl, type SiteLocation } from '../src/feed.js';
import { indexBlogSource, type BlogPage } from '../src/scan.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();
let pages: BlogPage[];

const location = (overrides: Partial<SiteLocation> = {}): SiteLocation => ({
  siteUrl: 'https://example.com',
  base: '/docs/',
  cleanUrls: true,
  publicDir: `${site.root}/public`,
  imagesDir: 'blog-images',
  ...overrides,
});

const post = (relativePath: string) =>
  pages.filter(isPost).find((page) => page.relativePath === relativePath) as PostPage;
const blog = (relativePath: string) =>
  pages.filter(isIndex).find((page) => page.relativePath === relativePath) as IndexPage;

beforeAll(() => {
  site
    .write('news/index.md', frontmatter(['title: News', 'description: All the news.', 'blog-index: true']))
    .write(
      'news/archive.md',
      frontmatter(['title: Archive', 'blog-index:', '  feed: { path: rss.xml, title: Archive feed }']),
    )
    .write(
      'news/a.md',
      frontmatter(
        [
          'blog:',
          '  date: 2026-10-01',
          '  summary: Fish & <chips>',
          '  image: ./a.png',
          '  author: { name: Jane, email: jane@example.com }',
          '  tags: [x]',
          '  category: News',
        ],
        '# A & B',
      ),
    )
    .write('news/a.png', Buffer.from('png'))
    .write('news/b.md', frontmatter(['blog:', '  image: /public-image.jpg'], '# B'))
    .write('public/public-image.jpg', Buffer.from('jpeg!'))
    .write('news/c.md', frontmatter(['blog:', '  image: https://cdn.example.com/c.webp'], '# C'))
    .write('news/d.md', frontmatter(['blog:', '  image: ./missing.png'], '# D'));
  pages = indexBlogSource(site.root);
});

afterAll(() => site.remove());

describe('URLs', () => {
  it('builds absolute page URLs with the base, honouring cleanUrls', () => {
    expect(toPageUrl('news/index.md', location())).toBe('https://example.com/docs/news/');
    expect(toPageUrl('news/a.md', location())).toBe('https://example.com/docs/news/a');
    expect(toPageUrl('news/a.md', location({ cleanUrls: false, base: '/' }))).toBe('https://example.com/news/a.html');
  });

  it('puts the feed beside its blog page', () => {
    expect(toFeedPath(blog('news/index.md'))).toBe('news/feed.xml');
    expect(toFeedPath(blog('news/archive.md'))).toBe('news/rss.xml');
  });
});

describe('resolvePostImage', () => {
  it('copies relative images under a content-hashed name', () => {
    const image = resolvePostImage(post('news/a.md'), location());
    expect(image).toMatchObject({
      outputPath: expect.stringMatching(/^blog-images\/a-[0-9a-f]{8}\.png$/),
      bytes: 3,
      type: 'image/png',
    });
    expect(image?.url).toBe(`https://example.com/docs/${image?.outputPath}`);
  });

  it('links public images where they are', () => {
    expect(resolvePostImage(post('news/b.md'), location())).toMatchObject({
      url: 'https://example.com/docs/public-image.jpg',
      bytes: 5,
      type: 'image/jpeg',
    });
  });

  it('keeps URLs, and skips missing files', () => {
    expect(resolvePostImage(post('news/c.md'), location())).toEqual({
      url: 'https://cdn.example.com/c.webp',
      type: 'image/webp',
    });
    expect(resolvePostImage(post('news/d.md'), location())).toBeNull();
  });
});

describe('renderFeed', () => {
  const feed = () =>
    renderFeed({
      index: blog('news/index.md'),
      posts: [post('news/a.md'), post('news/b.md')],
      site: location(),
      language: 'en-US',
    });

  it('describes the channel', () => {
    const xml = feed();
    expect(xml).toContain('<title>News</title>');
    expect(xml).toContain('<link>https://example.com/docs/news/</link>');
    expect(xml).toContain('<description>All the news.</description>');
    expect(xml).toContain(
      '<atom:link href="https://example.com/docs/news/feed.xml" rel="self" type="application/rss+xml" />',
    );
    expect(xml).toContain('<language>en-US</language>');
    expect(xml).toContain('<lastBuildDate>Thu, 01 Oct 2026 00:00:00 GMT</lastBuildDate>');
  });

  it('writes each post as an item, escaped', () => {
    const xml = feed();
    expect(xml).toContain('<title>A &#38; B</title>');
    expect(xml).toContain('<guid isPermaLink="true">https://example.com/docs/news/a</guid>');
    expect(xml).toContain('<pubDate>Thu, 01 Oct 2026 00:00:00 GMT</pubDate>');
    expect(xml).toContain('<description>Fish &#38; &#60;chips&#62;</description>');
    expect(xml).toContain('<dc:creator>jane@example.com (Jane)</dc:creator>');
    expect(xml).toContain('<category>News</category>');
    expect(xml).toContain('<category>x</category>');
    expect(xml).toMatch(
      /<enclosure url="https:\/\/example.com\/docs\/blog-images\/a-[0-9a-f]{8}\.png" length="3" type="image\/png" \/>/,
    );
  });

  it('leaves out pubDate for an undated post', () => {
    const items = feed().split('<item>');
    expect(items[2]).not.toContain('pubDate');
  });

  it('uses the feed title from frontmatter', () => {
    const xml = renderFeed({ index: blog('news/archive.md'), posts: [], site: location() });
    expect(xml).toContain('<title>Archive feed</title>');
  });
});
