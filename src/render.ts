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

/** A browse option: a filter link holding its name and, unless `count` is `null`, its post count, with an optional tooltip. */
function renderOption(name: string, count: number | null, url: string, title = ''): string {
  const tooltip = title ? ` "${title.replace(/"/g, '&quot;')}"` : '';
  const counter = count === null ? '' : ` <span class="vp-blog-facet__count">${count}</span>`;
  return `[<span class="vp-blog-facet__name">${escapeMarkdown(name)}</span>${counter}](${url}${tooltip})`;
}

const CHEVRON =
  '<svg class="vp-blog-menu__chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
  '<path fill="currentColor" d="M12 15.5a1 1 0 0 1-.7-.29l-5-5a1 1 0 0 1 1.4-1.42l4.3 4.3 4.3-4.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-.7.29z"></path>' +
  '</svg>';

/** Whether choosing one of `values` would narrow `total` posts: a single value on every post would not. */
function canNarrow(values: FacetCount[], total: number): boolean {
  return values.length > 1 || (values.length === 1 && values[0].count < total);
}

/** Most used first, then alphabetically: the order a row's first chips are chosen in. */
function byUse(a: FacetCount, b: FacetCount): number {
  return b.count - a.count || a.value.localeCompare(b.value, undefined, { sensitivity: 'base' });
}

/**
 * A drop-down of filters: a `<details>` whose button names the filter (the
 * client swaps in the chosen value), and a panel of links. It opens and
 * closes without JavaScript; the client closes it on a click outside, on
 * Escape and once a link is followed.
 */
function renderMenu(facet: string, label: string, panel: string[], attributes = ''): string[] {
  return [
    `<div class="vp-blog-menu-wrap" data-vp-blog-menu="${facet}">`,
    `<details class="vp-blog-menu vp-blog-menu--${facet}" data-vp-blog-facet="${facet}"${attributes}>`,
    `<summary class="vp-blog-menu__button"><span class="vp-blog-menu__text" data-label="${escapeHtml(label)}">${escapeTemplateText(label)}</span>${CHEVRON}</summary>`,
    '<div class="vp-blog-menu__panel">',
    ...panel,
    '</div>',
    '</details>',
    '</div>',
  ];
}

/**
 * The browse panel above a blog page's posts: a bar, then a line of
 * keywords. On the bar, categories (the few values a post is one of) are
 * tabs with their counts, "All" first, most used next; those past
 * `categoryLimit` go under "More". Dates, used now and then, are a
 * drop-down at its end, each year with its months, then the RSS link.
 * Keywords are chips below, most used first, the first `tagLimit` before
 * "+N more"; without tabs they sit on the bar instead. A part is left out
 * when it can't narrow the posts, such as one category that every post is in.
 */
function renderBrowse(posts: PostPage[], index: IndexPage, context: RenderContext): string[] {
  const { labels } = context;
  const { locale, timeZone } = context.dates;
  const { categoryList, categoryLimit, tagList, tagLimit, tagMinCount, archive: showArchive } = index.index;
  const blog = index.routePath;
  const option = (name: string, param: FilterParam, value: string, count: number | null, title = '') =>
    renderOption(name, count, toFilterUrl(blog, param, value), title);
  const tabs: string[] = [];
  const tools: string[] = [];

  const categories = categoryList ? collectCategories(posts).sort(byUse) : [];
  if (canNarrow(categories, posts.length)) {
    const shown = categoryLimit ? categories.slice(0, categoryLimit) : categories;
    const rest = categories.slice(shown.length);
    tabs.push(
      `<div class="vp-blog-tabs" role="group" aria-label="${escapeHtml(labels.categories)}" data-vp-blog-facet="category">`,
      ...block(
        'vp-blog-facet__chips',
        [
          option(labels.all, 'category', '', posts.length),
          ...shown.map(({ value, count }) => option(value, 'category', value, count)),
        ].join(' '),
      ),
      ...(rest.length
        ? renderMenu(
            'more',
            labels.moreCategories,
            block(
              'vp-blog-facet__chips',
              rest.map(({ value, count }) => option(value, 'category', value, count)).join(' '),
            ),
          )
        : []),
      '</div>',
    );
  }

  const tags = tagList
    ? collectTags(posts)
        .map(({ tag, count }) => ({ value: tag, count }))
        .filter(({ count }) => count >= tagMinCount)
        .sort(byUse)
    : [];
  const keywords: string[] = [];
  if (canNarrow(tags, posts.length)) {
    const limited = tagLimit && tags.length > tagLimit ? ` data-limit="${tagLimit}"` : '';
    keywords.push(
      `<div class="vp-blog-keywords" role="group" aria-label="${escapeHtml(labels.tags)}" data-vp-blog-facet="tag"${limited}>`,
      ...block('vp-blog-facet__chips', tags.map(({ value, count }) => option(value, 'tag', value, count)).join(' ')),
      '</div>',
    );
  }

  const archive = showArchive ? collectArchive(posts, timeZone) : [];
  const months = archive.flatMap((year) => year.months);
  if (archive.length > 1 || canNarrow(months, posts.length)) {
    const panel = [...block('vp-blog-menu__all', option(labels.allTime, 'year', '', null))];
    for (const year of archive) {
      // With one year, choosing it would narrow nothing: it is just a heading over its months.
      const heading =
        archive.length > 1
          ? option(year.value, 'year', year.value, year.count)
          : `<span class="vp-blog-facet__name">${year.value}</span>`;
      const monthLinks = year.months.map(({ value, count }) =>
        option(
          formatMonth(value, locale, { month: 'short' }),
          'month',
          value,
          count,
          formatMonth(value, locale, { month: 'long', year: 'numeric' }),
        ),
      );
      panel.push(
        `<div class="vp-blog-menu__year" data-year="${year.value}">`,
        ...block('vp-blog-menu__year-name', heading),
        ...block('vp-blog-menu__months', monthLinks.join(' ')),
        '</div>',
      );
    }
    tools.push(...renderMenu('date', labels.date, panel, ` aria-label="${escapeHtml(labels.archive)}"`));
  }

  if (tabs.length === 0 && tools.length === 0 && keywords.length === 0) return [];
  // Without tabs, the keywords take their place on the bar rather than a line of their own.
  const inline = tabs.length === 0;
  return [
    `<nav class="vp-blog-browse" aria-label="${escapeHtml(labels.browse)}">`,
    '<div class="vp-blog-browse__bar">',
    ...(inline ? keywords : tabs),
    '<div class="vp-blog-browse__tools">',
    ...tools,
    ...block('vp-blog-browse__rss', renderRssLink(index, context)),
    '</div>',
    '</div>',
    ...(inline ? [] : keywords),
    '</nav>',
  ];
}

/** Labels the client needs, as data attributes, so they are translated in one place. */
function renderClientAttributes(index: IndexPage, context: RenderContext): string {
  const { labels } = context;
  const attributes: Record<string, string> = {
    'data-page-size': String(index.index.pageSize),
    'data-label-show-all': labels.showAll,
    'data-label-previous': labels.previous,
    'data-label-next': labels.next,
    'data-label-pages': labels.pages,
    'data-label-announcements': labels.announcements,
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
