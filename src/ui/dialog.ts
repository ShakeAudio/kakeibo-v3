import { esc } from './format';

// 数字や文字を1つだけ入力してもらう小さなダイアログと、画面下に出る短いお知らせ

/**
 * ダイアログを開き、押されたボタンの値（ok / cancel）を返す。
 * close イベントが届かない環境があるため、ボタンのクリックで直接閉じる
 */
function openDialog(inner: string, onOk?: (dialog: HTMLDialogElement) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.innerHTML = `<form class="dialog-body">${inner}</form>`;
    document.body.appendChild(dialog);

    const finish = (ok: boolean) => {
      if (ok) onOk?.(dialog);
      dialog.close();
      dialog.remove();
      resolve(ok);
    };
    dialog.querySelector('form')!.onsubmit = (e) => {
      e.preventDefault();
      finish(true);
    };
    dialog.querySelector('[data-cancel]')!.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    dialog.showModal();
  });
}

const actions = (okLabel: string, okClass: string) => `
  <div class="dialog-actions">
    <button type="button" class="btn" data-cancel>やめる</button>
    <button type="submit" class="btn ${okClass}">${esc(okLabel)}</button>
  </div>`;

export function askNumber(title: string, value: number | undefined, note = ''): Promise<number | null> {
  return askText(title, value === undefined ? '' : String(value), note, true).then((v) =>
    v === null || v.trim() === '' ? null : Number(v.replace(/[^\d.]/g, '')),
  );
}

export function askText(title: string, value: string, note = '', numeric = false, secret = false): Promise<string | null> {
  let result = '';
  const opened = openDialog(
    `<p class="dialog-title">${esc(title)}</p>
     ${note ? `<p class="muted small">${esc(note)}</p>` : ''}
     <input name="v" type="${secret ? 'password' : 'text'}" value="${esc(value)}" ${numeric ? 'inputmode="numeric" pattern="[0-9.]*"' : ''} autocomplete="off" />
     ${actions('決定', 'primary')}`,
    (dialog) => (result = dialog.querySelector('input')!.value),
  );
  const input = document.querySelector<HTMLInputElement>('dialog[open] input');
  input?.focus();
  input?.select();
  return opened.then((ok) => (ok ? result : null));
}

export function confirmDialog(message: string, okLabel = 'OK', danger = false): Promise<boolean> {
  return openDialog(`<p class="dialog-title">${esc(message)}</p>${actions(okLabel, danger ? 'danger' : 'primary')}`);
}

export function toast(message: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
