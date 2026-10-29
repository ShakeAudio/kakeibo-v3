import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import type { State } from '../data/types';
import { dueDate, dueMonthFor, statementPeriod } from './cards';
import { currentBalance, paymentInMonth, payoffMonth } from './debts';
import { billings, duplicateDays, monthlyWork, suggestProject, unassignedTitles } from './business';
import { cardStatement, monthBudget, weekLiving } from './budget';
import { nextBusinessDay, weekStart } from '../lib/date';

const seed = (): State => createSeed();
const card = (s: State, id: string) => s.cards.find((c) => c.id === id)!;

describe('日付', () => {
  it('土日祝は翌営業日にずらす', () => {
    expect(nextBusinessDay('2026-12-26')).toBe('2026-12-28'); // 土曜
    expect(nextBusinessDay('2026-11-03')).toBe('2026-11-04'); // 文化の日
  });
  it('週は月曜始まり', () => {
    expect(weekStart('2026-10-29')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // 日曜
  });
});

describe('カード', () => {
  it('三井住友は月末締め・翌月26日払い', () => {
    const s = seed();
    expect(statementPeriod(card(s, 'smbc'), '2026-11')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(dueDate(card(s, 'smbc'), '2026-10')).toBe('2026-10-26');
    expect(dueMonthFor(card(s, 'smbc'), '2026-10-31')).toBe('2026-11');
  });
  it('エポスは4日締め・翌月4日払い', () => {
    const s = seed();
    expect(statementPeriod(card(s, 'epos'), '2026-11')).toEqual({ start: '2026-09-05', end: '2026-10-04' });
    expect(dueMonthFor(card(s, 'epos'), '2026-10-05')).toBe('2026-12');
    expect(dueDate(card(s, 'epos'), '2026-10')).toBe('2026-10-05'); // 10/4 は日曜
  });
  it('カード払いの固定費と分割はそのカードの請求に入る', () => {
    const s = seed();
    const labels = cardStatement(s, card(s, 'epos'), '2026-11', '2026-10-29').map((i) => i.label);
    expect(labels).toContain('家賃（エポス払い）');
    expect(labels).toContain('国民年金（エポス払い）');
    expect(labels).toContain('エポスカード 分割');
  });
});

describe('負債', () => {
  it('残債は返済日ごとに自動で減る', () => {
    const s = seed();
    const loan = s.debts.find((d) => d.name === 'ローンA')!;
    expect(currentBalance(s, loan, '2026-10-04')).toBe(433000);
    expect(currentBalance(s, loan, '2026-10-05')).toBe(420000);
    expect(paymentInMonth(s, loan, '2026-11')).toBe(13000);
  });
  it('最後の月は残りだけ払う', () => {
    const s = seed();
    const d = { ...s.debts[0], balance: 20000, monthly: 12000 };
    expect(payoffMonth(s, d)).toBe('2026-11');
    expect(paymentInMonth(s, d, '2026-11')).toBe(8000);
  });
});

describe('事業', () => {
  it('休演日を除いて稼働日を数え、重複は別に数える', () => {
    const s = seed();
    const oct = monthlyWork(s, '2026-10');
    // 演目B 10/1〜20（休演 2日）= 18日、演目C 21〜25、演目D 22〜24・26〜31
    expect(oct.days).toBe(29);
    expect(oct.duplicates).toBe(3);
    expect(oct.forecast).toBe((29 + 3) * 20000);
    expect(duplicateDays(s, '2026-10').map((d) => d.date)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24']);
  });
  it('紐づいていないタイトルを見つけて候補を出す', () => {
    const s = seed();
    expect(unassignedTitles(s)).toEqual(['演目E 大阪']);
    expect(suggestProject(s, '演目E 大阪')?.name).toBe('演目E');
  });
  it('案件まとめては地方公演を含めた最終日で請求する', () => {
    const s = seed();
    s.projects.find((p) => p.name === '演目E')!.titles.push('演目E 大阪');
    const b = billings(s, '2026-10-29').find((x) => x.label === '演目E')!;
    expect(b.workEnd).toBe('2027-02-23');
    expect(b.due).toBe('2027-03-31');
  });
  it('入金予定日を過ぎたら入金済み。手で戻せる', () => {
    const s = seed();
    const sep = billings(s, '2026-10-29').find((b) => b.label === 'X社 9月分')!;
    expect(sep.status).toBe('receivable');
    expect(billings(s, '2026-10-31').find((b) => b.id === sep.id)!.status).toBe('paid');
    s.paidOverrides[sep.id] = false;
    expect(billings(s, '2026-11-02').find((b) => b.id === sep.id)!.status).toBe('receivable');
  });
});

describe('予算', () => {
  it('過不足 = 繰越金 ＋ 入金予定 ± 現金 − 銀行の引き落とし', () => {
    const s = seed();
    const b = monthBudget(s, '2026-10', '2026-10-29');
    expect(b.carry).toBe(215000);
    expect(b.result).toBe(b.carry + b.income + b.cash - b.withdrawals);
    const next = monthBudget(s, '2026-11', '2026-10-29');
    expect(next.carry).toBe(b.result);
  });
  it('今週の生活費は三井住友の支出だけを数える', () => {
    const s = seed();
    s.transactions = [
      { id: 'a', date: '2026-10-27', amount: 1000, kind: 'expense', source: 'smbc' },
      { id: 'b', date: '2026-10-27', amount: 500, kind: 'expense', source: 'cash' },
      { id: 'c', date: '2026-10-25', amount: 800, kind: 'expense', source: 'smbc' },
    ];
    expect(weekLiving(s, '2026-10-29').remaining).toBe(14000);
  });
});
