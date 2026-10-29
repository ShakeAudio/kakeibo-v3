import { getState, newId, update } from '../data/store';
import type { Client } from '../data/types';
import { todayYmd } from '../lib/date';
import { billings } from '../logic/business';
import { confirmDialog, toast } from '../ui/dialog';
import { esc, yen } from '../ui/format';
import { icon, subHeader } from '../ui/layout';

// 取引先の一覧と編集

function terms(c: Client): string {
  const pay = `${c.payMonthOffset === 1 ? '翌月' : c.payMonthOffset === 2 ? '翌々月' : `${c.payMonthOffset}か月後`}${c.payDay === 'end' ? '末' : `${c.payDay}日`}払い`;
  return c.billing === 'project' ? `案件まとめて・${pay}` : `${c.closingDay === 'end' ? '月末' : `${c.closingDay}日`}締め・${pay}`;
}

export function renderClients(root: HTMLElement) {
  const state = getState();
  root.innerHTML = `
    ${subHeader('取引先', '#/settings', `<a href="#/settings/client/new" class="icon-btn accent" aria-label="取引先を追加">${icon('plus')}</a>`)}
    <main class="page">
      <div class="group">
        ${state.clients
          .map((c) => `<a class="item" href="#/settings/client/${c.id}"><span>${esc(c.name)}<br><span class="muted small">${terms(c)}</span></span>${icon('chevron-right', 'tiny muted')}</a>`)
          .join('')}
      </div>
    </main>`;
}

const dayOptions = (selected: number | 'end') =>
  [...Array.from({ length: 28 }, (_, i) => i + 1), 'end' as const]
    .map((d) => `<option value="${d}" ${d === selected ? 'selected' : ''}>${d === 'end' ? '末日' : `${d}日`}</option>`)
    .join('');

export function renderClientEdit(root: HTMLElement, id: string) {
  const state = getState();
  const existing = state.clients.find((c) => c.id === id);
  const c: Client = existing ?? { id: newId('c'), name: '', billing: 'project', closingDay: 'end', payMonthOffset: 1, payDay: 'end' };
  const projects = state.projects.filter((p) => p.clientId === c.id);
  const status = new Map(billings(state, todayYmd()).map((b) => [b.id, b.status]));

  root.innerHTML = `
    ${subHeader(existing ? '取引先を編集' : '取引先を追加', '#/settings/clients', '<button class="text-btn" form="client-form">保存</button>')}
    <main class="page">
      <form id="client-form" class="form">
        <label>名前<input name="name" value="${esc(c.name)}" required /></label>
        <fieldset>
          <legend>請求方式</legend>
          <label class="inline"><input type="radio" name="billing" value="project" ${c.billing === 'project' ? 'checked' : ''} /> 案件まとめて（案件の最終日の翌日に請求）</label>
          <label class="inline"><input type="radio" name="billing" value="monthly" ${c.billing === 'monthly' ? 'checked' : ''} /> 月締め</label>
          <label>締め日（月締めのみ）<select name="closingDay">${dayOptions(c.closingDay)}</select></label>
        </fieldset>
        <fieldset>
          <legend>支払条件</legend>
          <label>支払月
            <select name="payMonthOffset">${[1, 2, 3].map((n) => `<option value="${n}" ${n === c.payMonthOffset ? 'selected' : ''}>${['翌月', '翌々月', '3か月後'][n - 1]}</option>`).join('')}</select>
          </label>
          <label>支払日<select name="payDay">${dayOptions(c.payDay)}</select></label>
        </fieldset>
        <label>日当（空欄なら共通の日当）<input name="dayRate" inputmode="numeric" value="${c.dayRate ?? ''}" /></label>
        ${
          projects.length
            ? `<div><span class="field-label">この取引先の案件</span><div class="group">${projects
                .map((p) => {
                  const st = status.get(`p:${p.id}`);
                  return `<div class="item"><span>${esc(p.name)}</span><span class="muted small">${st === 'scheduled' ? '進行中' : st === 'paid' ? '入金済み' : st ? '請求済' : ''}</span></div>`;
                })
                .join('')}</div></div>`
            : ''
        }
        ${existing ? '<button type="button" class="btn danger block" data-delete>この取引先を削除</button>' : ''}
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#client-form')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const day = (k: string) => (data.get(k) === 'end' ? 'end' : Number(data.get(k)));
    const rate = Number(String(data.get('dayRate') ?? '').replace(/[^\d]/g, ''));
    const next: Client = {
      id: c.id,
      name: String(data.get('name')).trim(),
      billing: data.get('billing') === 'monthly' ? 'monthly' : 'project',
      closingDay: day('closingDay'),
      payMonthOffset: Number(data.get('payMonthOffset')),
      payDay: day('payDay'),
      dayRate: rate || undefined,
    };
    if (!next.name) return toast('名前を入れてください');
    update((s) => {
      const i = s.clients.findIndex((x) => x.id === c.id);
      i >= 0 ? (s.clients[i] = next) : s.clients.push(next);
    });
    toast(`保存しました（日当 ${next.dayRate ? yen(next.dayRate) : '共通'}）`);
    location.hash = '#/settings/clients';
  };

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (projects.length) return toast('案件が紐づいている取引先は削除できません');
    if (!(await confirmDialog(`「${c.name}」を削除しますか？`, '削除', true))) return;
    update((s) => (s.clients = s.clients.filter((x) => x.id !== c.id)));
    location.hash = '#/settings/clients';
  });
}
