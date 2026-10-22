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
/** A drop-down by its facet (`tag`, `date`, `more`): its button's text, and the link beside it that takes it off. */
const menu = (facet: string) => {
  const wrap = document.querySelector<HTMLElement>(`[data-vp-blog-menu="${facet}"]`)!;
  return {
    wrap,
    text: wrap.querySelector('.vp-blog-menu__text')!.textContent,
    clear: wrap.querySelector<HTMLAnchorElement>('.vp-blog-menu__clear'),
  };
};

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

  it('says how many posts match, with a link that takes every filter off', () => {
    view('?tag=release');
    expect(filter().hidden).toBe(false);
    expect(filter().querySelector('.vp-blog-filter__count')!.textContent).toBe('4 posts');
    expect(filter().querySelector('.vp-blog-filter__chip')).toBeNull();
    expect(filter().querySelector('.vp-blog-filter__clear')!.getAttribute('href')).toBe('/news/');
  });

  it('takes the keyword off from its own chip', () => {
    view('?tag=release');
    expect(chip('tag', 'release').getAttribute('href')).toBe('/news/');
  });

  it('marks the active keyword choice', () => {
    view('?tag=api');
    const active = [...document.querySelectorAll('[data-vp-blog-facet="tag"] .vp-blog-facet__chips a.is-active')];
    expect(active.map((a) => a.textContent)).toEqual(['api 2']);
    expect(chip('tag', 'api').getAttribute('aria-current')).toBe('true');
  });

  it('says so when no post matches, treating the keyword as text', () => {
    view('?tag=%3Cimg%20src%3Dx%3E');
    expect(shown()).toEqual([]);
    expect(filter().textContent).toContain('No posts match these filters.');
    expect(document.querySelector('img')).toBeNull();
  });

  it('is cleared without a filter', () => {
    view('?tag=api');
    view('');
    expect(filter().hidden).toBe(true);
    expect(document.querySelectorAll('.vp-blog-keywords a.is-active')).toHaveLength(0);
  });
});

describe('category filter', () => {
  it('shows only posts in the category, ignoring case', () => {
    expect(view('?category=ENGINEERING').category).toBe('engineering');
    expect(shown()).toEqual(['one', 'three', 'five']);
  });

  it('marks its tab, and "All" without one', () => {
    view('?category=engineering');
    const active = () =>
      [...document.querySelectorAll('.vp-blog-tabs a.is-active')].map(
        (a) => a.querySelector('.vp-blog-facet__name')!.textContent,
      );
    expect(active()).toEqual(['Engineering']);
    expect(chip('category', 'All').getAttribute('href')).toBe('/news/');
    view('');
    expect(active()).toEqual(['All']);
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
    expect(menu('date').text).toBe('2025');
  });

  it('shows a month, named in the blog locale', () => {
    view('?month=2026-03');
    expect(shown()).toEqual(['three']);
    expect(menu('date').text).toBe('March 2026');
    expect(menu('date').clear!.getAttribute('aria-label')).toBe('Remove filter: March 2026');
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
    expect(chip('category', 'All').getAttribute('href')).toBe('/news/?tag=release');
    expect(chip('tag', 'release').getAttribute('href')).toBe('/news/?category=engineering');
  });

  it('shows announcements as a removable filter too', () => {
    expect(view('?announcements&tag=api')).toMatchObject({ announcements: true, tag: 'api' });
    expect(shown()).toEqual(['three']);
    const chips = [...filter().querySelectorAll('.vp-blog-filter__chip')];
    // Announcements have no place in the toolbar, so they get a chip of their own.
    expect(chips.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Announcements×', '/news/?tag=api']]);
  });
});

describe('the browse panel', () => {
  it('links each chip to the current view with it added, back to page 1', () => {
    view('?category=engineering&page=2');
    expect(chip('tag', 'release').getAttribute('href')).toBe('/news/?category=engineering&tag=release');
    expect(chip('date', '2026').getAttribute('href')).toBe('/news/?category=engineering&year=2026');
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
    expect(count(chip('date', '2026'))).toBe('2');
    // A category tab counts with the other categories set aside.
    expect(count(chip('category', 'Product'))).toBe('1');
    expect(count(chip('category', 'All'))).toBe('5');
  });

  it('dims chips that would show nothing', () => {
    view('?tag=api');
    expect(chip('date', '2025').classList.contains('is-empty')).toBe(true);
    expect(chip('date', '2026').classList.contains('is-empty')).toBe(false);
  });

  it('restores the counts when the filters are cleared', () => {
    view('?category=engineering');
    view('');
    expect(count(chip('tag', 'release'))).toBe('4');
    expect(chip('tag', 'release').getAttribute('href')).toBe('/news/?tag=release');
  });

  it('closes its drop-downs once a choice is followed', () => {
    const details = menu('date').wrap.querySelector('details')!;
    details.open = true;
    view('?tag=api');
    expect(details.open).toBe(false);
  });

  it('closes an open drop-down on a click outside it, or on Escape', () => {
    view('');
    const details = menu('date').wrap.querySelector('details')!;
    details.open = true;
    details.querySelector('.vp-blog-menu__panel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(details.open).toBe(true);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(details.open).toBe(false);
    details.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(details.querySelector('summary'));
  });

  it('keeps a month inside its year: the year stays active, and both step back out', () => {
    view('?month=2025-01');
    const january = chip('date', 'Jan');
    expect(january.classList.contains('is-active')).toBe(true);
    expect(january.getAttribute('title')).toBe('January 2025');
    expect(january.getAttribute('href')).toBe('/news/?year=2025');
    expect(chip('date', '2025').classList.contains('is-active')).toBe(true);
    expect(chip('date', '2025').getAttribute('href')).toBe('/news/?year=2025');
    view('?year=2025');
    expect(chip('date', '2025').getAttribute('href')).toBe('/news/');
  });
});
