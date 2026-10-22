/**
 * Filtering and pagination for blog pages, in the browser. The build writes
 * every post into the page (see `renderPostList`); this hides the ones the
 * URL's `?category=`, `?tag=`, `?year=`, `?month=`, `?announcements` and
 * `?page=` leave out, keeps the browse panel's chips and counts in step with
 * them, and fills in the active filters and the page links. Without it, every
 * post simply shows.
 */

const ITEM = '[data-vp-blog-item]';
const OPEN_MENUS = 'details.vp-blog-menu[open]';

interface BlogLabels {
  showAll: string;
  previous: string;
  next: string;
  pages: string;
  announcements: string;
  tag: string;
  postCount: string;
  postCountOne: string;
  noMatches: string;
  removeFilter: string;
  more: string;
  less: string;
  filter: string;
  noFilterMatches: string;
}

function readLabels(blog: HTMLElement): BlogLabels {
  const { dataset } = blog;
  return {
    showAll: dataset.labelShowAll ?? 'Show all posts',
    previous: dataset.labelPrevious ?? 'Previous',
    next: dataset.labelNext ?? 'Next',
    pages: dataset.labelPages ?? 'Pages',
    announcements: dataset.labelAnnouncements ?? 'Announcements',
    tag: dataset.labelTag ?? 'Keyword',
    postCount: dataset.labelPostCount ?? '{n} posts',
    postCountOne: dataset.labelPostCountOne ?? '{n} post',
    noMatches: dataset.labelNoMatches ?? 'No posts match these filters.',
    removeFilter: dataset.labelRemoveFilter ?? 'Remove filter: {filter}',
    more: dataset.labelMore ?? '+{n} more',
    less: dataset.labelLess ?? 'Show fewer',
    filter: dataset.labelFilter ?? 'Filter {row}',
    noFilterMatches: dataset.labelNoFilterMatches ?? 'Nothing matches.',
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

/** A line of chips with more than this gets a field to narrow them, once "+N more" opens it out. */
const FILTER_FIELD_MIN = 30;

function chipName(anchor: HTMLAnchorElement): string {
  return (anchor.querySelector('.vp-blog-facet__name') ?? anchor).textContent?.trim() ?? '';
}

function rowChips(row: HTMLElement): HTMLAnchorElement[] {
  return [...row.querySelectorAll<HTMLAnchorElement>('.vp-blog-facet__chips a')];
}

/**
 * Adds a long row's controls, once: a "+N more" button after its chips, in
 * view even while a narrow screen's row is scrolled, and for a very long row, a field that narrows them. Chips also
 * learn their place in alphabetical order, which an open row lists them in.
 */
function setUpRow(row: HTMLElement, labels: BlogLabels): void {
  if (row.querySelector('.vp-blog-facet__more')) return;
  const chips = row.querySelector<HTMLElement>('.vp-blog-facet__chips');
  if (!chips) return;
  const anchors = rowChips(row);
  [...anchors]
    .sort((a, b) => chipName(a).localeCompare(chipName(b), undefined, { sensitivity: 'base' }))
    .forEach((anchor, position) => (anchor.dataset.vpBlogAlphabetical = String(position)));

  const more = element('button', 'vp-blog-facet__more') as HTMLButtonElement;
  more.type = 'button';
  more.addEventListener('click', () => {
    row.classList.toggle('is-open');
    layoutRow(row, labels);
  });
  chips.after(more);

  if (anchors.length <= FILTER_FIELD_MIN) return;
  const field = document.createElement('input');
  field.type = 'search';
  field.className = 'vp-blog-facet__filter';
  field.placeholder = labels.filter.replace('{row}', row.getAttribute('aria-label') ?? '');
  field.setAttribute('aria-label', field.placeholder);
  field.addEventListener('input', () => layoutRow(row, labels));
  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !field.value) return;
    field.value = '';
    layoutRow(row, labels);
  });
  const empty = element('p', 'vp-blog-facet__empty', labels.noFilterMatches);
  chips.prepend(field);
  chips.append(empty);
}

/**
 * Shows as much of a row as it should. A row with a `data-limit` shows that
 * many chips, most used first, plus any active one, then "+N more". Open, it
 * lists every chip alphabetically, narrowed to those matching its filter
 * field. Rows without a limit show every chip.
 */
function layoutRow(row: HTMLElement, labels: BlogLabels): void {
  const limit = Number(row.dataset.limit) || 0;
  if (!limit) return;
  setUpRow(row, labels);
  const open = row.classList.contains('is-open');
  const field = row.querySelector<HTMLInputElement>('.vp-blog-facet__filter');
  const query = open && field ? field.value.trim().toLowerCase() : '';
  const anchors = rowChips(row);
  let shown = 0;
  anchors.forEach((anchor, rank) => {
    const visible = open
      ? !query || chipName(anchor).toLowerCase().includes(query)
      : rank < limit || anchor.classList.contains('is-active');
    anchor.hidden = !visible;
    anchor.style.order = open ? (anchor.dataset.vpBlogAlphabetical ?? '') : '';
    if (visible) shown++;
  });
  const more = row.querySelector<HTMLButtonElement>('.vp-blog-facet__more')!;
  more.hidden = !open && shown === anchors.length;
  more.textContent = open ? labels.less : labels.more.replace('{n}', String(anchors.length - shown));
  more.setAttribute('aria-expanded', String(open));
  if (field) field.hidden = !open;
  const empty = row.querySelector<HTMLElement>('.vp-blog-facet__empty');
  if (empty) empty.hidden = !(open && shown === 0);
}

/**
 * Brings the browse panel in step with the filter. Each tab and choice links
 * to the view with it toggled, and counts the posts it would show with the
 * other filters kept, so a reader can see where every next step leads;
 * choices that would show nothing are dimmed. A drop-down's button shows its
 * chosen value, with a link beside it that takes the filter off. Every
 * drop-down closes, since this runs once a choice has been followed.
 */
function syncBrowse(blog: HTMLElement, url: URL, filter: BlogFilter, markers: Element[], labels: BlogLabels): void {
  const browse = blog.querySelector<HTMLElement>('.vp-blog-browse');
  if (!browse) return;
  setUpMenus(browse);
  for (const anchor of browse.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (anchor.classList.contains('vp-blog-menu__clear')) continue;
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
  for (const row of browse.querySelectorAll<HTMLElement>('[data-limit]')) layoutRow(row, labels);
  for (const wrap of browse.querySelectorAll<HTMLElement>('[data-vp-blog-menu]')) syncMenu(wrap, url, filter, labels);
  for (const menu of browse.querySelectorAll<HTMLDetailsElement>(OPEN_MENUS)) menu.open = false;
  // The tabs, and on narrow screens the keywords, are one line that scrolls sideways; its end fades while there is more.
  for (const line of browse.querySelectorAll<HTMLElement>('.vp-blog-tabs, .vp-blog-keywords')) {
    const chips = line.querySelector<HTMLElement>(':scope > .vp-blog-facet__chips');
    if (chips) line.classList.toggle('is-scrollable', chips.scrollWidth > chips.clientWidth + 1);
  }
}

/**
 * A drop-down's button: the filter's name, or the value chosen in it (the
 * month over its year). Beside a keyword or date drop-down with a value, a
 * link that takes it off.
 */
function syncMenu(wrap: HTMLElement, url: URL, filter: BlogFilter, labels: BlogLabels): void {
  const facet = wrap.dataset.vpBlogMenu ?? '';
  const choices = [...wrap.querySelectorAll<HTMLAnchorElement>('.vp-blog-menu__panel a.is-active')]
    .filter((anchor) => !anchor.closest('.vp-blog-menu__all'))
    .sort((a, b) => (b.dataset.vpBlogValue ?? '').length - (a.dataset.vpBlogValue ?? '').length);
  const chosen = choices[0];
  const name = chosen ? chosen.title || chipName(chosen) : '';
  const text = wrap.querySelector<HTMLElement>('.vp-blog-menu__text');
  if (text) text.textContent = name || text.dataset.label || '';
  wrap.classList.toggle('is-active', !!chosen);

  let clear = wrap.querySelector<HTMLAnchorElement>('.vp-blog-menu__clear');
  if (facet !== 'tag' && facet !== 'date') return;
  if (!clear) {
    clear = link('', '', 'vp-blog-menu__clear');
    clear.innerHTML = CLEAR_ICON;
    wrap.append(clear);
  }
  clear.hidden = !chosen;
  clear.href = toHref(url, { ...filter, [facet]: '' });
  const kind = facet === 'tag' ? `${labels.tag} ` : '';
  clear.setAttribute('aria-label', labels.removeFilter.replace('{filter}', `${kind}${name}`));
}

const CLEAR_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" ' +
  'd="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"></path></svg>';

/** Opening one drop-down closes any other, once per panel. */
function setUpMenus(browse: HTMLElement): void {
  if (browse.dataset.vpBlogMenus) return;
  browse.dataset.vpBlogMenus = '';
  for (const menu of browse.querySelectorAll<HTMLDetailsElement>('details.vp-blog-menu')) {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      for (const other of document.querySelectorAll<HTMLDetailsElement>(OPEN_MENUS)) {
        if (other !== menu) other.open = false;
      }
    });
  }
  if (menusDismissable) return;
  menusDismissable = true;
  // A click outside an open drop-down closes it, as does following a choice in it.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    for (const menu of document.querySelectorAll<HTMLDetailsElement>(OPEN_MENUS)) {
      if (!target || !menu.contains(target) || target.closest('.vp-blog-menu__panel a')) menu.open = false;
    }
  });
  // Escape closes it, and puts focus back on its button.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const menu of document.querySelectorAll<HTMLDetailsElement>(OPEN_MENUS)) {
      // A field with text clears it first.
      if (event.target instanceof HTMLInputElement && event.target.value && menu.contains(event.target)) continue;
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
}

let menusDismissable = false;

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

/**
 * Under the toolbar, while a filter is on: how many posts match, and a link
 * that takes every filter off. The filters themselves show in the toolbar;
 * only `?announcements`, which has no place there, gets a chip that removes it.
 */
function renderFilter(slot: HTMLElement, url: URL, filter: BlogFilter, count: number, labels: BlogLabels): void {
  slot.hidden = !(filter.category || filter.tag || filter.date || filter.announcements);
  if (slot.hidden) return slot.replaceChildren();

  const summary = count === 0 ? labels.noMatches : count === 1 ? labels.postCountOne : labels.postCount;
  const parts: Node[] = [element('span', 'vp-blog-filter__count', summary.replace('{n}', String(count)))];
  if (filter.announcements) {
    const chip = link('', toHref(url, { ...filter, announcements: false }), 'vp-blog-filter__chip');
    chip.setAttribute('aria-label', labels.removeFilter.replace('{filter}', labels.announcements));
    const remove = element('span', 'vp-blog-filter__remove', '×');
    remove.setAttribute('aria-hidden', 'true');
    chip.append(labels.announcements, remove);
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
  if (banner) renderFilter(banner, url, filter, pinned.length + rest.length, labels);
  const pagination = blog.querySelector<HTMLElement>('[data-vp-blog-pagination]');
  if (pagination) renderPagination(pagination, url, filter, page, pageCount, labels);
  syncBrowse(blog, url, filter, markers, labels);
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
