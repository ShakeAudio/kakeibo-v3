import holidayJp from '@holiday-jp/holiday_jp';

// 日付は 'YYYY-MM-DD'、月は 'YYYY-MM' の文字列で扱う

const pad = (n: number) => String(n).padStart(2, '0');

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayYmd(): string {
  return toYmd(new Date());
}

export function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

export function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}

export function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** day が 'end' または月の日数を超えるときは末日にする */
export function dateInMonth(ym: string, day: number | 'end'): string {
  const last = daysInMonth(ym);
  const d = day === 'end' ? last : Math.min(day, last);
  return `${ym}-${pad(d)}`;
}

export function monthNumber(ym: string): number {
  return Number(ym.slice(5, 7));
}

export function isHoliday(ymd: string): boolean {
  return ymd in holidayJp.holidays;
}

export function isBusinessDay(ymd: string): boolean {
  const dow = parseYmd(ymd).getDay();
  return dow !== 0 && dow !== 6 && !isHoliday(ymd);
}

/** 土日祝なら翌営業日にずらす */
export function nextBusinessDay(ymd: string): string {
  let d = ymd;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

/** 月曜始まりの週の初日 */
export function weekStart(ymd: string): string {
  const dow = parseYmd(ymd).getDay();
  return addDays(ymd, -((dow + 6) % 7));
}

/** start〜end（両端を含む）の日付を順に返す */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export function weekdayJa(ymd: string): string {
  return WEEK[parseYmd(ymd).getDay()];
}

export function formatMd(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
}

export function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`;
}
