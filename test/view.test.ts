// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyBlogView, readFilter } from '../src/view.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();
let markup = '';

beforeAll(() => {
  site.write('news/index.md', frontmatter(['blog-index:', '  pageSize: 2', '  groupBy: year'], '# News\n'));
  const posts: [string, string, string[]][] = [
    ['one', '2026-05-01', ['  pinned: true', '  tags: [release]', '  category: Engineering']],
    ['two', '2026-04-01', ['  tags: [release, api]', '  category: Product']],
    ['three', '2026-03-01', ['  tags: [api]', '  announcement: true', '  category: Engineering']],
    ['four', '2026-02-01', ['  tags: [release]', '  announcement: true']],
    ['five', '2025-01-01', ['  tags: [release]', '  announcement: true', '  category: Engineering']],
  ];
  for (const [name, date, extra] of posts) {
    site.write(`news/${name}.md`, frontmatter(['blog:', `  date: ${date}`, ...extra], `# ${name}\n`));
  }
  markup = site.render('news/index.md');
});

afterAll(() => site.remove());

beforeEach(() => {
  document.body.innerHTML = markup;
});

const blog = () => document.querySelector<HTMLElement>('[data-vp-blog]')!;
const view = (search: string) => applyBlogView(blog(), new URL(`http://localhost/news/${search}`));
const shown = () =>
  [...document.querySelectorAll('article')]
    .filter((article) => !article.hidden)
    .map((article) => article.querySelector('.vp-blog-card__title a')!.textContent);
const filter = () => document.querySelector<HTMLElement>('[data-vp-blog-filter]')!;
/** A browse chip by its row and name. */
const chip = (facet: string, name: string) =>
  [...document.querySelectorAll<HTMLAnchorElement>(`[data-vp-blog-facet="${facet}"] a`)].find(
    (anchor) => anchor.querySelector('.vp-blog-facet__name')!.textContent === name,
  )!;
const count = (anchor: HTMLAnchorElement) => anchor.querySelector('.vp-blog-facet__count')!.textContent;
const monthRows = () =>
  [...document.querySelectorAll<HTMLElement>('[data-vp-blog-facet="month"]')].map((row) => [
    row.dataset.year,
    row.hidden,
  ]);

describe('reading the URL', () => {
  const read = (search: string) => readFilter(new URL(`http://localhost/news/${search}`));

  it('lowercases the category and keyword', () => {
    expect(read('?category=Engineering&tag=API')).toEqual({
      category: 'engineering',
      tag: 'api',
      date: '',
      announcements: false,
    });
  });

  it('takes a year or a month, the month winning', () => {
    expect(read('?year=2026').date).toBe('2026');
    expect(read('?month=2026-03').date).toBe('2026-03');
    expect(read('?year=2025&month=2026-03').date).toBe('2026-03');
  });

  it('ignores dates that are not a year or a month', () => {
    expect(read('?year=26').date).toBe('');
    expect(read('?month=2026-13').date).toBe('');
    expect(read('?month=2026-3&year=2025').date).toBe('2025');
  });
});

describe('pagination', () => {
  it('shows the pinned post and the first page', () => {
    expect(view('')).toEqual({
      category: '',
      tag: '',
      date: '',
      announcements: false,
      page: 1,
      pageCount: 2,
    });
    expect(shown()).toEqual(['one', 'two', 'three']);
  });

  it('shows later pages without the pinned post, and hides years with nothing showing', () => {
    view('?page=2');
    expect(shown()).toEqual(['four', 'five']);
    const years = [...document.querySelectorAll<HTMLElement>('.vp-blog-year')];
    expect(years.map((year) => [year.querySelector('h2')!.textContent, year.hidden])).toEqual([
      ['2026', false],
      ['2025', false],
    ]);
    expect(document.querySelector<HTMLElement>('[data-vp-blog-pinned]')!.hidden).toBe(true);
  });

  it('keeps a page number in range', () => {
    expect(view('?page=99').page).toBe(2);
    expect(view('?page=abc').page).toBe(1);
  });

  it('writes page links that keep the filters', () => {
    view('?tag=release&page=1');
    const pagination = document.querySelector<HTMLElement>('[data-vp-blog-pagination]')!;
    expect(pagination.hidden).toBe(false);
    expect([...pagination.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/news/?tag=release&page=2',
      '/news/?tag=release&page=2',
    ]);
    expect(pagination.querySelector('[aria-current="page"]')!.textContent).toBe('1');
  });

  it('hides the page links when everything fits on one page', () => {
    view('?tag=api');
    expect(document.querySelector<HTMLElement>('[data-vp-blog-pagination]')!.hidden).toBe(true);
  });
});

describe('keyword filter', () => {
  it('shows only posts with the keyword, ignoring case', () => {
    view('?tag=API');
    expect(shown()).toEqual(['two', 'three']);
  });

  it('says how many posts match, with a chip that removes it and a link to show everything', () => {
    view('?tag=release');
    expect(filter().hidden).toBe(false);
    expect(filter().querySelector('.vp-blog-filter__count')!.textContent).toBe('4 posts');
    const remove = filter().querySelector<HTMLAnchorElement>('.vp-blog-filter__chip')!;
    expect(remove.textContent).toBe('Keyword release×');
    expect(remove.getAttribute('aria-label')).toBe('Remove filter: Keyword release');
    expect(remove.getAttribute('href')).toBe('/news/');
    expect(filter().querySelector('.vp-blog-filter__clear')!.getAttribute('href')).toBe('/news/');
  });

  it('marks the active keyword chip', () => {
    view('?tag=api');
    const active = [...document.querySelectorAll('.vp-blog-facet a.is-active')].map((a) => a.textContent);
    expect(active).toEqual(['api 2']);
    expect(chip('tag', 'api').getAttribute('aria-current')).toBe('true');
  });

  it('says so when no post matches, treating the keyword as text', () => {
    view('?tag=%3Cimg%20src%3Dx%3E');
    expect(shown()).toEqual([]);
    expect(filter().textContent).toContain('No posts match these filters.');
    expect(filter().textContent).toContain('<img src=x>');
    expect(filter().querySelector('img')).toBeNull();
  });

  it('is cleared without a filter', () => {
    view('?tag=api');
    view('');
    expect(filter().hidden).toBe(true);
    expect(document.querySelectorAll('.vp-blog-facet a.is-active')).toHaveLength(0);
  });
});

describe('category filter', () => {
  it('shows only posts in the category, ignoring case', () => {
    expect(view('?category=ENGINEERING').category).toBe('engineering');
    expect(shown()).toEqual(['one', 'three', 'five']);
  });

  it('names the category as its posts spell it', () => {
    view('?category=engineering');
    expect(filter().querySelector('.vp-blog-filter__chip')!.textContent).toBe('Category Engineering×');
  });

  it('marks the category link on cards', () => {
    view('?category=engineering');
    const marked = [...document.querySelectorAll('.vp-blog-card__category a.is-active')];
    expect(marked).toHaveLength(3);
    expect(document.querySelectorAll('.vp-blog-card__category a:not(.is-active)')).toHaveLength(1);
  });
});

describe('date filter', () => {
  it('shows a year, hiding the other years', () => {
    expect(view('?year=2025').date).toBe('2025');
    expect(shown()).toEqual(['five']);
    const years = [...document.querySelectorAll<HTMLElement>('.vp-blog-year')].map((year) => year.hidden);
    expect(years).toEqual([true, false]);
    expect(filter().querySelector('.vp-blog-filter__chip')!.textContent).toBe('2025×');
  });

  it('shows a month, named in the blog locale', () => {
    view('?month=2026-03');
    expect(shown()).toEqual(['three']);
    expect(filter().querySelector('.vp-blog-filter__chip')!.textContent).toBe('March 2026×');
  });

  it('leaves out undated posts', () => {
    document.querySelector('[data-month]')!.removeAttribute('data-month');
    view('?year=2026');
    expect(shown()).toEqual(['two', 'three']);
  });
});

describe('combined filters', () => {
  it('shows only posts matching every filter', () => {
    view('?category=engineering&year=2026');
    expect(shown()).toEqual(['one', 'three']);
    view('?category=engineering&tag=release&year=2025');
    expect(shown()).toEqual(['five']);
    expect(filter().querySelector('.vp-blog-filter__count')!.textContent).toBe('1 post');
  });

  it('removes one filter at a time, keeping the others', () => {
    view('?category=engineering&tag=release&page=2');
    const removes = [...filter().querySelectorAll('.vp-blog-filter__chip')].map((a) => a.getAttribute('href'));
    expect(removes).toEqual(['/news/?tag=release', '/news/?category=engineering']);
  });

  it('shows announcements as a removable filter too', () => {
    expect(view('?announcements&tag=api')).toMatchObject({ announcements: true, tag: 'api' });
    expect(shown()).toEqual(['three']);
    const chips = [...filter().querySelectorAll('.vp-blog-filter__chip')];
    expect(chips.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Announcements×', '/news/?tag=api'],
      ['Keyword api×', '/news/?announcements'],
    ]);
  });
});

describe('the browse panel', () => {
  it('links each chip to the current view with it added, back to page 1', () => {
    view('?category=engineering&page=2');
    expect(chip('tag', 'release').getAttribute('href')).toBe('/news/?category=engineering&tag=release');
    expect(chip('year', '2026').getAttribute('href')).toBe('/news/?category=engineering&year=2026');
    // Another category replaces the one in view.
    expect(chip('category', 'Product').getAttribute('href')).toBe('/news/?category=product');
  });

  it('takes an active chip off again', () => {
    view('?category=engineering&tag=release');
    expect(chip('category', 'Engineering').getAttribute('href')).toBe('/news/?tag=release');
    expect(chip('tag', 'release').getAttribute('href')).toBe('/news/?category=engineering');
  });

  it('counts what each chip would show with the other filters kept', () => {
    view('?category=engineering');
    expect(count(chip('tag', 'release'))).toBe('2');
    expect(count(chip('tag', 'api'))).toBe('1');
    expect(count(chip('year', '2026'))).toBe('2');
    // A category chip counts with the other categories set aside.
    expect(count(chip('category', 'Product'))).toBe('1');
  });

  it('dims chips that would show nothing', () => {
    view('?tag=api');
    expect(chip('year', '2025').classList.contains('is-empty')).toBe(true);
    expect(chip('year', '2026').classList.contains('is-empty')).toBe(false);
  });

  it('restores the counts when the filters are cleared', () => {
    view('?category=engineering');
    view('');
    expect(count(chip('tag', 'release'))).toBe('4');
    expect(chip('tag', 'release').getAttribute('href')).toBe('/news/?tag=release');
  });

  it('shows the months of the year in view', () => {
    view('');
    expect(monthRows()).toEqual([
      ['2026', true],
      ['2025', true],
    ]);
    view('?year=2026');
    expect(monthRows()).toEqual([
      ['2026', false],
      ['2025', true],
    ]);
    expect(chip('year', '2026').classList.contains('is-active')).toBe(true);
  });

  it('keeps a month inside its year: the year stays active, and both step back out', () => {
    view('?month=2025-01');
    expect(monthRows()).toEqual([
      ['2026', true],
      ['2025', false],
    ]);
    const january = chip('month', 'Jan');
    expect(january.classList.contains('is-active')).toBe(true);
    expect(january.getAttribute('title')).toBe('January 2025');
    expect(january.getAttribute('href')).toBe('/news/?year=2025');
    expect(chip('year', '2025').classList.contains('is-active')).toBe(true);
    expect(chip('year', '2025').getAttribute('href')).toBe('/news/?year=2025');
    view('?year=2025');
    expect(chip('year', '2025').getAttribute('href')).toBe('/news/');
  });
});
