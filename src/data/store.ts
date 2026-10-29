import type { State } from './types';
import { createEmpty, createSeed } from './seed';
import { isConnected } from './connection';
import { ApiError } from './api';
import { addChanges, emptyPending, fetchRemote, importNow, isEmpty, pendingCount, pushPending, type Pending } from './sync';
import { todayYmd } from '../lib/date';

// データは端末内（localStorage）に写しを持ち、GAS につながっていればスプレッドシートと同期する。
// ダミーデータは手元で動かすとき（npm run dev）に、まだつないでいない間だけ使う

const KEY = 'kakeibo-v3/state/v1';
const PENDING_KEY = 'kakeibo-v3/pending/v1';
const SYNC_KEY = 'kakeibo-v3/last-sync/v1';
export const DEMO = import.meta.env.DEV;

const initial = (): State => (DEMO ? createSeed() : createEmpty());

let state: State = read(KEY) ?? initial();
let pending: Pending = read(PENDING_KEY) ?? emptyPending();
const listeners = new Set<() => void>();

export type SyncStatus = {
  syncing: boolean;
  lastSync: string | null;
  pending: number;
  error: { code: ApiError['code']; message: string } | null;
};

const status: SyncStatus = { syncing: false, lastSync: read(SYNC_KEY), pending: pendingCount(pending), error: null };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 読めないときは初期状態から始める
  }
  return null;
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても画面は動かす
  }
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function getState(): State {
  return state;
}

export function getSyncStatus(): SyncStatus {
  return status;
}

/** state を書き換えて保存し、画面を描き直す。つながっていればスプレッドシートにも送る */
export function update(mutate: (s: State) => void) {
  const before = isConnected() ? structuredClone(state) : null;
  mutate(state);
  write(KEY, state);
  if (before) {
    setPending(addChanges(pending, before, state));
    scheduleFlush();
  }
  notify();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
}

/** 手元のダミーデータに戻す（公開版では空に戻す） */
export function resetToSeed() {
  state = initial();
  write(KEY, state);
  setPending(emptyPending());
  notify();
}

export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function setPending(p: Pending) {
  pending = p;
  status.pending = pendingCount(p);
  write(PENDING_KEY, p);
}

let flushTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 600);
}

function fail(err: unknown) {
  status.error =
    err instanceof ApiError ? { code: err.code, message: err.message } : { code: 'server', message: String(err) };
}

/** 送信待ちを送る。失敗したら送信待ちのまま残す */
async function flush(): Promise<boolean> {
  if (!isConnected() || isEmpty(pending)) return true;
  if (status.syncing) return false;
  status.syncing = true;
  notify();
  try {
    setPending(await pushPending(pending, state, setPending));
    status.error = null;
    return true;
  } catch (err) {
    fail(err);
    return false;
  } finally {
    status.syncing = false;
    notify();
  }
}

/**
 * 送信待ちを送り切ってから、スプレッドシートの内容を読み込んで置き換える。
 * withImport が true なら、先に GAS にメールとカレンダーを読み込ませる
 */
export async function syncNow(withImport = false): Promise<boolean> {
  if (!isConnected()) return false;
  if (!(await flush())) return false;
  status.syncing = true;
  notify();
  try {
    const remote = withImport ? await importNow(todayYmd()) : await fetchRemote(todayYmd());
    // 読み込み中に画面で入力された分があれば、それは上書きせず次に送る
    if (isEmpty(pending)) {
      state = remote;
      write(KEY, state);
    }
    status.lastSync = new Date().toISOString();
    write(SYNC_KEY, status.lastSync);
    status.error = null;
    return true;
  } catch (err) {
    fail(err);
    return false;
  } finally {
    status.syncing = false;
    notify();
    if (!isEmpty(pending)) scheduleFlush();
  }
}

/** 接続を消したとき: 端末に残した家計のデータも消す（他の人に見られないように） */
export function forgetLocalData() {
  state = initial();
  write(KEY, state);
  setPending(emptyPending());
  status.lastSync = null;
  status.error = null;
  try {
    localStorage.removeItem(SYNC_KEY);
  } catch {
    // 消せなくても続ける
  }
  notify();
}
