import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPost, pinStickyPosts, type PostPage } from '../src/collect.js';
import { collectTags, toTagUrl } from '../src/render.js';
import { indexBlogSource } from '../src/scan.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();

function post(name: string, date: string, extra: string[] = []): [string, string] {
  return [`news/${name}.md`, frontmatter(['blog:', `  date: ${date}`, ...extra], `# ${name}\n\nBody.\n`)];
}

beforeAll(() => {
  site.write(
    'news/index.md',
    frontmatter(['title: News', 'blog-index:', '  stickyLimit: 1', '  pageSize: 2'], '# News\n'),
  );
  for (const [path, content] of [
    post('alpha', '2026-01-01', ['  sticky: true', '  tags: [Release, api]']),
    post('beta', '2026-02-01', ['  sticky: true', '  tags: [release]']),
    post('gamma', '2026-03-01', ['  tags: [api]']),
    post('delta', '2026-04-01'),
  ]) {
    site.write(path, content);
  }
});

afterAll(() => site.remove());

describe('pinStickyPosts', () => {
  const posts = () =>
    indexBlogSource(site.root)
      .filter(isPost)
      .sort((a, b) => b.post.date!.getTime() - a.post.date!.getTime()) as PostPage[];
  const titles = (list: PostPage[]) => list.map((page) => page.post.title);

  it('pins the newest sticky posts up to the limit, and keeps the rest in date order', () => {
    const { pinned, rest } = pinStickyPosts(posts(), 1);
    expect(titles(pinned)).toEqual(['beta']);
    expect(titles(rest)).toEqual(['delta', 'gamma', 'alpha']);
  });

  it('pins every sticky post with a limit of 0', () => {
    expect(titles(pinStickyPosts(posts(), 0).pinned)).toEqual(['beta', 'alpha']);
  });
});

describe('keywords', () => {
  it('counts keywords across posts, ignoring case, alphabetically', () => {
    const posts = indexBlogSource(site.root).filter(isPost) as PostPage[];
    expect(collectTags(posts)).toEqual([
      { tag: 'api', count: 2 },
      { tag: 'Release', count: 2 },
    ]);
  });

  it('builds filter links that survive odd characters', () => {
    expect(toTagUrl('news/index.md', 'C++ (draft)')).toBe('/news/?tag=c%2B%2B%20%28draft%29');
    expect(toTagUrl('index.md', 'x')).toBe('/?tag=x');
    expect(toTagUrl('news/archive.md', 'x')).toBe('/news/archive.md?tag=x');
  });
});

describe('a blog page', () => {
  const html = () => site.render('news/index.md');

  it('pins sticky posts in their own section, up to stickyLimit', () => {
    const page = html();
    const sticky = page.slice(page.indexOf('data-vp-blog-sticky'), page.indexOf('</section>'));
    expect(sticky).toContain('>beta</a>');
    expect(sticky).not.toContain('>alpha</a>');
    expect(page.indexOf('>beta</a>')).toBeLessThan(page.indexOf('>delta</a>'));
  });

  it('lists every keyword with its count, each a filter link', () => {
    // Spelled as the first listed post spells it: the pinned beta writes "release".
    expect(html()).toContain('<a href="/news/?tag=release">release <span class="vp-blog-tags__count">2</span></a>');
  });

  it('gives the client the page size, labels and each post keywords', () => {
    const page = html();
    expect(page).toContain('data-page-size="2"');
    expect(page).toContain('data-label-tagged="Posts tagged {tag}"');
    expect(page).toContain('data-tags="release|api"');
  });

  it('leaves the keyword list out with tagList: false', () => {
    site.write('quiet/index.md', frontmatter(['blog-index:', '  tagList: false'], '# Quiet\n'));
    site.write('quiet/post.md', frontmatter(['blog:', '  tags: [x]'], '# Post\n'));
    expect(site.render('quiet/index.md')).not.toContain('vp-blog-tags');
  });
});

describe('a post', () => {
  it('links its keywords to its own blog, filtered', () => {
    expect(site.render('news/gamma.md')).toContain('<a href="/news/?tag=api">api</a>');
  });
});
