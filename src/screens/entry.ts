import { newId, update } from '../data/store';
import type { Transaction } from '../data/types';
import { todayYmd, weekdayJa } from '../lib/date';
import { toast } from '../ui/dialog';
import { yen } from '../ui/format';
import { icon, onAction } from '../ui/layout';

// 現金・エポスの入力（全画面テンキー）

const form = { source: 'cash' as 'cash' | 'epos', kind: 'expense' as Transaction['kind'], date: todayYmd(), digits: '' };

export function resetEntry() {
  form.source = 'cash';
  form.kind = 'expense';
  form.date = todayYmd();
  form.digits = '';
}

export function renderEntry(root: HTMLElement) {
  const isEpos = form.source === 'epos';
  const kind = isEpos ? 'expense' : form.kind;
  const amount = Number(form.digits || 0);

  root.innerHTML = `
    <div class="entry">
      <header class="sub-header">
        <a href="#/budget" class="icon-btn" aria-label="閉じる">${icon('x')}</a>
        <h1>入力</h1>
        <div class="sub-right"></div>
      </header>
      <div class="seg big-seg">
        <button data-action="source" data-v="cash" class="${!isEpos ? 'on' : ''}">現金</button>
        <button data-action="source" data-v="epos" class="${isEpos ? 'on' : ''}">エポス</button>
      </div>
      ${
        isEpos
          ? '<p class="muted small center">エポスは事業の経費（支出のみ）</p>'
          : `<div class="seg big-seg">
              <button data-action="kind" data-v="expense" class="${kind === 'expense' ? 'on ex-on' : ''}">支出</button>
              <button data-action="kind" data-v="income" class="${kind === 'income' ? 'on' : ''}">収入</button>
            </div>`
      }
      <label class="date-row">${icon('calendar')}
        <input type="date" value="${form.date}" data-field="date" />
        <span>（${weekdayJa(form.date)}）</span>
      </label>
      <div class="amount ${kind === 'expense' ? 'ex' : 'in'}">¥ ${yen(amount)}</div>
      <div class="keypad">
        ${['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0'].map((k) => `<button data-action="key" data-v="${k}">${k}</button>`).join('')}
        <button data-action="back" aria-label="1文字消す">${icon('backspace')}</button>
      </div>
      <button class="btn primary block" data-action="save">保存</button>
    </div>`;

  root.querySelector<HTMLInputElement>('[data-field="date"]')!.onchange = (e) => {
    form.date = (e.target as HTMLInputElement).value || todayYmd();
    renderEntry(root);
  };

  onAction(root, (action, el) => {
    const v = el.dataset.v!;
    if (action === 'source') form.source = v as typeof form.source;
    if (action === 'kind') form.kind = v as Transaction['kind'];
    if (action === 'key' && form.digits.length < 9) form.digits = (form.digits + v).replace(/^0+/, '');
    if (action === 'back') form.digits = form.digits.slice(0, -1);
    if (action === 'save') {
      if (!amount) return toast('金額を入れてください');
      update((s) => s.transactions.push({ id: newId('t'), date: form.date, amount, kind, source: form.source }));
      toast(`${isEpos ? 'エポス' : '現金'}の${kind === 'expense' ? '支出' : '収入'} ${yen(amount)} を保存しました`);
      resetEntry();
      location.hash = '#/budget';
      return;
    }
    renderEntry(root);
  });
}
