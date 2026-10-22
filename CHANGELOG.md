# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A subscribe dialog: with `useBlog()`, a click on any link to one of the site's feeds (the "Subscribe" links, a navbar feed link, a feed link in Markdown) opens a dialog with the feed's address to copy, an "Open in your feed reader" `feed:` link, the feed itself and a link to aboutfeeds.com. Static hosts serve feeds as `application/xml`, so browsers showed raw XML instead of offering a feed reader. Without JavaScript, or with a modifier key, the link opens the feed as before
- Every page links the main blog's feed with `<link rel="alternate">`, so feed readers find it from the home page or any other page. The `primaryFeed` option chooses another blog page, or `false` turns it off
- `subscribeTo`, `subscribeHint`, `feedAddress`, `copy`, `copied`, `openInReader`, `viewFeed`, `aboutFeeds` and `close` labels
- `openSubscribeDialog()` in the client entry, and the `BlogFeedData` and `BlogFeedItem` types
- `all`, `moreCategories`, `date` and `allTime` labels, for the browse panel

### Changed

- The browse panel is a bar on a single rule and one line of keywords, instead of a stack of labelled rows. On the bar, categories are tabs with their counts, "All" first, and dates are a drop-down of years with their months beneath them, showing the chosen date with a × beside it; the RSS link ends the bar as an icon. Keywords are chips below it, without the counter badges. Without categories, the keywords sit on the bar. On phones the tabs and keywords each scroll sideways
- Under the panel, the active filters are now one line: the post count and "Show all posts". The panel shows each filter, so only `?announcements` still gets a chip
- `categoryLimit` now counts category tabs, the rest going under "More", and defaults to `5` (was `8`)
- The `category` label is no longer shown, and blog pages no longer carry `data-locale` or `data-label-category`

## [0.6.0] - 2026-10-21

### Changed

- Posts with newer / older links no longer also show VitePress's previous / next links, which follow the sidebar rather than the post dates. A post's own `prev` / `next` frontmatter still wins, and `postNav: false` brings VitePress's links back

## [0.5.0] - 2026-10-21

### Added

- `categoryLimit` (default `8`) and `tagLimit` (default `12`) on blog pages: a browse row shows its most used values, then "+N more", which opens the full list alphabetically. A row of more than 30 values gets a field to narrow it when open
- `tagMinCount` on blog pages: keywords used by fewer posts are left out of the browse panel, though they still show on cards
- `more`, `less`, `filter` and `noFilterMatches` labels

### Changed

- The browse panel is a flat toolbar between two rules instead of a card, so it no longer looks like a post. `--vp-blog-browse-bg` is now `transparent`
- On screens narrower than 640px, each browse row is one line that scrolls sideways, so the panel stays short however many values it has
- Categories and keywords in the browse panel are ranked by how many posts use them, not alphabetically
- Rows that can't narrow the posts are left out, such as a single category that every post is in. With only one year, the archive shows that year's months without a row of years
- The "Subscribe" link sits at the end of the browse panel's first row (its icon alone on narrow screens), and only has a line of its own on a blog page without a panel
- Category and keyword chips are at least 24px high, and 32px on touch screens

## [0.4.0] - 2026-10-20

### Added

- Filtering blog pages by category (`?category=`), year (`?year=2026`) and month (`?month=2026-10`), combined with each other, with `?tag=` and with `?announcements`
- A browse panel above a blog page's posts: rows of categories, keywords and years, each chip with its post count, and the months of the year in view. Chips combine with the filters in view, toggle off when active, and recount as filters change; chips that would show nothing are dimmed
- Active filters above the posts: the number of matching posts, a chip to remove each filter, and "Show all posts"
- A post's category above its title on cards and in its byline, linked to its blog filtered by it
- `blog-index` settings `categories`, `showCategory`, `categoryList`, `archive`, and `groupBy: month`; `::: blog-posts` settings `categories` and `showCategory`
- `browse`, `categories`, `archive`, `category`, `tag`, `postCount`, `postCountOne`, `noMatches` and `removeFilter` labels
- `readFilter` and the `BlogFilter` type from `@binarynoir/vitepress-blog/client`, and the `BlogGroupBy` type

### Changed

- `sticky` is renamed `pinned`, to match its Pinned badge, and `stickyLimit` is renamed `pinLimit`, in post frontmatter, `blog-index`, `::: blog-posts` and the plugin options
- The `sticky` label is now `pinned`, and the `vp-blog-sticky`, `vp-blog-card--sticky`, `vp-blog-badge--sticky` and `data-vp-blog-sticky` classes and attribute are now `pinned` ones
- The keyword list is now the keyword row of the browse panel: its `vp-blog-tags` classes are now `vp-blog-facet` classes
- The filter line above filtered posts is replaced by the active filters
- `BlogViewState` gives `category` and `date` alongside `tag`, `announcements`, `page` and `pageCount`
- `BlogIndexConfig` has `groupBy` (`'year'`, `'month'` or `''`) in place of `groupByYear`

### Deprecated

- `sticky` and `stickyLimit`: still read when `pinned` and `pinLimit` aren't set

### Removed

- The `tagged`, `noTagged` and `noAnnouncements` labels, replaced by the active filters' `postCount`, `postCountOne` and `noMatches`

## [0.3.0] - 2026-10-20

### Added

- Announcements: `announcement: true` (or the banner's text) on a post puts it in a one-line, full-width banner above the nav bar on every page. With several, the newest shows with a count badge that opens the blog page filtered to announcements. Visitors can dismiss it; a newer announcement brings it back
- `BlogAnnouncementBanner` component from `@binarynoir/vitepress-blog/client`, for the theme's `layout-top` slot
- `?announcements` filter on blog pages, and an Announcement badge on announced posts
- `announcement`, `announcements`, `noAnnouncements`, `announcementCount` and `dismiss` labels

### Changed

- `blogVitePlugin` has Vite bundle this package for the server-side build (`ssr.noExternal`), so the banner can render on the server

## [0.2.0] - 2026-10-20

### Added

- Times in `date` and `updated`: `2026-10-20 14:30`, `2026-10-20T14:30:00`, or either with an offset (`-04:00`, `Z`). A time shows only when one is given, and posts on the same day sort by it
- `timeZone` option: the IANA time zone that times without an offset are read in, and that dates and times are shown in. Default `UTC`
- `timeFormat` option, and `published` and `dateTime` labels
- The byline labels both dates: "Published … · Updated …"

### Changed

- `date` and `updated` must be written as `YYYY-MM-DD`, optionally with a time and offset. Other forms that JavaScript happened to parse, such as `October 20, 2026`, are no longer read
- Year headings use the year in the `timeZone`, so a post late on December 31 stays in its own year

## [0.1.1] - 2026-10-20

### Fixed

- `useBlog()` from `@binarynoir/vitepress-blog/client` no longer breaks a site's build: during the server-side build, Node loads VitePress's node entry, which has none of the client functions it imported by name. It now imports VitePress as a namespace and does nothing on the server

## [0.1.0] - 2026-10-20

### Added

- Posts from `blog` frontmatter: title, summary, date, updated date, image, authors, tags, category, scope, sticky and draft, with top-level fallbacks
- Blog pages from `blog-index` frontmatter: a main blog (`scope: site`) and folder-scoped section blogs, with `list`, `grid` and `compact` layouts, year grouping, tag and folder filters and a limit
- `imageFit` (`cover` or `contain`) and `imagePosition` for how a post's image sits in its card
- Sticky posts (`sticky: true`), pinned to the top of blog pages up to each page's `stickyLimit`
- Pagination (`pageSize`) and keyword filtering (`?tag=`) in the browser with `useBlog()` from `@binarynoir/vitepress-blog/client`, a keyword list on each blog page (`tagList`), and keyword links on cards and bylines
- `::: blog-posts` blocks for any page (the home page, a section's page): a blog's latest posts with their own `limit`, `stickyLimit`, `layout`, `showTags` and `tags`, and a link to the blog page
- A byline under each post's title and newer / older links within its blog
- An RSS 2.0 feed for every blog page, linked from the blog page and its posts, and served in `vitepress dev`, with a "Subscribe" RSS link on each blog page and `::: blog-posts` block (`rssLink`)
- Open Graph and Twitter card tags for posts, and summaries as page descriptions
- `withBlog` wrapper, and `blogMarkdown`, `blogVitePlugin`, `blogHead`, `blogPageData` and `writeBlogFeeds` for wiring by hand
