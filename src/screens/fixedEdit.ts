import { getState, newId, update } from '../data/store';
import type { FixedCost } from '../data/types';
import { confirmDialog, toast } from '../ui/dialog';
import { esc } from '../ui/format';
import { subHeader } from '../ui/layout';

// 固定費の追加・編集

export function renderFixedEdit(root: HTMLElement, id: string) {
  const state = getState();
  const existing = state.fixedCosts.find((f) => f.id === id);
  const f: FixedCost = existing
    ? structuredClone(existing)
    : { id: newId('f'), name: '', amount: 0, schedule: { type: 'monthly' }, payment: { type: 'bank', bankId: state.banks[0]?.id ?? '', day: 27 } };
  const months = f.schedule.type === 'months' ? f.schedule.months : [];
  const isCard = f.payment.type === 'card';

  root.innerHTML = `
    ${subHeader(existing ? '固定費を編集' : '固定費を追加', '#/fixed', '<button class="text-btn" form="fixed-form">保存</button>')}
    <main class="page">
      <form id="fixed-form" class="form">
        <label>名前<input name="name" value="${esc(f.name)}" required /></label>
        <label>金額<input name="amount" inputmode="numeric" value="${f.amount || ''}" required /></label>
        <fieldset>
          <legend>払う月</legend>
          <label class="inline"><input type="radio" name="schedule" value="monthly" ${f.schedule.type === 'monthly' ? 'checked' : ''} /> 毎月</label>
          <label class="inline"><input type="radio" name="schedule" value="months" ${f.schedule.type === 'months' ? 'checked' : ''} /> 特定の月だけ</label>
          <div class="month-checks">
            ${Array.from({ length: 12 }, (_, i) => i + 1)
              .map((m) => `<label><input type="checkbox" name="m" value="${m}" ${months.includes(m) ? 'checked' : ''} />${m}月</label>`)
              .join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>払い方</legend>
          <label class="inline"><input type="radio" name="pay" value="bank" ${!isCard ? 'checked' : ''} /> 口座から引き落とし</label>
          <label class="inline"><input type="radio" name="pay" value="card" ${isCard ? 'checked' : ''} /> カード払い</label>
          <label>銀行（口座のとき）
            <select name="bankId">${state.banks.map((b) => `<option value="${b.id}" ${f.payment.type === 'bank' && f.payment.bankId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          </label>
          <label>引き落とし日（口座のとき・31で末日）<input name="day" inputmode="numeric" value="${f.payment.type === 'bank' ? (f.payment.day === 'end' ? 31 : f.payment.day) : 27}" /></label>
          <label>カード（カード払いのとき）
            <select name="cardId">${state.cards.map((c) => `<option value="${c.id}" ${f.payment.type === 'card' && f.payment.cardId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          </label>
          <label>カードに請求される日（カード払いのとき）<input name="chargeDay" inputmode="numeric" value="${f.payment.type === 'card' ? f.payment.chargeDay : 1}" /></label>
        </fieldset>
        ${existing ? '<button type="button" class="btn danger block" data-delete>この固定費を削除</button>' : ''}
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#fixed-form')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const num = (k: string) => Number(String(data.get(k) ?? '').replace(/[^\d]/g, ''));
    const checked = data.getAll('m').map(Number);
    const next: FixedCost = {
      id: f.id,
      name: String(data.get('name')).trim(),
      amount: num('amount'),
      schedule: data.get('schedule') === 'months' ? { type: 'months', months: checked } : { type: 'monthly' },
      payment:
        data.get('pay') === 'card'
          ? { type: 'card', cardId: String(data.get('cardId')), chargeDay: Math.min(31, Math.max(1, num('chargeDay') || 1)) }
          : { type: 'bank', bankId: String(data.get('bankId')), day: num('day') >= 31 ? 'end' : Math.max(1, num('day') || 1) },
    };
    if (!next.name || !next.amount) return toast('名前と金額を入れてください');
    if (next.schedule.type === 'months' && !checked.length) return toast('払う月を選んでください');
    update((s) => {
      const i = s.fixedCosts.findIndex((x) => x.id === f.id);
      i >= 0 ? (s.fixedCosts[i] = next) : s.fixedCosts.push(next);
    });
    toast('保存しました');
    location.hash = '#/fixed';
  };

  root.querySelector<HTMLButtonElement>('[data-delete]')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`「${f.name}」を削除しますか？`, '削除', true))) return;
    update((s) => (s.fixedCosts = s.fixedCosts.filter((x) => x.id !== f.id)));
    location.hash = '#/fixed';
  });
}
