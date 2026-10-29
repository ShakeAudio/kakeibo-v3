export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 128400 → "128,400" */
export function yen(n: number): string {
  return Math.round(n).toLocaleString('ja-JP');
}

/** 符号つき: +418,000 / −3,200 */
export function signed(n: number): string {
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${yen(Math.abs(n))}`;
}

/** カレンダー用: 10万以上は「10.2万」に縮める */
export function compact(n: number): string {
  return n >= 100000 ? `${(Math.floor(n / 1000) / 10).toFixed(1)}万` : yen(n);
}
