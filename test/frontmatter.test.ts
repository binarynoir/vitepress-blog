import { describe, expect, it } from 'vitest';
import {
  estimateReadingMinutes,
  mayHaveBlogFrontmatter,
  readExcerpt,
  readFrontmatter,
  resolveFolders,
  resolveIndexConfig,
  resolvePostData,
  toDate,
} from '../src/frontmatter.js';

function post(yaml: string, content = '# Heading\n\nFirst paragraph.\n', options = {}) {
  const { data } = readFrontmatter(`---\n${yaml}\n---\n`);
  return resolvePostData(data, content, 'fallback', options);
}

describe('readFrontmatter', () => {
  it('splits YAML from content', () => {
    expect(readFrontmatter('---\ntitle: A\n---\nBody')).toEqual({ data: { title: 'A' }, content: 'Body' });
  });

  it('returns the whole file when there is no frontmatter', () => {
    expect(readFrontmatter('# Just text')).toEqual({ data: {}, content: '# Just text' });
  });
});

describe('mayHaveBlogFrontmatter', () => {
  it('spots blog and blog-index keys only in frontmatter', () => {
    expect(mayHaveBlogFrontmatter('---\nblog: true\n---\n')).toBe(true);
    expect(mayHaveBlogFrontmatter('---\nblog-index:\n  scope: site\n---\n')).toBe(true);
    expect(mayHaveBlogFrontmatter('---\ntitle: blog\n---\nblog: true')).toBe(false);
    expect(mayHaveBlogFrontmatter('blog: true')).toBe(false);
  });
});

describe('toDate', () => {
  it('accepts strings and Dates, and rejects nonsense', () => {
    expect(toDate('2026-10-01')?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(toDate(new Date('2026-10-01T00:00:00Z'))?.getUTCDate()).toBe(1);
    expect(toDate('not a date')).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });
});

describe('resolvePostData', () => {
  it('is null without a blog key, or with blog: false', () => {
    expect(post('title: x')).toBeNull();
    expect(post('blog: false')).toBeNull();
  });

  it('fills defaults for blog: true from the heading and first paragraph', () => {
    expect(post('blog: true')).toMatchObject({
      title: 'Heading',
      summary: 'First paragraph.',
      scope: 'section',
      date: null,
      authors: [],
      tags: [],
      pinned: false,
      draft: false,
      readingMinutes: 1,
    });
  });

  it('reads every field under blog', () => {
    const data = post(
      [
        'title: Page title',
        'blog:',
        '  title: Post title',
        '  summary: Short.',
        '  date: 2026-10-01',
        '  updated: 2026-10-02',
        '  image: ./cover.png',
        '  imageAlt: A cover',
        '  author: { name: Jane, url: https://jane.dev }',
        '  tags: [a, b]',
        '  category: News',
        '  scope: site',
        '  pinned: true',
        '  draft: true',
        '  byline: false',
      ].join('\n'),
    );
    expect(data).toMatchObject({
      title: 'Post title',
      summary: 'Short.',
      image: './cover.png',
      imageAlt: 'A cover',
      authors: [{ name: 'Jane', url: 'https://jane.dev' }],
      tags: ['a', 'b'],
      category: 'News',
      scope: 'site',
      pinned: true,
      draft: true,
      byline: false,
    });
    expect(data?.date?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(data?.updated?.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('falls back to top-level title, description, date, author, image and tags', () => {
    const data = post('blog: true\ntitle: T\ndescription: D\ndate: 2026-01-02\nauthor: Sam\nimage: /i.png\ntags: x, y');
    expect(data).toMatchObject({
      title: 'T',
      summary: 'D',
      authors: [{ name: 'Sam' }],
      image: '/i.png',
      tags: ['x', 'y'],
    });
  });

  it('accepts global as another word for site', () => {
    expect(post('blog:\n  scope: global')?.scope).toBe('site');
  });

  it('reads how the image fits its frame, and which part stays in view', () => {
    expect(post('blog: true')).toMatchObject({ imageFit: 'cover', imagePosition: '' });
    expect(post('blog:\n  image: /logo.png\n  imageFit: contain\n  imagePosition: top')).toMatchObject({
      imageFit: 'contain',
      imagePosition: 'top',
    });
    expect(post('blog:\n  image: { src: a.png, fit: contain, position: 30% 20% }')).toMatchObject({
      imageFit: 'contain',
      imagePosition: '30% 20%',
    });
  });

  it.each([['top; color: red'], ['url(x)'], ['"><script>'], ['a b c d e']])('drops the position %s', (position) => {
    expect(post(`blog:\n  imagePosition: '${position}'`)?.imagePosition).toBe('');
  });

  it('accepts image as an object with src and alt', () => {
    expect(post('blog:\n  image: { src: a.png, alt: An A }')).toMatchObject({ image: 'a.png', imageAlt: 'An A' });
  });

  it('looks author keys up in the authors option, and uses defaultAuthor when none is named', () => {
    const options = {
      authors: { jane: { name: 'Jane Doe', url: 'https://jane.dev' }, sam: 'Sam Lee' },
      defaultAuthor: 'jane',
    };
    expect(post('blog:\n  author: [jane, sam, Kim]', undefined, options)?.authors).toEqual([
      { name: 'Jane Doe', url: 'https://jane.dev' },
      { name: 'Sam Lee' },
      { name: 'Kim' },
    ]);
    expect(post('blog: true', undefined, options)?.authors).toEqual([{ name: 'Jane Doe', url: 'https://jane.dev' }]);
  });

  it('strips markdown-tags syntax from the title and summary unless told not to', () => {
    expect(post('blog:\n  summary: Done ((tag|x))', '# Launch ((tag|Done|green))\n')).toMatchObject({
      title: 'Launch',
      summary: 'Done',
    });
    expect(post('blog: true', '# Launch ((tag|Done))\n', { stripTags: false })?.title).toBe('Launch ((tag|Done))');
  });

  it('turns off reading time with wordsPerMinute: 0', () => {
    expect(post('blog: true', undefined, { wordsPerMinute: 0 })?.readingMinutes).toBe(0);
  });
});

describe('readExcerpt', () => {
  it('skips headings, code, lists and HTML and returns plain text', () => {
    const content =
      '# T\n\n```js\nconst x = 1;\n```\n\n- a list\n\n<div>html</div>\n\nSome **bold** [link](/x) `code`.\n';
    expect(readExcerpt(content)).toBe('Some bold link code.');
  });

  it('shortens long paragraphs', () => {
    const excerpt = readExcerpt(`${'word '.repeat(100)}\n`);
    expect(excerpt.length).toBe(200);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('estimateReadingMinutes', () => {
  it('counts prose words and ignores code', () => {
    expect(estimateReadingMinutes(`${'word '.repeat(401)}\n\n\`\`\`\n${'code '.repeat(1000)}\n\`\`\`\n`, 200)).toBe(3);
  });
});

describe('resolveIndexConfig', () => {
  it('is null without blog-index', () => {
    expect(resolveIndexConfig({}, 'news/index.md')).toBeNull();
  });

  it('defaults to a section blog of its own folder with a feed.xml', () => {
    expect(resolveIndexConfig({ 'blog-index': true }, 'news/index.md')).toEqual({
      scope: 'section',
      folders: ['news'],
      tags: [],
      categories: [],
      limit: 0,
      layout: 'list',
      groupBy: '',
      showTags: true,
      showCategory: true,
      categoryList: true,
      categoryLimit: 8,
      tagList: true,
      tagLimit: 12,
      tagMinCount: 1,
      archive: true,
      pageSize: 10,
      pinLimit: 0,
      rssLink: true,
      feed: { path: 'feed.xml' },
    });
  });

  it('gives a main blog the whole site, and a non-index page a named feed', () => {
    expect(resolveIndexConfig({ 'blog-index': { scope: 'site' } }, 'blog/all.md')).toMatchObject({
      scope: 'site',
      folders: [],
      feed: { path: 'all-feed.xml' },
    });
  });

  it('reads every setting', () => {
    const config = resolveIndexConfig(
      {
        'blog-index': {
          folders: ['./posts', 'shared'],
          tags: 'release',
          categories: ['News', 'Engineering'],
          limit: 5,
          layout: 'grid',
          groupBy: 'month',
          showTags: false,
          showCategory: false,
          categoryList: false,
          categoryLimit: 5,
          tagList: false,
          tagLimit: 0,
          tagMinCount: 2,
          archive: false,
          pageSize: 5,
          pinLimit: 2,
          rssLink: false,
          feed: { title: 'T', description: 'D', limit: 3, path: 'rss.xml' },
        },
      },
      'news/index.md',
    );
    expect(config).toEqual({
      scope: 'section',
      folders: ['news/posts', 'shared'],
      tags: ['release'],
      categories: ['News', 'Engineering'],
      limit: 5,
      layout: 'grid',
      groupBy: 'month',
      showTags: false,
      showCategory: false,
      categoryList: false,
      categoryLimit: 5,
      tagList: false,
      tagLimit: 0,
      tagMinCount: 2,
      archive: false,
      pageSize: 5,
      pinLimit: 2,
      rssLink: false,
      feed: { title: 'T', description: 'D', limit: 3, path: 'rss.xml' },
    });
  });

  it('takes pageSize and pinLimit from the plugin options, and 0 turns them off', () => {
    expect(resolveIndexConfig({ 'blog-index': true }, 'index.md', { pageSize: 4, pinLimit: 1 })).toMatchObject({
      pageSize: 4,
      pinLimit: 1,
    });
    expect(resolveIndexConfig({ 'blog-index': { pageSize: 0 } }, 'index.md', { pageSize: 4 })?.pageSize).toBe(0);
  });

  it('still reads stickyLimit, the old name of pinLimit', () => {
    expect(resolveIndexConfig({ 'blog-index': { stickyLimit: 2 } }, 'index.md')?.pinLimit).toBe(2);
    expect(resolveIndexConfig({ 'blog-index': true }, 'index.md', { stickyLimit: 3 })?.pinLimit).toBe(3);
    expect(resolveIndexConfig({ 'blog-index': { pinLimit: 1, stickyLimit: 2 } }, 'index.md')?.pinLimit).toBe(1);
  });

  it('turns the feed off with feed: false', () => {
    expect(resolveIndexConfig({ 'blog-index': { feed: false } }, 'index.md')?.feed).toBeNull();
  });
});

describe('the old sticky name', () => {
  it('still pins a post, unless pinned says otherwise', () => {
    expect(resolvePostData({ blog: { sticky: true } }, '', 'x')?.pinned).toBe(true);
    expect(resolvePostData({ blog: { sticky: true, pinned: false } }, '', 'x')?.pinned).toBe(false);
  });
});

describe('resolveFolders', () => {
  it('resolves ./ and ../ from the page, and the rest from the source directory', () => {
    expect(resolveFolders(['./a', '../b', 'c/', '/d', '.'], 'x/y/index.md')).toEqual(['x/y/a', 'x/b', 'c', 'd', 'x/y']);
    expect(resolveFolders(['.'], 'index.md')).toEqual(['']);
  });
});
