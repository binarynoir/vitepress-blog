import path from 'node:path';
import type { IndexPage, PostPage } from './collect.js';
import {
  formatMonth,
  formatPostDate,
  monthIn,
  resolveTimeZone,
  toDateTimeAttribute,
  yearIn,
  type DateDisplay,
} from './dates.js';
import { toFeedPath } from './feed.js';
import { DEFAULT_LABELS, type BlogAuthor, type BlogLabels, type BlogOptions } from './types.js';
import { escapeHtml, escapeMarkdown, escapeTemplateText, isExternalUrl, toMarkdownUrl, toPageLink } from './util.js';

/** Marker a blog page can use to say where its list of posts goes. Without it the list is appended. */
export const BLOG_POSTS_PLACEHOLDER = '<!-- blog-posts -->';

export interface RenderContext {
  locale: string;
  /** How dates and times are shown: format, time zone, and how a date and a time are joined. */
  dates: DateDisplay;
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
  const locale = options.locale ?? 'en-US';
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  return {
    locale,
    dates: {
      locale,
      timeZone: resolveTimeZone(options.timeZone),
      dateFormat: options.dateFormat ?? { dateStyle: 'long' },
      timeFormat: options.timeFormat ?? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' },
      dateTime: labels.dateTime,
    },
    labels,
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
  const text = `<span class="vp-blog-rss__text">${escapeMarkdown(context.labels.subscribe)}</span>`;
  return `<span class="vp-blog-rss">[${RSS_ICON} ${text}](${url} "${title}")</span>`;
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

/** A `<time>` element: the date, plus the time when the frontmatter gave one, in the blog's time zone. */
function renderTime(date: Date, hasTime: boolean, context: RenderContext): string {
  const value = { date, hasTime };
  const attribute = toDateTimeAttribute(value, context.dates.timeZone);
  return `<time datetime="${attribute}">${escapeTemplateText(formatPostDate(value, context.dates))}</time>`;
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

function renderBadge(kind: 'draft' | 'pinned' | 'announcement', context: RenderContext): string {
  return `<span class="vp-blog-badge vp-blog-badge--${kind}">${escapeTemplateText(context.labels[kind])}</span>`;
}

/** The query parameters a blog page filters by: `?category=`, `?tag=`, `?year=2026` and `?month=2026-10`. */
export type FilterParam = 'category' | 'tag' | 'year' | 'month';

/**
 * The URL that filters a blog page, which VitePress gives the base:
 * `/blog/?tag=release`, or `/news/archive.md?category=engineering` for a page
 * not named `index.md`. An `index.md` page is linked by its folder, because
 * VitePress reads anything after `index.md` in a link as a heading anchor.
 */
export function toFilterUrl(blogRoutePath: string, param: FilterParam, value: string): string {
  const encoded = encodeURIComponent(value.toLowerCase()).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));
  const page = blogRoutePath.replace(/(^|\/)index\.md$/, '$1');
  return `${toMarkdownUrl(`/${page}`)}?${param}=${encoded}`;
}

/** The URL that filters a blog page by a keyword: `/blog/?tag=release`. See `toFilterUrl`. */
export function toTagUrl(blogRoutePath: string, tag: string): string {
  return toFilterUrl(blogRoutePath, 'tag', tag);
}

/** A chip: a link that filters `blogRoutePath` by `param`, or plain text without a blog. */
function renderFilterLink(text: string, param: FilterParam, blogRoutePath: string | null, className: string): string {
  return blogRoutePath
    ? `[${escapeMarkdown(text)}](${toFilterUrl(blogRoutePath, param, text)})`
    : `<span class="${className}">${escapeTemplateText(text)}</span>`;
}

/** Keyword chips: links that filter `blogRoutePath` by the keyword, or plain text without a blog. */
function renderTags(tags: string[], blogRoutePath: string | null): string {
  return tags.map((tag) => renderFilterLink(tag, 'tag', blogRoutePath, 'vp-blog-tag')).join(' ');
}

/** What the client reads to filter a post by keyword: its tags, lowercased, joined with `|`. */
function toTagsAttribute(post: PostPage): string {
  return escapeHtml(post.post.tags.map((tag) => tag.toLowerCase()).join('|'));
}

/**
 * The attributes the client filters a post by: its keywords, its category
 * (lowercased), the month it was published in (`YYYY-MM`, in the blog's time
 * zone), and whether it is an announcement.
 */
function toItemAttributes(post: PostPage, context: RenderContext): string {
  const { category, date, announcement } = post.post;
  const attributes = [`data-vp-blog-item data-tags="${toTagsAttribute(post)}"`];
  if (category) attributes.push(`data-category="${escapeHtml(category.toLowerCase())}"`);
  if (date) attributes.push(`data-month="${monthIn(date, context.dates.timeZone)}"`);
  if (announcement) attributes.push('data-announcement');
  return attributes.join(' ');
}

/** Badges for a draft, a pinned post and an announcement, joined with spaces. */
function renderBadges(post: PostPage, context: RenderContext): string {
  const { draft, pinned, announcement } = post.post;
  return [
    draft && renderBadge('draft', context),
    pinned && renderBadge('pinned', context),
    announcement && renderBadge('announcement', context),
  ]
    .filter(Boolean)
    .join(' ');
}

interface MetaParts {
  authors: boolean;
  updated: boolean;
  badges: boolean;
}

/**
 * One line of post details, joined with middle dots: badges, date, updated,
 * reading time, authors. In a byline (`include.updated`) the dates are
 * labelled "Published" and "Updated"; on cards the date stands alone.
 */
function renderMeta(post: PostPage, context: RenderContext, include: MetaParts): string {
  const { date, dateHasTime, updated, updatedHasTime, readingMinutes, authors } = post.post;
  const parts: string[] = [];
  if (include.badges) {
    const shown = renderBadges(post, context);
    if (shown) parts.push(shown);
  }
  if (date) {
    const time = renderTime(date, dateHasTime, context);
    parts.push(include.updated ? `${escapeMarkdown(context.labels.published)} ${time}` : time);
  }
  if (include.updated && updated && (!date || updated.getTime() !== date.getTime())) {
    parts.push(`${escapeMarkdown(context.labels.updated)} ${renderTime(updated, updatedHasTime, context)}`);
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
    post.post.pinned && 'pinned',
    post.post.draft && 'draft',
    post.post.announcement && 'announcement',
    image && 'with-image',
    image && post.post.imageFit === 'contain' && 'contain',
  ]
    .filter(Boolean)
    .map((modifier) => ` vp-blog-card--${modifier}`)
    .join('');
  const alt = escapeMarkdown(post.post.imageAlt);
  return [
    `<article class="vp-blog-card${modifiers}"${imageStyle(post)} ${toItemAttributes(post, context)}>`,
    ...(image ? block('vp-blog-card__image', `[![${alt}](${toMarkdownUrl(image)})](${toMarkdownUrl(link)})`) : []),
    '<div class="vp-blog-card__body">',
    ...(index.index.showCategory && post.post.category
      ? block('vp-blog-card__category', renderFilterLink(post.post.category, 'category', index.routePath, ''))
      : []),
    ...block('vp-blog-card__title', toPageLink(post.post.title, post.routePath)),
    ...block('vp-blog-card__meta', renderMeta(post, context, { authors: true, updated: false, badges: true })),
    ...block('vp-blog-card__summary', escapeMarkdown(post.post.summary)),
    ...(index.index.showTags ? block('vp-blog-card__tags', renderTags(post.post.tags, index.routePath)) : []),
    '</div>',
    '</article>',
  ];
}

function renderCompactItem(post: PostPage, context: RenderContext): string {
  const date = post.post.date ? `${renderTime(post.post.date, post.post.dateHasTime, context)} ` : '';
  const badges = renderBadges(post, context);
  // List items can't carry attributes in Markdown, so a hidden marker inside each one does.
  const marker = `<span hidden ${toItemAttributes(post, context)}></span>`;
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

/**
 * The posts under year or month headings ("2026", "October 2026"), each group
 * in a section the client can hide when none of its posts show.
 */
function renderGroups(posts: PostPage[], index: IndexPage, context: RenderContext): string[] {
  const { groupBy } = index.index;
  if (!groupBy) return renderGroup(posts, index, context);
  const { timeZone, locale } = context.dates;
  const groups = new Map<string, PostPage[]>();
  for (const post of posts) {
    const { date } = post.post;
    const key = !date ? '' : groupBy === 'year' ? String(yearIn(date, timeZone)) : monthIn(date, timeZone);
    groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  const lines: string[] = [];
  for (const [key, group] of groups) {
    const heading = !key
      ? context.labels.undated
      : groupBy === 'year'
        ? key
        : formatMonth(key, locale, { month: 'long', year: 'numeric' });
    lines.push(
      `<section class="vp-blog-group vp-blog-${groupBy}">`,
      '',
      `## ${escapeMarkdown(heading)}`,
      '',
      ...renderGroup(group, index, context),
      '',
      '</section>',
    );
  }
  return lines;
}

export interface FacetCount {
  value: string;
  count: number;
}

/** Every distinct value `pick` gives the posts, any case counted once in its first spelling, with how many posts have it, alphabetically. */
function collectValues(posts: PostPage[], pick: (post: PostPage) => string[]): FacetCount[] {
  const values = new Map<string, FacetCount>();
  for (const post of posts) {
    for (const value of new Set(pick(post))) {
      const entry = values.get(value.toLowerCase()) ?? { value, count: 0 };
      entry.count++;
      values.set(value.toLowerCase(), entry);
    }
  }
  return [...values.values()].sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: 'base' }));
}

/** Every keyword the listed posts use, with how many use it, alphabetically. */
export function collectTags(posts: PostPage[]): { tag: string; count: number }[] {
  return collectValues(posts, (post) => post.post.tags).map(({ value, count }) => ({ tag: value, count }));
}

/** Every category the listed posts are in, with how many are in it, alphabetically. */
export function collectCategories(posts: PostPage[]): FacetCount[] {
  return collectValues(posts, (post) => (post.post.category ? [post.post.category] : []));
}

export interface ArchiveYear extends FacetCount {
  /** The year's months that have posts, as `YYYY-MM`, newest first. */
  months: FacetCount[];
}

/** The years and months the dated posts were published in, in `timeZone`, with their post counts, newest first. */
export function collectArchive(posts: PostPage[], timeZone: string): ArchiveYear[] {
  const years = new Map<string, ArchiveYear>();
  for (const post of posts) {
    if (!post.post.date) continue;
    const month = monthIn(post.post.date, timeZone);
    const year = years.get(month.slice(0, 4)) ?? { value: month.slice(0, 4), count: 0, months: [] };
    year.count++;
    const entry = year.months.find((candidate) => candidate.value === month);
    if (entry) entry.count++;
    else year.months.push({ value: month, count: 1 });
    years.set(year.value, year);
  }
  const newestFirst = (a: FacetCount, b: FacetCount) => b.value.localeCompare(a.value);
  return [...years.values()].sort(newestFirst).map((year) => ({ ...year, months: [...year.months].sort(newestFirst) }));
}

/** A browse chip: a filter link holding its name and post count, with an optional tooltip. */
function renderChip(name: string, count: number, url: string, title = ''): string {
  const tooltip = title ? ` "${title.replace(/"/g, '&quot;')}"` : '';
  return (
    `[<span class="vp-blog-facet__name">${escapeMarkdown(name)}</span> ` +
    `<span class="vp-blog-facet__count">${count}</span>](${url}${tooltip})`
  );
}

interface FacetRow {
  facet: FilterParam;
  label: string;
  chips: string[];
  /** The row's name for screen readers, when it isn't `label`. */
  ariaLabel?: string;
  /** How many chips show before "+N more". `0` shows them all. */
  limit?: number;
  /** Added to the row's opening tag. */
  attributes?: string;
  /** Markdown beside the chips, at the end of the row: the first row holds the "Subscribe" link. */
  aside?: string;
}

/**
 * One row of the browse panel: a label, its chips, and anything beside them.
 * The client shows the first `limit` chips and a "+N more" button for the
 * rest; without it, every chip shows.
 */
function renderFacet(row: FacetRow): string[] {
  const { facet, label, chips, ariaLabel = label, limit = 0, attributes = '', aside = '' } = row;
  const limited = limit && chips.length > limit ? ` data-limit="${limit}"` : '';
  return [
    `<div class="vp-blog-facet vp-blog-facet--${facet}" role="group" aria-label="${escapeHtml(ariaLabel)}" data-vp-blog-facet="${facet}"${limited}${attributes}>`,
    `<span class="vp-blog-facet__label" aria-hidden="true">${escapeTemplateText(label)}</span>`,
    '<div class="vp-blog-facet__chips">',
    '',
    chips.join(' '),
    '',
    '</div>',
    ...block('vp-blog-facet__aside', aside),
    '</div>',
  ];
}

/** Whether choosing one of `values` would narrow `total` posts: a single value on every post would not. */
function canNarrow(values: FacetCount[], total: number): boolean {
  return values.length > 1 || (values.length === 1 && values[0].count < total);
}

/** Most used first, then alphabetically: the order a row's first chips are chosen in. */
function byUse(a: FacetCount, b: FacetCount): number {
  return b.count - a.count || a.value.localeCompare(b.value, undefined, { sensitivity: 'base' });
}

/**
 * The browse panel above a blog page's posts: a row of categories, a row of
 * keywords, and an archive of years, each chip a filter with its post count.
 * Below the years, one row of months per year, which the client shows for the
 * year being viewed. A row is left out when it can't narrow the posts, such
 * as one category that every post is in; with only one year, the archive is
 * just that year's months. Categories and keywords come most used first, so
 * the first `categoryLimit` and `tagLimit` of them are the ones that show
 * before "+N more". The "Subscribe" link sits at the end of the first row.
 */
function renderBrowse(posts: PostPage[], index: IndexPage, context: RenderContext): string[] {
  const { labels } = context;
  const { locale, timeZone } = context.dates;
  const { categoryList, categoryLimit, tagList, tagLimit, tagMinCount, archive: showArchive } = index.index;
  const blog = index.routePath;
  const rows: FacetRow[] = [];

  const categories = categoryList ? collectCategories(posts).sort(byUse) : [];
  if (canNarrow(categories, posts.length)) {
    const chips = categories.map(({ value, count }) => renderChip(value, count, toFilterUrl(blog, 'category', value)));
    rows.push({ facet: 'category', label: labels.categories, chips, limit: categoryLimit });
  }

  const tags = tagList
    ? collectTags(posts)
        .map(({ tag, count }) => ({ value: tag, count }))
        .filter(({ count }) => count >= tagMinCount)
        .sort(byUse)
    : [];
  if (canNarrow(tags, posts.length)) {
    const chips = tags.map(({ value, count }) => renderChip(value, count, toFilterUrl(blog, 'tag', value)));
    rows.push({ facet: 'tag', label: labels.tags, chips, limit: tagLimit });
  }

  const archive = showArchive ? collectArchive(posts, timeZone) : [];
  const monthChips = (months: FacetCount[]) =>
    months.map(({ value, count }) =>
      renderChip(
        formatMonth(value, locale, { month: 'short' }),
        count,
        toFilterUrl(blog, 'month', value),
        formatMonth(value, locale, { month: 'long', year: 'numeric' }),
      ),
    );
  if (archive.length === 1 && canNarrow(archive[0].months, posts.length)) {
    // One year: choosing it would narrow nothing, so the archive is its months.
    const [year] = archive;
    const ariaLabel = `${labels.archive} ${year.value}`;
    const attributes = ` data-year="${year.value}"`;
    rows.push({ facet: 'month', label: labels.archive, chips: monthChips(year.months), ariaLabel, attributes });
  } else if (archive.length > 1) {
    const years = archive.map(({ value, count }) => renderChip(value, count, toFilterUrl(blog, 'year', value)));
    rows.push({ facet: 'year', label: labels.archive, chips: years });
    for (const year of archive) {
      const ariaLabel = `${labels.archive} ${year.value}`;
      const attributes = ` data-year="${year.value}" hidden`;
      rows.push({ facet: 'month', label: year.value, chips: monthChips(year.months), ariaLabel, attributes });
    }
  }

  if (rows.length === 0) return [];
  rows[0].aside = renderRssLink(index, context);
  return [
    `<nav class="vp-blog-browse" aria-label="${escapeHtml(labels.browse)}">`,
    ...rows.flatMap(renderFacet),
    '</nav>',
  ];
}

/** Labels the client needs, as data attributes, so they are translated in one place. */
function renderClientAttributes(index: IndexPage, context: RenderContext): string {
  const { labels } = context;
  const attributes: Record<string, string> = {
    'data-page-size': String(index.index.pageSize),
    // For writing a `?month=` filter's name: "October 2026".
    'data-locale': context.locale,
    'data-label-show-all': labels.showAll,
    'data-label-previous': labels.previous,
    'data-label-next': labels.next,
    'data-label-pages': labels.pages,
    'data-label-announcements': labels.announcements,
    'data-label-category': labels.category,
    'data-label-tag': labels.tag,
    'data-label-post-count': labels.postCount,
    'data-label-post-count-one': labels.postCountOne,
    'data-label-no-matches': labels.noMatches,
    'data-label-remove-filter': labels.removeFilter,
    'data-label-more': labels.more,
    'data-label-less': labels.less,
    'data-label-filter': labels.filter,
    'data-label-no-filter-matches': labels.noFilterMatches,
  };
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(' ');
}

/**
 * Renders a blog page's posts as Markdown: the browse panel, the pinned
 * posts, then the rest (under year or month headings if the page asks
 * for it). Every post is in the HTML; `useBlog()` in the theme then filters
 * them by category, keyword and date and splits them into pages, using the
 * empty slots written here.
 */
export function renderPostList(pinned: PostPage[], rest: PostPage[], index: IndexPage, context: RenderContext): string {
  const all = [...pinned, ...rest];
  if (all.length === 0) return `<p class="vp-blog-empty">${escapeTemplateText(context.labels.noPosts)}</p>\n`;
  // The "Subscribe" link goes in the browse panel's first row, or on its own line when there is no panel.
  const browse = renderBrowse(all, index, context);
  const lines = [
    `<div class="vp-blog" data-vp-blog ${renderClientAttributes(index, context)}>`,
    ...(browse.length ? browse : block('vp-blog-subscribe', renderRssLink(index, context))),
    '<div class="vp-blog-filter" data-vp-blog-filter role="status" hidden></div>',
  ];
  if (pinned.length)
    lines.push(
      '<section class="vp-blog-pinned" data-vp-blog-pinned>',
      ...renderGroup(pinned, index, context),
      '</section>',
    );
  if (rest.length) lines.push(...renderGroups(rest, index, context));
  lines.push(`<nav class="vp-blog-pagination" data-vp-blog-pagination hidden></nav>`, '</div>');
  return `${lines.join('\n')}\n`;
}

export interface PostDecorations {
  byline: boolean;
  cover: boolean;
}

/**
 * The author, date, category and tags block under a post's title, and its
 * cover image. Its category and keywords link to `blogRoutePath` (the post's
 * own blog) filtered by them.
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
    const { category, tags } = post.post;
    const chips = [
      category &&
        `<span class="vp-blog-byline__category">${renderFilterLink(category, 'category', blogRoutePath, 'vp-blog-category')}</span>`,
      tags.length && `<span class="vp-blog-byline__tags">${renderTags(tags, blogRoutePath)}</span>`,
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(...block('vp-blog-byline', [meta, chips].filter(Boolean).join('\n\n')));
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
