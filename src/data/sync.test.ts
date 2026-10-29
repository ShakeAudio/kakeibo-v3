import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeed } from './seed';
import { addChanges, emptyPending, fetchRemote, pushPending } from './sync';
import type { State } from './types';

// --- GAS の代わり: Code.gs を Node で動かし、スプレッドシートはメモリ上の表で置き換える ---

const HEADERS: Record<string, number> = { 明細: 7, 固定費: 9, 負債: 12, 銀行: 3, カード: 7, 取引先: 7, 案件: 4, 予定: 4, 入金の手直し: 2, 日当: 2, カレンダー: 2, 設定: 2 };
let sheets: Record<string, string[][]>;

function fakeSheet(name: string) {
  const rows = () => sheets[name];
  return {
    getLastRow: () => rows().length,
    getRange: (r: number, c: number, nr: number, nc: number) => ({
      getDisplayValues: () => rows().slice(r - 1, r - 1 + nr).map((row) => Array.from({ length: nc }, (_, i) => row[c - 1 + i] ?? '')),
      clearContent() {
        sheets[name] = rows().slice(0, r - 1);
      },
      setNumberFormat() {
        return this;
      },
      setValues(values: string[][]) {
        values.forEach((v, i) => (rows()[r - 1 + i] = v.map(String)));
      },
    }),
  };
}

const gas: Record<string, any> = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n: string) => (sheets[n] ? fakeSheet(n) : null) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'secret' }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ s, setMimeType() { return this; } }) },
  Utilities: { sleep() {}, formatDate: () => '2026-10-30' },
};
runInNewContext(readFileSync(new URL('../../gas/Code.gs', import.meta.url), 'utf8'), gas);

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
});

beforeEach(() => {
  sheets = Object.fromEntries(Object.entries(HEADERS).map(([n, c]) => [n, [Array.from({ length: c }, (_, i) => `h${i}`)]]));
  sheets['銀行'].push(['docomo', 'ドコモSMBCネット銀行', 'ドコモSMBC']);
  sheets['カード'].push(['smbc', '三井住友カード', '三井住友', '末日', '1', '26', 'smbcb']);
  sheets['日当'].push(['2000-01-01', '22000']);
  sheets['設定'].push(['生活費の予算（週）', '15000'], ['生活費のカードID', 'smbc'], ['繰越金の月', ''], ['繰越金', ''], ['事業の入金先の銀行ID', 'docomo']);
  sheets['明細'].push(['m1', '2026-10-28', '1500', '支出', '三井住友', 'コンビニ', 'mail-1']);
  sheets['カレンダー'].push(['稼働', 'webcal://example'], ['打ち消し', 'webcal://example2']);
  localStorage.setItem('kakeibo-v3/connection/v1', JSON.stringify({ url: 'https://script.google.com/x', token: 'secret' }));
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const out = gas.doPost({ postData: { contents: init.body } });
    return { json: async () => JSON.parse(out.s) };
  });
});

describe('送信待ち', () => {
  it('変わった表と明細だけを積む', () => {
    const before = createSeed();
    const after: State = structuredClone(before);
    after.settings.weeklyBudget = 18000;
    after.transactions[0].amount = 999;
    after.transactions.splice(1, 1);
    after.transactions.push({ id: 'new', date: '2026-10-30', amount: 100, kind: 'expense', source: 'cash' });
    const p = addChanges(emptyPending(), before, after);
    expect(p.saves).toEqual(['settings']);
    expect(Object.keys(p.upserts).sort()).toEqual([before.transactions[0].id, 'new'].sort());
    expect(p.deletes).toEqual([before.transactions[1].id]);
  });
  it('足してすぐ消した明細は送らない', () => {
    const s0 = createSeed();
    const s1 = structuredClone(s0);
    s1.transactions.push({ id: 'tmp', date: '2026-10-30', amount: 1, kind: 'expense', source: 'cash' });
    const s2 = structuredClone(s1);
    s2.transactions.pop();
    const p = addChanges(addChanges(emptyPending(), s0, s1), s1, s2);
    expect(p.upserts.tmp).toBeUndefined();
  });
});

describe('GAS とのやり取り', () => {
  it('読み込むとアプリの形になる。カレンダーは件数だけ', async () => {
    const s = await fetchRemote('2026-10-30');
    expect(s.banks).toEqual([{ id: 'docomo', name: 'ドコモSMBCネット銀行', short: 'ドコモSMBC' }]);
    expect(s.settings).toMatchObject({ weeklyBudget: 15000, dayRates: [{ from: '2000-01-01', amount: 22000 }], opening: { month: '2026-09', amount: 0 } });
    expect(s.transactions[0]).toMatchObject({ id: 'm1', amount: 1500, source: 'smbc', label: 'コンビニ' });
    expect(s.calendarCounts).toEqual({ work: 1, cancel: 1 });
    expect(JSON.stringify(s)).not.toContain('webcal');
  });

  it('アプリで変えた内容がシートに保存され、読み直しても同じ', async () => {
    const before = await fetchRemote('2026-10-30');
    const after = structuredClone(before);
    after.transactions.push({ id: 't1', date: '2026-10-30', amount: 1200, kind: 'expense', source: 'cash' });
    after.transactions[0].label = 'スーパー';
    after.fixedCosts.push({ id: 'f1', name: '家賃', amount: 95000, schedule: { type: 'monthly' }, payment: { type: 'card', cardId: 'epos', chargeDay: 27 } });
    after.settings.dayRates.push({ from: '2026-10-30', amount: 23000 });
    after.settings.opening = { month: '2026-09', amount: 200000 };
    const rest = await pushPending(addChanges(emptyPending(), before, after), after, () => {});
    expect(rest).toEqual(emptyPending());

    const again = await fetchRemote('2026-10-30');
    expect(again.transactions).toEqual(after.transactions);
    expect(again.fixedCosts).toEqual(after.fixedCosts);
    expect(again.settings).toEqual(after.settings);
    // メールから取り込んだ明細は、アプリで直してもメールID が残る（二重取り込みを防ぐため）
    expect(sheets['明細'][1][6]).toBe('mail-1');
  });

  it('合言葉が違えば断られ、送信待ちは残る', async () => {
    localStorage.setItem('kakeibo-v3/connection/v1', JSON.stringify({ url: 'https://script.google.com/x', token: 'wrong' }));
    const s = createSeed();
    const p = { ...emptyPending(), saves: ['banks' as const] };
    await expect(pushPending(p, s, () => {})).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(fetchRemote('2026-10-30')).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
