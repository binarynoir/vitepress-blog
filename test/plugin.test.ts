import MarkdownIt from 'markdown-it';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blogMarkdown, insertAfterTitle } from '../src/plugin.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();

beforeAll(() => {
  site
    .write('news/index.md', frontmatter(['blog-index: true'], '# News\n\nIntro.\n\n<!-- blog-posts -->\n\nOutro.\n'))
    .write(
      'news/first.md',
      frontmatter(
        [
          'blog:',
          '  date: 2026-01-15',
          '  summary: "Braces {{ stay }} and <b>tags</b> stay text."',
          '  image: ./img/cover.png',
          '  imageAlt: Cover',
          '  author: { name: Jane, url: https://jane.dev }',
          '  tags: [intro]',
        ],
        '# First\n\nBody.\n',
      ),
    )
    .write(
      'news/second.md',
      frontmatter(
        ['blog:', '  date: 2026-02-20', '  updated: 2026-02-21', '  author: [Sam, Kim]'],
        '# Second\n\nBody.\n',
      ),
    )
    .write('news/third.md', frontmatter(['blog:', '  date: 2025-12-01', '  draft: true'], '# Third\n'))
    .write('news/img/cover.png', Buffer.from([0]))
    .write(
      'archive/index.md',
      frontmatter(['blog-index:', '  folders: [news]', '  layout: compact', '  groupBy: year'], '# Archive\n'),
    )
    .write('cards/index.md', frontmatter(['blog-index:', '  folders: [news]'], '# Cards\n'))
    .write('news/quiet.md', frontmatter(['blog:', '  byline: false', '  postNav: false'], '# Quiet\n'))
    .write('empty/index.md', frontmatter(['blog-index: true'], '# Nothing here\n'));
});

afterAll(() => site.remove());

describe('blog pages', () => {
  it('puts the list at the placeholder, newest first, without drafts', () => {
    const html = site.render('news/index.md');
    expect(html.indexOf('Intro.')).toBeLessThan(html.indexOf('vp-blog-list'));
    expect(html.indexOf('vp-blog-list')).toBeLessThan(html.indexOf('Outro.'));
    expect(html.indexOf('>Second</a>')).toBeLessThan(html.indexOf('>First</a>'));
    expect(html).not.toContain('Third');
  });

  it('links posts by their Markdown path, so VitePress can check them and add the base', () => {
    expect(site.render('news/index.md')).toContain('<a href="/news/first.md">First</a>');
  });

  it('writes card images relative to the blog page', () => {
    expect(site.render('cards/index.md')).toContain('<img src="../news/img/cover.png" alt="Cover">');
    expect(site.render('news/index.md')).toContain('<img src="./img/cover.png" alt="Cover">');
  });

  it('letterboxes an image with imageFit: contain, and positions a cropped one', () => {
    site
      .write('fit/index.md', frontmatter(['blog-index: true'], '# Fit\n'))
      .write('fit/logo.md', frontmatter(['blog:', '  image: /logo.png', '  imageFit: contain'], '# Logo\n'))
      .write('fit/photo.md', frontmatter(['blog:', '  image: /photo.jpg', '  imagePosition: top'], '# Photo\n'));
    const html = site.render('fit/index.md');
    expect(html).toMatch(
      /<article class="vp-blog-card vp-blog-card--with-image vp-blog-card--contain" data-vp-blog-item/,
    );
    expect(html).toContain(
      '<article class="vp-blog-card vp-blog-card--with-image" style="--vp-blog-image-position: top"',
    );
  });

  it('keeps summaries literal: HTML escaped, Vue braces in v-pre', () => {
    const html = site.render('news/index.md');
    expect(html).toContain('<span v-pre>Braces {{ stay }} and &lt;b&gt;tags&lt;/b&gt; stay text.</span>');
  });

  it('writes dates, reading time, authors and tags', () => {
    const html = site.render('news/index.md');
    expect(html).toContain('<time datetime="2026-01-15">January 15, 2026</time>');
    expect(html).toContain('1 min read');
    expect(html).toContain('By <a href="https://jane.dev">Jane</a>');
    expect(html).toContain('By Sam and Kim');
    // Keywords link to the blog page, filtered by them.
    expect(html).toContain('<a href="/news/?tag=intro">intro</a>');
  });

  it('appends the list when there is no placeholder, and groups compact lists by year', () => {
    const html = site.render('archive/index.md');
    expect(html).toMatch(/<h2>2026<\/h2>[\s\S]*<h2>2025<\/h2>|<h2>2026<\/h2>/);
    expect(html).toContain('vp-blog-list--compact');
    expect(html).toMatch(
      /<li><span hidden data-vp-blog-item data-tags="" data-month="2026-02"><\/span><time datetime="2026-02-20">February 20, 2026<\/time> <a href="\/news\/second.md">Second<\/a><\/li>/,
    );
  });

  it('shows drafts, marked, when drafts is on', () => {
    const html = site.render('news/index.md', { drafts: true });
    expect(html).toContain('>Third</a>');
    expect(html).toContain('vp-blog-badge--draft');
  });

  it('says so when a blog has no posts', () => {
    expect(site.render('empty/index.md')).toContain('<p class="vp-blog-empty">No posts yet.</p>');
  });

  it('uses the locale, date format and labels options', () => {
    const html = site.render('news/index.md', {
      locale: 'de-DE',
      dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
      labels: { by: 'Von', readingTime: '{n} Min.' },
      wordsPerMinute: 200,
    });
    expect(html).toContain('15. Jan. 2026');
    expect(html).toContain('Von Sam und Kim');
    expect(html).toContain('1 Min.');
  });
});

describe('posts', () => {
  it('adds a byline under the title', () => {
    const html = site.render('news/second.md');
    expect(html).toMatch(/<h1>Second<\/h1>\n<div class="vp-blog-byline">/);
    expect(html).toContain('Updated <time datetime="2026-02-21">February 21, 2026</time>');
  });

  it('links to the newer and older posts and back to the blog', () => {
    const html = site.render('news/first.md');
    expect(html).toContain(
      '<span class="vp-blog-post-nav__label">Newer post</span><br>\n<a href="/news/second.md">Second</a>',
    );
    // Undated posts sort last, so Quiet is older than First.
    expect(html).toContain(
      '<span class="vp-blog-post-nav__label">Older post</span><br>\n<a href="/news/quiet.md">Quiet</a>',
    );
    expect(site.render('news/second.md')).toContain('<div class="vp-blog-post-nav__newer"></div>');
    expect(html).toContain('<a href="/news/index.md">All posts in News</a>');
  });

  it('shows the cover image when asked', () => {
    expect(site.render('news/first.md', { cover: true })).toContain('<img src="./img/cover.png" alt="Cover">');
    expect(site.render('news/first.md')).not.toContain('vp-blog-cover');
  });

  it('lets a post turn the byline and links off', () => {
    const html = site.render('news/quiet.md');
    expect(html).not.toContain('vp-blog-byline');
    expect(html).not.toContain('vp-blog-post-nav');
  });

  it('honours the byline and postNav options', () => {
    const html = site.render('news/first.md', { byline: false, postNav: false });
    expect(html).not.toContain('vp-blog-byline');
    expect(html).not.toContain('vp-blog-post-nav');
  });
});

describe('insertAfterTitle', () => {
  it('skips headings inside code', () => {
    expect(insertAfterTitle('```md\n# Code\n```\n# Real\ntext', 'X')).toBe('```md\n# Code\n```\n# Real\n\nX\n\ntext');
  });

  it('puts it at the top when there is no title', () => {
    expect(insertAfterTitle('text', 'X')).toBe('X\n\ntext');
  });
});

describe('outside VitePress', () => {
  it('does nothing without env.path and env.relativePath', () => {
    const md = new MarkdownIt({ html: true }).use(blogMarkdown);
    expect(md.render('# Hi', { frontmatter: { blog: true } })).toBe('<h1>Hi</h1>\n');
  });
});
