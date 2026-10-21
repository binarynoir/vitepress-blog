import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findBlogsListing, findHomeBlog, isIndex, isPost, listBlogPosts, type IndexPage } from '../src/collect.js';
import { indexBlogSource, loadBlogPages, type BlogPage } from '../src/scan.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();
let pages: BlogPage[];

const all = { drafts: false, pinnedFirst: false, applyLimit: false };

function blog(relativePath: string): IndexPage {
  const page = pages.find((candidate) => candidate.relativePath === relativePath);
  if (!page || !isIndex(page)) throw new Error(`${relativePath} is not a blog page`);
  return page;
}

function titles(index: IndexPage, options = all): string[] {
  return listBlogPosts(pages, index, options).map((post) => post.post.title);
}

beforeAll(() => {
  site
    .write('blog/index.md', frontmatter(['blog-index:', '  scope: site'], '# Main'))
    .write('blog/welcome.md', frontmatter(['blog:', '  date: 2026-01-01'], '# Welcome'))
    .write('team-a/index.md', frontmatter(['blog-index: true'], '# Team A'))
    .write(
      'team-a/launch.md',
      frontmatter(['blog:', '  scope: site', '  date: 2026-03-01', '  tags: [release]'], '# Launch'),
    )
    .write('team-a/notes.md', frontmatter(['blog:', '  date: 2026-02-01'], '# Notes'))
    .write('team-a/deep/index.md', frontmatter(['blog-index: true'], '# Deep'))
    .write('team-a/deep/dive.md', frontmatter(['blog:', '  date: 2026-04-01', '  pinned: true'], '# Dive'))
    .write('team-a/wip.md', frontmatter(['blog:', '  draft: true', '  date: 2026-05-01'], '# WIP'))
    .write('loose/undated.md', frontmatter(['blog: true'], '# Undated'))
    .write('releases/index.md', frontmatter(['blog-index:', '  folders: [team-a]', '  tags: release'], '# Releases'))
    .write('plain.md', '# Not a post');
  pages = indexBlogSource(site.root);
});

afterAll(() => site.remove());

describe('indexBlogSource', () => {
  it('finds posts and blog pages, skipping other pages', () => {
    expect(pages.filter(isPost)).toHaveLength(6);
    expect(pages.filter(isIndex)).toHaveLength(4);
    expect(pages.some((page) => page.relativePath === 'plain.md')).toBe(false);
  });

  it('applies rewrites to the served path', () => {
    const rewritten = indexBlogSource(site.root, {}, { 'blog/welcome.md': 'news/welcome.md' });
    expect(rewritten.find((page) => page.relativePath === 'blog/welcome.md')?.routePath).toBe('news/welcome.md');
  });
});

describe('loadBlogPages', () => {
  it('leaves out pages VitePress does not build', () => {
    const loaded = loadBlogPages(site.root, {}, { pages: ['blog/index.md', 'blog/welcome.md'] });
    expect(loaded.map((page) => page.relativePath)).toEqual(['blog/index.md', 'blog/welcome.md']);
  });
});

describe('listBlogPosts', () => {
  it('lists every post in a section blog folder and below, whatever its scope', () => {
    expect(titles(blog('team-a/index.md'))).toEqual(['Dive', 'Launch', 'Notes']);
    expect(titles(blog('team-a/deep/index.md'))).toEqual(['Dive']);
  });

  it('lists site-scoped posts and posts no section blog covers on the main blog', () => {
    expect(titles(blog('blog/index.md'))).toEqual(['Launch', 'Welcome', 'Undated']);
  });

  it('filters by folders and tags', () => {
    expect(titles(blog('releases/index.md'))).toEqual(['Launch']);
  });

  it('lists drafts only when asked', () => {
    expect(titles(blog('team-a/index.md'), { ...all, drafts: true })).toContain('WIP');
  });

  it('puts pinned posts first when asked', () => {
    expect(titles(blog('team-a/index.md'), { ...all, pinnedFirst: true })[0]).toBe('Dive');
  });

  it('applies the limit only when asked', () => {
    const limited = { ...blog('team-a/index.md'), index: { ...blog('team-a/index.md').index, limit: 1 } };
    expect(listBlogPosts(pages, limited, { ...all, applyLimit: true })).toHaveLength(1);
    expect(listBlogPosts(pages, limited, all)).toHaveLength(3);
  });
});

describe('findHomeBlog', () => {
  const post = (relativePath: string) => pages.filter(isPost).find((page) => page.relativePath === relativePath)!;

  it('picks the deepest section blog that lists the post', () => {
    expect(findHomeBlog(pages, post('team-a/deep/dive.md'), false)?.relativePath).toBe('team-a/deep/index.md');
    expect(findHomeBlog(pages, post('team-a/launch.md'), false)?.relativePath).toBe('team-a/index.md');
  });

  it('falls back to the main blog', () => {
    expect(findHomeBlog(pages, post('loose/undated.md'), false)?.relativePath).toBe('blog/index.md');
  });

  it('finds none for a draft unless drafts are shown', () => {
    expect(findHomeBlog(pages, post('team-a/wip.md'), false)).toBeNull();
    expect(findHomeBlog(pages, post('team-a/wip.md'), true)?.relativePath).toBe('team-a/index.md');
  });

  it('lists every blog carrying a post', () => {
    expect(findBlogsListing(pages, post('team-a/launch.md')).map((index) => index.relativePath)).toEqual([
      'blog/index.md',
      'releases/index.md',
      'team-a/index.md',
    ]);
  });
});
