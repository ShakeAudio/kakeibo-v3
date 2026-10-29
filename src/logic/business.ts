import type { Client, State } from '../data/types';
import { addMonths, dateInMonth, eachDay, monthOf } from '../lib/date';

/** その日の日当（取引先の個別日当 → 共通日当の履歴の順） */
export function dayRate(state: State, date: string, client?: Client): number {
  if (client?.dayRate) return client.dayRate;
  const rates = [...state.settings.dayRates].sort((a, b) => a.from.localeCompare(b.from));
  let rate = rates[0]?.amount ?? 0;
  for (const r of rates) if (r.from <= date) rate = r.amount;
  return rate;
}

export function projectOfTitle(state: State, title: string) {
  return state.projects.find((p) => p.titles.includes(title));
}

/** どの案件にも紐づいていない稼働予定のタイトル */
export function unassignedTitles(state: State): string[] {
  const titles = new Set(state.events.filter((e) => e.kind === 'work').map((e) => e.title));
  return [...titles].filter((t) => !projectOfTitle(state, t));
}

/** タイトルの先頭が共通する案件を候補として返す（例: 「演目E 大阪」→ 演目E） */
export function suggestProject(state: State, title: string) {
  const head = title.split(/[\s　]+/).slice(0, -1).join(' ');
  if (!head) return undefined;
  return state.projects.find((p) => p.name === head || p.titles.some((t) => t.startsWith(head)));
}

function cancelDays(state: State): Set<string> {
  const days = new Set<string>();
  for (const e of state.events) if (e.kind === 'cancel') eachDay(e.start, e.end).forEach((d) => days.add(d));
  return days;
}

/**
 * 案件ごとの稼働日。紐づいていないタイトルは「title:タイトル」をキーにする。
 * 稼働日 = 稼働カレンダーの予定がある日 − 打ち消し（休演日）の日
 */
export function workDaysByKey(state: State): Map<string, Set<string>> {
  const cancels = cancelDays(state);
  const map = new Map<string, Set<string>>();
  for (const e of state.events) {
    if (e.kind !== 'work') continue;
    const key = projectOfTitle(state, e.title)?.id ?? `title:${e.title}`;
    const set = map.get(key) ?? new Set<string>();
    eachDay(e.start, e.end).forEach((d) => !cancels.has(d) && set.add(d));
    map.set(key, set);
  }
  return map;
}

function keyName(state: State, key: string): string {
  return key.startsWith('title:') ? key.slice(6) : (state.projects.find((p) => p.id === key)?.name ?? key);
}

function clientOfKey(state: State, key: string): Client | undefined {
  const project = state.projects.find((p) => p.id === key);
  return project && state.clients.find((c) => c.id === project.clientId);
}

export type MonthWork = { ym: string; days: number; duplicates: number; forecast: number; expenses: number };

/** 月ごとの稼働日数・重複・売上予想・経費（エポス） */
export function monthlyWork(state: State, ym: string): MonthWork {
  const byKey = workDaysByKey(state);
  const counts = new Map<string, number>();
  let forecast = 0;
  for (const [key, days] of byKey) {
    const client = clientOfKey(state, key);
    for (const d of days) {
      if (monthOf(d) !== ym) continue;
      counts.set(d, (counts.get(d) ?? 0) + 1);
      forecast += dayRate(state, d, client);
    }
  }
  let duplicates = 0;
  counts.forEach((n) => (duplicates += n - 1));
  const expenses = state.transactions
    .filter((t) => t.source === 'epos' && t.kind === 'expense' && monthOf(t.date) === ym)
    .reduce((sum, t) => sum + t.amount, 0);
  return { ym, days: counts.size, duplicates, forecast, expenses };
}

/** その月に案件が重なった日と案件名 */
export function duplicateDays(state: State, ym: string): { date: string; names: string[] }[] {
  const byDate = new Map<string, string[]>();
  for (const [key, days] of workDaysByKey(state)) {
    for (const d of days) {
      if (monthOf(d) !== ym) continue;
      byDate.set(d, [...(byDate.get(d) ?? []), keyName(state, key)]);
    }
  }
  return [...byDate]
    .filter(([, names]) => names.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, names]) => ({ date, names }));
}

export type Billing = {
  id: string;
  clientId: string;
  label: string;
  basis: 'project' | 'monthly';
  amount: number;
  /** 稼働の最終日（この日を過ぎると売掛金になる） */
  workEnd: string;
  due: string;
  status: 'scheduled' | 'receivable' | 'paid';
};

function status(state: State, id: string, workEnd: string, due: string, today: string): Billing['status'] {
  if (workEnd >= today) return 'scheduled';
  const override = state.paidOverrides[id];
  if (override !== undefined) return override ? 'paid' : 'receivable';
  return due <= today ? 'paid' : 'receivable';
}

/** カレンダーから請求（予定・売掛金・入金済み）を作る */
export function billings(state: State, today: string): Billing[] {
  const byKey = workDaysByKey(state);
  const list: Billing[] = [];
  for (const client of state.clients) {
    const projects = state.projects.filter((p) => p.clientId === client.id);
    if (client.billing === 'project') {
      for (const p of projects) {
        const days = [...(byKey.get(p.id) ?? [])].sort();
        if (!days.length) continue;
        const workEnd = days[days.length - 1];
        const due = dateInMonth(addMonths(monthOf(workEnd), client.payMonthOffset), client.payDay);
        const id = `p:${p.id}`;
        const amount = days.reduce((sum, d) => sum + dayRate(state, d, client), 0);
        list.push({ id, clientId: client.id, label: p.name, basis: 'project', amount, workEnd, due, status: status(state, id, workEnd, due, today) });
      }
    } else {
      const periods = new Map<string, string[]>();
      for (const p of projects) {
        for (const d of byKey.get(p.id) ?? []) {
          const closeThisMonth = dateInMonth(monthOf(d), client.closingDay);
          const closing = d <= closeThisMonth ? closeThisMonth : dateInMonth(addMonths(monthOf(d), 1), client.closingDay);
          periods.set(closing, [...(periods.get(closing) ?? []), d]);
        }
      }
      for (const [closing, days] of periods) {
        const due = dateInMonth(addMonths(monthOf(closing), client.payMonthOffset), client.payDay);
        const id = `m:${client.id}:${closing}`;
        const amount = days.reduce((sum, d) => sum + dayRate(state, d, client), 0);
        const label = `${client.name} ${Number(closing.slice(5, 7))}月分`;
        list.push({ id, clientId: client.id, label, basis: 'monthly', amount, workEnd: closing, due, status: status(state, id, closing, due, today) });
      }
    }
  }
  return list.sort((a, b) => a.due.localeCompare(b.due));
}

/** その月に入金される予定の額（入金済みも含む） */
export function incomeInMonth(state: State, ym: string, today: string): { total: number; items: Billing[] } {
  const items = billings(state, today).filter((b) => monthOf(b.due) === ym);
  return { total: items.reduce((s, b) => s + b.amount, 0), items };
}
