import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { findBlogForPage } from '../src/collect.js';
import { indexBlogSource } from '../src/scan.js';
import { findWidgetBlog, resolveWidgetConfig } from '../src/widget.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();

function widget(body: string): string {
  return `::: blog-posts\n${body}:::\n`;
}

beforeAll(() => {
  site
    .write('index.md', '# Home\n')
    .write(
      'blog/index.md',
      frontmatter(['title: Blog', 'blog-index:', '  scope: site', '  folders: ./', '  stickyLimit: 2'], '# Blog\n'),
    )
    .write(
      'blog/one.md',
      frontmatter(['blog:', '  date: 2026-01-01', '  sticky: true', '  tags: [release]'], '# One\n'),
    )
    .write('blog/two.md', frontmatter(['blog:', '  date: 2026-02-01', '  sticky: true'], '# Two\n'))
    .write('blog/three.md', frontmatter(['blog:', '  date: 2026-03-01', '  tags: [release]'], '# Three\n'))
    .write('blog/four.md', frontmatter(['blog:', '  date: 2026-04-01'], '# Four\n'))
    .write('team/index.md', frontmatter(['title: Team blog', 'blog-index:', '  layout: compact'], '# Team\n'))
    .write('team/news.md', frontmatter(['blog:', '  date: 2026-05-01'], '# Team news\n'))
    .write('team/guide/page.md', '# A team page\n');
});

afterAll(() => site.remove());

/** Renders a page with the given source, at the given path. */
function render(relativePath: string, source: string): string {
  site.write(relativePath, source);
  return site.render(relativePath);
}

const titles = (html: string) =>
  [...html.matchAll(/vp-blog-card__title">\n<p><a href="[^"]+">([^<]+)<\/a>/g)].map((m) => m[1]);

describe('finding the blog', () => {
  const pages = () => indexBlogSource(site.root);

  it("uses the page's own blog: its section blog, else a main blog", () => {
    expect(findBlogForPage(pages(), 'team/guide/page.md')?.title).toBe('Team blog');
    // The main blog only covers blog/, but the home page still belongs to it.
    expect(findBlogForPage(pages(), 'index.md')?.title).toBe('Blog');
  });

  it.each([['/blog/'], ['/blog'], ['blog/index.md'], ['/blog/index.md'], ['../blog/']])('finds %s', (blog) => {
    expect(findWidgetBlog(pages(), blog, 'team/index.md')?.title).toBe('Blog');
  });

  it('finds nothing at a path with no blog page', () => {
    expect(findWidgetBlog(pages(), '/nowhere/', 'index.md')).toBeNull();
  });
});

describe('settings', () => {
  it('fills in defaults, leaving the rest to the blog page', () => {
    expect(resolveWidgetConfig('').config).toEqual({
      blog: '',
      limit: 5,
      stickyLimit: undefined,
      layout: undefined,
      showTags: undefined,
      tags: [],
      more: '',
    });
  });

  it('reads every setting', () => {
    const { config } = resolveWidgetConfig(
      'blog: /blog/\nlimit: 2\nstickyLimit: 0\nlayout: grid\nshowTags: false\ntags: [release]\nmore: Read more\n',
    );
    expect(config).toEqual({
      blog: '/blog/',
      limit: 2,
      stickyLimit: 0,
      layout: 'grid',
      showTags: false,
      tags: ['release'],
      more: 'Read more',
    });
    expect(resolveWidgetConfig('more: false').config.more).toBeNull();
  });

  it('reports YAML it cannot read', () => {
    expect(resolveWidgetConfig('limit: [').problem).toMatch(/not valid YAML/);
  });
});

describe('the block', () => {
  it("shows the blog's posts, pinned first, up to the block's limits, with a link to the blog", () => {
    const html = render('index.md', `# Home\n\n${widget('limit: 3\nstickyLimit: 1\n')}`);
    // Two is the newest sticky post; one is sticky too, but past the block's stickyLimit.
    expect(titles(html)).toEqual(['Two', 'Four', 'Three']);
    expect(html).toContain(
      '<div class="vp-blog-widget__footer">\n<p><a href="/blog/index.md">All posts in Blog</a></p>',
    );
  });

  it('defaults to the blog page stickyLimit and a limit of 5', () => {
    const html = render('index.md', `# Home\n\n${widget('')}`);
    expect(titles(html)).toEqual(['Two', 'One', 'Four', 'Three']);
  });

  it('filters by keyword, and its keyword chips link to the blog page', () => {
    const html = render('index.md', `# Home\n\n${widget('tags: release\nlayout: grid\n')}`);
    expect(titles(html)).toEqual(['One', 'Three']);
    expect(html).toContain('vp-blog-list--grid');
    expect(html).toContain('<a href="/blog/?tag=release">release</a>');
  });

  it("uses a section page's own blog and layout, and custom or no link text", () => {
    const html = render('team/guide/page.md', `# Page\n\n${widget('more: Team news →\n')}`);
    expect(html).toContain('vp-blog-list--compact');
    expect(html).toContain('>Team news</a>');
    expect(html).toContain('<a href="/team/index.md">Team news →</a>');
    expect(render('team/guide/page.md', `# Page\n\n${widget('more: false\n')}`)).not.toContain(
      'vp-blog-widget__footer',
    );
  });

  it('can show several blocks on one page', () => {
    const html = render('index.md', `# Home\n\n${widget('limit: 1\n')}\n${widget('blog: /team/\nlimit: 1\n')}`);
    expect(html.match(/vp-blog-widget"/g)).toHaveLength(2);
  });

  it('leaves a block inside a code fence as written', () => {
    const html = render('index.md', `# Home\n\n\`\`\`md\n${widget('limit: 1\n')}\`\`\`\n`);
    expect(html).not.toContain('vp-blog-widget');
    expect(html).toContain('::: blog-posts');
  });

  it('warns about a blog it cannot find, and shows nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = render('index.md', `# Home\n\n${widget('blog: /missing/\n')}`);
    expect(html).not.toContain('vp-blog-widget');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no blog page found at "/missing/"'));
    warn.mockRestore();
  });
});

describe('RSS links', () => {
  const rss = '<span class="vp-blog-rss"><a href="/blog/feed.xml" title="RSS feed for Blog">';

  it('puts a Subscribe link to the feed on blog pages, when the site writes feeds', () => {
    expect(site.render('blog/index.md', { siteUrl: 'https://example.com' })).toContain(rss);
    expect(site.render('blog/index.md', { siteUrl: 'https://example.com' })).toContain('Subscribe</a></span>');
    // Without a site URL no feed is written, so there is nothing to link.
    expect(site.render('blog/index.md')).not.toContain('vp-blog-rss');
  });

  it('can be turned off for every blog with the option', () => {
    expect(site.render('blog/index.md', { siteUrl: 'https://example.com', rssLink: false })).not.toContain(
      'vp-blog-rss',
    );
  });

  it("puts the blog's feed in a block's footer, and a block can leave it out", () => {
    site.write('index.md', `# Home\n\n${widget('limit: 1\n')}`);
    const html = site.render('index.md', { siteUrl: 'https://example.com' });
    expect(html).toMatch(
      /vp-blog-widget__footer">\n<p><span class="vp-blog-rss"><a href="\/blog\/feed.xml"[\s\S]*All posts in Blog<\/a><\/p>/,
    );
    site.write('index.md', `# Home\n\n${widget('limit: 1\nrssLink: false\n')}`);
    expect(site.render('index.md', { siteUrl: 'https://example.com' })).not.toContain('vp-blog-rss');
  });

  it("links a section blog's own feed", () => {
    site.write('team/guide/page.md', `# Page\n\n${widget('')}`);
    expect(site.render('team/guide/page.md', { siteUrl: 'https://example.com' })).toContain(
      '<a href="/team/feed.xml" title="RSS feed for Team blog">',
    );
  });

  it('leaves it out for a blog with feed: false', () => {
    site.write('quiet/index.md', frontmatter(['blog-index:', '  feed: false'], '# Quiet\n'));
    site.write('quiet/post.md', frontmatter(['blog: true'], '# Post\n'));
    expect(site.render('quiet/index.md', { siteUrl: 'https://example.com' })).not.toContain('vp-blog-rss');
  });
});
