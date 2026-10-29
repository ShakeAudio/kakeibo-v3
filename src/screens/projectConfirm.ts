import { getState, newId, update } from '../data/store';
import { suggestProject, unassignedTitles } from '../logic/business';
import { askText, toast } from '../ui/dialog';
import { esc } from '../ui/format';

// 新しく出てきたカレンダーのタイトルを案件に紐づける確認。事業ページと案件ページの両方で使う

export function pendingTitlesHtml(): string {
  const state = getState();
  return unassignedTitles(state)
    .map((title) => {
      const s = suggestProject(state, title);
      return `
        <div class="card confirm">
          ${s ? `「${esc(title)}」は <b>${esc(s.name)}</b> の続きですか？` : `「${esc(title)}」はどの案件ですか？`}
          <div class="btn-row">
            ${
              s
                ? `<button class="btn primary" data-action="link" data-title="${esc(title)}" data-project="${s.id}">はい</button>`
                : `<select data-action-select="link" data-title="${esc(title)}">
                     <option value="">既存の案件を選ぶ</option>
                     ${state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
                   </select>`
            }
            <button class="btn" data-action="new-project" data-title="${esc(title)}">新しい案件</button>
          </div>
        </div>`;
    })
    .join('');
}

export function linkTitle(title: string, projectId: string) {
  update((s) => s.projects.find((p) => p.id === projectId)?.titles.push(title));
  toast('案件に紐づけました');
}

export async function newProjectFromTitle(title: string) {
  const name = await askText('新しい案件の名前', title.split(/[\s　]+/)[0] ?? title, '取引先はあとで案件ページから変えられます');
  if (!name) return;
  update((s) => s.projects.push({ id: newId('p'), name, clientId: s.clients[0]?.id ?? '', titles: [title] }));
  toast('案件を作りました');
}

/** 案件確認まわりのボタンを処理する。処理したら true */
export function handleConfirmAction(action: string, el: HTMLElement): boolean {
  if (action === 'link') {
    linkTitle(el.dataset.title!, el.dataset.project!);
    return true;
  }
  if (action === 'new-project') {
    newProjectFromTitle(el.dataset.title!);
    return true;
  }
  return false;
}

export function bindConfirmSelects(root: HTMLElement) {
  root.querySelectorAll<HTMLSelectElement>('[data-action-select="link"]').forEach((sel) => {
    sel.onchange = () => sel.value && linkTitle(sel.dataset.title!, sel.value);
  });
}
