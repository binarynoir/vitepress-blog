import MarkdownIt from 'markdown-it';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { blogMarkdown } from '../src/plugin.js';
import { readFrontmatter } from '../src/frontmatter.js';
import type { BlogOptions } from '../src/types.js';

/** A throwaway source directory of Markdown files. */
export class Site {
  readonly root = mkdtempSync(path.join(tmpdir(), 'vitepress-blog-'));

  write(relativePath: string, content: string | Buffer): this {
    const file = path.join(this.root, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return this;
  }

  /** Renders a page the way VitePress would: frontmatter split off into `env`, which is passed in to read back. */
  render(relativePath: string, options: BlogOptions = {}, source?: string, env: Record<string, unknown> = {}): string {
    const raw = source ?? readFileSync(path.join(this.root, relativePath), 'utf8');
    const { data, content } = readFrontmatter(raw);
    const md = new MarkdownIt({ html: true }).use(blogMarkdown, options);
    Object.assign(env, { frontmatter: data, path: path.join(this.root, relativePath), relativePath });
    return md.render(content, env);
  }

  remove(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

export function frontmatter(lines: string[], body = ''): string {
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}
