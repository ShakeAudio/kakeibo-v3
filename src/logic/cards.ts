import type { Card } from '../data/types';
import { addDays, addMonths, dateInMonth, monthOf, nextBusinessDay } from '../lib/date';

/** その月の締め日 */
export function closingDate(card: Card, ym: string): string {
  return dateInMonth(ym, card.closingDay);
}

/** 利用日が入る請求の締め日 */
export function closingFor(card: Card, ymd: string): string {
  const thisMonth = closingDate(card, monthOf(ymd));
  return ymd <= thisMonth ? thisMonth : closingDate(card, addMonths(monthOf(ymd), 1));
}

/** その月に引き落とされる請求の利用期間 */
export function statementPeriod(card: Card, dueMonth: string): { start: string; end: string } {
  const closingMonth = addMonths(dueMonth, -card.payMonthOffset);
  const end = closingDate(card, closingMonth);
  const start = addDays(closingDate(card, addMonths(closingMonth, -1)), 1);
  return { start, end };
}

/** その月の引き落とし日（休日なら翌営業日） */
export function dueDate(card: Card, dueMonth: string): string {
  return nextBusinessDay(dateInMonth(dueMonth, card.payDay));
}

/** 利用日に対する引き落とし月 */
export function dueMonthFor(card: Card, ymd: string): string {
  return addMonths(monthOf(closingFor(card, ymd)), card.payMonthOffset);
}
