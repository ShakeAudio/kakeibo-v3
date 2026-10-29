import { getState, getSyncStatus } from '../data/store';
import { addMonths, formatMd, formatYm, monthOf, todayYmd } from '../lib/date';
import { monthBudget, weekLiving, type BankRow } from '../logic/budget';
import { esc, signed, yen } from '../ui/format';
import { icon, mainHeader, onAction } from '../ui/layout';

// 予算ページ（メイン）: 今月と来月の過不足、今週の生活費

const open = new Set<string>();

/** 送れていない入力やエラーがあるときだけ、見出しの下に小さく出す */
function syncNote(): string {
  const s = getSyncStatus();
  if (s.error?.code === 'unauthorized') return `<a href="#/settings" class="sync-note ex">${esc(s.error.message)}。設定を確かめてください</a>`;
  if (s.pending) return `<a href="#/settings" class="sync-note wn">${s.syncing ? '送信中…' : `未送信 ${s.pending}件（つながったら送ります）`}</a>`;
  if (s.syncing) return '<p class="sync-note muted">読み込み中…</p>';
  return '';
}

function bankRows(month: string, rows: BankRow[]): string {
  return rows
    .map((b) => {
      // 引き落としがない月も、登録したすべての銀行を薄く出す
      if (!b.total) return `<div class="bank-row muted"><span>${esc(b.name)}</span><span>0</span></div>`;
      const key = `${month}:${b.bankId}`;
      const isOpen = open.has(key);
      return `
        <button class="bank-row" data-action="toggle" data-key="${key}" aria-expanded="${isOpen}">
          <span>${esc(b.name)}<span class="muted day">${b.days.map((d) => `${d}日`).join(' / ')}</span>
            ${icon(isOpen ? 'chevron-up' : 'chevron-down', 'tiny muted')}</span>
          <span class="ex">${yen(b.total)}</span>
        </button>
        ${
          isOpen
            ? `<div class="bank-detail">${b.items
                .map((i) => `<div class="line"><span>${esc(i.label)} <span class="muted">${formatMd(i.date)}</span></span><span>${yen(i.amount)}</span></div>`)
                .join('')}</div>`
            : ''
        }`;
    })
    .join('');
}

export function renderBudget(root: HTMLElement) {
  const state = getState();
  const today = todayYmd();
  const ym = monthOf(today);
  const now = monthBudget(state, ym, today);
  const next = monthBudget(state, addMonths(ym, 1), today);
  const week = weekLiving(state, today);
  const usedRate = Math.min(100, Math.max(0, (week.spent / week.budget) * 100));

  root.innerHTML = `
    ${mainHeader('budget')}
    <main class="page">
      <h2 class="page-title">${formatYm(ym)}の予算</h2>
      ${syncNote()}

      <section class="card">
        <div class="line"><span>繰越金（${Number(addMonths(ym, -1).slice(5))}月末）</span><span>${yen(now.carry)}</span></div>
        <div class="line"><span>＋ 今月の入金予定</span><span class="in">${yen(now.income)}</span></div>
        <div class="line"><span>± 現金の収支</span><span class="${now.cash < 0 ? 'ex' : 'in'}">${signed(now.cash)}</span></div>
        <div class="line"><span>− 銀行の引き落とし</span><span class="ex">${yen(now.withdrawals)}</span></div>
        ${bankRows(ym, now.banks)}
        <div class="line total"><span>今月の${now.result < 0 ? '不足額' : '残り'}</span><span class="big ${now.result < 0 ? 'ex' : 'in'}">${signed(now.result)}</span></div>
      </section>

      <section class="card">
        <div class="line"><span>今週の生活費あと <span class="muted small">${formatMd(week.start)}〜${formatMd(week.end)}</span></span><span class="big ${week.remaining < 0 ? 'ex' : ''}">${yen(week.remaining)}</span></div>
        <div class="bar"><div style="width:${usedRate}%"></div></div>
        <div class="line muted small"><span>使った ${yen(week.spent)}</span><span>予算 ${yen(week.budget)}</span></div>
      </section>

      <a href="#/fixed" class="link-row fab-gap">固定費・負債 ${icon('chevron-right', 'tiny')}</a>

      <section class="card">
        <div class="line"><span>＋ 来月の入金予定</span><span class="in">${yen(next.income)}</span></div>
        <div class="line"><span>− 来月の銀行の引き落とし予定</span><span class="ex">${yen(next.withdrawals)}</span></div>
        ${bankRows(next.ym, next.banks)}
        <div class="line total"><span>来月の${next.result < 0 ? '不足予定額' : '残り予定'}</span><span class="big ${next.result < 0 ? 'ex' : 'in'}">${signed(next.result)}</span></div>
      </section>
    </main>
    <a href="#/entry" class="fab" aria-label="現金・エポスを入力">${icon('plus')}</a>`;

  onAction(root, (action, el) => {
    if (action !== 'toggle') return;
    const key = el.dataset.key!;
    open.has(key) ? open.delete(key) : open.add(key);
    renderBudget(root);
  });
}
