import path from 'node:path';
import { parse } from 'yaml';
import { parsePostDate, resolveTimeZone } from './dates.js';
import type {
  BlogAuthor,
  BlogFeedConfig,
  BlogIndexConfig,
  BlogLayout,
  BlogOptions,
  BlogPostData,
  BlogScope,
} from './types.js';

export const POST_FRONTMATTER_KEY = 'blog';
export const INDEX_FRONTMATTER_KEY = 'blog-index';

// An opening `---` line, an optional YAML body, and a closing `---` line.
const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const BLOG_KEY = /^blog(?:-index)?[ \t]*:/m;
const FENCED_CODE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[`~]*[ \t]*$|(?![\s\S]))/gm;
const HEADING_1 = /^ {0,3}#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/m;
// `((tag|label))`, `((tag/label/background/foreground))` and their `((<tag…))`
// form, as `@binarynoir/vitepress-markdown-tags` writes them.
const TAG_SYNTAX = /\(\(<?tag([|/])[^|/)\r\n]*(?:\1[^|/)\r\n]*){0,2}\)\)/g;
const MAX_SUMMARY_LENGTH = 200;

/**
 * Splits a Markdown file into its YAML frontmatter and the content after it.
 * Invalid YAML throws, so callers can report it.
 */
export function readFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const source = raw.replace(/^﻿/, '');
  const match = FRONTMATTER.exec(source);
  if (!match) return { data: {}, content: source };
  const data: unknown = match[1] ? parse(match[1]) : null;
  return {
    data: data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {},
    content: source.slice(match[0].length),
  };
}

/** A cheap test that skips the YAML parse for the many pages that aren't part of a blog. */
export function mayHaveBlogFrontmatter(raw: string): boolean {
  const frontmatter = FRONTMATTER.exec(raw.replace(/^﻿/, ''))?.[1];
  return frontmatter !== undefined && BLOG_KEY.test(frontmatter);
}

/** `title` without markdown-tags syntax (`((tag|draft))`), its spacing tidied. */
export function stripTagSyntax(text: string): string {
  return text.replace(TAG_SYNTAX, ' ').replace(/\s+/g, ' ').trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function toBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** A list, or a single string split on commas. */
export function toStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return values.map(toText).filter(Boolean);
}

/**
 * Reads a frontmatter date: `2026-10-20`, `2026-10-20 14:30`, or either with
 * an offset (`…T14:30:00-04:00`, `…Z`). A value without an offset is read in
 * `timeZone`. See `parsePostDate`.
 */
export function toDate(value: unknown, timeZone = 'UTC'): Date | null {
  return parsePostDate(value, timeZone)?.date ?? null;
}

function toAuthor(value: unknown, options: BlogOptions): BlogAuthor | null {
  if (typeof value === 'string') {
    const name = value.trim();
    if (!name) return null;
    const known = options.authors && Object.hasOwn(options.authors, name) ? options.authors[name] : undefined;
    return known ? toAuthor(known, {}) : { name };
  }
  const record = toRecord(value);
  const name = toText(record.name);
  if (!name) return null;
  const author: BlogAuthor = { name };
  if (toText(record.url)) author.url = toText(record.url);
  if (toText(record.email)) author.email = toText(record.email);
  return author;
}

function toAuthors(value: unknown, options: BlogOptions): BlogAuthor[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const authors = values.map((item) => toAuthor(item, options)).filter((author) => author !== null);
  if (authors.length === 0 && options.defaultAuthor) {
    const fallback = toAuthor(options.defaultAuthor, options);
    if (fallback) authors.push(fallback);
  }
  return authors;
}

/**
 * A CSS `object-position` value, kept only if it is made of position words,
 * percentages and lengths (`top`, `left 20%`, `30% 20%`, `10px 0`), so
 * frontmatter can't write any other CSS into the page.
 */
export function toImagePosition(value: string): string {
  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const valid = /^(?:top|bottom|left|right|center|-?\d+(?:\.\d+)?(?:%|px|rem|em)?)$/;
  return parts.length > 0 && parts.length <= 4 && parts.every((part) => valid.test(part)) ? parts.join(' ') : '';
}

function toScope(value: unknown): BlogScope {
  return value === 'site' || value === 'global' ? 'site' : 'section';
}

/** Blanks out fenced code, so headings and prose inside it are ignored. */
function withoutCode(content: string): string {
  return content.replace(FENCED_CODE, '');
}

/** The text of the first level-1 heading, or `''`. */
export function readHeading(content: string): string {
  return (
    HEADING_1.exec(withoutCode(content))?.[1]
      ?.replace(/[ \t]*\{#[^}]*\}$/, '')
      .trim() ?? ''
  );
}

/** Markdown reduced to plain text: links to their text, emphasis and code marks removed, HTML dropped. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first paragraph of prose, as plain text, for a post without a summary. */
export function readExcerpt(content: string): string {
  for (const block of withoutCode(content).split(/\r?\n[ \t]*\r?\n/)) {
    const text = block.trim();
    // Skip headings, HTML, quotes, lists, tables, containers, includes and images.
    if (!text || /^(?:#|<|>|\||:::|\[\[|!\[|[-*+] |\d+[.)] |\{)/.test(text)) continue;
    const plain = toPlainText(text);
    if (!plain) continue;
    return plain.length > MAX_SUMMARY_LENGTH ? `${plain.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…` : plain;
  }
  return '';
}

/** Minutes to read the page's prose, rounded up, at least 1. */
export function estimateReadingMinutes(content: string, wordsPerMinute: number): number {
  if (wordsPerMinute <= 0) return 0;
  const words = toPlainText(withoutCode(content)).split(' ').filter(Boolean).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

/**
 * Reads a post from its frontmatter. `blog: true` is a post with every
 * default; `blog: { ... }` sets its details. Title, description, date,
 * author, image and tags may also be written at the top level, as other
 * blog tools expect; a value under `blog` wins.
 */
export function resolvePostData(
  data: Record<string, unknown>,
  content: string,
  fallbackTitle: string,
  options: BlogOptions = {},
): BlogPostData | null {
  const value = data[POST_FRONTMATTER_KEY];
  if (!value) return null;
  const post = toRecord(value);
  const pick = (key: string) => post[key] ?? data[key];
  const stripTags = options.stripTags ?? true;
  const clean = (text: string) => (stripTags ? stripTagSyntax(text) : text);

  const image = toRecord(pick('image'));
  const timeZone = resolveTimeZone(options.timeZone);
  const date = parsePostDate(pick('date'), timeZone);
  const updated = parsePostDate(pick('updated'), timeZone);
  const announcementText = typeof post.announcement === 'string' ? clean(post.announcement.trim()) : '';
  return {
    title: clean(toText(post.title) || toText(data.title) || readHeading(content)) || fallbackTitle,
    summary: clean(toText(post.summary) || toText(data.description) || readExcerpt(content)),
    date: date?.date ?? null,
    dateHasTime: date?.hasTime ?? false,
    updated: updated?.date ?? null,
    updatedHasTime: updated?.hasTime ?? false,
    image: toText(image.src) || toText(pick('image')),
    imageAlt: toText(image.alt) || toText(post.imageAlt) || toText(data.imageAlt),
    imageFit: (toText(image.fit) || toText(post.imageFit)) === 'contain' ? 'contain' : 'cover',
    imagePosition: toImagePosition(toText(image.position) || toText(post.imagePosition)),
    authors: toAuthors(post.author ?? post.authors ?? data.author ?? data.authors, options),
    tags: toStringList(pick('tags')),
    category: toText(pick('category')),
    scope: toScope(post.scope),
    sticky: post.sticky === true,
    draft: post.draft === true,
    announcement: post.announcement === true || !!announcementText,
    announcementText,
    byline: toBoolean(post.byline),
    cover: toBoolean(post.cover),
    postNav: toBoolean(post.postNav),
    readingMinutes: estimateReadingMinutes(content, options.wordsPerMinute ?? 200),
  };
}

function toLayout(value: unknown): BlogLayout {
  return value === 'grid' || value === 'compact' ? value : 'list';
}

function defaultFeedPath(relativePath: string): string {
  const name = path.posix.basename(relativePath, '.md');
  return name === 'index' ? 'feed.xml' : `${name}-feed.xml`;
}

function toFeed(value: unknown, relativePath: string): BlogFeedConfig | null {
  if (value === false) return null;
  const feed = toRecord(value);
  const config: BlogFeedConfig = { path: toText(feed.path) || defaultFeedPath(relativePath) };
  if (toText(feed.title)) config.title = toText(feed.title);
  if (toText(feed.description)) config.description = toText(feed.description);
  if (typeof feed.limit === 'number' && feed.limit > 0) config.limit = Math.floor(feed.limit);
  return config;
}

/**
 * Folder entries are relative to the source directory (`products`). One that
 * starts with `./` or `../` is relative to the folder of the page that lists it.
 */
export function resolveFolders(folders: string[], pageRelativePath: string): string[] {
  return folders.map((folder) => {
    const resolved = /^\.\.?(\/|$)/.test(folder)
      ? path.posix.join(path.posix.dirname(pageRelativePath), folder)
      : path.posix.normalize(folder);
    return resolved.replace(/^\/+|\/+$/g, '').replace(/^\.$/, '');
  });
}

/**
 * Reads the `blog-index` frontmatter value: `true` for the defaults, or an
 * object of settings. Returns `null` when the page is not a blog page.
 * A section blog covers its own folder unless `folders` says otherwise.
 * `pageSize`, `stickyLimit` and `rssLink` fall back to the plugin options.
 */
/** A whole number of at least 0, or `fallback`. */
function toCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export function resolveIndexConfig(
  data: Record<string, unknown>,
  relativePath: string,
  defaults: Pick<BlogOptions, 'pageSize' | 'stickyLimit' | 'rssLink'> = {},
): BlogIndexConfig | null {
  const value = data[INDEX_FRONTMATTER_KEY];
  if (!value) return null;
  const options = toRecord(value);
  const scope = toScope(options.scope);
  const folders = toStringList(options.folders);
  const ownFolder = path.posix.dirname(relativePath).replace(/^\.$/, '');
  return {
    scope,
    folders: folders.length ? resolveFolders(folders, relativePath) : scope === 'section' ? [ownFolder] : [],
    tags: toStringList(options.tags),
    limit: typeof options.limit === 'number' && options.limit > 0 ? Math.floor(options.limit) : 0,
    layout: toLayout(options.layout),
    groupByYear: options.groupBy === 'year',
    showTags: options.showTags !== false,
    tagList: options.tagList !== false,
    pageSize: toCount(options.pageSize, toCount(defaults.pageSize, 10)),
    stickyLimit: toCount(options.stickyLimit, toCount(defaults.stickyLimit, 0)),
    rssLink: typeof options.rssLink === 'boolean' ? options.rssLink : (defaults.rssLink ?? true),
    feed: toFeed(options.feed, relativePath),
  };
}
