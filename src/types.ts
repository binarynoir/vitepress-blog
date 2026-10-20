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
  /** How dates are written. Default: `{ dateStyle: 'long' }`, in UTC. */
  dateFormat?: Intl.DateTimeFormatOptions;
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
   * Most sticky posts pinned to the top of a blog page, for those that don't
   * set `stickyLimit`. Extra sticky posts take their place by date. `0` pins
   * them all. Default: `0`.
   */
  stickyLimit?: number;
  /**
   * Show a "Subscribe" RSS link on blog pages and `::: blog-posts` blocks,
   * for those that don't set `rssLink`. It only shows for a blog with a feed,
   * on a site with a site URL (without one, no feeds are written). Default: `true`.
   */
  rssLink?: boolean;
  /** Words the plugin writes on pages, for translating. `{n}`, `{blog}` and `{tag}` are filled in. */
  labels?: Partial<BlogLabels>;
}

export interface BlogLabels {
  /** Before the author names: "By Jane Doe". */
  by: string;
  /** Before a post's `updated` date. */
  updated: string;
  /** Reading time: "{n} min read". */
  readingTime: string;
  newer: string;
  older: string;
  /** The link back to a post's blog: "All posts in {blog}". */
  allPosts: string;
  draft: string;
  /** Badge on a sticky post. */
  sticky: string;
  noPosts: string;
  /** Year heading for posts without a date, when a blog groups by year. */
  undated: string;
  /** Label of a blog page's keyword list. */
  tags: string;
  /** Above a list filtered by keyword: "Posts tagged {tag}". */
  tagged: string;
  /** Link that clears the keyword filter. */
  showAll: string;
  /** When no post has the keyword: "No posts tagged {tag}." */
  noTagged: string;
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
  updated: 'Updated',
  readingTime: '{n} min read',
  newer: 'Newer post',
  older: 'Older post',
  allPosts: 'All posts in {blog}',
  draft: 'Draft',
  sticky: 'Pinned',
  noPosts: 'No posts yet.',
  undated: 'Undated',
  tags: 'Keywords',
  tagged: 'Posts tagged {tag}',
  showAll: 'Show all posts',
  noTagged: 'No posts tagged {tag}.',
  previous: 'Previous',
  next: 'Next',
  pages: 'Pages',
  subscribe: 'Subscribe',
  rssFeed: 'RSS feed for {blog}',
};

export type BlogScope = 'site' | 'section';
export type BlogLayout = 'list' | 'grid' | 'compact';

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
  /** Most posts to list. `0` lists them all. */
  limit: number;
  layout: BlogLayout;
  /** Put a year heading above each year's posts. */
  groupByYear: boolean;
  /** Show the post's tags on each card. */
  showTags: boolean;
  /** List every keyword above the posts, each one a filter. */
  tagList: boolean;
  /** Posts per page. `0` shows them all on one page. */
  pageSize: number;
  /** Most sticky posts pinned to the top. `0` pins them all. */
  stickyLimit: number;
  /** Show a "Subscribe" link to the blog's feed. */
  rssLink: boolean;
  feed: BlogFeedConfig | null;
}

/** A post's frontmatter, normalized. */
export interface BlogPostData {
  title: string;
  summary: string;
  date: Date | null;
  updated: Date | null;
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
  sticky: boolean;
  draft: boolean;
  /** Per-post overrides of the `byline`, `cover` and `postNav` options. */
  byline?: boolean;
  cover?: boolean;
  postNav?: boolean;
  readingMinutes: number;
}
