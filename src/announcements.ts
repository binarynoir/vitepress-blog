import { findAnnouncementBlog, listAnnouncements } from './collect.js';
import type { BlogPage } from './scan.js';
import { DEFAULT_LABELS, type BlogAnnouncementData, type BlogOptions } from './types.js';
import { DISMISSED_CLASS, DISMISSED_STORAGE_KEY, toUrlPath } from './util.js';

/** The banner's data: every announcement, newest first, and where the list of them is. `null` with none. */
export function resolveAnnouncements(
  pages: BlogPage[],
  options: BlogOptions,
  cleanUrls: boolean,
): BlogAnnouncementData | null {
  const drafts = options.drafts ?? false;
  const announcements = listAnnouncements(pages, drafts);
  if (announcements.length === 0) return null;
  const blog = findAnnouncementBlog(pages, announcements, drafts);
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  return {
    items: announcements.map((post) => ({
      id: `${post.routePath}@${post.post.date?.toISOString() ?? ''}`,
      text: post.post.announcementText || post.post.title,
      link: toUrlPath(post.routePath, cleanUrls),
    })),
    listLink: blog ? `${toUrlPath(blog.routePath, cleanUrls)}?announcements` : '',
    labels: {
      announcement: labels.announcement,
      announcementCount: labels.announcementCount,
      dismiss: labels.dismiss,
    },
  };
}

/**
 * A `<head>` script that marks `<html>` with `DISMISSED_CLASS` when the visitor
 * dismissed the newest announcement, so the server-rendered banner never
 * flashes before the page hydrates.
 */
export function renderDismissedScript(data: BlogAnnouncementData): string {
  // `<` escaped so an id can't close the script element.
  const id = JSON.stringify(data.items[0].id).replace(/</g, '\\u003c');
  return (
    `try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(DISMISSED_STORAGE_KEY)})||'[]');` +
    `if(Array.isArray(d)&&d.indexOf(${id})>-1)document.documentElement.classList.add(${JSON.stringify(DISMISSED_CLASS)})}catch(e){}`
  );
}
