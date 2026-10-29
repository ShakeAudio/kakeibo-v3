import { getConnection, setConnection } from '../data/connection';
import { esc } from '../ui/format';
import { toast } from '../ui/dialog';

// 公開版で、GAS の URL と合言葉が入るまで出す画面。これが入るまで家計簿の中身は表示しない

export function renderSetup(root: HTMLElement, onDone: () => void) {
  const conn = getConnection();
  root.innerHTML = `
    <main class="page setup">
      <h1 class="setup-title">家計簿</h1>
      <p class="muted small">この家計簿は持ち主専用です。使うには、GAS の URL と合言葉を入力してください。入力した内容はこの端末の中だけに保存されます。</p>
      <form id="setup-form" class="form">
        <label>GAS の URL<input name="url" value="${esc(conn.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" required /></label>
        <label>合言葉<input name="token" type="password" autocomplete="off" required /></label>
        <button class="btn primary block">はじめる</button>
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#setup-form')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const url = String(data.get('url')).trim();
    const token = String(data.get('token')).trim();
    if (!/^https:\/\/script\.google\.com\//.test(url)) return toast('script.google.com の URL を入れてください');
    if (!token) return toast('合言葉を入れてください');
    setConnection({ url, token });
    onDone();
  };
}
