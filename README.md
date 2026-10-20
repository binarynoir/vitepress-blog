# vitepress-blog

[![npm version](https://img.shields.io/npm/v/@binarynoir/vitepress-blog.svg)](https://www.npmjs.com/package/@binarynoir/vitepress-blog)
[![CI](https://github.com/binarynoir/vitepress-blog/actions/workflows/ci.yml/badge.svg)](https://github.com/binarynoir/vitepress-blog/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@binarynoir/vitepress-blog.svg)](LICENSE)

A [VitePress 2](https://vitepress.dev) plugin that turns pages into a blog with
frontmatter alone. Any page anywhere in your docs can be a post. A main blog
lists posts from the whole site, and **section blogs** list the posts of one
folder, the way section glossaries and tagged pages work. Every blog gets its
own RSS feed.

[Documentation and live demo](https://binarynoir.tech/plugins/blog/)

[![Support me on Buy Me a Coffee](https://img.shields.io/badge/Support%20me-Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/binarynoir)
[![Support me on Ko-fi](https://img.shields.io/badge/Support%20me-Ko--fi-blue?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/binarynoir)
[![More tools](https://img.shields.io/badge/Website-binarynoir.tech-8c8c8c?style=for-the-badge)](https://binarynoir.tech)

## What this does

```md
---
blog:
  date: 2026-10-01
  summary: Team A's first release is out.
  image: ./launch.png
  author: jane
  tags: [release]
  scope: site # also list it on the main blog
---

# We launched
```

- **Blog pages** (`blog-index` in the frontmatter) get a list of posts: cards
  with image, title, date, reading time, authors, summary and tags. Sticky
  posts are pinned to the top, the rest are split into pages, and a keyword
  list above them filters the posts by tag.
- **Posts** (`blog` in the frontmatter) get a byline under their title, links to
  the newer and older posts, and Open Graph and Twitter card tags.
- **Every blog page gets an RSS feed**, written beside it at build time and
  linked from its `<head>` and from each post it carries.
- Lists are plain Markdown generated at build time, with every post in the
  HTML, so they show up in search and work without JavaScript. Links go
  through VitePress, so they get your `base` and `cleanUrls` and are checked
  for dead links. A small composable, `useBlog()`, adds pages and keyword
  filtering in the browser.

## Install

```sh
npm install --save-dev @binarynoir/vitepress-blog
```

Needs Node 22 or later and VitePress 2.

## Usage

Wrap your config, and in your theme import the stylesheet and call `useBlog()`:

```ts
// .vitepress/config.mts
import { defineConfig } from 'vitepress';
import { withBlog } from '@binarynoir/vitepress-blog/vitepress';

export default withBlog(
  defineConfig({
    sitemap: { hostname: 'https://example.com' },
    // ...your config
  }),
  {
    authors: { jane: { name: 'Jane Doe', url: 'https://example.com/jane' } },
  },
);
```

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme';
import { useBlog } from '@binarynoir/vitepress-blog/client';
import '@binarynoir/vitepress-blog/style.css';

export default {
  extends: DefaultTheme,
  setup() {
    // Pages (?page=2) and keyword filtering (?tag=release) on blog pages.
    useBlog();
  },
};
```

`withBlog` keeps any `markdown.config`, `transformHead`, `transformPageData` and
`buildEnd` you already have: the blog's hook runs and then yours, so it
composes with other `withX()` wrappers in any order.

### Wiring it by hand

If you'd rather see each piece in your config, `withBlog` is these five:

```ts
import { blogMarkdown } from '@binarynoir/vitepress-blog';
import { blogHead, blogPageData, blogVitePlugin, writeBlogFeeds } from '@binarynoir/vitepress-blog/vitepress';

const blogOptions = { authors: { jane: 'Jane Doe' } };

export default defineConfig({
  markdown: {
    config(md) {
      md.use(blogMarkdown, blogOptions); // lists, bylines, newer / older links
    },
  },
  transformHead: (context) => blogHead(context, blogOptions), // social tags, feed links
  transformPageData: (pageData, context) => blogPageData(pageData, context, blogOptions), // descriptions
  buildEnd: (siteConfig) => writeBlogFeeds(siteConfig, blogOptions), // RSS feeds, images
  vite: { plugins: [blogVitePlugin(blogOptions)] }, // fresh lists and feeds in `vitepress dev`
});
```

Pass the same options to all five.

## Posts

A page is a post when its frontmatter has a `blog` key. `blog: true` is a post
with every default; an object sets its details.

```md
---
title: We launched
blog:
  date: 2026-10-01 09:00
  updated: 2026-10-05 16:30
  summary: Team A's first release is out.
  image: ./launch.png
  imageAlt: The release dashboard
  author: [jane, Sam Lee]
  tags: [release, team-a]
  category: Engineering
  scope: site
  sticky: true
---
```

| Key             | Default                                    | What it does                                                                                                                                              |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`         | the page's `title`, then its `#` heading   | Title in lists, feeds and social cards.                                                                                                                   |
| `summary`       | the page's `description`, then first prose | One or two sentences for cards, feeds and `<meta name="description">`.                                                                                    |
| `date`          | none                                       | When the post was published: a date, or a date and time. See [Dates and times](#dates-and-times). Newest first; undated posts go last.                    |
| `updated`       | none                                       | When the post was last changed, in the same forms. The byline shows both: "Published … · Updated …". It is the feed's last-updated time.                  |
| `image`         | none                                       | Card, social and feed image: a path relative to the post, a public path (`/cover.png`) or a URL. `{ src, alt, fit, position }` also works.                |
| `imageAlt`      | `''`                                       | Alt text for the image.                                                                                                                                   |
| `imageFit`      | `cover`                                    | How cards fit the image in their frame: `cover` crops it to fill the frame, `contain` shows all of it, letterboxed. Use `contain` for logos and diagrams. |
| `imagePosition` | the centre                                 | Which part of a cropped image stays in view, as CSS `object-position`: `top`, `left`, `30% 20%`.                                                          |
| `author`        | the `defaultAuthor` option                 | A name, a key from the `authors` option, `{ name, url, email }`, or a list of these. `authors` works too.                                                 |
| `tags`          | none                                       | A list or a comma-separated string. Shown as chips and written to the feed as categories.                                                                 |
| `category`      | none                                       | Written to the feed and `article:section`.                                                                                                                |
| `scope`         | `section`                                  | `site` (or `global`) also lists the post on the main blog. See [Scopes](#scopes).                                                                         |
| `sticky`        | `false`                                    | Pinned to the top of its blog pages, above the paginated posts, with a Pinned badge. See [Sticky posts](#sticky-posts).                                   |
| `draft`         | `false`                                    | Left out of lists and feeds. The page itself is still built: use `srcExclude` to hide it.                                                                 |
| `byline`        | the `byline` option                        | `false` hides this post's byline.                                                                                                                         |
| `cover`         | the `cover` option                         | `true` shows this post's image under its byline.                                                                                                          |
| `postNav`       | the `postNav` option                       | `false` hides this post's newer / older links.                                                                                                            |

Title, description, date, author(s), image and tags may also be written at the
top level of the frontmatter, as other blog tools expect. A value under `blog`
wins.

### Dates and times

`date` and `updated` take a date, or a date and a time, in any of these forms:

| Written                     | Means                                       |
| --------------------------- | ------------------------------------------- |
| `2026-10-20`                | A day. Shows "October 20, 2026".            |
| `2026-10-20 14:30`          | A day and a time, in the `timeZone` option. |
| `2026-10-20T14:30:00`       | The same, with a `T` and seconds.           |
| `2026-10-20T14:30:00-04:00` | An exact moment, with its offset from UTC.  |
| `2026-10-20T18:30:00Z`      | An exact moment, in UTC.                    |

```yaml
blog:
  date: 2026-10-20 14:30
  updated: 2026-10-21 09:05
```

- **A time shows only when you give one.** A date alone is shown as a date,
  never as "12:00 AM".
- **Times without an offset are in the `timeZone` option**, `UTC` unless you
  set one, so the same frontmatter means the same moment on every build
  machine. Set `timeZone: 'America/New_York'` and write local times; daylight
  saving is taken care of. Dates and times are also shown in that time zone.
- **The byline tells readers both:** "Published October 20, 2026 at 2:30 PM
  EDT · Updated October 21, 2026 at 9:05 AM EDT". Cards show the published
  date alone.
- **Posts on the same day sort by their times**, newest first, and a date
  alone counts as the start of its day.
- Feeds and social tags use the exact moment: `pubDate`, `lastBuildDate`,
  `article:published_time` and `article:modified_time`.

## Blog pages

A page with `blog-index` in its frontmatter lists posts. `blog-index: true` is a
**section blog** of the page's own folder.

```md
---
title: Team A blog
blog-index:
  layout: grid
  groupBy: year
---

# Team A blog

Notes from Team A.

<!-- blog-posts -->
```

The list goes where `<!-- blog-posts -->` is, or after the page's content.

| Key           | Default                        | What it does                                                                                    |
| ------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `scope`       | `section`                      | `site` makes this the main blog. See [Scopes](#scopes).                                         |
| `folders`     | the page's folder              | Folders to list posts from, relative to the source directory; `./` and `../` are page-relative. |
| `tags`        | all                            | Only list posts with at least one of these tags.                                                |
| `limit`       | all                            | Most posts to list. The feed has its own limit.                                                 |
| `layout`      | `list`                         | `list` (image beside text), `grid` (cards) or `compact` (dates and titles).                     |
| `groupBy`     | none                           | `year` puts a heading above each year's posts.                                                  |
| `showTags`    | `true`                         | `false` hides tag chips on cards.                                                               |
| `tagList`     | `true`                         | A keyword list above the posts: every tag with its count, each a filter. `false` leaves it out. |
| `pageSize`    | `10` (the `pageSize` option)   | Posts per page. `0` shows them all on one page.                                                 |
| `stickyLimit` | all (the `stickyLimit` option) | Most sticky posts pinned to the top. Extra ones take their place by date.                       |
| `rssLink`     | `true` (the `rssLink` option)  | A "Subscribe" link with the RSS icon to this blog's feed. `false` leaves it out.                |
| `feed`        | on                             | `false` turns the feed off, or `{ title, description, limit, path }` to set it up.              |

### Sticky posts

`sticky: true` pins a post to the top of every blog page that lists it, in its
own section above the other posts, with a Pinned badge. Pinned posts show on
the first page only and don't count toward `pageSize`. When more posts are
sticky than a page's `stickyLimit`, the newest ones are pinned and the others
take their place by date. Feeds ignore stickiness and stay in date order.

To keep sticky posts on top of an [Auto Sidebar](https://binarynoir.tech/plugins/auto-sidebar/)
sidebar too, sort the blog folder by stickiness, then date:

```txt
# docs/blog/.sidebar
index.md:All posts
.sort: blog.sticky desc, date desc
```

The sidebar pins every sticky post; `stickyLimit` applies to blog pages.

### Pages and keywords

Every post is written into the blog page's HTML, so search engines, local
search and readers without JavaScript see them all. With `useBlog()` in your
theme (see [Usage](#usage)), the browser then shows one page at a time and
filters by keyword, both from the URL:

- `?page=2` shows the second page. Previous, page number and Next links are
  added below the posts when there is more than one page.
- `?tag=release` shows only posts tagged `release` (in any case), with a
  "Posts tagged release · Show all posts" line above them. Pages then count
  the matching posts only.

Keywords are links everywhere they appear: in the keyword list at the top of
a blog page, on each card, and in a post's byline, where they link to the
post's own blog, filtered. They are ordinary links, so VitePress follows them
without reloading the page, and each filtered view has its own URL to share.

## Latest posts on any page

A `::: blog-posts` block shows a blog's latest posts anywhere: on the home
page, or on a section's landing page next to its own blog. Each block has its
own settings:

```md
## Latest from the blog

::: blog-posts
blog: /blog/
limit: 3
stickyLimit: 1
layout: grid
more: All posts →
:::
```

| Key           | Default               | What it does                                                                                                      |
| ------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `blog`        | the page's own blog   | The blog to show: its URL (`/blog/`) or file (`blog/index.md`); `./` and `../` are page-relative.                 |
| `limit`       | `5`                   | Most posts shown, pinned ones included. `0` shows them all.                                                       |
| `stickyLimit` | the blog page's       | Most sticky posts pinned to the top. `0` pins them all.                                                           |
| `layout`      | the blog page's       | `list`, `grid` or `compact`.                                                                                      |
| `showTags`    | the blog page's       | `false` hides keyword chips.                                                                                      |
| `tags`        | all                   | Only show posts with at least one of these keywords.                                                              |
| `more`        | `All posts in {blog}` | Text of the link to the blog page below the posts. `false` leaves the link out.                                   |
| `rssLink`     | the blog page's       | A "Subscribe" link with the RSS icon to the blog's feed, beside the link to the blog page. `false` leaves it out. |

- The page's own blog is the deepest section blog covering its folder, else
  the main blog, so a block on the home page shows the main blog and one on
  a section's page shows that section's blog.
- It shows the posts its blog lists, newest first, with no drafts unless the
  `drafts` option is on. Keyword chips link to the blog page, filtered.
- It is written into the page at build time, like blog pages, and refreshes in
  `vitepress dev` when a post changes. A page can hold several blocks. A
  block inside a code fence is left as written.
- A blog it can't find, or settings that aren't valid YAML, log a warning
  naming the page and line.

## Scopes

Scopes decide which blog lists a post, the same way section glossaries decide
which glossary a page uses.

- **A section blog** lists every post in its folder and the folders below it,
  whatever the post's scope. Section blogs can be nested: a post in
  `team-a/guides/` is listed by both `team-a/` and `team-a/guides/`.
- **The main blog** (`blog-index: { scope: site }`) lists:
  - posts from any folder that are marked `scope: site`
  - posts in folders that don't have a section blog of their own

So a site with only a main blog needs no scope settings at all, and a post
inside a section only reaches the main blog when it says `scope: site`.

```text
docs/
├─ blog/
│  ├─ index.md         blog-index: { scope: site }  → hello, launch, notes
│  └─ hello.md         blog: true
├─ team-a/
│  ├─ index.md         blog-index: true             → launch, internal
│  ├─ launch.md        blog: { scope: site }
│  └─ internal.md      blog: true
└─ notes.md            blog: true (no section blog covers it)
```

A post's newer and older links stay within its own blog: the deepest section
blog that lists it, otherwise the main blog.

## Feeds

Each blog page's RSS 2.0 feed is written next to it at the end of the build:
`news/index.md` gets `news/feed.xml`, and `news/archive.md` gets
`news/archive-feed.xml`. Set `feed.path` to name it yourself. Feeds hold the
newest 20 posts (the `feedLimit` option or `feed.limit`), never drafts, and
each item has its title, link, date, summary, authors, tags and image.

Feeds need absolute links, so they use the `siteUrl` option or VitePress's
`sitemap.hostname`. Without either, no feeds are written and the build says so.

Every blog page and `::: blog-posts` block shows a "Subscribe" link with the RSS icon to its own blog's feed, so readers can follow the whole site or just one section (`rssLink: false` hides it). It only appears when feeds are written, that is, with a site URL. The blog page also links its feed with `<link rel="alternate">`, and so does every
post the feed carries, so feed readers find it from any of them. In
`vitepress dev` the feeds are served from memory, with links to the dev server
if you have no site URL.

### Images in feeds and social cards

Vite renames images it bundles, and the new name isn't known until the build
is done. So a post image given as a relative path is also copied to
`blog-images/` under a name made from its content, and feeds and social cards
link that copy. Public paths (`/cover.png`) and URLs are linked as they are.

## Options

| Option           | Default                                                         | What it does                                                                                                          |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `siteUrl`        | `sitemap.hostname`                                              | Absolute URL of the published site, for feeds and social tags.                                                        |
| `authors`        | `{}`                                                            | Authors posts can name by key: `{ jane: { name, url, email } }` or `{ jane: 'Jane Doe' }`.                            |
| `defaultAuthor`  | none                                                            | Author for posts that don't name one.                                                                                 |
| `locale`         | `'en-US'`                                                       | Locale for dates and author lists ("Jane and Sam").                                                                   |
| `dateFormat`     | `{ dateStyle: 'long' }`                                         | `Intl.DateTimeFormat` options for dates.                                                                              |
| `timeFormat`     | `{ hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }` | `Intl.DateTimeFormat` options for times, as in "2:30 PM EDT". Only dates given with a time show one.                  |
| `timeZone`       | `'UTC'`                                                         | The IANA time zone (`'America/New_York'`) that times without an offset are in, and that dates and times are shown in. |
| `wordsPerMinute` | `200`                                                           | For "5 min read". `0` hides reading time.                                                                             |
| `byline`         | `true`                                                          | Author, date and tags under each post's title.                                                                        |
| `cover`          | `false`                                                         | Each post's image under its byline.                                                                                   |
| `postNav`        | `true`                                                          | Newer and older post links at the end of each post.                                                                   |
| `drafts`         | `false`                                                         | List drafts, marked. Pass `process.env.NODE_ENV !== 'production'` for dev only.                                       |
| `stripTags`      | `true`                                                          | Remove [Markdown Tags](https://binarynoir.tech/plugins/markdown-tags/) syntax from titles and summaries.              |
| `feedLimit`      | `20`                                                            | Most posts in each feed.                                                                                              |
| `imagesDir`      | `'blog-images'`                                                 | Output folder for copied post images.                                                                                 |
| `pageSize`       | `10`                                                            | Posts per page on blog pages that don't set `pageSize`. `0` turns pages off.                                          |
| `stickyLimit`    | `0` (all)                                                       | Most pinned sticky posts on blog pages that don't set `stickyLimit`.                                                  |
| `rssLink`        | `true`                                                          | A "Subscribe" RSS link on blog pages and blocks that don't set `rssLink`.                                             |
| `labels`         | English                                                         | Words the plugin writes, for translating. See below.                                                                  |

```ts
withBlog(config, {
  locale: 'de-DE',
  labels: {
    by: 'Von',
    published: 'Veröffentlicht',
    updated: 'Aktualisiert',
    dateTime: '{date} um {time}',
    readingTime: '{n} Min. Lesezeit',
    newer: 'Neuerer Beitrag',
    older: 'Älterer Beitrag',
    allPosts: 'Alle Beiträge in {blog}',
    draft: 'Entwurf',
    sticky: 'Angeheftet',
    noPosts: 'Noch keine Beiträge.',
    undated: 'Ohne Datum',
    tags: 'Schlagwörter',
    tagged: 'Beiträge mit {tag}',
    showAll: 'Alle Beiträge zeigen',
    noTagged: 'Keine Beiträge mit {tag}.',
    previous: 'Zurück',
    next: 'Weiter',
    pages: 'Seiten',
    subscribe: 'Abonnieren',
    rssFeed: 'RSS-Feed für {blog}',
  },
});
```

## Styling

`style.css` uses VitePress's theme variables, so it follows light and dark
mode. Override these to restyle it without new rules:

| Variable                | Default                    |
| ----------------------- | -------------------------- |
| `--vp-blog-card-bg`     | `var(--vp-c-bg-soft)`      |
| `--vp-blog-card-border` | `var(--vp-c-divider)`      |
| `--vp-blog-card-radius` | `12px`                     |
| `--vp-blog-meta-color`  | `var(--vp-c-text-2)`       |
| `--vp-blog-tag-bg`      | `var(--vp-c-default-soft)` |
| `--vp-blog-tag-color`   | `var(--vp-c-text-2)`       |
| `--vp-blog-accent`      | `var(--vp-c-brand-1)`      |

Every generated element has a `vp-blog-` class (`vp-blog-card`,
`vp-blog-byline`, `vp-blog-post-nav`, …) for anything more.

## Notes

- **Lists stay fresh in `vitepress dev`.** VitePress caches each page's
  output by its own source, so the dev plugin adds a fingerprint of every post
  to blog pages and posts, and reloads them when any post is added, edited or
  deleted.
- **Pages kept out of the build aren't listed.** Anything `srcExclude` leaves
  out (including [Exclude](https://binarynoir.tech/plugins/exclude/) rules) is
  skipped, so a list never links to a missing page.
- **Rewrites are followed.** Links and feeds use the path a page is served at.
- **Plain markdown-it**: `blogMarkdown` needs VitePress's `env.path`,
  `env.relativePath` and `env.frontmatter`, so it does nothing elsewhere.

## Releasing

Releases are tag-triggered. From a clean `main` that's in sync with
`origin/main`:

```sh
npm run release:patch   # or release:minor / release:major
```

This runs typecheck/lint/test/build locally, then `npm version <bump>` and
`git push --follow-tags`. Pushing the tag triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which re-runs
the checks, publishes to npm, and creates a GitHub release.

## License

MIT

---

## Feedback and support

Bug reports, feature requests and questions are all welcome. Please open them on this project's [GitHub issue tracker](https://github.com/binarynoir/vitepress-blog/issues):

- **Found a bug?** [Report it](https://github.com/binarynoir/vitepress-blog/issues/new?labels=bug&title=Bug%3A%20). Include your version and the steps to reproduce it.
- **Have an idea?** [Request a feature](https://github.com/binarynoir/vitepress-blog/issues/new?labels=enhancement&title=Feature%20request%3A%20). Tell us what you are trying to do.
- **Something else?** [Browse open issues](https://github.com/binarynoir/vitepress-blog/issues) to see if it has already been raised.

Pull requests are welcome too.

## More from BinaryNoir

<p align="center">
  <a href="https://binarynoir.tech">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://binarynoir.tech/logo-wide-dark.svg">
      <img alt="BinaryNoir" src="https://binarynoir.tech/logo-wide-light.svg" width="320">
    </picture>
  </a>
</p>

Blog is one of a family of open-source VitePress plugins, editor extensions and command-line tools from BinaryNoir. Browse them all, with documentation and live demos, at **[binarynoir.tech](https://binarynoir.tech)**.

**VitePress plugins**

- [Auto Sidebar](https://binarynoir.tech/plugins/auto-sidebar): sidebar built from your folders
- [Auto Navbar](https://binarynoir.tech/plugins/auto-navbar): navbar built from your folders
- [Sidebar Accordion](https://binarynoir.tech/plugins/sidebar-accordion): one open sidebar group at a time
- [Markdown Tags](https://binarynoir.tech/plugins/markdown-tags/): inline status badges and tagged-pages lists
- [Reading Time Tag](https://binarynoir.tech/plugins/reading-time-tag): reading-time estimates
- [Glossary Tooltips](https://binarynoir.tech/plugins/glossary/): hover definitions from one glossary file
- [Text Style](https://binarynoir.tech/plugins/text-style): colored and sized text inline
- [Downloads](https://binarynoir.tech/plugins/downloads): downloadable files next to your pages
- [Exclude](https://binarynoir.tech/plugins/exclude/): keep pages out of the build with a `.exclude` file
- [README Index](https://binarynoir.tech/plugins/readme-index/): `README.md` index pages for VuePress migrations
- [HTML Escape](https://binarynoir.tech/plugins/html-escape/): stray tags and braces shown as text, not build errors
- [Broken Links](https://binarynoir.tech/plugins/broken-links): dead links shown as text, not build errors

**Vite plugins**

- [Optimize Images](https://binarynoir.tech/plugins/optimize-images): smaller images in the build output
- [Image Fallback](https://binarynoir.tech/plugins/image-fallback): a placeholder instead of a failed build

**Editor extensions**

- [Tags for Markdown for VS Code](https://binarynoir.tech/plugins/markdown-tags/vscode): status badges in the VS Code Markdown preview
- [Tags for Markdown for Obsidian](https://binarynoir.tech/plugins/markdown-tags/obsidian): status badges in Obsidian

**Command-line tools**

- [NoirWatch](https://binarynoir.tech/apps/noirwatch): get notified when a web page changes
- [NoirCon](https://binarynoir.tech/apps/noircon): get notified when a site, server or port goes down
- [callrx](https://binarynoir.tech/apps/callrx): amateur radio callsign lookup

Website, docs and demos: **[binarynoir.tech](https://binarynoir.tech)**

## Author

John Smith III, [BinaryNoir](https://binarynoir.tech). Thanks to all contributors and users for their support and feedback.
