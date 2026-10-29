import { getState, update } from '../data/store';
import { formatMd, monthOf, todayYmd } from '../lib/date';
import { billings, dayRate, duplicateDays, monthlyWork, unassignedTitles, type Billing } from '../logic/business';
import { esc, yen } from '../ui/format';
import { mainHeader, onAction, periodNav } from '../ui/layout';
import { bindConfirmSelects, handleConfirmAction, pendingTitlesHtml } from './projectConfirm';

// 事業ページ: 稼働日数・売上予想・経費、売掛金と入金済み

const view = { year: Number(todayYmd().slice(0, 4)), dupMonth: monthOf(todayYmd()) };

function billingRow(b: Billing): string {
  const paid = b.status === 'paid';
  return `
    <div class="row">
      <span>${esc(b.label)}<br><span class="muted small">${b.basis === 'project' ? '案件まとめて' : '月締め'}・${paid ? `${formatMd(b.due)} 入金` : `入金予定 ${formatMd(b.due)}`}</span></span>
      <span class="right">
        <span class="${paid ? 'ok' : 'wn'}">${yen(b.amount)}</span><br>
        <button class="text-btn small" data-action="paid" data-id="${b.id}" data-v="${paid ? '0' : '1'}">${paid ? '未入金に戻す' : '入金済みにする'}</button>
      </span>
    </div>`;
}

export function renderBusiness(root: HTMLElement) {
  const state = getState();
  const today = todayYmd();
  const months = Array.from({ length: 12 }, (_, i) => `${view.year}-${String(i + 1).padStart(2, '0')}`);
  const work = months.map((ym) => monthlyWork(state, ym));
  const all = billings(state, today);
  const receivable = all.filter((b) => b.status === 'receivable');
  const paid = all.filter((b) => b.status === 'paid' && b.due.startsWith(String(view.year))).reverse();
  const dups = duplicateDays(state, view.dupMonth);
  const pendingCount = unassignedTitles(state).length;
  const sum = (key: 'forecast' | 'expenses') => work.reduce((s, w) => s + w[key], 0);

  root.innerHTML = `
    ${mainHeader('business')}
    <main class="page">
      ${periodNav(`${view.year}年`)}
      <section class="metric-grid">
        <div class="metric"><span class="muted small">売上予想</span><b>${yen(sum('forecast'))}</b></div>
        <div class="metric"><span class="muted small">売掛金</span><b class="wn">${yen(receivable.reduce((s, b) => s + b.amount, 0))}</b></div>
        <div class="metric"><span class="muted small">入金済み</span><b class="ok">${yen(paid.reduce((s, b) => s + b.amount, 0))}</b></div>
        <div class="metric"><span class="muted small">経費（エポス）</span><b class="ex">${yen(sum('expenses'))}</b></div>
      </section>

      <h3 class="section-title">月ごと <span class="muted small">日当 ${yen(dayRate(state, today))}</span></h3>
      <table class="table">
        <thead><tr><th>月</th><th>稼働</th><th>重複</th><th>売上予想</th><th>経費</th></tr></thead>
        <tbody>
          ${work
            .map(
              (w) => `<tr data-action="dup-month" data-ym="${w.ym}" class="${w.ym === view.dupMonth ? 'on' : ''}">
                <td>${Number(w.ym.slice(5))}月</td>
                <td>${w.days ? `${w.days}日` : '<span class="muted">—</span>'}</td>
                <td>${w.duplicates ? `<span class="wn">${w.duplicates}日</span>` : '<span class="muted">—</span>'}</td>
                <td>${w.forecast ? yen(w.forecast) : '<span class="muted">—</span>'}</td>
                <td>${w.expenses ? yen(w.expenses) : '<span class="muted">—</span>'}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <p class="muted small">月を押すと、その月の重複日が下に出ます</p>

      <h3 class="section-title">${Number(view.dupMonth.slice(5))}月の重複日</h3>
      ${dups.length ? dups.map((d) => `<div class="row"><span>${formatMd(d.date)}</span><span class="muted">${d.names.map(esc).join(' ／ ')}</span></div>`).join('') : '<p class="muted small">重複はありません</p>'}

      <h3 class="section-title">売掛金</h3>
      ${receivable.length ? receivable.map(billingRow).join('') : '<p class="muted small">売掛金はありません</p>'}

      <h3 class="section-title">入金済み</h3>
      ${paid.length ? paid.map(billingRow).join('') : '<p class="muted small">この年の入金はまだありません</p>'}

      ${pendingCount ? `<h3 class="section-title">案件の確認 <span class="tag tag-warn">${pendingCount}件</span></h3>${pendingTitlesHtml()}` : ''}
    </main>`;

  bindConfirmSelects(root);
  onAction(root, (action, el) => {
    if (handleConfirmAction(action, el)) return;
    if (action === 'prev' || action === 'next') {
      view.year += action === 'prev' ? -1 : 1;
      view.dupMonth = `${view.year}-${view.dupMonth.slice(5)}`;
    }
    if (action === 'dup-month') view.dupMonth = el.dataset.ym!;
    if (action === 'paid') {
      const id = el.dataset.id!;
      update((s) => (s.paidOverrides[id] = el.dataset.v === '1'));
      return;
    }
    renderBusiness(root);
  });
}
