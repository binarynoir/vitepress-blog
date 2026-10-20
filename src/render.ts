import path from 'node:path';
import type { IndexPage, PostPage } from './collect.js';
import { toFeedPath } from './feed.js';
import { DEFAULT_LABELS, type BlogAuthor, type BlogLabels, type BlogOptions } from './types.js';
import {
  escapeHtml,
  escapeMarkdown,
  escapeTemplateText,
  formatDate,
  isExternalUrl,
  toIsoDate,
  toMarkdownUrl,
  toPageLink,
} from './util.js';

/** Marker a blog page can use to say where its list of posts goes. Without it the list is appended. */
export const BLOG_POSTS_PLACEHOLDER = '<!-- blog-posts -->';

export interface RenderContext {
  locale: string;
  dateFormat: Intl.DateTimeFormatOptions;
  labels: BlogLabels;
  /** Absolute folder of the source file being rendered: relative image paths are written from here. */
  pageDirectory: string;
  /** Whether feeds are written (the site has a site URL), so RSS links have something to point at. */
  feeds: boolean;
}

export function createRenderContext(
  options: BlogOptions,
  pageDirectory: string,
  feeds: boolean = !!options.siteUrl,
): RenderContext {
  return {
    locale: options.locale ?? 'en-US',
    dateFormat: options.dateFormat ?? { dateStyle: 'long' },
    labels: { ...DEFAULT_LABELS, ...options.labels },
    pageDirectory,
    feeds,
  };
}

const RSS_ICON =
  '<svg class="vp-blog-rss__icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
  '<circle cx="6" cy="18" r="2.5" fill="currentColor"></circle>' +
  '<path fill="currentColor" d="M3.5 10.5v3a7 7 0 0 1 7 7h3a10 10 0 0 0-10-10z"></path>' +
  '<path fill="currentColor" d="M3.5 3.5v3a14 14 0 0 1 14 14h3a17 17 0 0 0-17-17z"></path>' +
  '</svg>';

/**
 * A "Subscribe" link with the RSS icon to a blog's feed, or `''` when the
 * blog has no feed, hides the link, or the site writes no feeds. A Markdown
 * link, so VitePress gives it the site's base.
 */
export function renderRssLink(index: IndexPage, context: RenderContext, show: boolean = index.index.rssLink): string {
  if (!show || !context.feeds || !index.index.feed) return '';
  const title = fill(context.labels.rssFeed, { blog: index.title }).replace(/"/g, '&quot;');
  const url = toMarkdownUrl(`/${toFeedPath(index)}`);
  return `<span class="vp-blog-rss">[${RSS_ICON} ${escapeMarkdown(context.labels.subscribe)}](${url} "${title}")</span>`;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * A post's image as the rendered page should write it. A path relative to the
 * post is rewritten relative to `pageDirectory`, so Vite still finds and
 * bundles it; public paths (`/x.png`), aliases and URLs are kept as written.
 */
export function toImageSource(post: PostPage, pageDirectory: string): string {
  const { image } = post.post;
  if (!image || isExternalUrl(image) || /^[/@~]/.test(image)) return image;
  const absolute = path.resolve(path.dirname(post.absolutePath), image);
  const relative = path.relative(pageDirectory, absolute).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function renderTime(date: Date, context: RenderContext): string {
  return `<time datetime="${toIsoDate(date)}">${escapeTemplateText(formatDate(date, context.locale, context.dateFormat))}</time>`;
}

function renderAuthor(author: BlogAuthor): string {
  return author.url ? `[${escapeMarkdown(author.name)}](${toMarkdownUrl(author.url)})` : escapeMarkdown(author.name);
}

function renderAuthors(authors: BlogAuthor[], context: RenderContext): string {
  if (authors.length === 0) return '';
  // ListFormat joins plain strings, so join placeholders and swap the rendered names in after.
  const placeholders = authors.map((_, index) => `\u0000${index}\u0000`);
  const joined = new Intl.ListFormat(context.locale, { type: 'conjunction' }).format(placeholders);
  const names = joined.replace(/\u0000(\d+)\u0000/g, (_, index: string) => renderAuthor(authors[Number(index)]));
  return `${escapeMarkdown(context.labels.by)} ${names}`;
}

function renderBadge(kind: 'draft' | 'sticky', context: RenderContext): string {
  return `<span class="vp-blog-badge vp-blog-badge--${kind}">${escapeTemplateText(context.labels[kind])}</span>`;
}

/**
 * The URL that filters a blog page by a keyword, which VitePress gives the
 * base: `/blog/?tag=release`, or `/news/archive.md?tag=release` for a page not
 * named `index.md`. An `index.md` page is linked by its folder, because
 * VitePress reads anything after `index.md` in a link as a heading anchor.
 */
export function toTagUrl(blogRoutePath: string, tag: string): string {
  const value = encodeURIComponent(tag.toLowerCase()).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));
  const page = blogRoutePath.replace(/(^|\/)index\.md$/, '$1');
  return `${toMarkdownUrl(`/${page}`)}?tag=${value}`;
}

/** Keyword chips: links that filter `blogRoutePath` by the keyword, or plain text without a blog. */
function renderTags(tags: string[], blogRoutePath: string | null): string {
  return tags
    .map((tag) =>
      blogRoutePath
        ? `[${escapeMarkdown(tag)}](${toTagUrl(blogRoutePath, tag)})`
        : `<span class="vp-blog-tag">${escapeTemplateText(tag)}</span>`,
    )
    .join(' ');
}

/** What the client reads to filter a post by keyword: its tags, lowercased, joined with `|`. */
function toTagsAttribute(post: PostPage): string {
  return escapeHtml(post.post.tags.map((tag) => tag.toLowerCase()).join('|'));
}

interface MetaParts {
  authors: boolean;
  updated: boolean;
  badges: boolean;
}

/** One line of post details, joined with middle dots: badges, date, updated, reading time, authors. */
function renderMeta(post: PostPage, context: RenderContext, include: MetaParts): string {
  const { date, updated, readingMinutes, authors, draft, sticky } = post.post;
  const parts: string[] = [];
  if (include.badges) {
    const badges = [draft && renderBadge('draft', context), sticky && renderBadge('sticky', context)];
    const shown = badges.filter(Boolean).join(' ');
    if (shown) parts.push(shown);
  }
  if (date) parts.push(renderTime(date, context));
  if (include.updated && updated && (!date || updated.getTime() !== date.getTime())) {
    parts.push(`${escapeMarkdown(context.labels.updated)} ${renderTime(updated, context)}`);
  }
  if (readingMinutes) parts.push(escapeMarkdown(fill(context.labels.readingTime, { n: String(readingMinutes) })));
  if (include.authors) {
    const names = renderAuthors(authors, context);
    if (names) parts.push(names);
  }
  return parts.join(' · ');
}

/** A `<div>` holding Markdown: blank lines around the content let markdown-it parse it. */
function block(className: string, content: string): string[] {
  return content ? [`<div class="${className}">`, '', content, '', '</div>'] : [];
}

/** The image's `object-position`, as a CSS variable on the card, when the post sets one. */
function imageStyle(post: PostPage): string {
  return post.post.imagePosition ? ` style="--vp-blog-image-position: ${post.post.imagePosition}"` : '';
}

function renderCard(post: PostPage, context: RenderContext, index: IndexPage): string[] {
  const link = `/${post.routePath}`;
  const image = toImageSource(post, context.pageDirectory);
  const modifiers = [
    post.post.sticky && 'sticky',
    post.post.draft && 'draft',
    image && 'with-image',
    image && post.post.imageFit === 'contain' && 'contain',
  ]
    .filter(Boolean)
    .map((modifier) => ` vp-blog-card--${modifier}`)
    .join('');
  const alt = escapeMarkdown(post.post.imageAlt);
  return [
    `<article class="vp-blog-card${modifiers}"${imageStyle(post)} data-vp-blog-item data-tags="${toTagsAttribute(post)}">`,
    ...(image ? block('vp-blog-card__image', `[![${alt}](${toMarkdownUrl(image)})](${toMarkdownUrl(link)})`) : []),
    '<div class="vp-blog-card__body">',
    ...block('vp-blog-card__title', toPageLink(post.post.title, post.routePath)),
    ...block('vp-blog-card__meta', renderMeta(post, context, { authors: true, updated: false, badges: true })),
    ...block('vp-blog-card__summary', escapeMarkdown(post.post.summary)),
    ...(index.index.showTags ? block('vp-blog-card__tags', renderTags(post.post.tags, index.routePath)) : []),
    '</div>',
    '</article>',
  ];
}

function renderCompactItem(post: PostPage, context: RenderContext): string {
  const date = post.post.date ? `${renderTime(post.post.date, context)} ` : '';
  const badges = [post.post.draft && renderBadge('draft', context), post.post.sticky && renderBadge('sticky', context)]
    .filter(Boolean)
    .join(' ');
  // List items can't carry attributes in Markdown, so a hidden marker inside each one does.
  const marker = `<span hidden data-vp-blog-item data-tags="${toTagsAttribute(post)}"></span>`;
  return `- ${marker}${date}${toPageLink(post.post.title, post.routePath)}${badges ? ` ${badges}` : ''}`;
}

/** Posts in the blog page's layout: cards, or a compact list. */
export function renderGroup(posts: PostPage[], index: IndexPage, context: RenderContext): string[] {
  const { layout } = index.index;
  if (layout === 'compact') {
    return [
      '<div class="vp-blog-list vp-blog-list--compact">',
      '',
      ...posts.map((post) => renderCompactItem(post, context)),
      '',
      '</div>',
    ];
  }
  return [
    `<div class="vp-blog-list vp-blog-list--${layout}">`,
    ...posts.flatMap((post) => renderCard(post, context, index)),
    '</div>',
  ];
}

/** The posts under year headings, each year in a section the client can hide when none of its posts show. */
function renderYears(posts: PostPage[], index: IndexPage, context: RenderContext): string[] {
  const years = new Map<string, PostPage[]>();
  for (const post of posts) {
    const year = post.post.date ? String(post.post.date.getUTCFullYear()) : context.labels.undated;
    years.set(year, [...(years.get(year) ?? []), post]);
  }
  const lines: string[] = [];
  for (const [year, group] of years) {
    lines.push(
      '<section class="vp-blog-year">',
      '',
      `## ${escapeMarkdown(year)}`,
      '',
      ...renderGroup(group, index, context),
      '',
      '</section>',
    );
  }
  return lines;
}

/** Every keyword the listed posts use, with how many use it, alphabetically. */
export function collectTags(posts: PostPage[]): { tag: string; count: number }[] {
  const tags = new Map<string, { tag: string; count: number }>();
  for (const post of posts) {
    for (const tag of new Set(post.post.tags)) {
      const entry = tags.get(tag.toLowerCase()) ?? { tag, count: 0 };
      entry.count++;
      tags.set(tag.toLowerCase(), entry);
    }
  }
  return [...tags.values()].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }));
}

function renderTagList(posts: PostPage[], index: IndexPage, context: RenderContext): string[] {
  const tags = collectTags(posts);
  if (!index.index.tagList || tags.length === 0) return [];
  const links = tags.map(
    ({ tag, count }) =>
      `[${escapeMarkdown(tag)} <span class="vp-blog-tags__count">${count}</span>](${toTagUrl(index.routePath, tag)})`,
  );
  const label = `<span class="vp-blog-tags__label">${escapeTemplateText(context.labels.tags)}</span>`;
  return [
    `<nav class="vp-blog-tags" aria-label="${escapeHtml(context.labels.tags)}">`,
    '',
    `${label} ${links.join(' ')}`,
    '',
    '</nav>',
  ];
}

/** Labels the client needs, as data attributes, so they are translated in one place. */
function renderClientAttributes(index: IndexPage, context: RenderContext): string {
  const { labels } = context;
  const attributes: Record<string, string> = {
    'data-page-size': String(index.index.pageSize),
    'data-label-tagged': labels.tagged,
    'data-label-show-all': labels.showAll,
    'data-label-no-tagged': labels.noTagged,
    'data-label-previous': labels.previous,
    'data-label-next': labels.next,
    'data-label-pages': labels.pages,
  };
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(' ');
}

/**
 * Renders a blog page's posts as Markdown: the keyword list, the pinned
 * sticky posts, then the rest (under year headings if the page asks for it).
 * Every post is in the HTML; `useBlog()` in the theme then filters them by
 * keyword and splits them into pages, using the empty slots written here.
 */
export function renderPostList(pinned: PostPage[], rest: PostPage[], index: IndexPage, context: RenderContext): string {
  const all = [...pinned, ...rest];
  if (all.length === 0) return `<p class="vp-blog-empty">${escapeTemplateText(context.labels.noPosts)}</p>\n`;
  const lines = [
    `<div class="vp-blog" data-vp-blog ${renderClientAttributes(index, context)}>`,
    ...block('vp-blog-subscribe', renderRssLink(index, context)),
    ...renderTagList(all, index, context),
    '<div class="vp-blog-filter" data-vp-blog-filter hidden></div>',
  ];
  if (pinned.length)
    lines.push(
      '<section class="vp-blog-sticky" data-vp-blog-sticky>',
      ...renderGroup(pinned, index, context),
      '</section>',
    );
  if (rest.length)
    lines.push(...(index.index.groupByYear ? renderYears(rest, index, context) : renderGroup(rest, index, context)));
  lines.push(`<nav class="vp-blog-pagination" data-vp-blog-pagination hidden></nav>`, '</div>');
  return `${lines.join('\n')}\n`;
}

export interface PostDecorations {
  byline: boolean;
  cover: boolean;
}

/**
 * The author, date and tags block under a post's title, and its cover image.
 * Its keywords link to `blogRoutePath` (the post's own blog) filtered by them.
 */
export function renderPostHeader(
  post: PostPage,
  context: RenderContext,
  show: PostDecorations,
  blogRoutePath: string | null = null,
): string {
  const lines: string[] = [];
  if (show.byline) {
    const meta = renderMeta(post, context, { authors: true, updated: true, badges: true });
    const tags = post.post.tags.length
      ? `<span class="vp-blog-byline__tags">${renderTags(post.post.tags, blogRoutePath)}</span>`
      : '';
    lines.push(...block('vp-blog-byline', [meta, tags].filter(Boolean).join('\n\n')));
  }
  if (show.cover && post.post.image) {
    // Written relative to the post itself, as the author wrote it.
    const image =
      /^[./@~]/.test(post.post.image) || isExternalUrl(post.post.image) ? post.post.image : `./${post.post.image}`;
    lines.push(...block('vp-blog-cover', `![${escapeMarkdown(post.post.imageAlt)}](${toMarkdownUrl(image)})`));
  }
  return lines.join('\n');
}

function renderNavLink(kind: 'newer' | 'older', post: PostPage | undefined, context: RenderContext): string[] {
  if (!post) return [`<div class="vp-blog-post-nav__${kind}"></div>`];
  const label = `<span class="vp-blog-post-nav__label">${escapeTemplateText(context.labels[kind])}</span>`;
  return block(`vp-blog-post-nav__${kind}`, `${label}<br>\n${toPageLink(post.post.title, post.routePath)}`);
}

/** Links to the newer and older posts in the post's blog, and back to the blog itself. */
export function renderPostNav(post: PostPage, posts: PostPage[], blog: IndexPage, context: RenderContext): string {
  const position = posts.indexOf(post);
  const newer = position > 0 ? posts[position - 1] : undefined;
  const older = position >= 0 ? posts[position + 1] : undefined;
  const lines = ['<nav class="vp-blog-post-nav">'];
  if (newer || older) lines.push(...renderNavLink('newer', newer, context), ...renderNavLink('older', older, context));
  lines.push(
    ...block('vp-blog-post-nav__all', toPageLink(fill(context.labels.allPosts, { blog: blog.title }), blog.routePath)),
  );
  lines.push('</nav>');
  return lines.join('\n');
}
