/**
 * The subscribe dialog, in the browser. Static hosts such as GitHub Pages
 * serve a feed as `application/xml`, so a browser shows a link to it as raw
 * XML rather than offering a feed reader. Instead, a plain click on a link to
 * one of the site's feeds opens a dialog with the feed's address to copy, a
 * `feed:` link that hands it to the visitor's feed reader app, and the feed
 * itself. Without JavaScript, or with a modifier key, the link opens the feed
 * as before.
 */
import type { BlogFeedData, BlogFeedItem } from './types.js';

/** Explains feeds to visitors new to them. */
const ABOUT_FEEDS_URL = 'https://aboutfeeds.com/';
const COPIED_FOR_MS = 2000;

const RSS_ICON =
  '<svg class="vp-blog-subscribe__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
  '<circle cx="6" cy="18" r="2.5" fill="currentColor"></circle>' +
  '<path fill="currentColor" d="M3.5 10.5v3a7 7 0 0 1 7 7h3a10 10 0 0 0-10-10z"></path>' +
  '<path fill="currentColor" d="M3.5 3.5v3a14 14 0 0 1 14 14h3a17 17 0 0 0-17-17z"></path>' +
  '</svg>';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" ' +
  'd="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"></path></svg>';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function link(text: string, href: string, className: string): HTMLAnchorElement {
  const anchor = element('a', className, text);
  anchor.href = href;
  return anchor;
}

/** The feed a link points at, or `null`: same origin, same path, any query or hash. */
export function findFeed(anchor: HTMLAnchorElement, feeds: BlogFeedItem[]): BlogFeedItem | null {
  let url: URL;
  try {
    url = new URL(anchor.href, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  return feeds.find((feed) => feed.path === url.pathname) ?? null;
}

/** The dialog for one feed, built fresh each time it opens. */
export function renderSubscribeDialog(feed: BlogFeedItem, labels: BlogFeedData['labels']): HTMLDialogElement {
  const dialog = element('dialog', 'vp-blog-subscribe');
  dialog.setAttribute('aria-labelledby', 'vp-blog-subscribe-title');

  const close = element('button', 'vp-blog-subscribe__close');
  close.type = 'button';
  close.setAttribute('aria-label', labels.close);
  close.innerHTML = CLOSE_ICON;
  close.addEventListener('click', () => dialog.close());

  const title = element('h2', 'vp-blog-subscribe__title');
  title.id = 'vp-blog-subscribe-title';
  title.innerHTML = RSS_ICON;
  title.append(labels.subscribeTo.replace('{blog}', feed.title));

  const field = element('div', 'vp-blog-subscribe__field');
  const address = element('input', 'vp-blog-subscribe__address');
  address.type = 'text';
  address.readOnly = true;
  address.value = feed.url;
  address.setAttribute('aria-label', labels.feedAddress);
  address.addEventListener('focus', () => address.select());
  field.append(address);
  // The clipboard needs a secure context; without it, the address can still be selected and copied by hand.
  if (navigator.clipboard) {
    const copy = element('button', 'vp-blog-subscribe__copy', labels.copy);
    copy.type = 'button';
    let reset: ReturnType<typeof setTimeout> | undefined;
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(feed.url).then(
        () => {
          copy.textContent = labels.copied;
          clearTimeout(reset);
          reset = setTimeout(() => (copy.textContent = labels.copy), COPIED_FOR_MS);
        },
        () => address.select(),
      );
    });
    field.append(copy);
  }

  const links = element('p', 'vp-blog-subscribe__links');
  const viewFeed = link(labels.viewFeed, feed.path, 'vp-blog-subscribe__link');
  // `target` keeps VitePress's router off it.
  viewFeed.target = '_self';
  const about = link(labels.aboutFeeds, ABOUT_FEEDS_URL, 'vp-blog-subscribe__link');
  about.target = '_blank';
  about.rel = 'noopener';
  links.append(link(labels.openInReader, `feed:${feed.url}`, 'vp-blog-subscribe__reader'), viewFeed, about);

  dialog.append(close, title, element('p', 'vp-blog-subscribe__hint', labels.subscribeHint), field, links);
  // A click on the backdrop lands on the dialog itself: it closes, as a click outside a menu would.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  return dialog;
}

/** Opens the dialog for `feed`, replacing one already open. */
export function openSubscribeDialog(feed: BlogFeedItem, labels: BlogFeedData['labels']): HTMLDialogElement {
  document.querySelector<HTMLDialogElement>('dialog.vp-blog-subscribe')?.close();
  const dialog = renderSubscribeDialog(feed, labels);
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/**
 * Opens the dialog for a plain click on a link to one of the feeds. A click
 * with a modifier key or another button, or on a link in the dialog, is left
 * to the browser.
 */
export function handleFeedClick(event: MouseEvent, data: BlogFeedData | null | undefined): void {
  if (!data || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return;
  if (anchor.closest('.vp-blog-subscribe')) return;
  const feed = findFeed(anchor, data.feeds);
  if (!feed) return;
  event.preventDefault();
  openSubscribeDialog(feed, data.labels);
}
