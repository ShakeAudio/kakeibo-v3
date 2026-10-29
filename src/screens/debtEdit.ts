import { getState, newId, update } from '../data/store';
import type { Debt } from '../data/types';
import { todayYmd } from '../lib/date';
import { currentBalance } from '../logic/debts';
import { toast } from '../ui/dialog';
import { esc } from '../ui/format';
import { subHeader } from '../ui/layout';

// 借入先の追加・編集

export function renderDebtEdit(root: HTMLElement, id: string) {
  const state = getState();
  const today = todayYmd();
  const existing = state.debts.find((d) => d.id === id);
  const balance = existing ? currentBalance(state, existing, today) : 0;
  const isCard = existing?.kind === 'card';

  root.innerHTML = `
    ${subHeader(existing ? '借入先を編集' : '借入先を追加', existing ? `#/debt/${existing.id}` : '#/debt', '<button class="text-btn" form="debt-form">保存</button>')}
    <main class="page">
      <form id="debt-form" class="form">
        <label>名前<input name="name" value="${esc(existing?.name ?? '')}" required /></label>
        <fieldset>
          <legend>種類</legend>
          <label class="inline"><input type="radio" name="kind" value="loan" ${!isCard ? 'checked' : ''} /> ローン（口座から返済）</label>
          <label class="inline"><input type="radio" name="kind" value="card" ${isCard ? 'checked' : ''} /> カードの分割（カードの引き落とし日に返済）</label>
          <label>銀行（ローンのとき）
            <select name="bankId">${state.banks.map((b) => `<option value="${b.id}" ${existing?.kind === 'loan' && existing.bankId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          </label>
          <label>返済日（ローンのとき）<input name="payDay" inputmode="numeric" value="${existing?.kind === 'loan' ? existing.payDay : 27}" /></label>
          <label>カード（分割のとき）
            <select name="cardId">${state.cards.map((c) => `<option value="${c.id}" ${existing?.kind === 'card' && existing.cardId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          </label>
        </fieldset>
        <label>借入額<input name="borrowed" inputmode="numeric" value="${existing?.borrowed ?? ''}" /></label>
        <label>今の残債<input name="balance" inputmode="numeric" value="${existing ? balance : ''}" required /></label>
        <label>毎月の返済額<input name="monthly" inputmode="numeric" value="${existing?.monthly ?? ''}" required /></label>
        <label>金利（年 %・わかれば）<input name="rate" inputmode="decimal" value="${existing?.rate ?? ''}" /></label>
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#debt-form')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const num = (k: string) => Number(String(data.get(k) ?? '').replace(/[^\d.]/g, ''));
    const base = {
      id: existing?.id ?? newId('d'),
      name: String(data.get('name')).trim(),
      borrowed: num('borrowed') || num('balance'),
      balance: num('balance'),
      balanceAsOf: today,
      monthly: num('monthly'),
      rate: String(data.get('rate') ?? '').trim() ? num('rate') : undefined,
    };
    const debt: Debt =
      data.get('kind') === 'card'
        ? { ...base, kind: 'card', cardId: String(data.get('cardId')) }
        : { ...base, kind: 'loan', bankId: String(data.get('bankId')), payDay: Math.min(31, Math.max(1, num('payDay') || 1)) };
    if (!debt.name || !debt.monthly) return toast('名前と毎月の返済額を入れてください');
    update((s) => {
      const i = s.debts.findIndex((d) => d.id === debt.id);
      i >= 0 ? (s.debts[i] = debt) : s.debts.push(debt);
    });
    toast('保存しました');
    location.hash = `#/debt/${debt.id}`;
  };
}
