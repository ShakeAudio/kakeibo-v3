import { getState, update } from '../data/store';
import type { FixedCost } from '../data/types';
import { addMonths, formatYm, monthOf, todayYmd } from '../lib/date';
import { fixedCostsInMonth } from '../logic/budget';
import { paymentDate } from '../logic/debts';
import { askNumber } from '../ui/dialog';
import { esc, yen } from '../ui/format';
import { icon, onAction, periodNav, subHeader } from '../ui/layout';

// 固定費ページ: 毎月 / 特定の月だけ / 負債の返済

const view = { ym: monthOf(todayYmd()) };

function payBadge(f: FixedCost): string {
  const state = getState();
  if (f.payment.type === 'card') {
    const cardId = f.payment.cardId;
    const card = state.cards.find((c) => c.id === cardId);
    return `<span class="tag tag-violet">${esc(card?.short ?? 'カード')}</span>`;
  }
  const day = f.payment.day === 'end' ? '末' : f.payment.day;
  return `<button class="day-chip" data-action="day" data-id="${f.id}">${day}日</button>`;
}

function fixedRow(f: FixedCost): string {
  const months = f.schedule.type === 'months' ? `<br><span class="muted small">${f.schedule.months.join('・')}月</span>` : '';
  return `
    <div class="row">
      <span><a href="#/fixed/edit/${f.id}" class="plain">${esc(f.name)}</a> ${payBadge(f)}${months}</span>
      <a href="#/fixed/edit/${f.id}" class="plain">${yen(f.amount)}</a>
    </div>`;
}

export function renderFixed(root: HTMLElement) {
  const state = getState();
  const { fixed, debts, total } = fixedCostsInMonth(state, view.ym);
  const monthly = fixed.filter((f) => f.schedule.type === 'monthly');
  const seasonal = fixed.filter((f) => f.schedule.type === 'months');

  root.innerHTML = `
    ${subHeader('固定費', '#/budget', `<a href="#/fixed/edit/new" class="icon-btn accent" aria-label="固定費を追加">${icon('plus')}</a>`)}
    <main class="page">
      ${periodNav(formatYm(view.ym))}
      <section class="card"><div class="line"><span>この月の固定費 合計</span><span class="big ex">${yen(total)}</span></div></section>

      <h3 class="section-title">毎月</h3>
      ${monthly.map(fixedRow).join('') || '<p class="muted small">ありません</p>'}

      <h3 class="section-title">特定の月だけ</h3>
      ${seasonal.map(fixedRow).join('') || '<p class="muted small">この月に払うものはありません</p>'}

      <h3 class="section-title split"><span>負債の返済</span><a href="#/debt" class="small">詳細 ${icon('chevron-right', 'tiny')}</a></h3>
      ${
        debts
          .map(
            ({ debt, amount }) => `<a href="#/debt/${debt.id}" class="row plain">
              <span>${esc(debt.name)}${debt.kind === 'loan' ? ` <span class="day-chip">${Number(paymentDate(state, debt, view.ym).slice(8))}日</span>` : ''}</span>
              <span>${yen(amount)}</span></a>`,
          )
          .join('') || '<p class="muted small">この月の返済はありません</p>'
      }
      <p class="muted small">カード払いのものは日付の代わりにカード名を出しています。引き落とし日はカードの日程に従います。</p>
    </main>`;

  onAction(root, async (action, el) => {
    if (action === 'prev' || action === 'next') {
      view.ym = addMonths(view.ym, action === 'prev' ? -1 : 1);
      renderFixed(root);
    }
    if (action === 'day') {
      const f = state.fixedCosts.find((x) => x.id === el.dataset.id);
      if (!f || f.payment.type !== 'bank') return;
      const day = await askNumber(`${f.name}の引き落とし日`, f.payment.day === 'end' ? 31 : f.payment.day, '31 を入れると末日になります');
      if (day === null || day < 1 || day > 31) return;
      update(() => f.payment.type === 'bank' && (f.payment.day = day >= 31 ? 'end' : day));
    }
  });
}
