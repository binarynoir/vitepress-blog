// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyBlogView } from '../src/view.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();
let markup = '';
/** 40 keywords: `k00` is on 40 posts, `k01` on 39, and so on, so they rank `k00`, `k01`, `k02`… */
const TAG_COUNT = 40;

beforeAll(() => {
  site.write('news/index.md', frontmatter(['blog-index:', '  tagLimit: 5', '  pageSize: 0'], '# News\n'));
  for (let post = 0; post < TAG_COUNT; post++) {
    const tags = Array.from({ length: TAG_COUNT - post }, (_, at) => `k${String(at).padStart(2, '0')}`);
    // Two categories, so the category row stays, but under its limit.
    const category = post % 2 ? 'Odd' : 'Even';
    const date = `2026-${String((post % 12) + 1).padStart(2, '0')}-01`;
    site.write(
      `news/p${post}.md`,
      frontmatter(['blog:', `  date: ${date}`, `  category: ${category}`, `  tags: [${tags}]`], `# p${post}\n`),
    );
  }
  markup = site.render('news/index.md');
});

afterAll(() => site.remove());

beforeEach(() => {
  document.body.innerHTML = markup;
});

const blog = () => document.querySelector<HTMLElement>('[data-vp-blog]')!;
const view = (search: string) => applyBlogView(blog(), new URL(`http://localhost/news/${search}`));
const tagRow = () => document.querySelector<HTMLElement>('[data-vp-blog-facet="tag"]')!;
const shownTags = () =>
  [...tagRow().querySelectorAll<HTMLAnchorElement>('.vp-blog-facet__chips a')]
    .filter((anchor) => !anchor.hidden)
    .map((anchor) => anchor.querySelector('.vp-blog-facet__name')!.textContent);
const more = () => tagRow().querySelector<HTMLButtonElement>('.vp-blog-facet__more')!;
const field = () => tagRow().querySelector<HTMLInputElement>('.vp-blog-facet__filter')!;
const type = (text: string) => {
  field().value = text;
  field().dispatchEvent(new Event('input'));
};

describe('a long row, closed', () => {
  it('shows the most used chips up to its limit, then a button for the rest', () => {
    view('');
    expect(shownTags()).toEqual(['k00', 'k01', 'k02', 'k03', 'k04']);
    expect(more().hidden).toBe(false);
    expect(more().textContent).toBe('+35 more');
    expect(more().getAttribute('aria-expanded')).toBe('false');
    expect(field().hidden).toBe(true);
  });

  it('keeps an active chip in view, even past the limit', () => {
    view('?tag=k30');
    expect(shownTags()).toEqual(['k00', 'k01', 'k02', 'k03', 'k04', 'k30']);
    expect(more().textContent).toBe('+34 more');
  });

  it('leaves a row under its limit alone', () => {
    view('');
    const categories = document.querySelector<HTMLElement>('[data-vp-blog-facet="category"]')!;
    expect(categories.hasAttribute('data-limit')).toBe(false);
    expect(categories.querySelector('.vp-blog-facet__more')).toBeNull();
  });
});

describe('a long row, open', () => {
  it('lists every chip alphabetically, and closes again', () => {
    view('');
    more().click();
    expect(tagRow().classList.contains('is-open')).toBe(true);
    expect(shownTags()).toHaveLength(TAG_COUNT);
    expect(more().textContent).toBe('Show fewer');
    expect(more().getAttribute('aria-expanded')).toBe('true');
    // Alphabetical by CSS order, while the HTML keeps its most-used-first order.
    const ordered = [...tagRow().querySelectorAll<HTMLAnchorElement>('.vp-blog-facet__chips a')].sort(
      (a, b) => Number(a.style.order) - Number(b.style.order),
    );
    expect(ordered.slice(0, 3).map((anchor) => anchor.querySelector('.vp-blog-facet__name')!.textContent)).toEqual([
      'k00',
      'k01',
      'k02',
    ]);
    more().click();
    expect(shownTags()).toHaveLength(5);
  });

  it('stays open while the reader picks filters', () => {
    view('');
    more().click();
    view('?tag=k10');
    expect(tagRow().classList.contains('is-open')).toBe(true);
    expect(shownTags()).toHaveLength(TAG_COUNT);
  });

  it('has a field that narrows a very long row, named for the row', () => {
    view('');
    more().click();
    expect(field().hidden).toBe(false);
    expect(field().getAttribute('aria-label')).toBe('Filter Keywords');
    type('K1');
    expect(shownTags()).toEqual(['k10', 'k11', 'k12', 'k13', 'k14', 'k15', 'k16', 'k17', 'k18', 'k19']);
  });

  it('says so when nothing matches, and clears with Escape', () => {
    view('');
    more().click();
    type('zzz');
    expect(shownTags()).toEqual([]);
    expect(tagRow().querySelector<HTMLElement>('.vp-blog-facet__empty')!.hidden).toBe(false);
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(field().value).toBe('');
    expect(shownTags()).toHaveLength(TAG_COUNT);
  });

  it('adds its controls only once, however often the view is applied', () => {
    view('');
    view('?tag=k01');
    view('');
    expect(tagRow().querySelectorAll('.vp-blog-facet__more')).toHaveLength(1);
    expect(tagRow().querySelectorAll('.vp-blog-facet__filter')).toHaveLength(1);
  });
});
