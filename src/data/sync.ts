import type { State, Transaction } from './types';
import { callGas } from './api';

// スプレッドシートとの同期。
// - 画面で変えた内容は「送信待ち」に積み、つながっていれば GAS に送る
// - 電波がなくて送れなかった分は端末に残し、次につながったときに送る
// - 読み込みは、送信待ちを送り切ってから行う（送る前の内容で上書きしないため）

/** まるごと置き換えて保存する表 */
export const SAVE_KEYS = ['fixedCosts', 'debts', 'banks', 'cards', 'clients', 'projects', 'paidOverrides', 'dayRates', 'settings'] as const;
export type SaveKey = (typeof SAVE_KEYS)[number];

export type Pending = {
  saves: SaveKey[];
  upserts: Record<string, Transaction>;
  deletes: string[];
};

export const emptyPending = (): Pending => ({ saves: [], upserts: {}, deletes: [] });

export function isEmpty(p: Pending): boolean {
  return !p.saves.length && !Object.keys(p.upserts).length && !p.deletes.length;
}

export function pendingCount(p: Pending): number {
  return p.saves.length + Object.keys(p.upserts).length + p.deletes.length;
}

/** state の中で、その表にあたる部分 */
export function collectionOf(state: State, key: SaveKey): unknown {
  if (key === 'dayRates') return state.settings.dayRates;
  if (key === 'settings') {
    const { weeklyBudget, livingCardId, opening, incomeBankId } = state.settings;
    return { weeklyBudget, livingCardId, opening, incomeBankId };
  }
  return state[key];
}

/** 変更前後を比べて、送信待ちに足す */
export function addChanges(pending: Pending, before: State, after: State): Pending {
  const next: Pending = { saves: [...pending.saves], upserts: { ...pending.upserts }, deletes: [...pending.deletes] };
  for (const key of SAVE_KEYS) {
    if (JSON.stringify(collectionOf(before, key)) !== JSON.stringify(collectionOf(after, key)) && !next.saves.includes(key)) {
      next.saves.push(key);
    }
  }
  const old = new Map(before.transactions.map((t) => [t.id, JSON.stringify(t)]));
  const now = new Set<string>();
  for (const t of after.transactions) {
    now.add(t.id);
    if (old.get(t.id) !== JSON.stringify(t)) {
      next.upserts[t.id] = t;
      next.deletes = next.deletes.filter((id) => id !== t.id);
    }
  }
  for (const id of old.keys()) {
    if (now.has(id)) continue;
    delete next.upserts[id];
    if (!next.deletes.includes(id)) next.deletes.push(id);
  }
  return next;
}

type Remote = Omit<State, 'settings' | 'calendarCounts'> & {
  settings: Omit<State['settings'], 'dayRates'>;
  dayRates: State['settings']['dayRates'];
  calendars: { work: number; cancel: number };
};

/** GAS から受け取ったデータをアプリの形にする */
export function fromRemote(r: Remote, today: string): State {
  const lastMonth = (() => {
    const [y, m] = today.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  return {
    settings: {
      ...r.settings,
      opening: { month: r.settings.opening.month || lastMonth, amount: r.settings.opening.amount },
      dayRates: r.dayRates,
    },
    banks: r.banks,
    cards: r.cards,
    transactions: r.transactions,
    fixedCosts: r.fixedCosts,
    debts: r.debts,
    clients: r.clients,
    projects: r.projects,
    events: r.events,
    paidOverrides: r.paidOverrides,
    calendarCounts: r.calendars,
  };
}

/** 送信待ちを順に送る。送れた分は消した送信待ちを返す。途中で失敗したら例外 */
export async function pushPending(pending: Pending, state: State, onProgress: (p: Pending) => void): Promise<Pending> {
  let rest = pending;
  if (Object.keys(rest.upserts).length || rest.deletes.length) {
    await callGas('saveTransactions', { upserts: Object.values(rest.upserts), deletes: rest.deletes });
    rest = { ...rest, upserts: {}, deletes: [] };
    onProgress(rest);
  }
  for (const key of pending.saves) {
    await callGas('save', { collection: key, items: collectionOf(state, key) });
    rest = { ...rest, saves: rest.saves.filter((k) => k !== key) };
    onProgress(rest);
  }
  return rest;
}

export async function fetchRemote(today: string): Promise<State> {
  const data = await callGas<{ state: Remote }>('load');
  return fromRemote(data.state, today);
}

/** メールとカレンダーを今すぐ読み込ませてから、全体を受け取る */
export async function importNow(today: string): Promise<State> {
  const data = await callGas<{ state: Remote }>('importNow');
  return fromRemote(data.state, today);
}
