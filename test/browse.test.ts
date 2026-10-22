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
/** One part of the browse panel: the category tabs, or a drop-down (`tag`, `date`), from its opening tag to its end. */
const row = (page: string, facet: string) => {
  const marker = page.indexOf(`data-vp-blog-facet="${facet}"`);
  if (marker === -1) return '';
  const start = page.lastIndexOf('<', marker);
  const ends = { category: '<div class="vp-blog-browse__tools">', tag: '</div>\n</div>' } as Record<string, string>;
  const end = page.indexOf(ends[facet] ?? '</details>', marker);
  return page.slice(start, end);
};
const names = (part: string) => [...part.matchAll(/facet__name">([^<]+)</g)].map((match) => match[1]);

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
  it('is a bar of category tabs and the date drop-down, then a line of keywords', () => {
    const page = html();
    expect(page).toContain('<nav class="vp-blog-browse" aria-label="Browse posts">\n<div class="vp-blog-browse__bar">');
    const order = ['category', 'date', 'tag'].map((facet) => page.indexOf(`data-vp-blog-facet="${facet}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThan(-1);
    expect(row(page, 'category')).toContain('<div class="vp-blog-tabs" role="group" aria-label="Categories"');
    expect(row(page, 'date')).toContain('data-label="Date">Date</span>');
    expect(row(page, 'tag')).toContain('<div class="vp-blog-keywords" role="group" aria-label="Keywords"');
    // The keywords come after the bar has closed.
    expect(page).toMatch(/<\/div>\n<\/div>\n<div class="vp-blog-keywords"/);
  });

  it('makes each category a tab with its count, after "All"', () => {
    const tabs = row(html(), 'category');
    expect(names(tabs)).toEqual(['All', 'Engineering', 'Product']);
    expect(tabs).toContain(
      '<a href="/news/?category="><span class="vp-blog-facet__name">All</span> <span class="vp-blog-facet__count">5</span></a>',
    );
    expect(tabs).toContain(
      '<a href="/news/?category=engineering"><span class="vp-blog-facet__name">Engineering</span> <span class="vp-blog-facet__count">2</span></a>',
    );
  });

  it('puts the keywords on the bar when there are no tabs', () => {
    site.write('tagged/index.md', frontmatter(['blog-index: true'], '# Tagged\n'));
    site.write('tagged/a.md', frontmatter(['blog:', '  tags: [x]'], '# a\n'));
    site.write('tagged/b.md', frontmatter(['blog:', '  tags: [y]'], '# b\n'));
    const page = site.render('tagged/index.md');
    expect(page).not.toContain('vp-blog-tabs');
    expect(page).toContain('<div class="vp-blog-browse__bar">\n<div class="vp-blog-keywords"');
  });

  it('puts the categories past categoryLimit under "More", with their counts', () => {
    site.write('cats/index.md', frontmatter(['blog-index:', '  categoryLimit: 1'], '# Cats\n'));
    site.write('cats/a.md', frontmatter(['blog:', '  category: Big'], '# a\n'));
    site.write('cats/b.md', frontmatter(['blog:', '  category: Big'], '# b\n'));
    site.write('cats/c.md', frontmatter(['blog:', '  category: Small'], '# c\n'));
    const tabs = row(site.render('cats/index.md'), 'category');
    expect(tabs).toContain('<div class="vp-blog-menu-wrap" data-vp-blog-menu="more">');
    expect(tabs).toContain('data-label="More">More</span>');
    const more = tabs.slice(tabs.indexOf('data-vp-blog-menu="more"'));
    expect(names(more)).toEqual(['Small']);
    expect(more).toContain('<span class="vp-blog-facet__count">1</span>');
  });

  it('lists each year in the date drop-down with its count, and its months under it', () => {
    const date = row(html(), 'date');
    expect(names(date)).toEqual(['All time', '2026', 'Oct', 'Mar', '2025', 'Dec']);
    expect(date).toContain(
      '<a href="/news/?year=2026"><span class="vp-blog-facet__name">2026</span> <span class="vp-blog-facet__count">3</span></a>',
    );
    expect(date).toContain('<div class="vp-blog-menu__year" data-year="2026">');
    expect(date).toContain(
      '<a href="/news/?month=2026-10" title="October 2026"><span class="vp-blog-facet__name">Oct</span> <span class="vp-blog-facet__count">2</span></a>',
    );
  });

  it('names months in the locale', () => {
    expect(row(site.render('news/index.md', { locale: 'de-DE' }), 'date')).toContain('title="Oktober 2026"');
  });

  it('heads the months of the only year with it, since choosing it would narrow nothing', () => {
    site.write('solo/index.md', frontmatter(['blog-index: true'], '# Solo\n'));
    site.write('solo/a.md', frontmatter(['blog:', '  date: 2026-01-05'], '# a\n'));
    site.write('solo/b.md', frontmatter(['blog:', '  date: 2026-02-05'], '# b\n'));
    const date = row(site.render('solo/index.md'), 'date');
    expect(names(date)).toEqual(['All time', '2026', 'Feb', 'Jan']);
    expect(date).toContain('<p><span class="vp-blog-facet__name">2026</span></p>');
    expect(date).not.toContain('?year=2026');
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
    expect(page).not.toContain('data-vp-blog-facet="date"');
    expect(page).toContain('data-vp-blog-facet="tag"');
  });
});

describe('parts that would not narrow the posts', () => {
  it('are left out: one category on every post, or one keyword on every post', () => {
    site.write('same/index.md', frontmatter(['blog-index: true'], '# Same\n'));
    site.write(
      'same/a.md',
      frontmatter(['blog:', '  date: 2026-01-05', '  category: Releases', '  tags: [x]'], '# a\n'),
    );
    site.write(
      'same/b.md',
      frontmatter(['blog:', '  date: 2026-02-05', '  category: Releases', '  tags: [x]'], '# b\n'),
    );
    const page = site.render('same/index.md');
    expect(page).not.toContain('data-vp-blog-facet="category"');
    expect(page).not.toContain('data-vp-blog-facet="tag"');
    expect(page).toContain('data-vp-blog-facet="date"');
  });

  it('stay when the one value is on only some posts, since choosing it still narrows them', () => {
    site.write('some/index.md', frontmatter(['blog-index: true'], '# Some\n'));
    site.write('some/a.md', frontmatter(['blog:', '  date: 2026-01-05', '  category: Releases'], '# a\n'));
    site.write('some/b.md', frontmatter(['blog:', '  date: 2026-01-06'], '# b\n'));
    expect(row(site.render('some/index.md'), 'category')).toContain('Releases');
  });
});

describe('long keyword lists', () => {
  beforeAll(() => {
    site.write('many/index.md', frontmatter(['blog-index:', '  tagLimit: 3', '  tagMinCount: 2'], '# Many\n'));
    // zeta on 3 posts, beta on 2, the rest on 1 or 2.
    const tags = [['zeta', 'beta', 'alpha'], ['zeta', 'beta', 'gamma'], ['zeta', 'delta', 'gamma'], ['solo']];
    tags.forEach((list, at) =>
      site.write(
        `many/p${at}.md`,
        frontmatter(['blog:', `  date: 2026-0${at + 1}-01`, `  tags: [${list}]`], `# p${at}\n`),
      ),
    );
  });

  it('list keywords most used first, then alphabetically', () => {
    expect(names(row(site.render('many/index.md'), 'tag'))).toEqual(['zeta', 'beta', 'gamma']);
  });

  it('leave out keywords used by fewer than tagMinCount posts', () => {
    const tags = row(site.render('many/index.md'), 'tag');
    expect(tags).not.toContain('>alpha<');
    expect(tags).not.toContain('>solo<');
  });

  it('carry their limit only when they have more chips than it', () => {
    site.write('many/index.md', frontmatter(['blog-index:', '  tagLimit: 2'], '# Many\n'));
    expect(row(site.render('many/index.md'), 'tag')).toContain('data-limit="2"');
    site.write('many/index.md', frontmatter(['blog-index:', '  tagLimit: 0'], '# Many\n'));
    expect(row(site.render('many/index.md'), 'tag')).not.toContain('data-limit');
    expect(row(html(), 'tag')).not.toContain('data-limit');
  });
});

describe('the Subscribe link', () => {
  it('ends the toolbar', () => {
    const page = site.render('news/index.md', { siteUrl: 'https://example.com' });
    const rss = page.indexOf('<div class="vp-blog-browse__rss">');
    expect(rss).toBeGreaterThan(page.indexOf('data-vp-blog-facet="date"'));
    expect(page.slice(rss, page.indexOf('</nav>', rss))).toContain('vp-blog-rss');
    expect(page).not.toContain('vp-blog-subscribe');
  });

  it('has a line of its own when there is no panel', () => {
    site.write('bare/index.md', frontmatter(['blog-index: true'], '# Bare\n'));
    site.write('bare/a.md', frontmatter(['blog:', '  date: 2026-01-05'], '# a\n'));
    const page = site.render('bare/index.md', { siteUrl: 'https://example.com' });
    expect(page).not.toContain('vp-blog-browse');
    expect(page).toContain('<div class="vp-blog-subscribe">');
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
