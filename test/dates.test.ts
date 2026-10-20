import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatPostDate, parsePostDate, resolveTimeZone, toDateTimeAttribute, yearIn } from '../src/dates.js';
import { frontmatter, Site } from './helpers.js';

const iso = (value: unknown, timeZone?: string) => parsePostDate(value, timeZone)?.date.toISOString();

describe('parsePostDate', () => {
  it('reads a date alone as midnight in the time zone, without a time', () => {
    expect(parsePostDate('2026-10-20')).toEqual({ date: new Date('2026-10-20T00:00:00Z'), hasTime: false });
    expect(iso('2026-10-20', 'America/New_York')).toBe('2026-10-20T04:00:00.000Z');
  });

  it.each([
    ['2026-10-20 14:30', '2026-10-20T14:30:00.000Z'],
    ['2026-10-20T14:30', '2026-10-20T14:30:00.000Z'],
    ['2026-10-20T14:30:15', '2026-10-20T14:30:15.000Z'],
    ['2026-10-20T14:30:15.5', '2026-10-20T14:30:15.500Z'],
  ])('reads %s as a date and time, in UTC by default', (value, expected) => {
    expect(parsePostDate(value)).toEqual({ date: new Date(expected), hasTime: true });
  });

  it('reads an offset or Z as written, whatever the time zone', () => {
    expect(iso('2026-10-20T14:30:00Z', 'America/New_York')).toBe('2026-10-20T14:30:00.000Z');
    expect(iso('2026-10-20T14:30:00-04:00', 'Asia/Tokyo')).toBe('2026-10-20T18:30:00.000Z');
    expect(iso('2026-10-20 14:30 +0530')).toBe('2026-10-20T09:00:00.000Z');
  });

  it('reads a time without an offset in the time zone, through daylight saving', () => {
    // New York is on EDT (UTC-4) in October and EST (UTC-5) after November 1, 2026.
    expect(iso('2026-10-20 14:30', 'America/New_York')).toBe('2026-10-20T18:30:00.000Z');
    expect(iso('2026-11-20 14:30', 'America/New_York')).toBe('2026-11-20T19:30:00.000Z');
  });

  it('accepts a Date, as other YAML parsers give, with a time unless it is midnight UTC', () => {
    expect(parsePostDate(new Date('2026-10-20T00:00:00Z'))?.hasTime).toBe(false);
    expect(parsePostDate(new Date('2026-10-20T14:30:00Z'))?.hasTime).toBe(true);
  });

  it.each([['2026-02-30'], ['2026-13-01'], ['October 20, 2026'], ['20/10/2026'], [''], [20261020], [undefined]])(
    'rejects %s',
    (value) => {
      expect(parsePostDate(value)).toBeNull();
    },
  );
});

describe('showing dates', () => {
  const display = (timeZone = 'UTC') => ({
    locale: 'en-US',
    timeZone,
    dateFormat: { dateStyle: 'long' } as const,
    timeFormat: { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } as const,
    dateTime: '{date} at {time}',
  });

  it('shows the time only when the frontmatter gave one', () => {
    expect(formatPostDate(parsePostDate('2026-10-20')!, display())).toBe('October 20, 2026');
    expect(formatPostDate(parsePostDate('2026-10-20 14:30', 'America/New_York')!, display('America/New_York'))).toBe(
      'October 20, 2026 at 2:30 PM EDT',
    );
  });

  it('shows a date alone on its own day in the time zone', () => {
    expect(formatPostDate(parsePostDate('2026-10-20', 'Pacific/Auckland')!, display('Pacific/Auckland'))).toBe(
      'October 20, 2026',
    );
  });

  it('writes the date alone, or the exact moment, for <time datetime>', () => {
    expect(toDateTimeAttribute(parsePostDate('2026-10-20', 'America/New_York')!, 'America/New_York')).toBe(
      '2026-10-20',
    );
    expect(toDateTimeAttribute(parsePostDate('2026-10-20 14:30', 'America/New_York')!, 'America/New_York')).toBe(
      '2026-10-20T18:30:00.000Z',
    );
  });

  it('puts a late-night post in its own year in the time zone', () => {
    const newYearsEve = parsePostDate('2025-12-31 23:30', 'America/New_York')!.date;
    expect(newYearsEve.getUTCFullYear()).toBe(2026);
    expect(yearIn(newYearsEve, 'America/New_York')).toBe(2025);
  });

  it('falls back to UTC, with a warning, for a time zone it does not know', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveTimeZone('Mars/Olympus_Mons')).toBe('UTC');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Mars/Olympus_Mons" is not a time zone'));
    warn.mockRestore();
  });
});

describe('dates and times on pages', () => {
  const site = new Site();
  const options = { timeZone: 'America/New_York' };

  beforeAll(() => {
    site
      .write('news/index.md', frontmatter(['blog-index:', '  groupBy: year'], '# News\n'))
      .write(
        'news/morning.md',
        frontmatter(['blog:', '  date: 2026-10-20 09:15', '  updated: 2026-10-21T16:45:00-04:00'], '# Morning\n'),
      )
      .write('news/evening.md', frontmatter(['blog:', '  date: 2026-10-20 18:00'], '# Evening\n'))
      .write('news/dated.md', frontmatter(['blog:', '  date: 2026-10-19'], '# Dated\n'))
      .write('news/eve.md', frontmatter(['blog:', '  date: 2025-12-31 23:30'], '# Eve\n'));
  });

  afterAll(() => site.remove());

  it('labels the byline dates Published and Updated, each with its time', () => {
    const html = site.render('news/morning.md', options);
    expect(html).toContain(
      'Published <time datetime="2026-10-20T13:15:00.000Z">October 20, 2026 at 9:15 AM EDT</time> · Updated <time datetime="2026-10-21T20:45:00.000Z">October 21, 2026 at 4:45 PM EDT</time>',
    );
  });

  it('shows a date alone without a time', () => {
    expect(site.render('news/dated.md', options)).toContain(
      'Published <time datetime="2026-10-19">October 19, 2026</time>',
    );
  });

  it('sorts posts from the same day by their times', () => {
    const html = site.render('news/index.md', options);
    const order = ['>Evening</a>', '>Morning</a>', '>Dated</a>', '>Eve</a>'].map((title) => html.indexOf(title));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('puts a late-night post under its own year', () => {
    const html = site.render('news/index.md', options);
    expect(html.indexOf('<h2>2025</h2>')).toBeLessThan(html.indexOf('>Eve</a>'));
  });

  it('shows the time on cards, without labels', () => {
    expect(site.render('news/index.md', options)).toContain(
      '<time datetime="2026-10-20T22:00:00.000Z">October 20, 2026 at 6:00 PM EDT</time>',
    );
  });
});
