import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPost, type PostPage } from '../src/collect.js';
import { collectArchive, collectCategories, toFilterUrl } from '../src/render.js';
import { indexBlogSource } from '../src/scan.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();

beforeAll(() => {
  site.write('news/index.md', frontmatter(['blog-index: true'], '# News\n'));
  const posts: [string, string[]][] = [
    // The newest post spells the category, as with keywords.
    ['fix', ['  date: 2026-10-12', '  category: Engineering', '  tags: [api]']],
    ['launch', ['  date: 2026-10-01', '  category: engineering', '  tags: [release]']],
    ['plan', ['  date: 2026-03-04', '  category: Product']],
    ['retro', ['  date: 2025-12-30']],
  ];
  for (const [name, extra] of posts) {
    site.write(`news/${name}.md`, frontmatter(['blog:', ...extra], `# ${name}\n`));
  }
  site.write('news/someday.md', frontmatter(['blog: true'], '# someday\n'));
});

afterAll(() => site.remove());

const posts = () => indexBlogSource(site.root).filter(isPost) as PostPage[];
const html = () => site.render('news/index.md');
/** One row of the browse panel, from its opening tag to its end. */
const row = (page: string, facet: string, year = '') => {
  const marker = page.indexOf(`data-vp-blog-facet="${facet}"${year ? ` data-year="${year}"` : ''}`);
  if (marker === -1) return '';
  const start = page.lastIndexOf('<div class="vp-blog-facet', marker);
  return page.slice(start, page.indexOf('</div>\n</div>', marker));
};

describe('collecting', () => {
  it('counts categories ignoring case, in the first spelling, alphabetically', () => {
    expect(collectCategories(posts())).toEqual([
      { value: 'Engineering', count: 2 },
      { value: 'Product', count: 1 },
    ]);
  });

  it('counts the years and months of dated posts, newest first', () => {
    expect(collectArchive(posts(), 'UTC')).toEqual([
      {
        value: '2026',
        count: 3,
        months: [
          { value: '2026-10', count: 2 },
          { value: '2026-03', count: 1 },
        ],
      },
      { value: '2025', count: 1, months: [{ value: '2025-12', count: 1 }] },
    ]);
  });

  it('builds filter links for each kind', () => {
    expect(toFilterUrl('news/index.md', 'category', 'R&D (Labs)')).toBe('/news/?category=r%26d%20%28labs%29');
    expect(toFilterUrl('news/archive.md', 'year', '2026')).toBe('/news/archive.md?year=2026');
    expect(toFilterUrl('index.md', 'month', '2026-10')).toBe('/?month=2026-10');
  });
});

describe('the browse panel', () => {
  it('has a row each for categories, keywords and the archive, in that order', () => {
    const page = html();
    expect(page).toContain('<nav class="vp-blog-browse" aria-label="Browse posts">');
    const order = ['category', 'tag', 'year', 'month'].map((facet) => page.indexOf(`data-vp-blog-facet="${facet}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(row(page, 'category')).toContain('role="group" aria-label="Categories"');
  });

  it('links each category and year to the blog, filtered, with its count', () => {
    const page = html();
    expect(row(page, 'category')).toContain(
      '<a href="/news/?category=engineering"><span class="vp-blog-facet__name">Engineering</span> <span class="vp-blog-facet__count">2</span></a>',
    );
    expect(row(page, 'year')).toContain(
      '<a href="/news/?year=2026"><span class="vp-blog-facet__name">2026</span> <span class="vp-blog-facet__count">3</span></a>',
    );
  });

  it('writes a hidden row of months for each year, short names with the full one as a tooltip', () => {
    const page = html();
    const months = row(page, 'month', '2026');
    expect(months).toContain('aria-label="Archive 2026"');
    expect(months).toContain(' hidden>');
    expect(months).toContain(
      '<a href="/news/?month=2026-10" title="October 2026"><span class="vp-blog-facet__name">Oct</span> <span class="vp-blog-facet__count">2</span></a>',
    );
    expect(months.indexOf('Oct')).toBeLessThan(months.indexOf('Mar'));
    expect(row(page, 'month', '2025')).toContain('Dec');
  });

  it('names months in the locale', () => {
    expect(row(site.render('news/index.md', { locale: 'de-DE' }), 'month', '2026')).toContain('title="Oktober 2026"');
  });

  it('shows the months of the only year without hiding them', () => {
    site.write('solo/index.md', frontmatter(['blog-index: true'], '# Solo\n'));
    site.write('solo/a.md', frontmatter(['blog:', '  date: 2026-01-05'], '# a\n'));
    site.write('solo/b.md', frontmatter(['blog:', '  date: 2026-02-05'], '# b\n'));
    const months = row(site.render('solo/index.md'), 'month', '2026');
    expect(months).toContain('Jan');
    expect(months).not.toContain(' hidden>');
  });

  it('leaves the archive out when every post is from the same month, and the panel when there is nothing to browse', () => {
    site.write('month/index.md', frontmatter(['blog-index: true'], '# Month\n'));
    site.write('month/a.md', frontmatter(['blog:', '  date: 2026-01-05'], '# a\n'));
    site.write('month/b.md', frontmatter(['blog:', '  date: 2026-01-20'], '# b\n'));
    const page = site.render('month/index.md');
    expect(page).not.toContain('data-vp-blog-facet');
    expect(page).not.toContain('vp-blog-browse');
  });

  it('leaves rows out with categoryList, tagList or archive set to false', () => {
    site.write(
      'quiet/index.md',
      frontmatter(['blog-index:', '  folders: [news]', '  categoryList: false', '  archive: false'], '# Quiet\n'),
    );
    const page = site.render('quiet/index.md');
    expect(page).not.toContain('data-vp-blog-facet="category"');
    expect(page).not.toContain('data-vp-blog-facet="year"');
    expect(page).toContain('data-vp-blog-facet="tag"');
  });
});

describe('cards', () => {
  it('carry each post category and month for the client', () => {
    const page = html();
    expect(page).toContain('data-tags="api" data-category="engineering" data-month="2026-10"');
    expect(page).toMatch(/data-tags="" data-month="2025-12">/);
    // An undated post has no month.
    expect(page).toMatch(/<article class="vp-blog-card" data-vp-blog-item data-tags="">/);
  });

  it('show the category above the title, linked to the blog filtered by it', () => {
    const page = html();
    expect(page).toContain(
      '<div class="vp-blog-card__category">\n<p><a href="/news/?category=engineering">Engineering</a></p>\n</div>\n<div class="vp-blog-card__title">\n<p><a href="/news/fix.md">',
    );
  });

  it('hide the category with showCategory: false', () => {
    site.write(
      'plain/index.md',
      frontmatter(['blog-index:', '  folders: [news]', '  showCategory: false'], '# Plain\n'),
    );
    expect(site.render('plain/index.md')).not.toContain('vp-blog-card__category');
  });

  it('use the month in the blog time zone', () => {
    site.write('zone/index.md', frontmatter(['blog-index: true'], '# Zone\n'));
    site.write('zone/late.md', frontmatter(['blog:', '  date: 2026-04-01T02:00:00Z'], '# late\n'));
    expect(site.render('zone/index.md', { timeZone: 'America/New_York' })).toContain('data-month="2026-03"');
  });
});

describe('grouping by month', () => {
  it('puts a month heading above each month, undated posts last', () => {
    site.write('monthly/index.md', frontmatter(['blog-index:', '  folders: [news]', '  groupBy: month'], '# M\n'));
    const page = site.render('monthly/index.md');
    const headings = [...page.matchAll(/<section class="vp-blog-group vp-blog-month">\n<h2>([^<]+)<\/h2>/g)].map(
      (match) => match[1],
    );
    expect(headings).toEqual(['October 2026', 'March 2026', 'December 2025', 'Undated']);
  });
});

describe('restricting a blog to categories', () => {
  it('lists only posts in one of them, in any case', () => {
    site.write(
      'eng/index.md',
      frontmatter(['blog-index:', '  folders: [news]', '  categories: [ENGINEERING]'], '# E\n'),
    );
    const page = site.render('eng/index.md');
    expect(page).toContain('>launch</a>');
    expect(page).toContain('>fix</a>');
    expect(page).not.toContain('>plan</a>');
    expect(page).not.toContain('>retro</a>');
  });
});

describe('a post', () => {
  it('links its category in the byline to its own blog, ahead of its keywords', () => {
    const page = site.render('news/fix.md');
    expect(page).toContain(
      '<span class="vp-blog-byline__category"><a href="/news/?category=engineering">Engineering</a></span> <span class="vp-blog-byline__tags">',
    );
  });
});

describe('a ::: blog-posts block', () => {
  it('lists only posts in its categories', () => {
    const source = '# Home\n\n::: blog-posts\nblog: /news/\ncategories: Product\n:::\n';
    site.write('home.md', source);
    const page = site.render('home.md');
    expect(page).toContain('>plan</a>');
    expect(page).not.toContain('>launch</a>');
    expect(page).toContain('<a href="/news/?category=product">Product</a>');
  });
});
