/**
 * Keyword filtering and pagination for blog pages, in the browser. The build
 * writes every post into the page (see `renderPostList`); this hides the ones
 * the URL's `?tag=` and `?page=` leave out, and fills in the filter banner and
 * the page links. Without it, every post simply shows.
 */

const ITEM = '[data-vp-blog-item]';

interface BlogLabels {
  tagged: string;
  showAll: string;
  noTagged: string;
  previous: string;
  next: string;
  pages: string;
}

function readLabels(blog: HTMLElement): BlogLabels {
  const { dataset } = blog;
  return {
    tagged: dataset.labelTagged ?? 'Posts tagged {tag}',
    showAll: dataset.labelShowAll ?? 'Show all posts',
    noTagged: dataset.labelNoTagged ?? 'No posts tagged {tag}.',
    previous: dataset.labelPrevious ?? 'Previous',
    next: dataset.labelNext ?? 'Next',
    pages: dataset.labelPages ?? 'Pages',
  };
}

/** The element a marker stands for: a card is its own marker; a compact list item holds one. */
function itemElement(marker: Element): HTMLElement {
  return (marker.tagName === 'ARTICLE' ? marker : (marker.closest('li') ?? marker)) as HTMLElement;
}

function hasTag(marker: Element, tag: string): boolean {
  return !tag || (marker.getAttribute('data-tags') ?? '').split('|').includes(tag);
}

/** `url` with `tag` and `page` set (or removed when empty or page 1), as a path the router can follow. */
function toHref(url: URL, tag: string, page: number): string {
  const next = new URL(url.href);
  next.hash = '';
  if (tag) next.searchParams.set('tag', tag);
  else next.searchParams.delete('tag');
  if (page > 1) next.searchParams.set('page', String(page));
  else next.searchParams.delete('page');
  return next.pathname + next.search;
}

/** `template` with `{tag}` replaced by a `<strong>` holding the tag, as text: the tag comes from the URL. */
function fillWithTag(element: HTMLElement, template: string, tag: string): void {
  const [before, after = ''] = template.split('{tag}');
  const strong = document.createElement('strong');
  strong.textContent = tag;
  element.replaceChildren(document.createTextNode(before), ...(template.includes('{tag}') ? [strong] : []), after);
}

function link(text: string, href: string, className: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.className = className;
  anchor.href = href;
  anchor.textContent = text;
  return anchor;
}

function renderFilter(slot: HTMLElement, url: URL, tag: string, matches: number, labels: BlogLabels): void {
  slot.hidden = !tag;
  if (!tag) return slot.replaceChildren();
  const message = document.createElement('span');
  fillWithTag(message, matches ? labels.tagged : labels.noTagged, tag);
  slot.replaceChildren(message, ' ', link(labels.showAll, toHref(url, '', 1), 'vp-blog-filter__clear'));
}

function renderPagination(
  slot: HTMLElement,
  url: URL,
  tag: string,
  page: number,
  pageCount: number,
  labels: BlogLabels,
): void {
  slot.hidden = pageCount < 2;
  slot.setAttribute('aria-label', labels.pages);
  if (pageCount < 2) return slot.replaceChildren();

  const parts: Node[] = [];
  if (page > 1) parts.push(link(labels.previous, toHref(url, tag, page - 1), 'vp-blog-pagination__previous'));
  for (let number = 1; number <= pageCount; number++) {
    if (number === page) {
      const current = document.createElement('span');
      current.className = 'vp-blog-pagination__page is-current';
      current.setAttribute('aria-current', 'page');
      current.textContent = String(number);
      parts.push(current);
    } else {
      parts.push(link(String(number), toHref(url, tag, number), 'vp-blog-pagination__page'));
    }
  }
  if (page < pageCount) parts.push(link(labels.next, toHref(url, tag, page + 1), 'vp-blog-pagination__next'));
  slot.replaceChildren(...parts);
}

/** Marks the keyword links (in the keyword list and on cards) that match the active keyword. */
function markActiveTags(blog: HTMLElement, tag: string): void {
  for (const anchor of blog.querySelectorAll<HTMLAnchorElement>('.vp-blog-tags a, .vp-blog-card__tags a')) {
    let linkTag = '';
    try {
      linkTag = new URL(anchor.href, location.href).searchParams.get('tag') ?? '';
    } catch {
      // Leave a link that isn't a URL unmarked.
    }
    const active = !!tag && linkTag.toLowerCase() === tag;
    anchor.classList.toggle('is-active', active);
    if (active) anchor.setAttribute('aria-current', 'true');
    else anchor.removeAttribute('aria-current');
  }
}

export interface BlogViewState {
  tag: string;
  page: number;
  pageCount: number;
}

/**
 * Shows the posts of one blog page that `url` asks for: those with its
 * `?tag=` keyword (any case), and of those, the ones on its `?page=`. Pinned
 * sticky posts only show on the first page and aren't counted in the page
 * size. Returns what is showing.
 */
export function applyBlogView(blog: HTMLElement, url: URL): BlogViewState {
  const labels = readLabels(blog);
  const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase();
  const pageSize = Math.max(0, Number(blog.dataset.pageSize) || 0);

  const markers = [...blog.querySelectorAll(ITEM)];
  const isSticky = (marker: Element) => !!marker.closest('[data-vp-blog-sticky]');
  const sticky = markers.filter((marker) => isSticky(marker) && hasTag(marker, tag));
  const rest = markers.filter((marker) => !isSticky(marker) && hasTag(marker, tag));

  const pageCount = pageSize ? Math.max(1, Math.ceil(rest.length / pageSize)) : 1;
  const requested = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requested) ? requested : 1));

  const shown = new Set<Element>([
    ...(page === 1 ? sticky : []),
    ...(pageSize ? rest.slice((page - 1) * pageSize, page * pageSize) : rest),
  ]);
  for (const marker of markers) itemElement(marker).hidden = !shown.has(marker);

  // A sticky section or year with nothing showing is hidden, heading and all.
  for (const group of blog.querySelectorAll<HTMLElement>('[data-vp-blog-sticky], .vp-blog-year')) {
    group.hidden = ![...group.querySelectorAll(ITEM)].some((marker) => shown.has(marker));
  }

  const filter = blog.querySelector<HTMLElement>('[data-vp-blog-filter]');
  if (filter) renderFilter(filter, url, tag, sticky.length + rest.length, labels);
  const pagination = blog.querySelector<HTMLElement>('[data-vp-blog-pagination]');
  if (pagination) renderPagination(pagination, url, tag, page, pageCount, labels);
  markActiveTags(blog, tag);

  return { tag, page, pageCount };
}

const lastViews = new WeakMap<HTMLElement, BlogViewState>();

/**
 * Applies `url` to every blog page in `root`. When the page or keyword of a
 * blog already on screen changes, it is scrolled back to its top.
 */
export function applyBlogViews(root: ParentNode = document, url: URL = new URL(location.href)): void {
  for (const blog of root.querySelectorAll<HTMLElement>('[data-vp-blog]')) {
    const previous = lastViews.get(blog);
    const view = applyBlogView(blog, url);
    lastViews.set(blog, view);
    if (
      previous &&
      (previous.page !== view.page || previous.tag !== view.tag) &&
      blog.getBoundingClientRect().top < 0
    ) {
      blog.scrollIntoView({ block: 'start' });
    }
  }
}
