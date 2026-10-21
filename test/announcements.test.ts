import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SiteConfig } from 'vitepress';
import { renderDismissedScript, resolveAnnouncements } from '../src/announcements.js';
import { resolvePostData } from '../src/frontmatter.js';
import { indexBlogSource } from '../src/scan.js';
import { ANNOUNCEMENTS_KEY } from '../src/util.js';
import { attachAnnouncements } from '../src/vitepress.js';
import { frontmatter, Site } from './helpers.js';

const site = new Site();

beforeAll(() => {
  site
    .write('blog/index.md', frontmatter(['title: Blog', 'blog-index:', '  scope: site'], '# Blog\n'))
    .write('news/index.md', frontmatter(['title: News', 'blog-index: true'], '# News\n'))
    .write(
      'blog/maintenance.md',
      frontmatter(['blog:', '  date: 2026-10-01', '  announcement: Down for maintenance on Friday'], '# Maintenance\n'),
    )
    .write('blog/launch.md', frontmatter(['blog:', '  date: 2026-10-15', '  announcement: true'], '# We launched\n'))
    .write('blog/plain.md', frontmatter(['blog:', '  date: 2026-10-20'], '# Plain post\n'))
    .write(
      'blog/unfinished.md',
      frontmatter(['blog:', '  date: 2026-10-30', '  announcement: true', '  draft: true'], '# Unfinished\n'),
    );
});

afterAll(() => site.remove());

describe('announcement frontmatter', () => {
  it('reads true as an announcement with the title as its text', () => {
    const post = resolvePostData({ blog: { announcement: true } }, '# Title\n', 'fallback')!;
    expect([post.announcement, post.announcementText]).toEqual([true, '']);
  });

  it('reads a string as the banner text', () => {
    const post = resolvePostData({ blog: { announcement: '  New release  ' } }, '# Title\n', 'fallback')!;
    expect([post.announcement, post.announcementText]).toEqual([true, 'New release']);
  });

  it('is off by default and for an empty string', () => {
    expect(resolvePostData({ blog: true }, '', 'x')!.announcement).toBe(false);
    expect(resolvePostData({ blog: { announcement: ' ' } }, '', 'x')!.announcement).toBe(false);
  });
});

describe('resolveAnnouncements', () => {
  it('lists announcements newest first, without drafts, and links the blog that lists them', () => {
    const data = resolveAnnouncements(indexBlogSource(site.root), {}, true)!;
    expect(data.items).toEqual([
      { id: 'blog/launch.md@2026-10-15T00:00:00.000Z', text: 'We launched', link: '/blog/launch' },
      {
        id: 'blog/maintenance.md@2026-10-01T00:00:00.000Z',
        text: 'Down for maintenance on Friday',
        link: '/blog/maintenance',
      },
    ]);
    expect(data.listLink).toBe('/blog/?announcements');
    expect(data.labels).toEqual({
      announcement: 'Announcement',
      announcementCount: '{n} announcements',
      dismiss: 'Dismiss',
    });
  });

  it('includes drafts with the drafts option, and writes .html links without clean URLs', () => {
    const data = resolveAnnouncements(indexBlogSource(site.root), { drafts: true }, false)!;
    expect(data.items[0].link).toBe('/blog/unfinished.html');
    expect(data.items).toHaveLength(3);
  });

  it('uses translated labels', () => {
    const data = resolveAnnouncements(indexBlogSource(site.root), { labels: { dismiss: 'Schließen' } }, true)!;
    expect(data.labels.dismiss).toBe('Schließen');
  });

  it('is null without announcements', () => {
    expect(resolveAnnouncements([], {}, true)).toBeNull();
  });
});

describe('renderDismissedScript', () => {
  it('checks the newest id, escaped so it cannot close the script', () => {
    const script = renderDismissedScript({
      items: [{ id: 'a</script>.md@', text: '', link: '' }],
      listLink: '',
      labels: { announcement: '', announcementCount: '', dismiss: '' },
    });
    expect(script).not.toContain('</script>');
    expect(script).toContain('vp-blog-announcements-dismissed');
    expect(script).toContain('vp-blog-announcement-dismissed');
  });
});

describe('attachAnnouncements', () => {
  const config = () =>
    ({
      srcDir: site.root,
      cleanUrls: true,
      site: { base: '/', head: [['meta', { name: 'x' }]] },
      publicDir: path.join(site.root, 'public'),
    }) as unknown as SiteConfig;

  it('puts the data on the site data and adds the head script once', () => {
    const siteConfig = config();
    expect(attachAnnouncements(siteConfig)).toBe(true);
    expect(attachAnnouncements(siteConfig)).toBe(false);
    const data = (siteConfig.site as unknown as Record<string, { items: unknown[] }>)[ANNOUNCEMENTS_KEY];
    expect(data.items).toHaveLength(2);
    expect(siteConfig.site.head).toHaveLength(2);
    expect(siteConfig.site.head[1][0]).toBe('script');
  });

  it('removes both when there are no announcements', () => {
    const siteConfig = config();
    attachAnnouncements(siteConfig);
    siteConfig.srcDir = path.join(site.root, 'news');
    expect(attachAnnouncements(siteConfig)).toBe(true);
    expect(ANNOUNCEMENTS_KEY in siteConfig.site).toBe(false);
    expect(siteConfig.site.head).toEqual([['meta', { name: 'x' }]]);
  });
});

describe('blog pages', () => {
  it('badge announcements and mark them for the filter', () => {
    const html = site.render('blog/index.md');
    expect(html).toMatch(/<article class="vp-blog-card vp-blog-card--announcement"[^>]* data-announcement>/);
    expect(html).toContain('<span class="vp-blog-badge vp-blog-badge--announcement">Announcement</span>');
    expect(html).toContain('data-label-announcements="Announcements"');
    expect(html.match(/data-announcement[ >]/g)).toHaveLength(2);
  });
});
