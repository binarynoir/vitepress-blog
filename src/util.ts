const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes the characters that are special in HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * Escapes text so it stays literal in Markdown and in VitePress's Vue
 * templates. Text with braces goes in a `v-pre` span, since Vue would otherwise
 * evaluate `{{ }}` even when the Markdown escaped it.
 */
export function escapeMarkdown(text: string): string {
  const escaped = text
    .replace(/[\\`*_[\]#|~]/g, '\\$&')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return /[{}]/.test(escaped) ? `<span v-pre>${escaped}</span>` : escaped;
}

/** HTML text that Vue leaves alone: braces go in a `v-pre` span. */
export function escapeTemplateText(text: string): string {
  const escaped = escapeHtml(text);
  return /[{}]/.test(escaped) ? `<span v-pre>${escaped}</span>` : escaped;
}

/** A URL with a scheme (`https:`, `mailto:`) or protocol-relative (`//cdn`). */
export function isExternalUrl(url: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url);
}

/** Encodes a URL for a Markdown link destination: spaces and parentheses would end it early. */
export function toMarkdownUrl(url: string): string {
  return encodeURI(url).replace(/[()]/g, (character) => (character === '(' ? '%28' : '%29'));
}

/** A Markdown link to a page by its served path, which VitePress then checks and gives the site's base. */
export function toPageLink(text: string, routePath: string): string {
  return `[${escapeMarkdown(text)}](${toMarkdownUrl(`/${routePath}`)})`;
}

/** A page's URL path, without the site's base: `news/index.md` is `/news/`, `news/launch.md` is `/news/launch`. */
export function toUrlPath(routePath: string, cleanUrls: boolean): string {
  return `/${routePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, cleanUrls ? '' : '.html')}`;
}

/** `base` and `urlPath` joined with exactly one slash between them. */
export function joinUrl(base: string, urlPath: string): string {
  return `${base.replace(/\/+$/, '')}/${urlPath.replace(/^\/+/, '')}`;
}
