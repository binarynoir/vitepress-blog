import path from 'node:path';
import { parse } from 'yaml';
import { findBlogForPage, isIndex, listBlogPosts, pinStickyPosts, type IndexPage } from './collect.js';
import { toStringList } from './frontmatter.js';
import { renderGroup, renderRssLink, type RenderContext } from './render.js';
import type { BlogPage } from './scan.js';
import type { BlogLayout } from './types.js';
import { escapeTemplateText, toPageLink } from './util.js';

/** Pages that hold a block, by absolute path, so `vitepress dev` can refresh them when a post changes. */
export const widgetPages = new Set<string>();

/** Name of the block: `::: blog-posts` … `:::`. */
export const WIDGET_NAME = 'blog-posts';

// `::: blog-posts` on its own line, a YAML body, and a closing `:::` line.
const WIDGET_OPEN = new RegExp(`^ {0,3}:{3,}[ \\t]*${WIDGET_NAME}[ \\t]*$`);
const WIDGET_CLOSE = /^ {0,3}:{3,}[ \t]*$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const DEFAULT_LIMIT = 5;

/** What a `::: blog-posts` block asks for, with defaults filled in from its blog page. */
export interface WidgetConfig {
  /** As written: a blog page's URL (`/blog/`) or file (`blog/index.md`), `./` and `../` page-relative. */
  blog: string;
  limit: number;
  stickyLimit: number;
  layout: BlogLayout;
  showTags: boolean;
  tags: string[];
  /** Text of the link to the blog page, or `null` for none. */
  more: string | null;
  /** Show a "Subscribe" link to the blog's feed. */
  rssLink: boolean;
}

/** Whether a page's source holds a block, cheaply, before it is parsed. */
export function hasWidget(source: string): boolean {
  return source.includes(`${WIDGET_NAME}`) && source.split('\n').some((line) => WIDGET_OPEN.test(line));
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Finds the blog page a block names. `blog` can be a URL path (`/blog/`,
 * `/news/archive`) or a file (`blog/index.md`), from the source directory or,
 * starting with `./` or `../`, from the page's folder. Without one, it is the
 * page's own blog (see `findBlogForPage`).
 */
export function findWidgetBlog(pages: BlogPage[], blog: string, pageRelativePath: string): IndexPage | null {
  const indexes = pages.filter(isIndex);
  if (!blog) return findBlogForPage(pages, pageRelativePath);
  let target = /^\.\.?(\/|$)/.test(blog)
    ? path.posix.join(path.posix.dirname(pageRelativePath), blog)
    : blog.replace(/^\/+/, '');
  target = target.replace(/\.html$/, '');
  const candidates = target.endsWith('.md')
    ? [target]
    : target === '' || target.endsWith('/')
      ? [`${target}index.md`]
      : [`${target}.md`, `${target}/index.md`];
  return (
    indexes.find((index) => candidates.includes(index.routePath)) ??
    indexes.find((index) => candidates.includes(index.relativePath)) ??
    null
  );
}

/** A block's settings as written: the ones left out fall back to its blog page's. */
export type WidgetSettings = Omit<WidgetConfig, 'stickyLimit' | 'layout' | 'showTags' | 'rssLink'> &
  Partial<Pick<WidgetConfig, 'stickyLimit' | 'layout' | 'showTags' | 'rssLink'>>;

/** Reads a block's YAML body. Values it can't use are left to the defaults. */
export function resolveWidgetConfig(body: string): { config: WidgetSettings; problem?: string } {
  let data: Record<string, unknown> = {};
  let problem: string | undefined;
  try {
    data = toRecord(body.trim() ? parse(body) : {});
  } catch (error) {
    problem = `its settings are not valid YAML: ${(error as Error).message.split('\n')[0]}`;
  }
  const layout =
    data.layout === 'list' || data.layout === 'grid' || data.layout === 'compact' ? data.layout : undefined;
  return {
    config: {
      blog: typeof data.blog === 'string' ? data.blog.trim() : '',
      limit: toCount(data.limit) ?? DEFAULT_LIMIT,
      stickyLimit: toCount(data.stickyLimit),
      layout,
      showTags: typeof data.showTags === 'boolean' ? data.showTags : undefined,
      tags: toStringList(data.tags),
      more: data.more === false ? null : typeof data.more === 'string' && data.more.trim() ? data.more.trim() : '',
      rssLink: typeof data.rssLink === 'boolean' ? data.rssLink : undefined,
    },
    problem,
  };
}

export interface WidgetEnvironment {
  pages: BlogPage[];
  /** The page holding the block, from the source directory. */
  pageRelativePath: string;
  drafts: boolean;
  context: RenderContext;
  /** Called with a message for each block that can't be shown. */
  warn: (message: string) => void;
}

/** Renders one block's Markdown: its posts, then a link to its blog page. */
export function renderWidget(body: string, environment: WidgetEnvironment): string {
  const { pages, pageRelativePath, drafts, context, warn } = environment;
  const { config, problem } = resolveWidgetConfig(body);
  if (problem) warn(problem);

  const blog = findWidgetBlog(pages, config.blog, pageRelativePath);
  if (!blog) {
    warn(config.blog ? `no blog page found at "${config.blog}"` : 'no blog covers this page: name one with "blog:"');
    return '';
  }

  const stickyLimit = config.stickyLimit ?? blog.index.stickyLimit;
  const wanted = new Set(config.tags.map((tag) => tag.toLowerCase()));
  const posts = listBlogPosts(pages, blog, { drafts, stickyFirst: false, applyLimit: false }).filter(
    (post) => wanted.size === 0 || post.post.tags.some((tag) => wanted.has(tag.toLowerCase())),
  );
  const { pinned, rest } = pinStickyPosts(posts, stickyLimit);
  const shown = [...pinned, ...rest].slice(0, config.limit || undefined);

  // The block's own settings over the blog page's; keyword chips still link to the blog page.
  const view: IndexPage = {
    ...blog,
    index: {
      ...blog.index,
      layout: config.layout ?? blog.index.layout,
      showTags: config.showTags ?? blog.index.showTags,
    },
  };

  const lines = [`<div class="vp-blog-widget">`];
  if (shown.length) lines.push(...renderGroup(shown, view, context));
  else lines.push(`<p class="vp-blog-empty">${escapeTemplateText(context.labels.noPosts)}</p>`);
  // The footer: a "Subscribe" link to the blog's feed, and a link to the blog page.
  const footer = [renderRssLink(blog, context, config.rssLink ?? blog.index.rssLink)];
  if (config.more !== null) {
    footer.push(toPageLink(config.more || context.labels.allPosts.replace('{blog}', blog.title), blog.routePath));
  }
  if (footer.some(Boolean)) {
    lines.push('<div class="vp-blog-widget__footer">', '', footer.filter(Boolean).join(' '), '', '</div>');
  }
  lines.push('</div>');
  return lines.join('\n');
}

/**
 * Replaces every `::: blog-posts` block outside fenced code with its posts.
 * Blocks inside code fences are left as written, so the syntax can be shown.
 */
export function applyWidgets(source: string, environment: WidgetEnvironment): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let fence = '';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const marker = FENCE.exec(line)?.[1];
    if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length))) {
      fence = fence ? '' : marker;
      output.push(line);
      continue;
    }
    if (fence || !WIDGET_OPEN.test(line)) {
      output.push(line);
      continue;
    }
    const close = lines.findIndex((candidate, at) => at > index && WIDGET_CLOSE.test(candidate));
    if (close === -1) {
      environment.warn(`"::: ${WIDGET_NAME}" on line ${index + 1} has no closing ":::"`);
      output.push(line);
      continue;
    }
    const lineWarn = (message: string) => environment.warn(`the block on line ${index + 1}: ${message}`);
    output.push('', renderWidget(lines.slice(index + 1, close).join('\n'), { ...environment, warn: lineWarn }), '');
    index = close;
  }
  return output.join('\n');
}
