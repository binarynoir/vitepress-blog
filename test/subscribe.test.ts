// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleFeedClick, openSubscribeDialog } from '../src/subscribe.js';
import { DEFAULT_LABELS, type BlogFeedData } from '../src/types.js';

const data: BlogFeedData = {
  feeds: [
    { path: '/blog/feed.xml', url: 'https://example.com/blog/feed.xml', title: 'Blog' },
    { path: '/team/feed.xml', url: 'https://example.com/team/feed.xml', title: 'Team' },
  ],
  labels: {
    subscribeTo: DEFAULT_LABELS.subscribeTo,
    subscribeHint: DEFAULT_LABELS.subscribeHint,
    feedAddress: DEFAULT_LABELS.feedAddress,
    copy: DEFAULT_LABELS.copy,
    copied: DEFAULT_LABELS.copied,
    openInReader: DEFAULT_LABELS.openInReader,
    viewFeed: DEFAULT_LABELS.viewFeed,
    aboutFeeds: DEFAULT_LABELS.aboutFeeds,
    close: DEFAULT_LABELS.close,
  },
};

/** Clicks a link to `href` the way a visitor would, and returns the event. */
function click(href: string, init: MouseEventInit = {}): MouseEvent {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.innerHTML = '<span>Subscribe</span>';
  document.body.append(anchor);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(event, 'target', { value: anchor.firstElementChild });
  handleFeedClick(event, data);
  return event;
}

const dialog = () => document.querySelector<HTMLDialogElement>('dialog.vp-blog-subscribe');

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('handleFeedClick', () => {
  it('opens the dialog for a link to a feed', () => {
    const event = click('/team/feed.xml');
    expect(event.defaultPrevented).toBe(true);
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Subscribe to Team');
    expect(dialog()?.querySelector('input')?.value).toBe('https://example.com/team/feed.xml');
    const links = [...dialog()!.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'));
    expect(links).toEqual(['feed:https://example.com/team/feed.xml', '/team/feed.xml', 'https://aboutfeeds.com/']);
  });

  it('matches the feed with a query or hash on the link', () => {
    click('/blog/feed.xml?x=1#top');
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Subscribe to Blog');
  });

  it('leaves other links, other sites and modified clicks to the browser', () => {
    for (const event of [
      click('/blog/'),
      click('https://elsewhere.example/blog/feed.xml'),
      click('/blog/feed.xml', { metaKey: true }),
      click('/blog/feed.xml', { button: 1 }),
    ]) {
      expect(event.defaultPrevented).toBe(false);
    }
    expect(dialog()).toBeNull();
  });

  it('leaves the links inside the dialog alone', () => {
    openSubscribeDialog(data.feeds[0], data.labels);
    const viewFeed = dialog()!.querySelector<HTMLAnchorElement>('a[href="/blog/feed.xml"]')!;
    expect(viewFeed.target).toBe('_self');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, 'target', { value: viewFeed });
    handleFeedClick(event, data);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing without feed data', () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    handleFeedClick(event, undefined);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('openSubscribeDialog', () => {
  it('keeps one dialog open at a time, and removes it once closed', () => {
    openSubscribeDialog(data.feeds[0], data.labels);
    openSubscribeDialog(data.feeds[1], data.labels);
    expect(document.querySelectorAll('dialog.vp-blog-subscribe')).toHaveLength(1);
    dialog()!.querySelector<HTMLButtonElement>('.vp-blog-subscribe__close')!.click();
    expect(dialog()).toBeNull();
  });

  it('copies the address, and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    openSubscribeDialog(data.feeds[0], data.labels);
    const copy = dialog()!.querySelector<HTMLButtonElement>('.vp-blog-subscribe__copy')!;
    copy.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('https://example.com/blog/feed.xml');
    expect(copy.textContent).toBe('Copied');
  });

  it('leaves out the copy button without the clipboard', () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    openSubscribeDialog(data.feeds[0], data.labels);
    expect(dialog()!.querySelector('.vp-blog-subscribe__copy')).toBeNull();
  });
});
