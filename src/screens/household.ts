import { getState } from '../data/store';
import type { Transaction } from '../data/types';
import { addMonths, daysInMonth, formatMd, formatYm, monthOf, parseYmd, todayYmd, weekdayJa } from '../lib/date';
import { compact, esc, yen } from '../ui/format';
import { mainHeader, onAction, periodNav } from '../ui/layout';

// 家計ページ: 三井住友カードと現金だけを、月カレンダー / 年の一覧で見る

const view = { mode: 'month' as 'month' | 'year', ym: monthOf(todayYmd()), year: Number(todayYmd().slice(0, 4)), selected: todayYmd() };

function householdTx(): Transaction[] {
  const state = getState();
  return state.transactions.filter((t) => t.source === state.settings.livingCardId || t.source === 'cash');
}

function sums(list: Transaction[]) {
  const expense = list.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  const income = list.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  return { expense, income };
}

function summary(expense: number, income: number): string {
  return `
    <section class="card summary">
      <div><span class="muted small">支出</span><b class="ex">${yen(expense)}</b></div>
      <div><span class="muted small">収入</span><b class="in">${yen(income)}</b></div>
      <div><span class="muted small">差額</span><b>${yen(income - expense)}</b></div>
    </section>`;
}

function monthView(): string {
  const tx = householdTx().filter((t) => monthOf(t.date) === view.ym);
  const { expense, income } = sums(tx);
  const firstDow = parseYmd(`${view.ym}-01`).getDay();
  const cells: string[] = ['日', '月', '火', '水', '木', '金', '土'].map((w) => `<div class="cal-head">${w}</div>`);
  for (let i = 0; i < firstDow; i++) cells.push('<div></div>');
  for (let d = 1; d <= daysInMonth(view.ym); d++) {
    const date = `${view.ym}-${String(d).padStart(2, '0')}`;
    const day = sums(tx.filter((t) => t.date === date));
    cells.push(`
      <button class="cal-day ${date === view.selected ? 'on' : ''} ${date === todayYmd() ? 'today' : ''}" data-action="select" data-date="${date}">
        <span>${d}</span>
        ${day.expense ? `<span class="amt ex">${compact(day.expense)}</span>` : ''}
        ${day.income ? `<span class="amt in">${compact(day.income)}</span>` : ''}
      </button>`);
  }
  const selectedTx = monthOf(view.selected) === view.ym ? tx.filter((t) => t.date === view.selected) : [];
  return `
    ${periodNav(formatYm(view.ym))}
    ${summary(expense, income)}
    <div class="calendar">${cells.join('')}</div>
    ${
      monthOf(view.selected) === view.ym
        ? `<h3 class="section-title">${formatMd(view.selected)}（${weekdayJa(view.selected)}）</h3>
           ${
             selectedTx.length
               ? selectedTx
                   .map(
                     (t) => `<div class="row">
                       <span><span class="tag ${t.source === 'cash' ? 'tag-green' : 'tag-blue'}">${t.source === 'cash' ? '現金' : 'カード'}</span>${esc(t.label ?? (t.kind === 'income' ? '収入' : '支出'))}</span>
                       <span class="${t.kind === 'expense' ? 'ex' : 'in'}">${yen(t.amount)}</span></div>`,
                   )
                   .join('')
               : '<p class="muted small">この日の明細はありません</p>'
           }`
        : ''
    }`;
}

function yearView(): string {
  const tx = householdTx().filter((t) => t.date.startsWith(String(view.year)));
  const { expense, income } = sums(tx);
  const months = Array.from({ length: 12 }, (_, i) => `${view.year}-${String(i + 1).padStart(2, '0')}`);
  return `
    ${periodNav(`${view.year}年`)}
    ${summary(expense, income)}
    <div class="month-grid">
      ${months
        .map((ym) => {
          const m = sums(tx.filter((t) => monthOf(t.date) === ym));
          return `<button class="month-cell ${ym === monthOf(todayYmd()) ? 'on' : ''}" data-action="month" data-ym="${ym}">
            <span>${Number(ym.slice(5))}月</span>
            <span class="${m.expense ? 'ex' : 'muted'}">${m.expense ? yen(m.expense) : '—'}</span>
          </button>`;
        })
        .join('')}
    </div>`;
}

export function renderHousehold(root: HTMLElement) {
  root.innerHTML = `
    ${mainHeader('household')}
    <main class="page">
      <div class="seg small-seg center-seg">
        <button data-action="mode" data-v="month" class="${view.mode === 'month' ? 'on' : ''}">月</button>
        <button data-action="mode" data-v="year" class="${view.mode === 'year' ? 'on' : ''}">年</button>
      </div>
      ${view.mode === 'month' ? monthView() : yearView()}
    </main>`;

  onAction(root, (action, el) => {
    if (action === 'mode') view.mode = el.dataset.v as typeof view.mode;
    if (action === 'select') view.selected = el.dataset.date!;
    if (action === 'month') {
      view.ym = el.dataset.ym!;
      view.mode = 'month';
    }
    if (action === 'prev' || action === 'next') {
      const step = action === 'prev' ? -1 : 1;
      if (view.mode === 'month') view.ym = addMonths(view.ym, step);
      else view.year += step;
    }
    renderHousehold(root);
  });
}
