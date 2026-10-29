import { getState, update } from '../data/store';
import { formatYm, monthOf, todayYmd } from '../lib/date';
import { bankIdOf, currentBalance, payoffMonth, paymentDate } from '../logic/debts';
import { askNumber, confirmDialog, toast } from '../ui/dialog';
import { esc, yen } from '../ui/format';
import { icon, subHeader } from '../ui/layout';

// 負債画面: プルダウンで借入先を選び、残債と詳細を見る

let selectedId = '';

export function renderDebt(root: HTMLElement, id?: string) {
  const state = getState();
  const today = todayYmd();
  if (id) selectedId = id;
  const debt = state.debts.find((d) => d.id === selectedId) ?? state.debts[0];
  const balances = state.debts.map((d) => currentBalance(state, d, today));
  const totalBalance = balances.reduce((s, b) => s + b, 0);
  const totalMonthly = state.debts.reduce((s, d) => s + (currentBalance(state, d, today) > 0 ? d.monthly : 0), 0);

  let detail = '<p class="muted">借入先がありません</p>';
  if (debt) {
    const balance = currentBalance(state, debt, today);
    const paid = Math.max(0, debt.borrowed - balance);
    const rate = debt.borrowed ? Math.min(100, (paid / debt.borrowed) * 100) : 0;
    const bank = state.banks.find((b) => b.id === bankIdOf(state, debt));
    const card = debt.kind === 'card' ? state.cards.find((c) => c.id === debt.cardId) : undefined;
    const payoff = payoffMonth(state, { ...debt, balance, balanceAsOf: today });
    detail = `
      <section class="card">
        <div class="line"><span>残債</span><span class="big ex">${yen(balance)}</span></div>
        <div class="bar ok-bar"><div style="width:${rate}%"></div></div>
        <div class="line muted small"><span>借入 ${yen(debt.borrowed)}</span><span>返済済み ${yen(paid)}</span></div>
      </section>
      <section class="card">
        <div class="line"><span>毎月の返済額</span><span>${yen(debt.monthly)}</span></div>
        <div class="line"><span>返済日</span><span>${Number(paymentDate(state, debt, monthOf(today)).slice(8))}日${card ? `（${esc(card.short)}の引き落とし日）` : ''}</span></div>
        <div class="line"><span>引き落とし</span><span>${esc(bank?.name ?? '—')}</span></div>
        <div class="line"><span>金利（年）</span><span>${debt.rate !== undefined ? `${debt.rate}%` : '—'}</span></div>
        <div class="line"><span>完済予定（目安）</span><span>${payoff ? formatYm(payoff) : '—'}</span></div>
      </section>
      <p class="muted small">残債は返済日ごとに自動で減ります。利息の分などでずれたら「残債を直す」で正しい数字にしてください。</p>
      <div class="btn-row">
        <button class="btn" data-fix>残債を直す</button>
        <a class="btn" href="#/debt/edit/${debt.id}">編集</a>
        <button class="btn danger" data-delete>削除</button>
      </div>`;
  }

  root.innerHTML = `
    ${subHeader('負債', '#/fixed')}
    <main class="page">
      <section class="card">
        <div class="line"><span>残債の合計</span><span class="big ex">${yen(totalBalance)}</span></div>
        <div class="line muted small"><span>毎月の返済 合計</span><span>${yen(totalMonthly)}</span></div>
      </section>
      <label class="select-wrap">
        <select data-select>
          ${state.debts.map((d, i) => `<option value="${d.id}" ${d.id === debt?.id ? 'selected' : ''}>${esc(d.name)}（残 ${yen(balances[i])}）</option>`).join('')}
          <option value="__new">＋ 借入先を追加</option>
        </select>
        ${icon('chevron-down', 'select-icon')}
      </label>
      ${detail}
      <a href="#/debt/installment" class="btn block accent-outline">${icon('plus', 'tiny')} 分割払いを追加</a>
    </main>`;

  root.querySelector<HTMLSelectElement>('[data-select]')!.onchange = (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (v === '__new') location.hash = '#/debt/edit/new';
    else location.hash = `#/debt/${v}`;
  };

  root.querySelector('[data-fix]')?.addEventListener('click', async () => {
    if (!debt) return;
    const v = await askNumber(`${debt.name}の今の残債`, currentBalance(state, debt, today), '明細やアプリで確認した金額を入れてください');
    if (v === null) return;
    update(() => {
      debt.balance = v;
      debt.balanceAsOf = today;
    });
    toast('残債を直しました');
  });

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!debt || !(await confirmDialog(`「${debt.name}」を削除しますか？`, '削除', true))) return;
    update((s) => (s.debts = s.debts.filter((d) => d.id !== debt.id)));
    selectedId = '';
    location.hash = '#/debt';
  });
}
