import type { Card, FixedCost, State } from '../data/types';
import { addDays, addMonths, dateInMonth, eachDay, monthNumber, monthOf, nextBusinessDay, weekStart } from '../lib/date';
import { dueDate, statementPeriod } from './cards';
import { bankIdOf, paymentDate, paymentInMonth } from './debts';
import { incomeInMonth } from './business';

export type WithdrawalItem = { label: string; amount: number; date: string };
export type BankRow = { bankId: string; name: string; days: number[]; total: number; items: WithdrawalItem[] };

export function isFixedInMonth(f: FixedCost, ym: string): boolean {
  return f.schedule.type === 'monthly' || f.schedule.months.includes(monthNumber(ym));
}

function livingSpent(state: State, start: string, end: string): number {
  return state.transactions
    .filter((t) => t.source === state.settings.livingCardId && t.kind === 'expense' && t.date >= start && t.date <= end)
    .reduce((s, t) => s + t.amount, 0);
}

/** 今週（月曜始まり）の生活費 */
export function weekLiving(state: State, today: string) {
  const start = weekStart(today);
  const end = addDays(start, 6);
  const spent = livingSpent(state, start, end);
  const budget = state.settings.weeklyBudget;
  return { start, end, spent, budget, remaining: budget - spent };
}

/** 生活費カードの、まだ来ていない日の分の見込み（今週の残り予算 ＋ それ以降の日割り） */
function livingProjection(state: State, today: string, periodEnd: string): number {
  if (periodEnd < today) return 0;
  const week = weekLiving(state, today);
  const daysLeftInWeek = eachDay(today, week.end).length;
  const daysLeftInPeriod = eachDay(today, periodEnd).length;
  const thisWeek = Math.max(0, week.remaining) * Math.min(1, daysLeftInPeriod / daysLeftInWeek);
  const laterDays = Math.max(0, daysLeftInPeriod - daysLeftInWeek);
  return Math.round(thisWeek + (laterDays * week.budget) / 7);
}

/** カード1枚の、その月に引き落とされる請求の内訳 */
export function cardStatement(state: State, card: Card, dueMonth: string, today: string): WithdrawalItem[] {
  const { start, end } = statementPeriod(card, dueMonth);
  const date = dueDate(card, dueMonth);
  const items: WithdrawalItem[] = [];

  const usage = state.transactions
    .filter((t) => t.source === card.id && t.kind === 'expense' && t.date >= start && t.date <= end)
    .reduce((s, t) => s + t.amount, 0);
  if (usage) items.push({ label: `${card.short}カード 1回払い`, amount: usage, date });

  if (card.id === state.settings.livingCardId) {
    const projected = livingProjection(state, today, end);
    if (projected) items.push({ label: '生活費の見込み（残りの日）', amount: projected, date });
  }

  for (const f of state.fixedCosts) {
    if (f.payment.type !== 'card' || f.payment.cardId !== card.id) continue;
    for (let ym = monthOf(start); ym <= monthOf(end); ym = addMonths(ym, 1)) {
      const charge = dateInMonth(ym, f.payment.chargeDay);
      if (charge >= start && charge <= end && isFixedInMonth(f, ym)) {
        items.push({ label: `${f.name}（${card.short}払い）`, amount: f.amount, date });
      }
    }
  }

  for (const d of state.debts) {
    if (d.kind !== 'card' || d.cardId !== card.id) continue;
    const amount = paymentInMonth(state, d, dueMonth);
    if (amount) items.push({ label: `${d.name} 分割`, amount, date });
  }
  return items;
}

/** その月の銀行ごとの引き落とし */
export function bankWithdrawals(state: State, ym: string, today: string): BankRow[] {
  const byBank = new Map<string, WithdrawalItem[]>();
  const add = (bankId: string, item: WithdrawalItem) => byBank.set(bankId, [...(byBank.get(bankId) ?? []), item]);

  for (const card of state.cards) cardStatement(state, card, ym, today).forEach((i) => add(card.bankId, i));

  for (const f of state.fixedCosts) {
    if (f.payment.type !== 'bank' || !isFixedInMonth(f, ym)) continue;
    add(f.payment.bankId, { label: f.name, amount: f.amount, date: nextBusinessDay(dateInMonth(ym, f.payment.day)) });
  }

  for (const d of state.debts) {
    if (d.kind !== 'loan') continue;
    const amount = paymentInMonth(state, d, ym);
    if (amount) add(bankIdOf(state, d), { label: `${d.name} 返済`, amount, date: paymentDate(state, d, ym) });
  }

  return state.banks.map((bank) => {
    const items = (byBank.get(bank.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const days = [...new Set(items.map((i) => Number(i.date.slice(8, 10))))];
    return { bankId: bank.id, name: bank.short, days, total: items.reduce((s, i) => s + i.amount, 0), items };
  });
}

export function cashNet(state: State, ym: string): number {
  return state.transactions
    .filter((t) => t.source === 'cash' && monthOf(t.date) === ym)
    .reduce((s, t) => s + (t.kind === 'income' ? t.amount : -t.amount), 0);
}

export type MonthBudget = {
  ym: string;
  carry: number;
  income: number;
  cash: number;
  banks: BankRow[];
  withdrawals: number;
  result: number;
};

/** 繰越金 ＋ 入金予定 ± 現金 − 銀行の引き落とし */
export function monthBudget(state: State, ym: string, today: string): MonthBudget {
  const { opening } = state.settings;
  let carry = opening.amount;
  for (let m = addMonths(opening.month, 1); m < ym; m = addMonths(m, 1)) {
    carry = monthResult(state, m, today, carry);
  }
  const income = incomeInMonth(state, ym, today).total;
  const cash = cashNet(state, ym);
  const banks = bankWithdrawals(state, ym, today);
  const withdrawals = banks.reduce((s, b) => s + b.total, 0);
  return { ym, carry, income, cash, banks, withdrawals, result: carry + income + cash - withdrawals };
}

function monthResult(state: State, ym: string, today: string, carry: number): number {
  const income = incomeInMonth(state, ym, today).total;
  const withdrawals = bankWithdrawals(state, ym, today).reduce((s, b) => s + b.total, 0);
  return carry + income + cashNet(state, ym) - withdrawals;
}

/** 固定費ページ用: その月に払う固定費と負債の返済 */
export function fixedCostsInMonth(state: State, ym: string) {
  const fixed = state.fixedCosts.filter((f) => isFixedInMonth(f, ym));
  const debts = state.debts.map((d) => ({ debt: d, amount: paymentInMonth(state, d, ym) })).filter((x) => x.amount > 0);
  const total = fixed.reduce((s, f) => s + f.amount, 0) + debts.reduce((s, x) => s + x.amount, 0);
  return { fixed, debts, total };
}
