import { getState, newId, update } from '../data/store';
import { addMonths, formatMd, formatYm, todayYmd } from '../lib/date';
import { dueDate, dueMonthFor } from '../logic/cards';
import { askNumber, toast } from '../ui/dialog';
import { esc, yen } from '../ui/format';
import { icon, onAction } from '../ui/layout';

// 分割払いを追加: カード・利用日・金額・回数から毎月の支払額と完済予定を出す

const COUNTS = [3, 12, 24, 36];
const form = { cardId: '', date: todayYmd(), amount: 0, count: 12, monthly: 0 as number | null };

export function renderInstallment(root: HTMLElement) {
  const state = getState();
  if (!form.cardId) form.cardId = state.cards[0]?.id ?? '';
  const card = state.cards.find((c) => c.id === form.cardId);
  const auto = form.count ? Math.ceil(form.amount / form.count) : 0;
  const monthly = form.monthly || auto;
  const firstMonth = card ? dueMonthFor(card, form.date) : '';
  const first = card ? dueDate(card, firstMonth) : '';
  const lastMonth = firstMonth ? addMonths(firstMonth, form.count - 1) : '';
  const bank = state.banks.find((b) => b.id === card?.bankId);
  const custom = !COUNTS.includes(form.count);

  root.innerHTML = `
    <header class="sub-header">
      <a href="#/debt" class="icon-btn" aria-label="閉じる">${icon('x')}</a>
      <h1>分割払いを追加</h1>
      <div class="sub-right"><button class="text-btn" data-action="save">保存</button></div>
    </header>
    <main class="page form">
      <label>カード
        <select data-field="cardId">${state.cards.map((c) => `<option value="${c.id}" ${c.id === form.cardId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      </label>
      <label>利用日<input type="date" data-field="date" value="${form.date}" /></label>
      <label>利用金額<input data-field="amount" inputmode="numeric" value="${form.amount || ''}" placeholder="120000" /></label>
      <div>
        <span class="field-label">回数</span>
        <div class="seg">
          ${COUNTS.map((n) => `<button data-action="count" data-v="${n}" class="${form.count === n ? 'on' : ''}">${n}</button>`).join('')}
          <button data-action="count-other" class="${custom ? 'on' : ''}">${custom ? `${form.count}回` : '他'}</button>
        </div>
      </div>
      <label>毎月の支払額（自動計算・手数料などで違えば直す）
        <input data-field="monthly" inputmode="numeric" value="${monthly || ''}" />
      </label>
      ${
        card && form.amount
          ? `<section class="card">
              <div class="line"><span class="muted">毎月</span><span>${yen(monthly)} × ${form.count}回</span></div>
              <div class="line"><span class="muted">初回の引き落とし</span><span>${first.slice(0, 4)}/${formatMd(first)}（${esc(bank?.short ?? '')}）</span></div>
              <div class="line"><span class="muted">完済予定</span><span>${formatYm(lastMonth)}</span></div>
            </section>`
          : ''
      }
      <p class="muted small">保存すると負債・固定費・予算ページの銀行の行に反映されます。分割で買ったものは＋の入力（1回払い）には入れないでください。</p>
    </main>`;

  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]').forEach((input) => {
    input.onchange = () => {
      const key = input.dataset.field!;
      const raw = input.value;
      if (key === 'cardId') form.cardId = raw;
      if (key === 'date') form.date = raw || todayYmd();
      if (key === 'amount') {
        form.amount = Number(raw.replace(/[^\d]/g, ''));
        form.monthly = null;
      }
      if (key === 'monthly') form.monthly = Number(raw.replace(/[^\d]/g, '')) || null;
      renderInstallment(root);
    };
  });

  onAction(root, async (action, el) => {
    if (action === 'count') {
      form.count = Number(el.dataset.v);
      form.monthly = null;
    }
    if (action === 'count-other') {
      const v = await askNumber('回数', form.count);
      if (v && v > 0) {
        form.count = Math.round(v);
        form.monthly = null;
      }
    }
    if (action === 'save') {
      if (!card || !form.amount || !monthly) return toast('カード・利用金額・回数を入れてください');
      update((s) =>
        s.debts.push({
          id: newId('d'),
          name: `${card.name} 分割（${formatMd(form.date)}）`,
          kind: 'card',
          cardId: card.id,
          borrowed: form.amount,
          balance: form.amount,
          balanceAsOf: form.date,
          monthly,
          firstPayment: first,
        }),
      );
      toast('分割払いを追加しました');
      form.amount = 0;
      form.monthly = null;
      location.hash = '#/debt';
      return;
    }
    renderInstallment(root);
  });
}
