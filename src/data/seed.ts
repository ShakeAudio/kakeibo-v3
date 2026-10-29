import type { State, Transaction } from './types';
import { eachDay } from '../lib/date';

// GAS につなぐまでの動作確認用ダミーデータ。金額や会社名はすべて仮

const SHOPS = ['スーパー', 'コンビニ', 'ドラッグストア', '居酒屋', 'カフェ', '定食屋', '100円ショップ', 'ネット通販'];

/** 毎回同じ並びになる疑似乱数 */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function dummyTransactions(): Transaction[] {
  const rand = seededRandom(42);
  const list: Transaction[] = [];
  let n = 0;
  for (const date of eachDay('2026-01-01', '2026-10-29')) {
    if (rand() < 0.75) {
      const count = rand() < 0.3 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        list.push({
          id: `t${n++}`,
          date,
          amount: Math.round((300 + rand() * 4500) / 10) * 10,
          kind: 'expense',
          source: 'smbc',
          label: SHOPS[Math.floor(rand() * SHOPS.length)],
        });
      }
    }
    if (rand() < 0.12) {
      list.push({ id: `t${n++}`, date, amount: Math.round((200 + rand() * 1500) / 10) * 10, kind: 'expense', source: 'cash' });
    }
    if (rand() < 0.2) {
      list.push({ id: `t${n++}`, date, amount: Math.round((300 + rand() * 2500) / 10) * 10, kind: 'expense', source: 'epos', label: '交通費' });
    }
  }
  list.push({ id: `t${n++}`, date: '2026-10-29', amount: 5000, kind: 'income', source: 'cash' });
  return list;
}

const cancelDays = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-09-09', '2026-09-16', '2026-10-08', '2026-10-15', '2026-11-11', '2026-11-18', '2026-11-25', '2026-12-09', '2027-02-01', '2027-02-08'];

/** 公開版の初期状態。データは何も持たず、GAS から読み込んだものだけを表示する */
export function createEmpty(): State {
  const lastMonth = new Date();
  lastMonth.setDate(0);
  return {
    settings: {
      weeklyBudget: 15000,
      livingCardId: 'smbc',
      opening: { month: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`, amount: 0 },
      dayRates: [],
      incomeBankId: '',
    },
    banks: [],
    cards: [],
    transactions: [],
    fixedCosts: [],
    debts: [],
    clients: [],
    projects: [],
    events: [],
    paidOverrides: {},
  };
}

/** 手元で動かすとき（npm run dev）だけ使うダミーデータ */
export function createSeed(): State {
  return {
    settings: {
      weeklyBudget: 15000,
      livingCardId: 'smbc',
      opening: { month: '2026-09', amount: 215000 },
      dayRates: [{ from: '2000-01-01', amount: 20000 }],
      incomeBankId: 'docomo',
    },
    banks: [
      { id: 'docomo', name: 'ドコモSMBCネット銀行', short: 'ドコモSMBC' },
      { id: 'smbcb', name: '三井住友銀行', short: '三井住友' },
      { id: 'mizuho', name: 'みずほ銀行', short: 'みずほ' },
      { id: 'rakuten', name: '楽天銀行', short: '楽天' },
      { id: 'paypay', name: 'PayPay銀行', short: 'PayPay' },
    ],
    cards: [
      { id: 'smbc', name: '三井住友カード', short: '三井住友', closingDay: 'end', payMonthOffset: 1, payDay: 26, bankId: 'smbcb' },
      { id: 'epos', name: 'エポスカード', short: 'エポス', closingDay: 4, payMonthOffset: 1, payDay: 4, bankId: 'docomo' },
      { id: 'rakuten', name: '楽天カード', short: '楽天', closingDay: 'end', payMonthOffset: 1, payDay: 27, bankId: 'rakuten' },
    ],
    transactions: dummyTransactions(),
    fixedCosts: [
      { id: 'f1', name: '家賃', amount: 95000, schedule: { type: 'monthly' }, payment: { type: 'card', cardId: 'epos', chargeDay: 27 } },
      { id: 'f2', name: '国民年金', amount: 17000, schedule: { type: 'monthly' }, payment: { type: 'card', cardId: 'epos', chargeDay: 1 } },
      { id: 'f3', name: 'スマホ', amount: 8000, schedule: { type: 'monthly' }, payment: { type: 'card', cardId: 'smbc', chargeDay: 10 } },
      { id: 'f4', name: '国民健康保険', amount: 38000, schedule: { type: 'months', months: [6, 7, 8, 9, 10, 11, 12, 1, 2, 3] }, payment: { type: 'bank', bankId: 'mizuho', day: 30 } },
      { id: 'f5', name: '住民税', amount: 48000, schedule: { type: 'months', months: [6, 8, 10, 1] }, payment: { type: 'bank', bankId: 'mizuho', day: 30 } },
    ],
    debts: [
      { id: 'd1', name: 'エポスカード', kind: 'card', cardId: 'epos', borrowed: 240000, balance: 180000, balanceAsOf: '2026-09-30', monthly: 12000 },
      { id: 'd2', name: '三井住友カード', kind: 'card', cardId: 'smbc', borrowed: 300000, balance: 240000, balanceAsOf: '2026-09-30', monthly: 15000 },
      { id: 'd3', name: '楽天カード', kind: 'card', cardId: 'rakuten', borrowed: 200000, balance: 144000, balanceAsOf: '2026-09-30', monthly: 10000 },
      { id: 'd4', name: 'ローンA', kind: 'loan', bankId: 'rakuten', payDay: 5, borrowed: 500000, balance: 433000, balanceAsOf: '2026-09-30', monthly: 13000, rate: 15 },
      { id: 'd5', name: 'ローンB', kind: 'loan', bankId: 'paypay', payDay: 10, borrowed: 400000, balance: 310000, balanceAsOf: '2026-09-30', monthly: 10000, rate: 14.5 },
    ],
    clients: [
      { id: 'c1', name: 'X社', billing: 'monthly', closingDay: 'end', payMonthOffset: 1, payDay: 'end' },
      { id: 'c2', name: 'Y社', billing: 'project', closingDay: 'end', payMonthOffset: 1, payDay: 'end' },
      { id: 'c3', name: 'Z社', billing: 'project', closingDay: 'end', payMonthOffset: 2, payDay: 10 },
    ],
    projects: [
      { id: 'p1', name: '演目A', clientId: 'c1', titles: ['演目A 東京', '演目A 兵庫'] },
      { id: 'p2', name: '演目B', clientId: 'c1', titles: ['演目B 東京'] },
      { id: 'p3', name: '演目C', clientId: 'c2', titles: ['演目C 大阪', '演目C 東京'] },
      { id: 'p4', name: '演目D', clientId: 'c3', titles: ['演目D 稽古', '演目D 東京', '演目D 新作'] },
      { id: 'p5', name: '演目E', clientId: 'c2', titles: ['演目E 東京'] },
    ],
    events: [
      { title: '演目A 東京', start: '2026-08-01', end: '2026-08-30', kind: 'work' },
      { title: '演目A 兵庫', start: '2026-09-03', end: '2026-09-21', kind: 'work' },
      { title: '演目B 東京', start: '2026-10-01', end: '2026-10-20', kind: 'work' },
      { title: '演目C 大阪', start: '2026-10-21', end: '2026-10-25', kind: 'work' },
      { title: '演目D 稽古', start: '2026-10-22', end: '2026-10-24', kind: 'work' },
      { title: '演目D 東京', start: '2026-10-26', end: '2026-10-31', kind: 'work' },
      { title: '演目C 東京', start: '2026-11-05', end: '2026-11-29', kind: 'work' },
      { title: '演目D 新作', start: '2026-12-03', end: '2026-12-20', kind: 'work' },
      { title: '演目E 東京', start: '2027-01-31', end: '2027-02-14', kind: 'work' },
      { title: '演目E 大阪', start: '2027-02-16', end: '2027-02-23', kind: 'work' },
      ...cancelDays.map((d) => ({ title: '休演日', start: d, end: d, kind: 'cancel' as const })),
    ],
    paidOverrides: {},
  };
}
