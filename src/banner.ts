// A namespace import, as in `client.ts`: loaded by Node without the Vite
// plugin, VitePress's node entry has no `useData` or `withBase`.
import * as vitepress from 'vitepress';
import { computed, defineComponent, h, onMounted, ref } from 'vue';
import type { BlogAnnouncementData } from './types.js';
import { ANNOUNCEMENTS_KEY, DISMISSED_CLASS, DISMISSED_STORAGE_KEY } from './util.js';

const closeIcon = () =>
  h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' }, [
    h('path', {
      fill: 'currentColor',
      d: 'M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z',
    }),
  ]);

function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DISMISSED_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked (a private window, say): dismissed until the next page load.
  }
}

/**
 * The announcement banner: one line across the top of the page, above the
 * nav bar, with the newest announcement linked to its post. With more than
 * one not yet dismissed, a badge counts them and links to the blog page
 * filtered to announcements. Its close button dismisses every current one;
 * a newer announcement brings it back. Put it in the theme's `layout-top` slot:
 *
 * ```ts
 * // .vitepress/theme/index.ts
 * import { h } from 'vue';
 * import DefaultTheme from 'vitepress/theme';
 * import { BlogAnnouncementBanner } from '@binarynoir/vitepress-blog/client';
 *
 * export default {
 *   extends: DefaultTheme,
 *   Layout: () => h(DefaultTheme.Layout, null, { 'layout-top': () => h(BlogAnnouncementBanner) }),
 * };
 * ```
 *
 * It reads what `blogVitePlugin` (or `withBlog`) puts on the site data, and
 * renders nothing without it.
 */
export const BlogAnnouncementBanner = defineComponent({
  name: 'BlogAnnouncementBanner',
  setup() {
    if (typeof vitepress.useData !== 'function') return () => null;
    const { site } = vitepress.useData();
    const data = computed(
      () => (site.value as unknown as Record<string, unknown>)[ANNOUNCEMENTS_KEY] as BlogAnnouncementData | undefined,
    );
    // Unknown until mounted: the server can't read storage, so the first render
    // matches its HTML, and the `<head>` script has already hidden it if dismissed.
    const dismissed = ref<string[] | null>(null);
    onMounted(() => {
      dismissed.value = readDismissed();
    });

    const latest = computed(() => data.value?.items[0]);
    const active = computed(() => (data.value?.items ?? []).filter((item) => !dismissed.value?.includes(item.id)));

    const dismiss = () => {
      const ids = (data.value?.items ?? []).map((item) => item.id);
      dismissed.value = ids;
      writeDismissed(ids);
      document.documentElement.classList.add(DISMISSED_CLASS);
    };

    return () => {
      const announcement = latest.value;
      if (!data.value || !announcement || dismissed.value?.includes(announcement.id)) return null;
      const { labels, listLink } = data.value;
      const count = active.value.length;
      const countLabel = labels.announcementCount.replace('{n}', String(count));
      const badge =
        count > 1
          ? listLink
            ? h(
                'a',
                {
                  class: 'vp-blog-announcement__count',
                  href: vitepress.withBase(listLink),
                  title: countLabel,
                  'aria-label': countLabel,
                },
                String(count),
              )
            : h(
                'span',
                { class: 'vp-blog-announcement__count', title: countLabel, 'aria-label': countLabel },
                String(count),
              )
          : null;
      return h('div', { class: 'vp-blog-announcement', role: 'region', 'aria-label': labels.announcement }, [
        h('div', { class: 'vp-blog-announcement__content' }, [
          h(
            'a',
            { class: 'vp-blog-announcement__text', href: vitepress.withBase(announcement.link) },
            announcement.text,
          ),
          badge,
        ]),
        h(
          'button',
          {
            class: 'vp-blog-announcement__dismiss',
            type: 'button',
            title: labels.dismiss,
            'aria-label': labels.dismiss,
            onClick: dismiss,
          },
          [closeIcon()],
        ),
      ]);
    };
  },
});
