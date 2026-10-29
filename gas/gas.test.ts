import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// GAS のコードを Node で読み込み、Google の機能を使わない部分（読み取り・変換）を確かめる
const ctx: Record<string, any> = { Utilities: { formatDate: () => '2026-10-30' }, console };
runInNewContext(readFileSync(new URL('./Code.gs', import.meta.url), 'utf8') + '\nthis.CODEC = CODEC;', ctx);

describe('三井住友メール', () => {
  it('利用日・金額・利用先を読む', () => {
    const body = 'ご利用カード：三井住友カード\n利用日：2026/10/29 12:34\n利用先：セブン－イレブン\n利用取引：買物\n利用金額：1,234円\n';
    expect(ctx.parseSmbcMail(body)).toEqual({ date: '2026-10-29', amount: 1234, label: 'セブン－イレブン' });
  });
  it('読めないメールは null', () => {
    expect(ctx.parseSmbcMail('お知らせ')).toBeNull();
  });
});

describe('iCal', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261001',
    'DTEND;VALUE=DATE:20261021',
    'SUMMARY:演目B 東京',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Asia/Tokyo:20261008T000000',
    'DTEND;TZID=Asia/Tokyo:20261009T000000',
    'SUMMARY:休演日',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20261021T230000Z',
    'DTEND:20261022T010000Z',
    'SUMMARY:演目C\\, 大阪',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261025',
    'SUMMARY:長いタイ',
    ' トル',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('終日の予定は終了日を含む形にそろえる', () => {
    const events = ctx.parseIcs(ics);
    expect(events[0]).toEqual({ title: '演目B 東京', start: '2026-10-01', end: '2026-10-20' });
  });
  it('0:00 ちょうどに終わる予定は前日まで', () => {
    expect(ctx.parseIcs(ics)[1]).toEqual({ title: '休演日', start: '2026-10-08', end: '2026-10-08' });
  });
  it('UTC の時刻は日本時間の日付にする', () => {
    expect(ctx.parseIcs(ics)[2]).toEqual({ title: '演目C, 大阪', start: '2026-10-22', end: '2026-10-22' });
  });
  it('2026年より前の予定は取り込まず、またがる予定は1月1日からにする', () => {
    const events = [
      { title: '去年', start: '2025-11-01', end: '2025-12-20' },
      { title: '年またぎ', start: '2025-12-28', end: '2026-01-05' },
      { title: '今年', start: '2026-10-01', end: '2026-10-20' },
    ];
    expect(ctx.onlyFrom(events, ctx.CALENDAR_FROM ?? '2026-01-01')).toEqual([
      { title: '年またぎ', start: '2026-01-01', end: '2026-01-05' },
      { title: '今年', start: '2026-10-01', end: '2026-10-20' },
    ]);
  });
  it('折り返された行をつなぎ、終了日がなければ開始日', () => {
    expect(ctx.parseIcs(ics)[3]).toEqual({ title: '長いタイトル', start: '2026-10-25', end: '2026-10-25' });
  });
});

describe('シートの行 ⇔ アプリのデータ', () => {
  const roundTrip = (key: string, items: unknown) => ctx.CODEC[key].decode(ctx.CODEC[key].encode(items).map((r: unknown[]) => r.map(String)));

  it('固定費（毎月・特定の月、口座・カード）', () => {
    const items = [
      { id: 'f1', name: '家賃', amount: 95000, schedule: { type: 'monthly' }, payment: { type: 'card', cardId: 'epos', chargeDay: 27 } },
      { id: 'f2', name: '住民税', amount: 48000, schedule: { type: 'months', months: [6, 8, 10, 1] }, payment: { type: 'bank', bankId: 'mizuho', day: 'end' } },
    ];
    expect(roundTrip('fixedCosts', items)).toEqual(items);
  });
  it('負債・カード・取引先・案件', () => {
    const debts = [
      { id: 'd4', name: 'アコム', kind: 'loan', bankId: 'rakuten', payDay: 5, borrowed: 500000, balance: 420000, balanceAsOf: '2026-10-05', monthly: 13000, rate: 15, firstPayment: undefined },
    ];
    expect(roundTrip('debts', debts)).toEqual(debts);
    const cards = [{ id: 'smbc', name: '三井住友カード', short: '三井住友', closingDay: 'end', payMonthOffset: 1, payDay: 26, bankId: 'smbcb' }];
    expect(roundTrip('cards', cards)).toEqual(cards);
    const clients = [{ id: 'c1', name: 'X社', billing: 'monthly', closingDay: 'end', payMonthOffset: 1, payDay: 'end', dayRate: undefined }];
    expect(roundTrip('clients', clients)).toEqual(clients);
    const projects = [{ id: 'p1', name: '演目E', clientId: 'c1', titles: ['演目E 東京', '演目E 大阪'] }];
    expect(roundTrip('projects', projects)).toEqual(projects);
  });
  it('明細と設定', () => {
    const tx = [{ id: 't1', date: '2026-10-29', amount: 1200, kind: 'expense', source: 'cash', label: undefined }];
    expect(roundTrip('transactions', tx)).toEqual(tx);
    const settings = { weeklyBudget: 15000, livingCardId: 'smbc', opening: { month: '2026-09', amount: 215000 }, incomeBankId: 'docomo' };
    expect(roundTrip('settings', settings)).toEqual(settings);
    expect(roundTrip('paidOverrides', { 'm:c1:2026-09-30': false })).toEqual({ 'm:c1:2026-09-30': false });
  });
  it('スプレッドシートに手で入れた値も読める', () => {
    const [d] = ctx.CODEC.debts.decode([['d1', 'エポスカード', 'カード分割', 'epos', '', '', '240,000', '180000', '', '12000', '', '']]);
    expect(d).toMatchObject({ kind: 'card', cardId: 'epos', borrowed: 240000, balance: 180000, balanceAsOf: '2026-10-30', monthly: 12000 });
    const [f] = ctx.CODEC.fixedCosts.decode([['f9', '国保', '38000', '6、7、8', '口座', 'mizuho', '末日', '', '']]);
    expect(f.schedule).toEqual({ type: 'months', months: [6, 7, 8] });
    expect(f.payment).toEqual({ type: 'bank', bankId: 'mizuho', day: 'end' });
  });
});
