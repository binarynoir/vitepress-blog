import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { IndexPage, PostPage } from './collect.js';
import { DEFAULT_LABELS, type BlogFeedData, type BlogOptions } from './types.js';
import { isExternalUrl, joinUrl, toUrlPath } from './util.js';

/** Where the site is published, for the absolute links feeds and social cards need. */
export interface SiteLocation {
  /** `https://example.com`, without the base. */
  siteUrl: string;
  /** VitePress's `base`: `/` or `/docs/`. */
  base: string;
  cleanUrls: boolean;
  /** Absolute path of VitePress's public folder, for `/x.png` images. */
  publicDir: string;
  /** Folder under the output that relative post images are copied to. */
  imagesDir: string;
}

/** An absolute URL for a path on the site: `/news/` becomes `https://example.com/docs/news/`. */
export function toAbsoluteUrl(urlPath: string, site: SiteLocation): string {
  return joinUrl(site.siteUrl, joinUrl(site.base, urlPath));
}

export function toPageUrl(routePath: string, site: SiteLocation): string {
  return toAbsoluteUrl(toUrlPath(routePath, site.cleanUrls), site);
}

/** A blog page's feed file, relative to the output folder: `news/feed.xml`. */
export function toFeedPath(index: IndexPage): string {
  return path.posix.join(path.posix.dirname(index.routePath), index.index.feed!.path);
}

/**
 * The subscribe dialog's data: every feed the build writes, with its path as
 * links to it are written and its absolute URL. `null` with no feeds.
 */
export function resolveFeedData(indexes: IndexPage[], site: SiteLocation, options: BlogOptions): BlogFeedData | null {
  const feeds = indexes
    .filter((index) => index.index.feed)
    .map((index) => ({
      path: joinUrl(site.base, toFeedPath(index)),
      url: toAbsoluteUrl(toFeedPath(index), site),
      title: index.index.feed?.title ?? index.title,
    }));
  if (feeds.length === 0) return null;
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  return {
    feeds,
    labels: {
      subscribeTo: labels.subscribeTo,
      subscribeHint: labels.subscribeHint,
      feedAddress: labels.feedAddress,
      copy: labels.copy,
      copied: labels.copied,
      openInReader: labels.openInReader,
      viewFeed: labels.viewFeed,
      aboutFeeds: labels.aboutFeeds,
      close: labels.close,
    },
  };
}

export interface ResolvedImage {
  /** Absolute URL to publish. */
  url: string;
  /** For a file on disk: where it is, and where in the output it is copied to (relative). */
  file?: string;
  outputPath?: string;
  bytes?: number;
  type?: string;
}

const IMAGE_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function toImageType(file: string): string | undefined {
  return IMAGE_TYPES[path.extname(file).toLowerCase()];
}

/**
 * A post's image as an absolute URL. Vite gives bundled images a hashed name
 * that isn't known until the build is done, so a relative image is instead
 * copied to `imagesDir` under a name made from its content: the URL is known
 * when the page's `<head>` is written, and changes when the image does.
 */
export function resolvePostImage(post: PostPage, site: SiteLocation): ResolvedImage | null {
  const { image } = post.post;
  if (!image) return null;
  if (isExternalUrl(image)) return { url: image.startsWith('//') ? `https:${image}` : image, type: toImageType(image) };
  if (/^[@~]/.test(image)) return null;

  const file = image.startsWith('/')
    ? path.join(site.publicDir, decodeURI(image))
    : path.resolve(path.dirname(post.absolutePath), decodeURI(image));
  let bytes: number;
  try {
    bytes = statSync(file).size;
  } catch {
    return null;
  }
  if (image.startsWith('/')) return { url: toAbsoluteUrl(image, site), file, bytes, type: toImageType(file) };

  const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
  const extension = path.extname(file);
  const outputPath = path.posix.join(site.imagesDir, `${path.basename(file, extension)}-${hash}${extension}`);
  return { url: toAbsoluteUrl(outputPath, site), file, outputPath, bytes, type: toImageType(file) };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function element(name: string, value: string | undefined, attributes = ''): string {
  return value ? `<${name}${attributes}>${escapeXml(value)}</${name}>` : '';
}

export interface FeedInput {
  index: IndexPage;
  posts: PostPage[];
  site: SiteLocation;
  /** The site's language, `en-US`. */
  language?: string;
  /** Used when neither the feed nor the blog page has a description. */
  siteDescription?: string;
}

/** Renders an RSS 2.0 feed for a blog page, newest posts first. */
export function renderFeed({ index, posts, site, language, siteDescription }: FeedInput): string {
  const feed = index.index.feed!;
  const pageUrl = toPageUrl(index.routePath, site);
  const newest = posts.map((post) => post.post.updated ?? post.post.date).find((date) => date !== null);

  const items = posts.map((post) => {
    const url = toPageUrl(post.routePath, site);
    const image = resolvePostImage(post, site);
    const lines = [
      element('title', post.post.title),
      element('link', url),
      element('guid', url, ' isPermaLink="true"'),
      post.post.date ? element('pubDate', post.post.date.toUTCString()) : '',
      element('description', post.post.summary),
      ...post.post.authors.map((author) =>
        element('dc:creator', author.email ? `${author.email} (${author.name})` : author.name),
      ),
      ...[post.post.category, ...post.post.tags].filter(Boolean).map((category) => element('category', category)),
      image
        ? `<media:content url="${escapeXml(image.url)}" medium="image"${image.type ? ` type="${image.type}"` : ''} />`
        : '',
      image?.bytes !== undefined && image.type
        ? `<enclosure url="${escapeXml(image.url)}" length="${image.bytes}" type="${image.type}" />`
        : '',
    ];
    return `    <item>\n${lines
      .filter(Boolean)
      .map((line) => `      ${line}`)
      .join('\n')}\n    </item>`;
  });

  const channel = [
    element('title', feed.title ?? index.title),
    element('link', pageUrl),
    element('description', feed.description ?? (index.description || siteDescription || index.title)),
    `<atom:link href="${escapeXml(toAbsoluteUrl(toFeedPath(index), site))}" rel="self" type="application/rss+xml" />`,
    element('language', language),
    newest ? element('lastBuildDate', newest.toUTCString()) : '',
    element('generator', '@binarynoir/vitepress-blog'),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">',
    '  <channel>',
    ...channel.filter(Boolean).map((line) => `    ${line}`),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
