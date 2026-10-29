import { getState, update } from '../data/store';
import type { Project } from '../data/types';
import { eachDay, formatMd, todayYmd } from '../lib/date';
import { workDaysByKey } from '../logic/business';
import { confirmDialog } from '../ui/dialog';
import { esc } from '../ui/format';
import { icon, onAction, subHeader } from '../ui/layout';
import { bindConfirmSelects, handleConfirmAction, pendingTitlesHtml } from './projectConfirm';

// 案件: 確認待ち・進行中・終了と、紐づく予定のタイトル

let openId = '';

function titleDays(title: string): number {
  const state = getState();
  const cancels = new Set(state.events.filter((e) => e.kind === 'cancel').flatMap((e) => eachDay(e.start, e.end)));
  const days = new Set(state.events.filter((e) => e.kind === 'work' && e.title === title).flatMap((e) => eachDay(e.start, e.end)));
  return [...days].filter((d) => !cancels.has(d)).length;
}

function projectItem(p: Project, days: string[]): string {
  const state = getState();
  const client = state.clients.find((c) => c.id === p.clientId);
  const isOpen = p.id === openId;
  const period = days.length ? `${formatMd(days[0])}〜${formatMd(days[days.length - 1])}・${days.length}日` : '予定なし';
  return `
    <button class="item" data-action="open" data-id="${p.id}">
      <span>${esc(p.name)}<br><span class="muted small">${esc(client?.name ?? '取引先なし')}・${period}</span></span>
      ${icon(isOpen ? 'chevron-up' : 'chevron-down', 'tiny muted')}
    </button>
    ${
      isOpen
        ? `<div class="item-detail">
            <label class="field-label">取引先
              <select data-client="${p.id}">${state.clients.map((c) => `<option value="${c.id}" ${c.id === p.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
            </label>
            <span class="field-label">紐づく予定</span>
            ${p.titles
              .map(
                (t) => `<div class="line"><span>${esc(t)} <span class="muted small">${titleDays(t)}日</span></span>
                  <button class="text-btn small danger-text" data-action="unlink" data-id="${p.id}" data-title="${esc(t)}">外す</button></div>`,
              )
              .join('')}
          </div>`
        : ''
    }`;
}

export function renderProjects(root: HTMLElement) {
  const state = getState();
  const today = todayYmd();
  const byKey = workDaysByKey(state);
  const withDays = state.projects.map((p) => ({ p, days: [...(byKey.get(p.id) ?? [])].sort() }));
  const active = withDays.filter(({ days }) => !days.length || days[days.length - 1] >= today);
  const done = withDays.filter(({ days }) => days.length && days[days.length - 1] < today).reverse();
  const pending = pendingTitlesHtml();

  root.innerHTML = `
    ${subHeader('案件', '#/settings')}
    <main class="page">
      ${pending ? `<h3 class="group-title">確認待ち</h3>${pending}` : ''}
      <h3 class="group-title">進行中・これから</h3>
      <div class="group">${active.map(({ p, days }) => projectItem(p, days)).join('') || '<div class="item muted">ありません</div>'}</div>
      <h3 class="group-title">終了</h3>
      <div class="group">${done.map(({ p, days }) => projectItem(p, days)).join('') || '<div class="item muted">ありません</div>'}</div>
      <p class="muted small">期間はすべての予定（地方公演を含む）の最初と最後の日。休演日は日数から除いています。</p>
    </main>`;

  bindConfirmSelects(root);
  root.querySelectorAll<HTMLSelectElement>('[data-client]').forEach((sel) => {
    sel.onchange = () => update((s) => s.projects.find((p) => p.id === sel.dataset.client)!.clientId = sel.value);
  });

  onAction(root, async (action, el) => {
    if (handleConfirmAction(action, el)) return;
    if (action === 'open') {
      openId = openId === el.dataset.id ? '' : el.dataset.id!;
      renderProjects(root);
    }
    if (action === 'unlink') {
      const title = el.dataset.title!;
      if (!(await confirmDialog(`「${title}」をこの案件から外しますか？`, '外す'))) return;
      update((s) => {
        const p = s.projects.find((x) => x.id === el.dataset.id)!;
        p.titles = p.titles.filter((t) => t !== title);
      });
    }
  });
}
