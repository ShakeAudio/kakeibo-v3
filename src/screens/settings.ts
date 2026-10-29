import { DEMO, forgetLocalData, getState, getSyncStatus, resetToSeed, syncNow, update } from '../data/store';
import { ApiError, ping } from '../data/api';
import { addMonths, formatYm, monthOf, todayYmd } from '../lib/date';
import { dayRate, unassignedTitles } from '../logic/business';
import { clearConnection, getConnection, isConnected, setConnection, type Connection } from '../data/connection';
import { askNumber, askText, confirmDialog, toast } from '../ui/dialog';
import { esc, yen } from '../ui/format';
import { icon, onAction, subHeader } from '../ui/layout';

// 設定トップ

const chevron = icon('chevron-right', 'tiny muted');

function item(label: string, value: string, attrs: string): string {
  return `<button class="item" ${attrs}><span>${label}</span><span>${value} ${chevron}</span></button>`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * URL か合言葉を変えたとき。両方そろったら GAS に確かめてもらい、正しければ保存して読み込む。
 * 違っていれば保存しない
 */
async function changeConnection(root: HTMLElement, patch: Partial<Connection>) {
  const next = { ...getConnection(), ...patch };
  if (next.url && next.token) {
    try {
      await ping(next);
    } catch (err) {
      return toast(err instanceof ApiError ? err.message : 'つながりませんでした');
    }
    setConnection(patch);
    toast('つながりました。データを読み込みます');
    await syncNow();
  } else {
    setConnection(patch);
  }
  afterConnectionChange(root);
}

/** 公開版で接続が外れたら、最初の画面（URL と合言葉の入力）に戻す */
function afterConnectionChange(root: HTMLElement) {
  if (!DEMO && !isConnected()) location.hash = '#/';
  else renderSettings(root);
}

export function renderSettings(root: HTMLElement) {
  const state = getState();
  const today = todayYmd();
  const { settings } = state;
  const pending = unassignedTitles(state).length;
  const works = state.events.filter((e) => e.kind === 'work').length;
  const cancels = state.events.filter((e) => e.kind === 'cancel').length;
  const conn = getConnection();
  const sync = getSyncStatus();

  root.innerHTML = `
    ${subHeader('設定', '#/budget')}
    <main class="page">
      <h3 class="group-title">家計</h3>
      <div class="group">
        ${item('生活費の予算（週）', yen(settings.weeklyBudget), 'data-action="weekly"')}
        ${item('繰越金の初期値', settings.opening.month ? `${formatYm(settings.opening.month)}末 ${yen(settings.opening.amount)}` : '<span class="muted">未設定</span>', 'data-action="opening"')}
        ${item('カード・銀行', '', 'data-action="go" data-href="#/settings/cards"')}
      </div>

      <h3 class="group-title">事業</h3>
      <div class="group">
        ${item('日当', yen(dayRate(state, today)), 'data-action="rate"')}
        ${item('取引先', `${state.clients.length}社`, 'data-action="go" data-href="#/settings/clients"')}
        ${item('案件', pending ? `<span class="tag tag-warn">確認 ${pending}</span>` : `${state.projects.length}件`, 'data-action="go" data-href="#/settings/projects"')}
      </div>

      <h3 class="group-title">スプレッドシートとの同期</h3>
      <div class="group">
        <div class="item"><span>カレンダーの予定</span><span class="muted">稼働 ${works}件 / 打ち消し ${cancels}件${state.calendarCounts ? `（登録 ${state.calendarCounts.work + state.calendarCounts.cancel}件）` : ''}</span></div>
        <div class="item"><span>最後に読み込んだ時刻</span><span class="muted">${sync.lastSync ? formatTime(sync.lastSync) : '—'}</span></div>
        ${sync.pending ? `<div class="item"><span>送信待ち</span><span class="wn">${sync.pending}件</span></div>` : ''}
        ${sync.error ? `<div class="item"><span class="ex small">${esc(sync.error.message)}</span></div>` : ''}
        <div class="item"><span class="muted small">三井住友メールは15分ごと、カレンダーは6時間ごとに自動で読み込みます</span>
          <button class="text-btn" data-action="import" ${sync.syncing ? 'disabled' : ''}>${sync.syncing ? '読み込み中…' : '今すぐ読み込む'}</button></div>
      </div>

      <h3 class="group-title">接続（Google / GAS）</h3>
      <div class="group">
        ${item('GAS の URL', conn.url ? '設定済み' : '<span class="muted">未設定</span>', 'data-action="conn-url"')}
        ${item('合言葉', conn.token ? '●●●●（設定済み）' : '<span class="muted">未設定</span>', 'data-action="conn-token"')}
        <div class="item"><span class="small ${isConnected() ? 'ok' : 'wn'}">${isConnected() ? 'つながっています' : DEMO ? '未接続（ダミーデータで動作中）' : '未接続'}</span>
          ${conn.url || conn.token ? '<button class="text-btn danger-text" data-action="conn-clear">消す</button>' : ''}</div>
      </div>
      <p class="muted small">URL と合言葉はこの端末の中だけに保存し、プログラムや公開ページには入りません。</p>

      ${
        DEMO
          ? `<button class="btn danger block" data-action="reset">ダミーデータに戻す</button>
             <p class="muted small">手元で動かしているときだけ出るボタンです。公開版にはダミーデータは入りません。</p>`
          : ''
      }
    </main>`;

  onAction(root, async (action, el) => {
    if (action === 'go') location.hash = el.dataset.href!;
    if (action === 'import') {
      if (!isConnected()) return toast('先に GAS の URL と合言葉を入れてください');
      if (await syncNow(true)) toast('読み込みました');
      else toast(getSyncStatus().error?.message ?? '読み込めませんでした');
    }
    if (action === 'weekly') {
      const v = await askNumber('生活費の予算（1週間）', settings.weeklyBudget);
      if (v !== null) update((s) => (s.settings.weeklyBudget = v));
    }
    if (action === 'opening') {
      const month = addMonths(monthOf(today), -1);
      const v = await askNumber(`繰越金の初期値（${formatYm(month)}末の残高）`, settings.opening.amount, 'すべての銀行の残高の合計。以降は自動で繰り越します');
      if (v !== null) update((s) => (s.settings.opening = { month, amount: v }));
    }
    if (action === 'rate') {
      const v = await askNumber('日当', dayRate(state, today), '今日以降の稼働に使います。過去の月は前の日当のまま計算します');
      if (v === null) return;
      update((s) => {
        s.settings.dayRates = s.settings.dayRates.filter((r) => r.from !== today);
        s.settings.dayRates.push({ from: today, amount: v });
      });
    }
    if (action === 'conn-url') {
      const v = await askText('GAS の URL', conn.url, 'GAS の「ウェブアプリ」の URL（https://script.google.com/macros/s/…/exec）');
      if (v === null) return;
      if (v.trim() && !/^https:\/\/script\.google\.com\//.test(v.trim())) return toast('script.google.com の URL を入れてください');
      await changeConnection(root, { url: v.trim() });
    }
    if (action === 'conn-token') {
      const v = await askText('合言葉', '', 'GAS 側に設定した合言葉。表示はされません', false, true);
      if (v === null || !v.trim()) return;
      await changeConnection(root, { token: v.trim() });
    }
    if (action === 'conn-clear' && (await confirmDialog('この端末に保存した URL と合言葉、家計のデータの写しを消しますか？スプレッドシートのデータは消えません', '消す', true))) {
      clearConnection();
      forgetLocalData();
      afterConnectionChange(root);
    }
    if (action === 'reset' && (await confirmDialog('入力した内容を消してダミーデータに戻しますか？', '戻す', true))) {
      resetToSeed();
      toast('ダミーデータに戻しました');
    }
  });
}
