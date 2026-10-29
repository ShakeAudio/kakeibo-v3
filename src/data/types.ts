// アプリが扱うデータの形。GAS 接続後もこの形のままスプレッドシートとやり取りする

export type Bank = { id: string; name: string; short: string };

export type Card = {
  id: string;
  name: string;
  short: string;
  /** 締め日。'end' は末日 */
  closingDay: number | 'end';
  /** 締めた月から何か月後に払うか */
  payMonthOffset: number;
  payDay: number;
  bankId: string;
};

/** 現金・エポスの手入力と、三井住友メールから取り込んだ明細 */
export type Transaction = {
  id: string;
  date: string;
  amount: number;
  kind: 'expense' | 'income';
  source: 'cash' | 'epos' | 'smbc';
  label?: string;
};

export type FixedSchedule = { type: 'monthly' } | { type: 'months'; months: number[] };

export type FixedPayment =
  | { type: 'bank'; bankId: string; day: number | 'end' }
  /** カードに請求される日。画面には出さず、どの請求に入るかの判定だけに使う */
  | { type: 'card'; cardId: string; chargeDay: number };

export type FixedCost = {
  id: string;
  name: string;
  amount: number;
  schedule: FixedSchedule;
  payment: FixedPayment;
};

export type Debt = {
  id: string;
  name: string;
  borrowed: number;
  /** balanceAsOf 時点の残債。以降は返済日ごとに自動で減る */
  balance: number;
  balanceAsOf: string;
  monthly: number;
  rate?: number;
  /** この日より前の返済は数えない（分割払いの初回など） */
  firstPayment?: string;
} & ({ kind: 'card'; cardId: string } | { kind: 'loan'; bankId: string; payDay: number });

export type Client = {
  id: string;
  name: string;
  billing: 'project' | 'monthly';
  /** 月締めのときの締め日 */
  closingDay: number | 'end';
  payMonthOffset: number;
  payDay: number | 'end';
  /** 空なら共通の日当 */
  dayRate?: number;
};

export type Project = {
  id: string;
  name: string;
  clientId: string;
  /** この案件に紐づくカレンダーの予定のタイトル */
  titles: string[];
};

/** iCloud カレンダーから読んだ予定。end は最終日を含む */
export type CalendarEvent = {
  title: string;
  start: string;
  end: string;
  kind: 'work' | 'cancel';
};

export type Settings = {
  weeklyBudget: number;
  /** 生活費として数えるカード */
  livingCardId: string;
  /** 繰越金の初期値（その月の月末時点の残高） */
  opening: { month: string; amount: number };
  dayRates: { from: string; amount: number }[];
  /** 事業の入金が入る銀行 */
  incomeBankId: string;
};

export type State = {
  settings: Settings;
  banks: Bank[];
  cards: Card[];
  transactions: Transaction[];
  fixedCosts: FixedCost[];
  debts: Debt[];
  clients: Client[];
  projects: Project[];
  events: CalendarEvent[];
  /** 売掛金の入金状態を手で直したもの（請求ID → 入金済みか） */
  paidOverrides: Record<string, boolean>;
  /** スプレッドシートに登録したカレンダーの件数（URL そのものはアプリに渡さない） */
  calendarCounts?: { work: number; cancel: number };
};
