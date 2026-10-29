import { getState, newId, update } from '../data/store';
import type { Bank, Card, State } from '../data/types';
import { confirmDialog, toast } from '../ui/dialog';
import { esc } from '../ui/format';
import { icon, subHeader } from '../ui/layout';

// カード・銀行の一覧と、追加・編集・削除

function cardTerms(c: Card): string {
  const offset = c.payMonthOffset === 1 ? '翌月' : c.payMonthOffset === 2 ? '翌々月' : `${c.payMonthOffset}か月後`;
  return `${c.closingDay === 'end' ? '月末' : `${c.closingDay}日`}締め・${offset}${c.payDay}日払い`;
}

export function renderCards(root: HTMLElement) {
  const state = getState();
  const bankName = (id: string) => state.banks.find((b) => b.id === id)?.short ?? '未設定';
  const chevron = icon('chevron-right', 'tiny muted');

  root.innerHTML = `
    ${subHeader('カード・銀行', '#/settings')}
    <main class="page">
      <h3 class="group-title split"><span>カード</span><a href="#/settings/card/new" class="small">${icon('plus', 'tiny')} 追加</a></h3>
      <div class="group">
        ${state.cards
          .map(
            (c) => `<a class="item" href="#/settings/card/${c.id}">
              <span>${esc(c.name)}<br><span class="muted small">${cardTerms(c)}</span></span>
              <span class="muted small">${esc(bankName(c.bankId))} ${chevron}</span></a>`,
          )
          .join('') || '<div class="item muted">カードがありません</div>'}
      </div>
      <h3 class="group-title split"><span>銀行</span><a href="#/settings/bank/new" class="small">${icon('plus', 'tiny')} 追加</a></h3>
      <div class="group">
        ${state.banks
          .map(
            (b) => `<a class="item" href="#/settings/bank/${b.id}">
              <span>${esc(b.name)}</span>
              <span class="muted small">${b.id === state.settings.incomeBankId ? '事業の入金先 ' : ''}${chevron}</span></a>`,
          )
          .join('') || '<div class="item muted">銀行がありません</div>'}
      </div>
      <p class="muted small">引き落とし日が土日祝のときは翌営業日で計算します。予算ページの銀行の行は、ここに登録した銀行ごとに出ます。</p>
    </main>`;
}

/** 削除できない理由（使われている場所）。なければ空 */
function cardUsage(state: State, id: string): string[] {
  const uses: string[] = [];
  if (state.settings.livingCardId === id) uses.push('生活費のカード');
  state.fixedCosts.filter((f) => f.payment.type === 'card' && f.payment.cardId === id).forEach((f) => uses.push(`固定費「${f.name}」`));
  state.debts.filter((d) => d.kind === 'card' && d.cardId === id).forEach((d) => uses.push(`負債「${d.name}」`));
  if (state.transactions.some((t) => t.source === id)) uses.push('入力済みの明細');
  return uses;
}

function bankUsage(state: State, id: string): string[] {
  const uses: string[] = [];
  if (state.settings.incomeBankId === id) uses.push('事業の入金先');
  state.cards.filter((c) => c.bankId === id).forEach((c) => uses.push(`カード「${c.name}」`));
  state.fixedCosts.filter((f) => f.payment.type === 'bank' && f.payment.bankId === id).forEach((f) => uses.push(`固定費「${f.name}」`));
  state.debts.filter((d) => d.kind === 'loan' && d.bankId === id).forEach((d) => uses.push(`負債「${d.name}」`));
  return uses;
}

const dayOptions = (selected: number | 'end', withEnd: boolean) =>
  [...Array.from({ length: withEnd ? 28 : 31 }, (_, i) => i + 1), ...(withEnd ? ['end' as const] : [])]
    .map((d) => `<option value="${d}" ${d === selected ? 'selected' : ''}>${d === 'end' ? '末日' : `${d}日`}</option>`)
    .join('');

async function confirmDelete(name: string, uses: string[]): Promise<boolean> {
  if (uses.length) {
    toast(`${uses.slice(0, 2).join('・')}${uses.length > 2 ? ' など' : ''}で使っているため削除できません`);
    return false;
  }
  return confirmDialog(`「${name}」を削除しますか？`, '削除', true);
}

export function renderCardEdit(root: HTMLElement, id: string) {
  const state = getState();
  const existing = state.cards.find((c) => c.id === id);
  const c: Card = existing ?? { id: newId('card'), name: '', short: '', closingDay: 'end', payMonthOffset: 1, payDay: 27, bankId: state.banks[0]?.id ?? '' };

  root.innerHTML = `
    ${subHeader(existing ? 'カードを編集' : 'カードを追加', '#/settings/cards', '<button class="text-btn" form="card-form">保存</button>')}
    <main class="page">
      <form id="card-form" class="form">
        <label>名前<input name="name" value="${esc(c.name)}" placeholder="楽天カード" required /></label>
        <label>短い名前（予算ページなどに出す）<input name="short" value="${esc(c.short)}" placeholder="楽天" /></label>
        <label>締め日<select name="closingDay">${dayOptions(c.closingDay, true)}</select></label>
        <label>支払月
          <select name="payMonthOffset">${[1, 2].map((n) => `<option value="${n}" ${n === c.payMonthOffset ? 'selected' : ''}>${n === 1 ? '翌月' : '翌々月'}</option>`).join('')}</select>
        </label>
        <label>引き落とし日<select name="payDay">${dayOptions(c.payDay, false)}</select></label>
        <label>引き落とし銀行
          <select name="bankId">${state.banks.map((b) => `<option value="${b.id}" ${b.id === c.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        </label>
        ${existing ? '<button type="button" class="btn danger block" data-delete>このカードを削除</button>' : ''}
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#card-form')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name')).trim();
    if (!name) return toast('名前を入れてください');
    if (!data.get('bankId')) return toast('先に銀行を追加してください');
    const next: Card = {
      id: c.id,
      name,
      short: String(data.get('short')).trim() || name.replace(/カード$/, ''),
      closingDay: data.get('closingDay') === 'end' ? 'end' : Number(data.get('closingDay')),
      payMonthOffset: Number(data.get('payMonthOffset')),
      payDay: Number(data.get('payDay')),
      bankId: String(data.get('bankId')),
    };
    update((s) => {
      const i = s.cards.findIndex((x) => x.id === c.id);
      i >= 0 ? (s.cards[i] = next) : s.cards.push(next);
    });
    toast('保存しました');
    location.hash = '#/settings/cards';
  };

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!(await confirmDelete(c.name, cardUsage(state, c.id)))) return;
    update((s) => (s.cards = s.cards.filter((x) => x.id !== c.id)));
    location.hash = '#/settings/cards';
  });
}

export function renderBankEdit(root: HTMLElement, id: string) {
  const state = getState();
  const existing = state.banks.find((b) => b.id === id);
  const b: Bank = existing ?? { id: newId('bank'), name: '', short: '' };
  const isIncome = state.settings.incomeBankId === b.id;

  root.innerHTML = `
    ${subHeader(existing ? '銀行を編集' : '銀行を追加', '#/settings/cards', '<button class="text-btn" form="bank-form">保存</button>')}
    <main class="page">
      <form id="bank-form" class="form">
        <label>名前<input name="name" value="${esc(b.name)}" placeholder="楽天銀行" required /></label>
        <label>短い名前（予算ページの行に出す）<input name="short" value="${esc(b.short)}" placeholder="楽天" /></label>
        <label class="inline"><input type="checkbox" name="income" ${isIncome ? 'checked' : ''} /> 事業の入金先にする</label>
        ${existing ? '<button type="button" class="btn danger block" data-delete>この銀行を削除</button>' : ''}
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#bank-form')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name')).trim();
    if (!name) return toast('名前を入れてください');
    const next: Bank = { id: b.id, name, short: String(data.get('short')).trim() || name.replace(/銀行$/, '') };
    update((s) => {
      const i = s.banks.findIndex((x) => x.id === b.id);
      i >= 0 ? (s.banks[i] = next) : s.banks.push(next);
      if (data.get('income')) s.settings.incomeBankId = b.id;
    });
    toast('保存しました');
    location.hash = '#/settings/cards';
  };

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!(await confirmDelete(b.name, bankUsage(state, b.id)))) return;
    update((s) => (s.banks = s.banks.filter((x) => x.id !== b.id)));
    location.hash = '#/settings/cards';
  });
}
