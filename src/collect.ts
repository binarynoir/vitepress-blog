import type { BlogPage } from './scan.js';
import type { BlogPostData } from './types.js';

export type PostPage = BlogPage & { post: BlogPostData };
export type IndexPage = BlogPage & { index: NonNullable<BlogPage['index']> };

export function isPost(page: BlogPage): page is PostPage {
  return page.post !== null;
}

export function isIndex(page: BlogPage): page is IndexPage {
  return page.index !== null;
}

function dirname(relativePath: string): string {
  return relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';
}

function isInFolders(relativePath: string, folders: string[]): boolean {
  return folders.length === 0 || folders.some((folder) => !folder || relativePath.startsWith(`${folder}/`));
}

/** How deep a blog's folder is: `''` is 0, `news` is 1, `news/eng` is 2. A blog covering several folders ranks by its deepest. */
function folderDepth(index: IndexPage): number {
  return Math.max(0, ...index.index.folders.map((folder) => (folder ? folder.split('/').length : 0)));
}

/** Whether the post has one of `tags`, in any case. No tags means any post. */
export function hasAnyTag(post: PostPage, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const wanted = new Set(tags.map((tag) => tag.toLowerCase()));
  return post.post.tags.some((tag) => wanted.has(tag.toLowerCase()));
}

/** Whether the post is in one of `categories`, in any case. No categories means any post. */
export function inAnyCategory(post: PostPage, categories: string[]): boolean {
  if (categories.length === 0) return true;
  const category = post.post.category.toLowerCase();
  return !!category && categories.some((wanted) => wanted.toLowerCase() === category);
}

/**
 * Whether a blog lists a post, before drafts, tags and limits:
 *
 * - A section blog lists every post in its folders, whatever the post's scope.
 * - The main blog (`scope: site`) lists every `scope: site` post, and every
 *   post that no section blog covers, so a site with only a main blog needs
 *   no scope settings at all.
 */
export function blogCoversPost(index: IndexPage, post: PostPage, sections: IndexPage[]): boolean {
  if (index.index.scope === 'section') return isInFolders(post.relativePath, index.index.folders);
  if (!isInFolders(post.relativePath, index.index.folders)) return false;
  if (post.post.scope === 'site') return true;
  return !sections.some((section) => isInFolders(post.relativePath, section.index.folders));
}

function compareDates(a: Date | null, b: Date | null): number {
  if (a && b) return b.getTime() - a.getTime();
  // Undated posts go last.
  return a ? -1 : b ? 1 : 0;
}

/** Newest first; undated posts last, then by title. */
export function compareByDate(a: PostPage, b: PostPage): number {
  return compareDates(a.post.date, b.post.date) || a.post.title.localeCompare(b.post.title);
}

export interface ListOptions {
  /** Include `draft: true` posts. */
  drafts: boolean;
  /** Put `pinned: true` posts at the top, up to the blog's `pinLimit`. */
  pinnedFirst: boolean;
  /** Apply the blog's `limit`. */
  applyLimit: boolean;
}

/**
 * Splits date-ordered posts into the pinned ones kept at the top (the newest
 * `limit` of them, or all with `0`) and the rest, still in date order.
 */
export function pinPosts(posts: PostPage[], limit: number): { pinned: PostPage[]; rest: PostPage[] } {
  const candidates = posts.filter((post) => post.post.pinned);
  const pinned = new Set(limit ? candidates.slice(0, limit) : candidates);
  return { pinned: [...pinned], rest: posts.filter((post) => !pinned.has(post)) };
}

/** The posts a blog page lists, in order. */
export function listBlogPosts(pages: BlogPage[], index: IndexPage, options: ListOptions): PostPage[] {
  const sections = pages.filter(isIndex).filter((page) => page.index.scope === 'section');
  let posts = pages
    .filter(isPost)
    .filter((post) => options.drafts || !post.post.draft)
    .filter((post) => blogCoversPost(index, post, sections) && hasAnyTag(post, index.index.tags))
    .filter((post) => inAnyCategory(post, index.index.categories))
    .sort(compareByDate);
  if (options.pinnedFirst) {
    const { pinned, rest } = pinPosts(posts, index.index.pinLimit);
    posts = [...pinned, ...rest];
  }
  return options.applyLimit && index.index.limit ? posts.slice(0, index.index.limit) : posts;
}

/**
 * The blog a post belongs to, for its "newer / older" links: the deepest
 * section blog that lists it, otherwise the first main blog that does.
 */
export function findHomeBlog(pages: BlogPage[], post: PostPage, drafts: boolean): IndexPage | null {
  const listing = pages
    .filter(isIndex)
    .filter((index) => listBlogPosts(pages, index, { drafts, pinnedFirst: false, applyLimit: false }).includes(post));
  const sections = listing.filter((index) => index.index.scope === 'section');
  if (sections.length) return deepestFirst(sections, post.relativePath)[0];
  return listing[0] ?? null;
}

/** Section blogs, deepest folder first; a tie goes to the blog whose own page sits in a folder above `relativePath`. */
function deepestFirst(sections: IndexPage[], relativePath: string): IndexPage[] {
  const isAbove = (index: IndexPage) => Number(isInFolders(relativePath, [dirname(index.relativePath)]));
  return [...sections].sort((a, b) => folderDepth(b) - folderDepth(a) || isAbove(b) - isAbove(a));
}

/**
 * The blog any page belongs to, post or not: the deepest section blog whose
 * folders hold it, else a main blog whose folders hold it, else the first
 * main blog. So the home page belongs to the main blog, and a section's pages
 * to the section's blog.
 */
export function findBlogForPage(pages: BlogPage[], relativePath: string): IndexPage | null {
  const indexes = pages.filter(isIndex);
  const covering = indexes.filter((index) => isInFolders(relativePath, index.index.folders));
  const sections = covering.filter((index) => index.index.scope === 'section');
  if (sections.length) return deepestFirst(sections, relativePath)[0];
  const main = indexes.filter((index) => index.index.scope === 'site');
  return main.find((index) => covering.includes(index)) ?? main[0] ?? null;
}

/** Every blog page that lists the post, for the feed links in its `<head>`. */
export function findBlogsListing(pages: BlogPage[], post: PostPage): IndexPage[] {
  return pages
    .filter(isIndex)
    .filter((index) =>
      listBlogPosts(pages, index, { drafts: false, pinnedFirst: false, applyLimit: false }).includes(post),
    );
}

/** Every announcement, newest first. Drafts only with `drafts`. */
export function listAnnouncements(pages: BlogPage[], drafts: boolean): PostPage[] {
  return pages
    .filter(isPost)
    .filter((post) => post.post.announcement && (drafts || !post.post.draft))
    .sort(compareByDate);
}

/**
 * The blog page the banner's count badge opens, filtered to announcements: a
 * blog page that lists all of them (the main blog first), else the newest
 * one's own blog.
 */
export function findAnnouncementBlog(pages: BlogPage[], announcements: PostPage[], drafts: boolean): IndexPage | null {
  if (announcements.length === 0) return null;
  const listingAll = pages.filter(isIndex).filter((index) => {
    const listed = listBlogPosts(pages, index, { drafts, pinnedFirst: false, applyLimit: false });
    return announcements.every((post) => listed.includes(post));
  });
  return (
    listingAll.find((index) => index.index.scope === 'site') ??
    listingAll[0] ??
    findHomeBlog(pages, announcements[0], drafts)
  );
}
