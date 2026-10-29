import type { Debt, State } from '../data/types';
import { addMonths, dateInMonth, monthOf, nextBusinessDay } from '../lib/date';
import { dueDate } from './cards';

/** その月の返済日 */
export function paymentDate(state: State, debt: Debt, ym: string): string {
  if (debt.kind === 'card') {
    const card = state.cards.find((c) => c.id === debt.cardId);
    if (card) return dueDate(card, ym);
  }
  return nextBusinessDay(dateInMonth(ym, debt.kind === 'loan' ? debt.payDay : 1));
}

export function bankIdOf(state: State, debt: Debt): string {
  if (debt.kind === 'loan') return debt.bankId;
  return state.cards.find((c) => c.id === debt.cardId)?.bankId ?? '';
}

/**
 * 返済の予定を月ごとに並べる。balanceAsOf の翌日以降の返済日から、残債がなくなるまで。
 * 利息は考えない（ずれたら残債を手で直す運用）
 */
export function schedule(state: State, debt: Debt, untilMonth: string): { ym: string; date: string; amount: number; after: number }[] {
  const rows: { ym: string; date: string; amount: number; after: number }[] = [];
  let remaining = debt.balance;
  for (let ym = monthOf(debt.balanceAsOf); ym <= untilMonth && remaining > 0; ym = addMonths(ym, 1)) {
    const date = paymentDate(state, debt, ym);
    if (date <= debt.balanceAsOf) continue;
    if (debt.firstPayment && date < debt.firstPayment) continue;
    const amount = Math.min(debt.monthly, remaining);
    remaining -= amount;
    rows.push({ ym, date, amount, after: remaining });
  }
  return rows;
}

/** 今日時点の残債 */
export function currentBalance(state: State, debt: Debt, today: string): number {
  const paid = schedule(state, debt, monthOf(today)).filter((r) => r.date <= today);
  return paid.length ? paid[paid.length - 1].after : debt.balance;
}

/** その月の返済額 */
export function paymentInMonth(state: State, debt: Debt, ym: string): number {
  return schedule(state, debt, ym).find((r) => r.ym === ym)?.amount ?? 0;
}

/** 完済予定の月（利息を考えない目安） */
export function payoffMonth(state: State, debt: Debt): string | null {
  if (debt.monthly <= 0) return null;
  const rows = schedule(state, debt, addMonths(monthOf(debt.balanceAsOf), 600));
  return rows.length ? rows[rows.length - 1].ym : null;
}
