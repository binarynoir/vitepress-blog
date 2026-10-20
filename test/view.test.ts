// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyBlogView } from '../src/view.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();
let markup = '';

beforeAll(() => {
  site.write('news/index.md', frontmatter(['blog-index:', '  pageSize: 2', '  groupBy: year'], '# News\n'));
  const posts: [string, string, string[]][] = [
    ['one', '2026-05-01', ['  sticky: true', '  tags: [release]']],
    ['two', '2026-04-01', ['  tags: [release, api]']],
    ['three', '2026-03-01', ['  tags: [api]']],
    ['four', '2026-02-01', ['  tags: [release]']],
    ['five', '2025-01-01', ['  tags: [release]']],
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

describe('pagination', () => {
  it('shows the pinned post and the first page', () => {
    expect(view('')).toEqual({ tag: '', page: 1, pageCount: 2 });
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
    expect(document.querySelector<HTMLElement>('[data-vp-blog-sticky]')!.hidden).toBe(true);
  });

  it('keeps a page number in range', () => {
    expect(view('?page=99').page).toBe(2);
    expect(view('?page=abc').page).toBe(1);
  });

  it('writes page links that keep the keyword', () => {
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

  it('says what it is filtering by, with a link to show everything', () => {
    view('?tag=release');
    const filter = document.querySelector<HTMLElement>('[data-vp-blog-filter]')!;
    expect(filter.hidden).toBe(false);
    expect(filter.textContent).toContain('Posts tagged release');
    expect(filter.querySelector('a')!.getAttribute('href')).toBe('/news/');
  });

  it('marks the active keyword link', () => {
    view('?tag=api');
    const active = [...document.querySelectorAll('.vp-blog-tags a.is-active')].map((a) => a.textContent);
    expect(active).toEqual(['api 2']);
  });

  it('says so when no post has the keyword, treating the keyword as text', () => {
    view('?tag=%3Cimg%20src%3Dx%3E');
    const filter = document.querySelector<HTMLElement>('[data-vp-blog-filter]')!;
    expect(shown()).toEqual([]);
    expect(filter.textContent).toContain('No posts tagged <img src=x>.');
    expect(filter.querySelector('img')).toBeNull();
  });

  it('is cleared without a keyword', () => {
    view('?tag=api');
    view('');
    expect(document.querySelector<HTMLElement>('[data-vp-blog-filter]')!.hidden).toBe(true);
    expect(document.querySelectorAll('.vp-blog-tags a.is-active')).toHaveLength(0);
  });
});
