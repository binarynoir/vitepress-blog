import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  mayHaveBlogFrontmatter,
  readFrontmatter,
  readHeading,
  resolveIndexConfig,
  resolvePostData,
  stripTagSyntax,
} from './frontmatter.js';
import type { BlogIndexConfig, BlogOptions, BlogPostData } from './types.js';

/** A post or a blog page found under the source directory. */
export interface BlogPage {
  /** Path of the source file from the source directory, with forward slashes: `news/launch.md`. */
  relativePath: string;
  absolutePath: string;
  /** `relativePath` after VitePress rewrites: the path the page is served at. */
  routePath: string;
  title: string;
  description: string;
  post: BlogPostData | null;
  index: BlogIndexConfig | null;
}

type ScannedPage = Omit<BlogPage, 'absolutePath' | 'routePath'>;

interface CacheEntry {
  mtimeMs: number;
  size: number;
  /** A stable key for the options the page was read with: author lookups and reading time depend on them. */
  optionsKey: string;
  page: ScannedPage | null;
}

const scanCache = new Map<string, CacheEntry>();

/**
 * Follows symlinked folders and files. `ancestors` holds the real paths of the
 * folders above this one, so a link that points back up the tree is skipped
 * instead of looping forever. Broken links are skipped.
 */
function listMarkdownFiles(directory: string, ancestors: Set<string> = new Set()): string[] {
  let realDirectory: string;
  try {
    realDirectory = realpathSync(directory);
  } catch {
    return [];
  }
  if (ancestors.has(realDirectory)) return [];
  const chain = new Set(ancestors).add(realDirectory);

  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(directory, entry.name);
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const target = statSync(fullPath);
        isDirectory = target.isDirectory();
        isFile = target.isFile();
      } catch {
        continue;
      }
    }
    if (isDirectory) files.push(...listMarkdownFiles(fullPath, chain));
    else if (isFile && entry.name.endsWith('.md')) files.push(fullPath);
  }
  return files;
}

function toFallbackTitle(relativePath: string): string {
  const parts = relativePath.replace(/\.md$/, '').split('/');
  const name = parts.at(-1) === 'index' && parts.length > 1 ? parts.at(-2)! : parts.at(-1)!;
  return name.replace(/[-_]+/g, ' ');
}

const warned = new Set<string>();

/** Reads one file. A page with both `blog` and `blog-index` is a blog page, not a post. */
export function scanPage(raw: string, relativePath: string, options: BlogOptions = {}): ScannedPage | null {
  if (!mayHaveBlogFrontmatter(raw)) return null;
  const { data, content } = readFrontmatter(raw);
  const fallbackTitle = toFallbackTitle(relativePath);
  const index = resolveIndexConfig(data, relativePath, options);
  const post = index ? null : resolvePostData(data, content, fallbackTitle, options);
  if (!index && !post) return null;

  const rawTitle = (typeof data.title === 'string' && data.title.trim()) || readHeading(content);
  const title = (options.stripTags ?? true) ? stripTagSyntax(rawTitle) : rawTitle;
  return {
    relativePath,
    title: post?.title ?? (title || fallbackTitle),
    description: typeof data.description === 'string' ? data.description.trim() : '',
    post,
    index,
  };
}

function toOptionsKey(options: BlogOptions): string {
  return JSON.stringify([
    options.authors,
    options.defaultAuthor,
    options.wordsPerMinute,
    options.stripTags,
    options.pageSize,
    options.pinLimit ?? options.stickyLimit,
    options.rssLink,
    options.timeZone,
  ]);
}

/**
 * Every post and blog page under `sourceDirectory`, sorted by path. Results
 * are cached per file and reused until its modification time or size
 * changes. `rewrites` maps a source path to the path it is served at.
 */
export function indexBlogSource(
  sourceDirectory: string,
  options: BlogOptions = {},
  rewrites: Record<string, string | undefined> = {},
): BlogPage[] {
  const pages: BlogPage[] = [];
  const present = new Set<string>();
  const optionsKey = toOptionsKey(options);

  for (const absolutePath of listMarkdownFiles(sourceDirectory).sort()) {
    present.add(absolutePath);
    const stats = statSync(absolutePath);
    const relativePath = path.relative(sourceDirectory, absolutePath).split(path.sep).join('/');
    let entry = scanCache.get(absolutePath);
    if (!entry || entry.mtimeMs !== stats.mtimeMs || entry.size !== stats.size || entry.optionsKey !== optionsKey) {
      let page: ScannedPage | null = null;
      try {
        page = scanPage(readFileSync(absolutePath, 'utf8'), relativePath, options);
      } catch (error) {
        // Invalid YAML: VitePress reports it when it builds the page, so warn once and move on.
        if (!warned.has(absolutePath)) {
          warned.add(absolutePath);
          console.warn(`[vitepress-blog] skipped ${relativePath}: ${(error as Error).message}`);
        }
      }
      entry = { mtimeMs: stats.mtimeMs, size: stats.size, optionsKey, page };
      scanCache.set(absolutePath, entry);
    }
    if (entry.page) pages.push({ ...entry.page, absolutePath, routePath: rewrites[relativePath] ?? relativePath });
  }

  for (const cached of scanCache.keys()) {
    if (cached.startsWith(sourceDirectory + path.sep) && !present.has(cached)) scanCache.delete(cached);
  }
  return pages;
}

/** What VitePress knows about the site's pages. Both fields are optional, for use outside VitePress. */
export interface SourceInfo {
  /** Source path to served path. */
  rewrites?: { map?: Record<string, string | undefined> };
  /** Source paths of the pages VitePress builds: pages kept out by `srcExclude` aren't in it. */
  pages?: string[];
  /** The site's own config, for the site URL feeds need. */
  userConfig?: { sitemap?: { hostname?: string } };
}

/** The posts and blog pages VitePress builds, with rewrites applied. */
export function loadBlogPages(sourceDirectory: string, options: BlogOptions = {}, info: SourceInfo = {}): BlogPage[] {
  const built = info.pages ? new Set(info.pages) : null;
  return indexBlogSource(sourceDirectory, options, info.rewrites?.map).filter(
    (page) => !built || built.has(page.relativePath),
  );
}

/** Changes whenever a post or blog page under the directory is added, removed or edited. */
export function fingerprintBlogSource(pages: BlogPage[]): string {
  const hash = createHash('sha1');
  for (const page of pages) {
    const { mtimeMs, size } = statSync(page.absolutePath);
    hash.update(`${page.relativePath}:${mtimeMs}:${size}\n`);
  }
  return hash.digest('hex').slice(0, 12);
}
