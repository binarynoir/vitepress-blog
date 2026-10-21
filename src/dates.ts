/**
 * Dates and times from frontmatter. A post can give a date (`2026-10-20`), a
 * date and time (`2026-10-20 14:30` or `2026-10-20T14:30:00`), or either with
 * an offset (`2026-10-20T14:30:00-04:00`, `…Z`). A value without an offset is
 * read in the blog's time zone, so the same frontmatter means the same moment
 * on every build machine, and is shown in that time zone too.
 */

/** A post's date and whether its frontmatter gave a time, so a date alone is never shown with "12:00 AM". */
export interface PostDate {
  date: Date;
  hasTime: boolean;
}

// `2026-10-20`, then an optional `T` or space and `HH:mm[:ss[.sss]]`, then an optional `Z` or `±HH[:]mm`.
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/** Whether `timeZone` is a time zone this runtime knows, such as `UTC` or `America/New_York`. */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const warnedZones = new Set<string>();

/** The `timeZone` option, or `UTC` (with a warning, once) when it isn't a time zone this runtime knows. */
export function resolveTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return 'UTC';
  if (isTimeZone(timeZone)) return timeZone;
  if (!warnedZones.has(timeZone)) {
    warnedZones.add(timeZone);
    console.warn(
      `[vitepress-blog] "${timeZone}" is not a time zone; using UTC. Use an IANA name such as "America/New_York".`,
    );
  }
  return 'UTC';
}

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** How far `timeZone`'s wall clock is ahead of UTC at `instant`, in milliseconds (negative west of UTC). */
export function zoneOffset(instant: number, timeZone: string): number {
  let format = offsetFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormats.set(timeZone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - Math.floor(instant / 1000) * 1000;
}

/** The instant a wall-clock time in `timeZone` names, using the offset in force then (daylight saving included). */
function fromZonedTime(wall: number, timeZone: string): number {
  const first = wall - zoneOffset(wall, timeZone);
  const second = wall - zoneOffset(first, timeZone);
  return second;
}

/**
 * Reads a frontmatter date. Strings in the forms above are read exactly; a
 * `Date` (as other YAML parsers produce) counts as having a time unless it
 * is midnight UTC. Anything else is `null`.
 */
export function parsePostDate(value: unknown, timeZone = 'UTC'): PostDate | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const midnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0;
    return { date: value, hasTime: !midnight };
  }
  if (typeof value !== 'string') return null;
  const match = DATE_TIME.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', millisecond = '0', offset] = match;
  const hasTime = hour !== undefined;
  const wall = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    hasTime ? Number(hour) : 0,
    hasTime ? Number(minute) : 0,
    Number(second),
    Number(millisecond.padEnd(3, '0')),
  );
  // Date.UTC rolls over impossible dates (2026-02-30), so check the date survived intact.
  const check = new Date(wall);
  if (check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day)) return null;

  if (!offset) return { date: new Date(fromZonedTime(wall, timeZone)), hasTime };
  if (offset.toUpperCase() === 'Z') return { date: new Date(wall), hasTime };
  const sign = offset.startsWith('-') ? -1 : 1;
  const digits = offset.slice(1).replace(':', '');
  const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
  return { date: new Date(wall - sign * minutes * 60_000), hasTime };
}

export interface DateDisplay {
  locale: string;
  timeZone: string;
  dateFormat: Intl.DateTimeFormatOptions;
  timeFormat: Intl.DateTimeFormatOptions;
  /** How a date and a time are joined: `{date} at {time}`. */
  dateTime: string;
}

/** A post date for readers: the date, plus the time when the frontmatter gave one, in the blog's time zone. */
export function formatPostDate({ date, hasTime }: PostDate, display: DateDisplay): string {
  const { locale, timeZone } = display;
  const day = new Intl.DateTimeFormat(locale, { timeZone, ...display.dateFormat }).format(date);
  if (!hasTime) return day;
  const time = new Intl.DateTimeFormat(locale, { timeZone, ...display.timeFormat }).format(date);
  return display.dateTime.replace('{date}', day).replace('{time}', time);
}

/** The calendar date in `timeZone`, as `YYYY-MM-DD`. */
export function toZonedIsoDate(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** A `<time datetime>` value: the date alone, or the exact moment when there is a time. */
export function toDateTimeAttribute({ date, hasTime }: PostDate, timeZone: string): string {
  return hasTime ? date.toISOString() : toZonedIsoDate(date, timeZone);
}

/** The year a date falls in, in `timeZone`, for year headings. */
export function yearIn(date: Date, timeZone: string): number {
  return Number(toZonedIsoDate(date, timeZone).slice(0, 4));
}

/** The month a date falls in, in `timeZone`, as `YYYY-MM`: what month headings and `?month=` use. */
export function monthIn(date: Date, timeZone: string): string {
  return toZonedIsoDate(date, timeZone).slice(0, 7);
}

/** A `YYYY-MM` month for readers, in `locale`: "October 2026", or with `{ month: 'short' }`, "Oct". */
export function formatMonth(month: string, locale: string, format: Intl.DateTimeFormatOptions): string {
  const [year, number] = month.split('-').map(Number);
  // The first of the month at noon UTC, shown in UTC, is that month in every locale.
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...format }).format(Date.UTC(year, number - 1, 1, 12));
}
