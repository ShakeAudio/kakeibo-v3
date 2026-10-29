import { getConnection, type Connection } from './connection';

// GAS（ウェブアプリ）とのやり取り。合言葉は URL に付けず、送る中身（本文）に入れる

export class ApiError extends Error {
  constructor(
    message: string,
    /** unauthorized: 合言葉が違う / network: つながらない / server: GAS 側のエラー */
    readonly code: 'unauthorized' | 'network' | 'server',
  ) {
    super(message);
  }
}

export async function callGas<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}, conn: Connection = getConnection()): Promise<T> {
  let res: Response;
  try {
    res = await fetch(conn.url, {
      method: 'POST',
      // text/plain にすると、GAS が対応していない事前確認（プリフライト）が起きない
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, token: conn.token }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('GAS につながりません', 'network');
  }
  let data: { ok?: boolean; error?: string } & T;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('GAS の返事を読めません。URL を確かめてください', 'server');
  }
  if (!data.ok) {
    if (data.error === 'unauthorized') throw new ApiError('合言葉が違います', 'unauthorized');
    throw new ApiError(`GAS でエラーが起きました（${data.error ?? '不明'}）`, 'server');
  }
  return data;
}

/** URL と合言葉が正しいか確かめる */
export function ping(conn: Connection) {
  return callGas('ping', {}, conn);
}
