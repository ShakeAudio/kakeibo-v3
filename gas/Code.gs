/**
 * 家計簿 v3 - GAS（スプレッドシート「家計簿 v3 データ」に紐づけて使う）
 *
 * 役割は3つだけ。画面は持たない。
 *   1. アプリとのデータの受け渡し（doPost）。合言葉が合わない要求は断る
 *   2. 三井住友カードの利用通知メールを「明細」に取り込む（importSmbcMail）
 *   3. iCloud カレンダーの公開 URL を読み、「予定」に書き込む（importCalendars）
 *
 * はじめに一度だけ実行する関数:
 *   createToken()   合言葉を作ってスクリプト プロパティに保存し、ログに表示する
 *   setupTriggers() メールは15分ごと、カレンダーは6時間ごとに自動で動くようにする
 *
 * 列の並びは docs/sheets.md と同じ。列を足すときは右端に。
 */

// ============================================================
// シートと列
// ============================================================

const SHEET = {
  transactions: '明細',
  fixedCosts: '固定費',
  debts: '負債',
  banks: '銀行',
  cards: 'カード',
  clients: '取引先',
  projects: '案件',
  events: '予定',
  paidOverrides: '入金の手直し',
  dayRates: '日当',
  calendars: 'カレンダー',
  settings: '設定',
};

const COLUMNS = {
  transactions: 7,
  fixedCosts: 9,
  debts: 12,
  banks: 3,
  cards: 7,
  clients: 7,
  projects: 4,
  events: 4,
  paidOverrides: 2,
  dayRates: 2,
  calendars: 2,
  settings: 2,
};

/** 三井住友カードの利用通知メールに付けている Gmail のラベル */
const SMBC_LABEL = '三井住友_明細';

/** カレンダーはこの日より前の予定を取り込まない（またがる予定はこの日からにする） */
const CALENDAR_FROM = '2026-01-01';

// ============================================================
// 1. アプリとの受け渡し
// ============================================================

/** ブラウザで URL を開いたときは何も返さない（データは doPost だけで渡す） */
function doGet() {
  return ContentService.createTextOutput('ok');
}

/**
 * アプリからの要求。本文は JSON（Content-Type: text/plain で送られてくる）
 *   { token, action: 'load' }
 *   { token, action: 'save', collection, items }        小さな表をまるごと置き換える
 *   { token, action: 'saveTransactions', upserts, deletes }  明細は1件ずつ追加・更新・削除
 *   { token, action: 'importNow' }                      メールとカレンダーを今すぐ読む
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad-request' });
  }
  if (!checkToken_(body.token)) {
    Utilities.sleep(1000); // 総当たりを遅くする
    return json_({ ok: false, error: 'unauthorized' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (body.action) {
      case 'ping':
        return json_({ ok: true });
      case 'load':
        return json_({ ok: true, state: loadState_() });
      case 'save':
        saveCollection_(body.collection, body.items);
        return json_({ ok: true });
      case 'saveTransactions':
        saveTransactions_(body.upserts || [], body.deletes || []);
        return json_({ ok: true });
      case 'importNow':
        lock.releaseLock();
        importSmbcMail();
        importCalendars();
        return json_({ ok: true, state: loadState_() });
      default:
        return json_({ ok: false, error: 'unknown-action' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {
      // すでに外れている
    }
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  const saved = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return Boolean(saved) && typeof token === 'string' && token === saved;
}

/** 合言葉を作って保存する。ログに出た文字列をアプリの設定に入力する */
function createToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  console.log('合言葉: ' + token);
}

// ============================================================
// シートの読み書き
// ============================================================

function sheet_(key) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET[key]);
  if (!s) throw new Error('シートがありません: ' + SHEET[key]);
  return s;
}

/** 2行目以降を文字列の2次元配列で返す（空行は除く） */
function readRows_(key) {
  const s = sheet_(key);
  const last = s.getLastRow();
  if (last < 2) return [];
  return s
    .getRange(2, 1, last - 1, COLUMNS[key])
    .getDisplayValues()
    .filter((r) => r.some((v) => v !== ''));
}

/** 2行目以降をまるごと書き換える */
function writeRows_(key, rows) {
  const s = sheet_(key);
  const n = COLUMNS[key];
  const last = s.getLastRow();
  if (last >= 2) s.getRange(2, 1, last - 1, n).clearContent();
  if (rows.length) {
    s.getRange(2, 1, rows.length, n).setNumberFormat('@').setValues(rows.map((r) => pad_(r, n)));
  }
}

function pad_(row, n) {
  const r = row.map((v) => (v === null || v === undefined ? '' : String(v)));
  while (r.length < n) r.push('');
  return r.slice(0, n);
}

function loadState_() {
  const state = {};
  Object.keys(CODEC).forEach((key) => {
    state[key] = CODEC[key].decode(readRows_(key));
  });
  return state;
}

function saveCollection_(key, items) {
  if (!CODEC[key] || !CODEC[key].encode || key === 'transactions' || key === 'events') {
    throw new Error('保存できない種類です: ' + key);
  }
  writeRows_(key, CODEC[key].encode(items || []));
}

/** 明細は GAS もメールから書き込むので、まるごと置き換えずに1件ずつ反映する */
function saveTransactions_(upserts, deletes) {
  const rows = readRows_('transactions');
  const index = {};
  rows.forEach((r, i) => (index[r[0]] = i));
  const removed = {};
  deletes.forEach((id) => (removed[id] = true));
  upserts.forEach((t) => {
    const row = CODEC.transactions.encode([t])[0];
    if (index[t.id] !== undefined) {
      row[6] = rows[index[t.id]][6]; // メールID は残す
      rows[index[t.id]] = row;
    } else {
      index[t.id] = rows.length;
      rows.push(row);
    }
  });
  writeRows_('transactions', rows.filter((r) => !removed[r[0]]));
}

// ============================================================
// アプリのデータの形 ⇔ シートの行（列の並びは docs/sheets.md）
// ============================================================

const num_ = (v) => (v === '' || v === undefined || v === null ? 0 : Number(String(v).replace(/[,¥円\s]/g, '')) || 0);
const numOrEmpty_ = (v) => (v === '' || v === undefined || v === null ? undefined : num_(v));
const day_ = (v) => (String(v).trim() === '末日' ? 'end' : num_(v));
const dayOut_ = (v) => (v === 'end' ? '末日' : v);

const KIND = { 支出: 'expense', 収入: 'income' };
const SOURCE = { 現金: 'cash', エポス: 'epos', 三井住友: 'smbc' };
const invert_ = (o) => Object.keys(o).reduce((acc, k) => ((acc[o[k]] = k), acc), {});
const KIND_JA = invert_(KIND);
const SOURCE_JA = invert_(SOURCE);

const CODEC = {
  transactions: {
    decode: (rows) =>
      rows.map((r) => ({ id: r[0], date: r[1], amount: num_(r[2]), kind: KIND[r[3]] || 'expense', source: SOURCE[r[4]] || 'cash', label: r[5] || undefined })),
    encode: (items) => items.map((t) => [t.id, t.date, t.amount, KIND_JA[t.kind], SOURCE_JA[t.source], t.label || '', '']),
  },
  fixedCosts: {
    decode: (rows) =>
      rows.map((r) => ({
        id: r[0],
        name: r[1],
        amount: num_(r[2]),
        schedule:
          r[3] === '毎月' || r[3] === ''
            ? { type: 'monthly' }
            : { type: 'months', months: r[3].split(/[,、・\s]+/).filter(Boolean).map(Number) },
        payment: r[4] === 'カード' ? { type: 'card', cardId: r[7], chargeDay: num_(r[8]) || 1 } : { type: 'bank', bankId: r[5], day: day_(r[6]) || 'end' },
      })),
    encode: (items) =>
      items.map((f) => [
        f.id,
        f.name,
        f.amount,
        f.schedule.type === 'monthly' ? '毎月' : f.schedule.months.join(','),
        f.payment.type === 'card' ? 'カード' : '口座',
        f.payment.type === 'bank' ? f.payment.bankId : '',
        f.payment.type === 'bank' ? dayOut_(f.payment.day) : '',
        f.payment.type === 'card' ? f.payment.cardId : '',
        f.payment.type === 'card' ? f.payment.chargeDay : '',
      ]),
  },
  debts: {
    decode: (rows) =>
      rows.map((r) => {
        const base = {
          id: r[0],
          name: r[1],
          borrowed: num_(r[6]),
          balance: num_(r[7]),
          balanceAsOf: r[8] || today_(),
          monthly: num_(r[9]),
          rate: numOrEmpty_(r[10]),
          firstPayment: r[11] || undefined,
        };
        return r[2] === 'カード分割'
          ? Object.assign(base, { kind: 'card', cardId: r[3] })
          : Object.assign(base, { kind: 'loan', bankId: r[4], payDay: num_(r[5]) || 1 });
      }),
    encode: (items) =>
      items.map((d) => [
        d.id,
        d.name,
        d.kind === 'card' ? 'カード分割' : 'ローン',
        d.kind === 'card' ? d.cardId : '',
        d.kind === 'loan' ? d.bankId : '',
        d.kind === 'loan' ? d.payDay : '',
        d.borrowed,
        d.balance,
        d.balanceAsOf,
        d.monthly,
        d.rate === undefined ? '' : d.rate,
        d.firstPayment || '',
      ]),
  },
  banks: {
    decode: (rows) => rows.map((r) => ({ id: r[0], name: r[1], short: r[2] || r[1] })),
    encode: (items) => items.map((b) => [b.id, b.name, b.short]),
  },
  cards: {
    decode: (rows) =>
      rows.map((r) => ({ id: r[0], name: r[1], short: r[2] || r[1], closingDay: day_(r[3]) || 'end', payMonthOffset: num_(r[4]) || 1, payDay: num_(r[5]) || 27, bankId: r[6] })),
    encode: (items) => items.map((c) => [c.id, c.name, c.short, dayOut_(c.closingDay), c.payMonthOffset, c.payDay, c.bankId]),
  },
  clients: {
    decode: (rows) =>
      rows.map((r) => ({
        id: r[0],
        name: r[1],
        billing: r[2] === '月締め' ? 'monthly' : 'project',
        closingDay: day_(r[3]) || 'end',
        payMonthOffset: num_(r[4]) || 1,
        payDay: day_(r[5]) || 'end',
        dayRate: numOrEmpty_(r[6]) || undefined,
      })),
    encode: (items) =>
      items.map((c) => [c.id, c.name, c.billing === 'monthly' ? '月締め' : '案件まとめて', dayOut_(c.closingDay), c.payMonthOffset, dayOut_(c.payDay), c.dayRate || '']),
  },
  projects: {
    decode: (rows) => rows.map((r) => ({ id: r[0], name: r[1], clientId: r[2], titles: r[3].split('\n').map((t) => t.trim()).filter(Boolean) })),
    encode: (items) => items.map((p) => [p.id, p.name, p.clientId, p.titles.join('\n')]),
  },
  events: {
    decode: (rows) => rows.map((r) => ({ title: r[0], start: r[1], end: r[2] || r[1], kind: r[3] === '打ち消し' ? 'cancel' : 'work' })),
  },
  paidOverrides: {
    decode: (rows) => rows.reduce((acc, r) => ((acc[r[0]] = String(r[1]).toUpperCase() === 'TRUE'), acc), {}),
    encode: (obj) => Object.keys(obj).map((id) => [id, obj[id] ? 'TRUE' : 'FALSE']),
  },
  dayRates: {
    decode: (rows) => rows.map((r) => ({ from: r[0], amount: num_(r[1]) })),
    encode: (items) => items.map((r) => [r.from, r.amount]),
  },
  settings: {
    decode: (rows) => {
      const v = {};
      rows.forEach((r) => (v[r[0]] = r[1]));
      return {
        weeklyBudget: num_(v['生活費の予算（週）']) || 15000,
        livingCardId: v['生活費のカードID'] || 'smbc',
        opening: { month: v['繰越金の月'] || '', amount: num_(v['繰越金']) },
        incomeBankId: v['事業の入金先の銀行ID'] || '',
      };
    },
    encode: (s) => [
      ['生活費の予算（週）', s.weeklyBudget],
      ['生活費のカードID', s.livingCardId],
      ['繰越金の月', s.opening.month],
      ['繰越金', s.opening.amount],
      ['事業の入金先の銀行ID', s.incomeBankId],
    ],
  },
  /** カレンダーの URL はアプリに渡さない（件数だけ） */
  calendars: {
    decode: (rows) => ({ work: rows.filter((r) => r[0] === '稼働').length, cancel: rows.filter((r) => r[0] === '打ち消し').length }),
  },
};

function today_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// ============================================================
// 2. 三井住友カードの利用通知メール
// ============================================================

/** メール本文から利用日・金額・利用先を取り出す。読めなければ null */
function parseSmbcMail(body) {
  const date = body.match(/利用日[：:]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const amount = body.match(/利用金額[：:]\s*([0-9,]+)\s*円/);
  if (!date || !amount) return null;
  const shop = body.match(/利用先[：:]\s*(.+)/);
  const p = (n) => ('0' + n).slice(-2);
  return {
    date: date[1] + '-' + p(date[2]) + '-' + p(date[3]),
    amount: Number(amount[1].replace(/,/g, '')),
    label: shop ? shop[1].trim() : '',
  };
}

/** ラベル「三井住友_明細」の付いた直近90日のメールを、まだ取り込んでいなければ明細に足す */
function importSmbcMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const s = sheet_('transactions');
    const done = {};
    readRows_('transactions').forEach((r) => r[6] && (done[r[6]] = true));
    const add = [];
    GmailApp.search('label:' + SMBC_LABEL + ' newer_than:90d').forEach((thread) => {
      thread.getMessages().forEach((m) => {
        const id = m.getId();
        if (done[id]) return;
        const t = parseSmbcMail(m.getPlainBody());
        if (!t) {
          console.warn('読み取れないメール: ' + m.getSubject() + ' ' + id);
          return;
        }
        add.push(['m' + id, t.date, t.amount, '支出', '三井住友', t.label, id]);
        done[id] = true;
      });
    });
    if (add.length) s.getRange(s.getLastRow() + 1, 1, add.length, COLUMNS.transactions).setNumberFormat('@').setValues(add.map((r) => pad_(r, COLUMNS.transactions)));
    console.log('三井住友メール: ' + add.length + '件取り込み');
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 3. iCloud カレンダー（公開 URL）
// ============================================================

/** カレンダーの公開 URL を読み、「予定」をまるごと書き換える */
function importCalendars() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const rows = [];
    readRows_('calendars').forEach((r) => {
      const kind = r[0] === '打ち消し' ? '打ち消し' : '稼働';
      const url = String(r[1]).trim().replace(/^webcal:\/\//, 'https://');
      if (!url) return;
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) {
        console.warn('カレンダーを読めません: ' + res.getResponseCode());
        return;
      }
      onlyFrom(parseIcs(res.getContentText()), CALENDAR_FROM).forEach((e) => rows.push([e.title, e.start, e.end, kind]));
    });
    rows.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    writeRows_('events', rows);
    console.log('カレンダー: ' + rows.length + '件');
  } finally {
    lock.releaseLock();
  }
}

/**
 * iCal（.ics）の文字列から予定を取り出す。終了日は最終日を含む形にそろえる。
 * 繰り返しの予定（RRULE）は最初の1回だけ扱う。
 */
function parseIcs(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null;
  lines.forEach((line) => {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur && cur.start) {
        events.push({ title: cur.title || '', start: cur.start, end: cur.end && cur.end >= cur.start ? cur.end : cur.start });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) return;
      const name = line.slice(0, i).split(';')[0];
      const params = line.slice(0, i);
      const value = line.slice(i + 1);
      if (name === 'SUMMARY') cur.title = value.replace(/\\n/g, ' ').replace(/\\([,;\\])/g, '$1').trim();
      if (name === 'DTSTART') cur.start = icsDate_(value, params, false);
      if (name === 'DTEND') cur.end = icsDate_(value, params, true);
    }
  });
  return events;
}

/** from より前に終わる予定を除き、from をまたぐ予定は from からにする */
function onlyFrom(events, from) {
  return events.filter((e) => e.end >= from).map((e) => (e.start < from ? { title: e.title, start: from, end: e.end } : e));
}

/** 20261001 / 20261001T130000 / 20261001T040000Z を 'YYYY-MM-DD'（日本時間）にする */
function icsDate_(value, params, isEnd) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return '';
  let d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0));
  if (m[7]) d = new Date(d.getTime() + 9 * 3600 * 1000); // UTC → 日本時間
  const allDay = !m[4] || /VALUE=DATE(?!-)/.test(params);
  // 終日の予定や 0:00 ちょうどに終わる予定の終了日は「その前日まで」
  if (isEnd && (allDay || (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0))) {
    d = new Date(d.getTime() - 24 * 3600 * 1000);
  }
  const p = (n) => ('0' + n).slice(-2);
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

// ============================================================
// 自動で動かす設定
// ============================================================

/** メールは15分ごと、カレンダーは6時間ごとに自動で読み込む */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (['importSmbcMail', 'importCalendars'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('importSmbcMail').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('importCalendars').timeBased().everyHours(6).create();
  console.log('自動実行を設定しました');
}
