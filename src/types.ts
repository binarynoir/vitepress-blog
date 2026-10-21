export interface BlogAuthor {
  name: string;
  /** Linked from the author's name in bylines and cards. */
  url?: string;
  /** Shown in the feed's `<dc:creator>` as `email (name)` when set. */
  email?: string;
}

export interface BlogOptions {
  /**
   * Absolute URL of the published site, such as `https://example.com`. Feeds
   * and social-card tags need absolute links. Default: VitePress's
   * `sitemap.hostname`. With neither, no feeds or social tags are written.
   */
  siteUrl?: string;
  /** Locale for dates in bylines and cards. Default: `'en-US'`. */
  locale?: string;
  /** How dates are written. Default: `{ dateStyle: 'long' }`. */
  dateFormat?: Intl.DateTimeFormatOptions;
  /**
   * How times are written, for dates whose frontmatter gives one
   * (`2026-10-20 14:30`). Default: `{ hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }`,
   * as in "2:30 PM EDT".
   */
  timeFormat?: Intl.DateTimeFormatOptions;
  /**
   * The time zone frontmatter times without an offset are in, and that every
   * date and time is shown in: an IANA name such as `'America/New_York'`.
   * A value with an offset (`2026-10-20T14:30:00-04:00`, `…Z`) is read as
   * written. Default: `'UTC'`.
   */
  timeZone?: string;
  /** Reading speed for the "5 min read" estimate. `0` hides it. Default: `200`. */
  wordsPerMinute?: number;
  /** Add an author, date and tags line under each post's title. Default: `true`. */
  byline?: boolean;
  /** Show each post's `image` under its byline. Default: `false`. */
  cover?: boolean;
  /** Add newer and older post links to the end of each post. Default: `true`. */
  postNav?: boolean;
  /**
   * List `draft: true` posts, marked as drafts. They are never put in a feed.
   * Pass `process.env.NODE_ENV !== 'production'` to see them in `vitepress dev` only.
   * Default: `false`.
   */
  drafts?: boolean;
  /** Remove markdown-tags syntax (`((tag|draft))`) from titles and summaries. Default: `true`. */
  stripTags?: boolean;
  /** Authors a post can name by key: `author: jane`. */
  authors?: Record<string, BlogAuthor | string>;
  /** Author for posts that don't name one. */
  defaultAuthor?: BlogAuthor | string;
  /** Most posts in each feed, newest first. Default: `20`. */
  feedLimit?: number;
  /**
   * Folder in the build output that post images are copied to, so feeds and
   * social cards can link them at a stable URL. Default: `'blog-images'`.
   */
  imagesDir?: string;
  /**
   * Posts per page on blog pages, for those that don't set `pageSize`. `0`
   * shows every post on one page. Needs `useBlog()` in the theme. Default: `10`.
   */
  pageSize?: number;
  /**
   * Most `pinned: true` posts kept at the top of a blog page, for those that
   * don't set `pinLimit`. Extra pinned posts take their place by date. `0`
   * pins them all. Default: `0`.
   */
  pinLimit?: number;
  /** @deprecated Renamed `pinLimit`; still read when `pinLimit` isn't set. */
  stickyLimit?: number;
  /**
   * Show a "Subscribe" RSS link on blog pages and `::: blog-posts` blocks,
   * for those that don't set `rssLink`. It only shows for a blog with a feed,
   * on a site with a site URL (without one, no feeds are written). Default: `true`.
   */
  rssLink?: boolean;
  /** Words the plugin writes on pages, for translating. `{n}`, `{blog}` and `{filter}` are filled in. */
  labels?: Partial<BlogLabels>;
}

export interface BlogLabels {
  /** Before the author names: "By Jane Doe". */
  by: string;
  /** Before a post's `date` in its byline: "Published October 20, 2026". */
  published: string;
  /** Before a post's `updated` date. */
  updated: string;
  /** A date and its time: "{date} at {time}". */
  dateTime: string;
  /** Reading time: "{n} min read". */
  readingTime: string;
  newer: string;
  older: string;
  /** The link back to a post's blog: "All posts in {blog}". */
  allPosts: string;
  draft: string;
  /** Badge on a pinned post. */
  pinned: string;
  /** Badge on an announcement, and the accessible name of the announcement banner. */
  announcement: string;
  /** A blog page's announcements filter (`?announcements`), in the active filters. */
  announcements: string;
  /** Tooltip of the banner's count badge: "{n} announcements". */
  announcementCount: string;
  /** Accessible name of the banner's close button. */
  dismiss: string;
  noPosts: string;
  /** Group heading for posts without a date, when a blog groups by year or month. */
  undated: string;
  /** Accessible name of the browse panel above a blog page's posts. */
  browse: string;
  /** Label of the browse panel's category row. */
  categories: string;
  /** Label of the browse panel's keyword row. */
  tags: string;
  /** Label of the browse panel's year row. */
  archive: string;
  /** Names a category filter among the active filters: "Category". */
  category: string;
  /** Names a keyword filter among the active filters: "Keyword". */
  tag: string;
  /** How many posts the active filters match: "{n} posts". */
  postCount: string;
  /** The same, for one post: "{n} post". */
  postCountOne: string;
  /** When no post matches the active filters. */
  noMatches: string;
  /** Accessible name of an active filter's remove link: "Remove filter: {filter}". */
  removeFilter: string;
  /** Link that clears every filter. */
  showAll: string;
  previous: string;
  next: string;
  /** Accessible name of the page links. */
  pages: string;
  /** Text of the RSS link on blog pages and blocks. */
  subscribe: string;
  /** Tooltip of the RSS link: "RSS feed for {blog}". */
  rssFeed: string;
}

export const DEFAULT_LABELS: BlogLabels = {
  by: 'By',
  published: 'Published',
  updated: 'Updated',
  dateTime: '{date} at {time}',
  readingTime: '{n} min read',
  newer: 'Newer post',
  older: 'Older post',
  allPosts: 'All posts in {blog}',
  draft: 'Draft',
  pinned: 'Pinned',
  announcement: 'Announcement',
  announcements: 'Announcements',
  announcementCount: '{n} announcements',
  dismiss: 'Dismiss',
  noPosts: 'No posts yet.',
  undated: 'Undated',
  browse: 'Browse posts',
  categories: 'Categories',
  tags: 'Keywords',
  archive: 'Archive',
  category: 'Category',
  tag: 'Keyword',
  postCount: '{n} posts',
  postCountOne: '{n} post',
  noMatches: 'No posts match these filters.',
  removeFilter: 'Remove filter: {filter}',
  showAll: 'Show all posts',
  previous: 'Previous',
  next: 'Next',
  pages: 'Pages',
  subscribe: 'Subscribe',
  rssFeed: 'RSS feed for {blog}',
};

export type BlogScope = 'site' | 'section';
export type BlogLayout = 'list' | 'grid' | 'compact';
/** How a blog page groups its posts under headings: by year, by month, or not at all (`''`). */
export type BlogGroupBy = 'year' | 'month' | '';

export interface BlogFeedConfig {
  title?: string;
  description?: string;
  limit?: number;
  /** Feed file, relative to the blog page's folder. Default: `feed.xml` (`<name>-feed.xml` for a page not named `index.md`). */
  path: string;
}

/** What a blog page's `blog-index` frontmatter says, with defaults filled in. */
export interface BlogIndexConfig {
  /** `site` for the main blog; `section` (the default) for a blog of one part of the site. */
  scope: BlogScope;
  /** Folders the blog covers, relative to the source directory. Empty means the whole site. */
  folders: string[];
  /** Only list posts with at least one of these tags. */
  tags: string[];
  /** Only list posts in one of these categories. */
  categories: string[];
  /** Most posts to list. `0` lists them all. */
  limit: number;
  layout: BlogLayout;
  /** Put a heading above each year's or month's posts. */
  groupBy: BlogGroupBy;
  /** Show the post's tags on each card. */
  showTags: boolean;
  /** Show the post's category above its title on each card. */
  showCategory: boolean;
  /** List every category above the posts, each one a filter. */
  categoryList: boolean;
  /** List every keyword above the posts, each one a filter. */
  tagList: boolean;
  /** List the years and months that have posts above the posts, each one a filter. */
  archive: boolean;
  /** Posts per page. `0` shows them all on one page. */
  pageSize: number;
  /** Most pinned posts kept at the top. `0` pins them all. */
  pinLimit: number;
  /** Show a "Subscribe" link to the blog's feed. */
  rssLink: boolean;
  feed: BlogFeedConfig | null;
}

/** A post's frontmatter, normalized. */
export interface BlogPostData {
  title: string;
  summary: string;
  /** When the post was published, from `date`. */
  date: Date | null;
  /** Whether `date` gave a time, not just a day. */
  dateHasTime: boolean;
  /** When the post was last changed, from `updated`. */
  updated: Date | null;
  /** Whether `updated` gave a time, not just a day. */
  updatedHasTime: boolean;
  /** As written: a path relative to the post, a public path (`/x.png`) or a URL. */
  image: string;
  imageAlt: string;
  /** How a card fits the image in its frame: `cover` crops to fill it, `contain` shows all of it. */
  imageFit: 'cover' | 'contain';
  /** Which part of a cropped image stays in view, as CSS `object-position`: `top`, `30% 20%`. `''` is the centre. */
  imagePosition: string;
  authors: BlogAuthor[];
  tags: string[];
  category: string;
  scope: BlogScope;
  pinned: boolean;
  draft: boolean;
  /** Shown in the announcement banner above the nav bar. */
  announcement: boolean;
  /** The banner's text, from `announcement: "…"`. `''` uses the title. */
  announcementText: string;
  /** Per-post overrides of the `byline`, `cover` and `postNav` options. */
  byline?: boolean;
  cover?: boolean;
  postNav?: boolean;
  readingMinutes: number;
}

/** One announcement, as the banner shows it. */
export interface BlogAnnouncementItem {
  /** The post's path and date: what a dismissal remembers, so re-dating a post announces it again. */
  id: string;
  text: string;
  /** The post's URL path, without the site's base. */
  link: string;
}

/** What the announcement banner reads from VitePress's site data. */
export interface BlogAnnouncementData {
  /** Newest first: the banner shows the first one that hasn't been dismissed. */
  items: BlogAnnouncementItem[];
  /** The blog page filtered to announcements (`/blog/?announcements`), without the base, or `''` when no blog lists them. */
  listLink: string;
  labels: Pick<BlogLabels, 'announcement' | 'announcementCount' | 'dismiss'>;
}
