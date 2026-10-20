# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
