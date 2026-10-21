/**
 * Filtering and pagination for blog pages, in the browser. The build writes
 * every post into the page (see `renderPostList`); this hides the ones the
 * URL's `?category=`, `?tag=`, `?year=`, `?month=`, `?announcements` and
 * `?page=` leave out, keeps the browse panel's chips and counts in step with
 * them, and fills in the active filters and the page links. Without it, every
 * post simply shows.
 */

const ITEM = '[data-vp-blog-item]';
/** Links that filter the blog: the browse panel's chips, and the category and keyword links on cards. */
const FILTER_LINKS = '.vp-blog-facet a, .vp-blog-card__category a, .vp-blog-card__tags a';

interface BlogLabels {
  showAll: string;
  previous: string;
  next: string;
  pages: string;
  announcements: string;
  category: string;
  tag: string;
  postCount: string;
  postCountOne: string;
  noMatches: string;
  removeFilter: string;
}

function readLabels(blog: HTMLElement): BlogLabels {
  const { dataset } = blog;
  return {
    showAll: dataset.labelShowAll ?? 'Show all posts',
    previous: dataset.labelPrevious ?? 'Previous',
    next: dataset.labelNext ?? 'Next',
    pages: dataset.labelPages ?? 'Pages',
    announcements: dataset.labelAnnouncements ?? 'Announcements',
    category: dataset.labelCategory ?? 'Category',
    tag: dataset.labelTag ?? 'Keyword',
    postCount: dataset.labelPostCount ?? '{n} posts',
    postCountOne: dataset.labelPostCountOne ?? '{n} post',
    noMatches: dataset.labelNoMatches ?? 'No posts match these filters.',
    removeFilter: dataset.labelRemoveFilter ?? 'Remove filter: {filter}',
  };
}

/**
 * What the URL filters by. Every filter must match. The category and keyword
 * are lowercased; `date` is `''`, a year (`2026`) or a month (`2026-10`).
 */
export interface BlogFilter {
  category: string;
  tag: string;
  date: string;
  /** Whether only announcements show (`?announcements`). */
  announcements: boolean;
}

type Facet = 'category' | 'tag' | 'date';

/** Reads the filter from `?category=`, `?tag=`, `?year=` and `?month=`. A month names its year too, so it wins over `?year=`. */
export function readFilter(url: URL): BlogFilter {
  const text = (name: string) => (url.searchParams.get(name) ?? '').trim().toLowerCase();
  const month = text('month');
  const year = text('year');
  return {
    category: text('category'),
    tag: text('tag'),
    date: /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ? month : /^\d{4}$/.test(year) ? year : '',
    announcements: url.searchParams.has('announcements'),
  };
}

/** The element a marker stands for: a card is its own marker; a compact list item holds one. */
function itemElement(marker: Element): HTMLElement {
  return (marker.tagName === 'ARTICLE' ? marker : (marker.closest('li') ?? marker)) as HTMLElement;
}

function matches(marker: Element, filter: BlogFilter): boolean {
  const { category, tag, date, announcements } = filter;
  return (
    (!tag || (marker.getAttribute('data-tags') ?? '').split('|').includes(tag)) &&
    (!category || marker.getAttribute('data-category') === category) &&
    // `2026` matches every month of 2026; `2026-10` only October.
    (!date || (marker.getAttribute('data-month') ?? '').startsWith(date)) &&
    (!announcements || marker.hasAttribute('data-announcement'))
  );
}

/** `url` with the filter and `page` set (or removed when empty or page 1), as a path the router can follow. */
function toHref(url: URL, filter: BlogFilter, page = 1): string {
  const next = new URL(url.href);
  next.hash = '';
  const set = (name: string, value: string) =>
    value ? next.searchParams.set(name, value) : next.searchParams.delete(name);
  set('category', filter.category);
  set('tag', filter.tag);
  set('year', filter.date.length === 4 ? filter.date : '');
  set('month', filter.date.length === 7 ? filter.date : '');
  if (filter.announcements) next.searchParams.set('announcements', '');
  else next.searchParams.delete('announcements');
  set('page', page > 1 ? String(page) : '');
  // A bare `?announcements`, not `?announcements=`.
  return next.pathname + next.search.replace(/([?&]announcements)=(?=&|$)/, '$1');
}

/** The filter a link applies, as the build wrote it: `?category=x`, `?tag=x`, `?year=2026` or `?month=2026-10`. */
interface FilterLink {
  facet: Facet;
  value: string;
}

/**
 * The filter a link stands for. It is read from the link's URL the first time
 * and remembered, because the browse panel's links are then rewritten to
 * combine it with the other active filters.
 */
function readFilterLink(anchor: HTMLAnchorElement): FilterLink | null {
  if (!anchor.dataset.vpBlogFacet) {
    let params: URLSearchParams;
    try {
      params = new URL(anchor.href, location.href).searchParams;
    } catch {
      return null;
    }
    const param = (['category', 'tag', 'month', 'year'] as const).find((name) => params.has(name));
    if (!param) return null;
    anchor.dataset.vpBlogFacet = param === 'year' || param === 'month' ? 'date' : param;
    anchor.dataset.vpBlogValue = (params.get(param) ?? '').trim().toLowerCase();
  }
  return { facet: anchor.dataset.vpBlogFacet as Facet, value: anchor.dataset.vpBlogValue ?? '' };
}

function withValue(filter: BlogFilter, { facet, value }: FilterLink): BlogFilter {
  return { ...filter, [facet]: value };
}

/** Whether the link's filter is applied. A year is also active while one of its months is. */
function isActive({ facet, value }: FilterLink, filter: BlogFilter): boolean {
  if (facet !== 'date') return filter[facet] === value;
  return value.length === 4 ? filter.date.startsWith(value) : filter.date === value;
}

/**
 * Where a browse chip leads: its filter added to the active ones (replacing
 * any other value of the same kind), or, when it is the active one, taken off
 * again. An active month steps back out to its year.
 */
function toggle(filter: BlogFilter, link: FilterLink): BlogFilter {
  if (link.facet !== 'date')
    return withValue(filter, { ...link, value: filter[link.facet] === link.value ? '' : link.value });
  if (filter.date !== link.value) return withValue(filter, link);
  return { ...filter, date: link.value.length === 7 ? link.value.slice(0, 4) : '' };
}

function markActive(anchor: HTMLAnchorElement, active: boolean): void {
  anchor.classList.toggle('is-active', active);
  if (active) anchor.setAttribute('aria-current', 'true');
  else anchor.removeAttribute('aria-current');
}

/**
 * Brings the browse panel in step with the filter. Each chip links to the
 * view with it toggled, and counts the posts it would show with the other
 * filters kept, so a reader can see where every next step leads; chips that
 * would show nothing are dimmed. The months of the year in view show below
 * the years.
 */
function syncBrowse(blog: HTMLElement, url: URL, filter: BlogFilter, markers: Element[]): void {
  const browse = blog.querySelector<HTMLElement>('.vp-blog-browse');
  if (!browse) return;
  for (const anchor of browse.querySelectorAll<HTMLAnchorElement>('.vp-blog-facet a')) {
    const link = readFilterLink(anchor);
    if (!link) continue;
    const active = isActive(link, filter);
    const count = markers.filter((marker) => matches(marker, withValue(filter, link))).length;
    anchor.href = toHref(url, toggle(filter, link));
    markActive(anchor, active);
    anchor.classList.toggle('is-empty', count === 0 && !active);
    const counter = anchor.querySelector('.vp-blog-facet__count');
    if (counter) counter.textContent = String(count);
  }
  // With only one year, its months always show.
  const months = [...browse.querySelectorAll<HTMLElement>('[data-vp-blog-facet="month"]')];
  for (const row of months) row.hidden = months.length > 1 && row.dataset.year !== filter.date.slice(0, 4);
}

/** The name a filter value is shown with: as a chip or card link spells it, else as the URL gave it. */
function findName(blog: HTMLElement, facet: 'category' | 'tag', value: string): string {
  for (const anchor of blog.querySelectorAll<HTMLAnchorElement>(FILTER_LINKS)) {
    const link = readFilterLink(anchor);
    if (link?.facet === facet && link.value === value) {
      const name = (anchor.querySelector('.vp-blog-facet__name') ?? anchor).textContent?.trim();
      if (name) return name;
    }
  }
  return value;
}

/** A year as written, or a month as "October 2026" in the blog's locale. */
function formatDate(date: string, locale: string): string {
  if (date.length === 4) return date;
  const [year, month] = date.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
      Date.UTC(year, month - 1, 1, 12),
    );
  } catch {
    return date;
  }
}

function element(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function link(text: string, href: string, className: string): HTMLAnchorElement {
  const anchor = element('a', className, text) as HTMLAnchorElement;
  anchor.href = href;
  return anchor;
}

/** One active filter: what kind it is (`''` for a date or announcements), its name, and the view without it. */
interface ActiveFilter {
  kind: string;
  name: string;
  without: BlogFilter;
}

function listActiveFilters(blog: HTMLElement, filter: BlogFilter, labels: BlogLabels): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (filter.announcements) {
    active.push({ kind: '', name: labels.announcements, without: { ...filter, announcements: false } });
  }
  if (filter.category) {
    const name = findName(blog, 'category', filter.category);
    active.push({ kind: labels.category, name, without: { ...filter, category: '' } });
  }
  if (filter.tag) {
    active.push({ kind: labels.tag, name: findName(blog, 'tag', filter.tag), without: { ...filter, tag: '' } });
  }
  if (filter.date) {
    const name = formatDate(filter.date, blog.dataset.locale || document.documentElement.lang || 'en-US');
    active.push({ kind: '', name, without: { ...filter, date: '' } });
  }
  return active;
}

/**
 * The active filters, above the posts: how many posts match, a chip for each
 * filter that removes just that one, and a link that clears them all. All of
 * it is written as text: the values come from the URL.
 */
function renderFilter(
  slot: HTMLElement,
  blog: HTMLElement,
  url: URL,
  filter: BlogFilter,
  count: number,
  labels: BlogLabels,
): void {
  const active = listActiveFilters(blog, filter, labels);
  slot.hidden = active.length === 0;
  if (slot.hidden) return slot.replaceChildren();

  const summary = count === 0 ? labels.noMatches : count === 1 ? labels.postCountOne : labels.postCount;
  const parts: Node[] = [element('span', 'vp-blog-filter__count', summary.replace('{n}', String(count)))];
  for (const { kind, name, without } of active) {
    const chip = link('', toHref(url, without), 'vp-blog-filter__chip');
    chip.setAttribute('aria-label', labels.removeFilter.replace('{filter}', kind ? `${kind} ${name}` : name));
    if (kind) chip.append(element('span', 'vp-blog-filter__kind', kind), ' ');
    const remove = element('span', 'vp-blog-filter__remove', '×');
    remove.setAttribute('aria-hidden', 'true');
    chip.append(name, remove);
    parts.push(chip);
  }
  const clear = { category: '', tag: '', date: '', announcements: false };
  parts.push(link(labels.showAll, toHref(url, clear), 'vp-blog-filter__clear'));
  slot.replaceChildren(...parts);
}

function renderPagination(
  slot: HTMLElement,
  url: URL,
  filter: BlogFilter,
  page: number,
  pageCount: number,
  labels: BlogLabels,
): void {
  slot.hidden = pageCount < 2;
  slot.setAttribute('aria-label', labels.pages);
  if (pageCount < 2) return slot.replaceChildren();

  const parts: Node[] = [];
  if (page > 1) parts.push(link(labels.previous, toHref(url, filter, page - 1), 'vp-blog-pagination__previous'));
  for (let number = 1; number <= pageCount; number++) {
    if (number === page) {
      const current = element('span', 'vp-blog-pagination__page is-current', String(number));
      current.setAttribute('aria-current', 'page');
      parts.push(current);
    } else {
      parts.push(link(String(number), toHref(url, filter, number), 'vp-blog-pagination__page'));
    }
  }
  if (page < pageCount) parts.push(link(labels.next, toHref(url, filter, page + 1), 'vp-blog-pagination__next'));
  slot.replaceChildren(...parts);
}

/** Marks the category and keyword links on cards that match the active filter. */
function markCardLinks(blog: HTMLElement, filter: BlogFilter): void {
  for (const anchor of blog.querySelectorAll<HTMLAnchorElement>('.vp-blog-card__category a, .vp-blog-card__tags a')) {
    const link = readFilterLink(anchor);
    markActive(anchor, !!link && isActive(link, filter));
  }
}

export interface BlogViewState extends BlogFilter {
  page: number;
  pageCount: number;
}

/**
 * Shows the posts of one blog page that `url` asks for: those matching every
 * filter it gives (category and keyword in any case, a year or a month, only
 * announcements), and of those, the ones on its `?page=`. Pinned posts
 * only show on the first page and aren't counted in the page size. Returns
 * what is showing.
 */
export function applyBlogView(blog: HTMLElement, url: URL): BlogViewState {
  const labels = readLabels(blog);
  const filter = readFilter(url);
  const pageSize = Math.max(0, Number(blog.dataset.pageSize) || 0);

  const markers = [...blog.querySelectorAll(ITEM)];
  const isPinned = (marker: Element) => !!marker.closest('[data-vp-blog-pinned]');
  const pinned = markers.filter((marker) => isPinned(marker) && matches(marker, filter));
  const rest = markers.filter((marker) => !isPinned(marker) && matches(marker, filter));

  const pageCount = pageSize ? Math.max(1, Math.ceil(rest.length / pageSize)) : 1;
  const requested = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requested) ? requested : 1));

  const shown = new Set<Element>([
    ...(page === 1 ? pinned : []),
    ...(pageSize ? rest.slice((page - 1) * pageSize, page * pageSize) : rest),
  ]);
  for (const marker of markers) itemElement(marker).hidden = !shown.has(marker);

  // A pinned section, year or month with nothing showing is hidden, heading and all.
  for (const group of blog.querySelectorAll<HTMLElement>('[data-vp-blog-pinned], .vp-blog-group')) {
    group.hidden = ![...group.querySelectorAll(ITEM)].some((marker) => shown.has(marker));
  }

  const banner = blog.querySelector<HTMLElement>('[data-vp-blog-filter]');
  if (banner) renderFilter(banner, blog, url, filter, pinned.length + rest.length, labels);
  const pagination = blog.querySelector<HTMLElement>('[data-vp-blog-pagination]');
  if (pagination) renderPagination(pagination, url, filter, page, pageCount, labels);
  syncBrowse(blog, url, filter, markers);
  markCardLinks(blog, filter);

  return { ...filter, page, pageCount };
}

const lastViews = new WeakMap<HTMLElement, BlogViewState>();

function viewChanged(previous: BlogViewState, view: BlogViewState): boolean {
  return (['category', 'tag', 'date', 'announcements', 'page'] as const).some((key) => previous[key] !== view[key]);
}

/**
 * Applies `url` to every blog page in `root`. When the page or a filter of a
 * blog already on screen changes, it is scrolled back to its top.
 */
export function applyBlogViews(root: ParentNode = document, url: URL = new URL(location.href)): void {
  for (const blog of root.querySelectorAll<HTMLElement>('[data-vp-blog]')) {
    const previous = lastViews.get(blog);
    const view = applyBlogView(blog, url);
    lastViews.set(blog, view);
    if (previous && viewChanged(previous, view) && blog.getBoundingClientRect().top < 0) {
      blog.scrollIntoView({ block: 'start' });
    }
  }
}
