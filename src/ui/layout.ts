import { esc } from './format';

// どの画面でも使う部品（上部の切り替え・戻るつきの見出し・アイコン）

export type MainTab = 'budget' | 'household' | 'business';

const TABS: { id: MainTab; label: string }[] = [
  { id: 'budget', label: '予算' },
  { id: 'household', label: '家計' },
  { id: 'business', label: '事業' },
];

// オフラインでも表示できるよう、使うアイコンだけを SVG で持つ（Tabler Icons の形を参考）
const ICONS: Record<string, string> = {
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-up': '<path d="M6 15l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  backspace: '<path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><path d="M12 10l4 4m0-4l-4 4"/>',
  pencil: '<path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4"/><path d="M13.5 6.5l4 4"/>',
  settings:
    '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>',
};

export function icon(name: string, extra = ''): string {
  return `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

/** 予算 / 家計 / 事業 の切り替えと歯車 */
export function mainHeader(active: MainTab): string {
  return `
    <header class="main-header">
      <nav class="seg grow">
        ${TABS.map((t) => `<a href="#/${t.id}" class="${t.id === active ? 'on' : ''}">${t.label}</a>`).join('')}
      </nav>
      <a href="#/settings" class="icon-btn" aria-label="設定">${icon('settings')}</a>
    </header>`;
}

/** 戻るボタンつきの見出し。right にはボタンなどを入れる */
export function subHeader(title: string, back: string, right = ''): string {
  return `
    <header class="sub-header">
      <a href="${back}" class="icon-btn" aria-label="戻る">${icon('chevron-left')}</a>
      <h1>${esc(title)}</h1>
      <div class="sub-right">${right}</div>
    </header>`;
}

/** ‹ 2026年10月 › のような期間の移動 */
export function periodNav(label: string): string {
  return `
    <div class="period-nav">
      <button class="icon-btn" data-action="prev" aria-label="前へ">${icon('chevron-left')}</button>
      <span>${esc(label)}</span>
      <button class="icon-btn" data-action="next" aria-label="次へ">${icon('chevron-right')}</button>
    </div>`;
}

/** data-action を持つ要素のクリックをまとめて受け取る */
export function onAction(root: HTMLElement, handler: (action: string, el: HTMLElement) => void) {
  root.onclick = (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (el && root.contains(el)) handler(el.dataset.action!, el);
  };
}
