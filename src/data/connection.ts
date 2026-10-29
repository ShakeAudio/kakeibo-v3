// GAS の URL と合言葉。プログラムには書かず、この端末の中だけに保存する。
// 家計のデータ（state）とは別の場所に置き、データの書き出しなどに混ざらないようにする

const KEY = 'kakeibo-v3/connection/v1';

export type Connection = { url: string; token: string };

export function getConnection(): Connection {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { url: '', token: '', ...JSON.parse(raw) };
  } catch {
    // 読めないときは未設定として扱う
  }
  return { url: '', token: '' };
}

export function setConnection(patch: Partial<Connection>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getConnection(), ...patch }));
  } catch {
    // 保存できない環境では何もしない
  }
}

export function clearConnection() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 消せなくても続ける
  }
}

export function isConnected(): boolean {
  const c = getConnection();
  return Boolean(c.url && c.token);
}
