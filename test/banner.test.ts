// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import type { BlogAnnouncementData } from '../src/types.js';

const siteData = ref<Record<string, unknown>>({});

vi.mock('vitepress', () => ({
  useData: () => ({ site: siteData }),
  withBase: (path: string) => `/base${path}`,
}));

const { BlogAnnouncementBanner } = await import('../src/banner.js');

function data(count: number): BlogAnnouncementData {
  return {
    items: Array.from({ length: count }, (_, index) => ({
      id: `post-${count - index}`,
      text: `Announcement ${count - index}`,
      link: `/blog/post-${count - index}`,
    })),
    listLink: '/blog/?announcements',
    labels: { announcement: 'Announcement', announcementCount: '{n} announcements', dismiss: 'Dismiss' },
  };
}

let root: HTMLElement;
let unmount: () => void;

async function mount(announcements: BlogAnnouncementData | undefined): Promise<void> {
  siteData.value = announcements ? { blogAnnouncements: announcements } : {};
  root = document.createElement('div');
  document.body.append(root);
  const app = createApp(BlogAnnouncementBanner);
  app.mount(root);
  unmount = () => app.unmount();
  await nextTick();
}

const banner = () => root.querySelector<HTMLElement>('.vp-blog-announcement');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  unmount();
  root.remove();
});

describe('BlogAnnouncementBanner', () => {
  it('links one announcement to its post, with no count', async () => {
    await mount(data(1));
    const link = banner()!.querySelector('a.vp-blog-announcement__text')!;
    expect(link.textContent).toBe('Announcement 1');
    expect(link.getAttribute('href')).toBe('/base/blog/post-1');
    expect(banner()!.querySelector('.vp-blog-announcement__count')).toBeNull();
    expect(banner()!.getAttribute('aria-label')).toBe('Announcement');
  });

  it('shows the newest of several, with a count linking to the filtered blog', async () => {
    await mount(data(3));
    expect(banner()!.querySelector('.vp-blog-announcement__text')!.textContent).toBe('Announcement 3');
    const count = banner()!.querySelector('a.vp-blog-announcement__count')!;
    expect(count.textContent).toBe('3');
    expect(count.getAttribute('href')).toBe('/base/blog/?announcements');
    expect(count.getAttribute('aria-label')).toBe('3 announcements');
  });

  it('dismisses every current announcement, and remembers it', async () => {
    await mount(data(2));
    banner()!.querySelector('button')!.click();
    await nextTick();
    expect(banner()).toBeNull();
    expect(JSON.parse(localStorage.getItem('vp-blog-announcements-dismissed')!)).toEqual(['post-2', 'post-1']);
    expect(document.documentElement.classList.contains('vp-blog-announcement-dismissed')).toBe(true);

    unmount();
    await mount(data(2));
    expect(banner()).toBeNull();
  });

  it('comes back for a newer announcement, counting only the ones not dismissed', async () => {
    localStorage.setItem('vp-blog-announcements-dismissed', JSON.stringify(['post-2', 'post-1']));
    await mount(data(4));
    expect(banner()!.querySelector('.vp-blog-announcement__text')!.textContent).toBe('Announcement 4');
    expect(banner()!.querySelector('.vp-blog-announcement__count')!.textContent).toBe('2');
  });

  it('renders nothing without announcements, or with unreadable storage', async () => {
    await mount(undefined);
    expect(root.innerHTML).toBe('<!---->');
    unmount();
    localStorage.setItem('vp-blog-announcements-dismissed', '{not json');
    await mount(data(1));
    expect(banner()).not.toBeNull();
  });
});
