/* What a form cannot be sent without, said once per form.

   Thirteen forms used to swallow a press on an empty field: the button
   worked, nothing was sent, and nothing was said. Five of them did it through
   one line in the shared list editor, eight in their own submit handlers. And
   no field anywhere said it was required, so the reader learned which ones
   were by pressing and watching nothing happen.

   One list per form now drives three things that used to be separate, or
   missing: the sentence a refused press says, `aria-required` on the field,
   and the question its empty box asks. They cannot disagree, because there is
   only one list to read. The API schemas' own required arrays were not used
   for this, deliberately: in four forms they do not match what the form
   actually refuses (a holding needs a value the schema leaves optional, a
   goal's schema requires the name its form calls optional), and a marker has
   to tell the reader what THIS form will refuse.

   No runtime imports, so `npm test` reaches it. */

/** One field the form needs before it can send anything. */
export interface Need {
  /** The form's own name for the value, as passed to `refusal`. */
  key: string;
  /** How the shared sentence names it: "the name", "a ticker". */
  noun: string;
  /** The question its empty box asks. Left out for a select, whose first
      option already asks; for a date, which cannot show a placeholder; and
      for a currency box, 54px wide, where no question fits ("Currency?" is
      65px) and which opens filled in anyway. Every question here must fit
      its box with room to spare: tests/questionsFit.test.ts measures them
      against the font. */
  ask?: string;
  /** A sentence of its own, for a field whose absence has a reason worth
      giving. Said on its own, and only once the plain ones are filled in. */
  says?: string;
}

type Values = Record<string, string | number | null | undefined>;

function empty(v: string | number | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

/** The needs whose value is still empty, in the form's order. */
export function missing(needs: Need[], values: Values): Need[] {
  return needs.filter((n) => empty(values[n.key]));
}

function list(nouns: string[]): string {
  if (nouns.length === 1) return nouns[0];
  return `${nouns.slice(0, -1).join("、")}和${nouns[nouns.length - 1]}`;
}

/** What a refused press says, or null when nothing is missing.

    The plain needs are said together, in one sentence, because a reader
    filling a form should learn everything that is left at once. A need with a
    sentence of its own waits until the plain ones are in: those sentences were
    written to arrive when their field is the one thing left. */
export function refusal(needs: Need[], values: Values): string | null {
  const gone = missing(needs, values);
  const plain = gone.filter((n) => !n.says);
  if (plain.length > 0) return `请填写${list(plain.map((n) => n.noun))}。`;
  return gone.length > 0 ? (gone[0].says as string) : null;
}

/** The attributes that mark `key` as needed, to spread onto its control:
    `aria-required`, and the question its empty box asks. Nothing for a field
    this form does not need in its current state. */
export function marks(
  needs: Need[],
  key: string,
): { "aria-required"?: true; placeholder?: string } {
  const need = needs.find((n) => n.key === key);
  if (!need) return {};
  return need.ask ? { "aria-required": true, placeholder: need.ask } : { "aria-required": true };
}

// --- The rules, one per form ------------------------------------------------

const NAME: Need = { key: "name", noun: "名称", ask: "叫什么？" };
const AMOUNT: Need = { key: "amount", noun: "金额", ask: "多少钱？" };

export const INSTITUTION: Need[] = [{ ...NAME, ask: "哪家银行或券商？" }];

export const INCOME: Need[] = [{ ...NAME, ask: "是什么？如：工资" }, AMOUNT];
export const EXPENSE: Need[] = [{ ...NAME, ask: "是什么？如：房租" }, AMOUNT];

/** The dated series: a cash anchor, a valuation, a balance. `noun` and `ask`
    are the amount's, which is the one part that differs. */
export function dated(noun: string, ask: string): Need[] {
  return [
    { key: "date", noun: "日期" },
    { key: "amount", noun, ask },
  ];
}

/** The three dated series. Their questions live here rather than at the
    call sites, so the fit test sees every question the forms can ask. */
export const CASH_ANCHOR = dated("现金", "多少钱？");
export const VALUATION = dated("市值", "值多少？");
export const BALANCE = dated("余额", "还剩多少？");

export const REAL_ASSET: Need[] = [
  { ...NAME, ask: "是什么？如：米兰公寓" },
  {
    key: "currency",
    noun: "货币",
    says: "请说明这项资产以什么货币计价。",
  },
];

export const DEBT: Need[] = [
  { ...NAME, ask: "是什么？如：车贷" },
  { key: "currency", noun: "货币", says: "请说明这笔负债是什么货币。" },
];

/** A goal: the dropdown carries the meaning, so the free label is needed only
    for "other", where it IS the goal. */
export function goal(type: string): Need[] {
  return [
    { key: "type", noun: "目标用途" },
    ...(type === "other" ? [{ key: "name", noun: "目标内容", ask: "目标是什么？" }] : []),
    { key: "currency", noun: "货币", says: "请说明这个目标是什么货币。" },
  ];
}

const CURRENCIES_MOVED =
  "请说明这两种货币各是什么：从转出方扣的是什么，转入方入账的是什么。";

/** A transfer. Its source-or-destination is an either/or that no one field
    carries: `ends` is either of them, said as a sentence and marked on
    neither box. */
export const TRANSFER: Need[] = [
  { key: "date", noun: "日期" },
  AMOUNT,
  { key: "ends", noun: "转出方或转入方", says: "请选择转出机构和/或转入机构。" },
  { key: "currency", noun: "货币", says: CURRENCIES_MOVED },
  { key: "toCurrency", noun: "货币", says: CURRENCIES_MOVED },
];

/** A PAC. At least one target needs a ticker; the first target's box carries
    the mark, since a second row left empty is simply ignored. Where each
    ticker is held is said by the form, per target, after these. */
export const PLAN: Need[] = [
  { ...NAME, ask: "叫什么？" },
  { key: "amount", noun: "预算", ask: "多少钱？" },
  { key: "ticker", noun: "代码", ask: "哪个代码？" },
  {
    key: "sourceId",
    noun: "出资账户",
    says: "定投计划总要从某处扣钱：请指定出资账户，每次投入才会动真实的余额。",
  },
];

/** A position in a situation: a total, or a quantity and a price. */
export function holding(mode: "total" | "qty"): Need[] {
  return [
    { key: "name", noun: "名称", ask: "是什么？（输入搜索）" },
    ...(mode === "qty"
      ? [
          { key: "quantity", noun: "数量", ask: "多少份？" },
          { key: "unitPrice", noun: "价格", ask: "什么价？" },
        ]
      : [{ key: "value", noun: "市值", ask: "值多少？" }]),
  ];
}

const CURRENCIES_TRADED = "请说明这两种货币各是什么：价格用的货币，和资金实际进出账户的货币。";

/** A ledger row. A close needs what came back, and zero is an answer; a
    buy, a sell or a dividend needs what was traded and at what, where a
    dividend's price is what each share paid. */
/** How a ledger kind reads in a sentence ("a sell", "a dividend"). Display
    only: `kind` itself stays the compared enum value. */
function kindWord(kind: string): string {
  return kind === "sell" ? "卖出" : kind === "dividend" ? "分红" : kind === "close" ? "清仓" : "交易";
}

export function transaction(kind: string, isClose: boolean): Need[] {
  return [
    { key: "assetName", noun: "标的", ask: "是什么？（输入搜索）" },
    ...(isClose
      ? [{ key: "fees", noun: "回款", ask: "回款多少？" }]
      : [
          { key: "symbol", noun: "代码", ask: "代码或 ISIN？" },
          { key: "quantity", noun: "数量", ask: "多少份？" },
          kind === "dividend"
            ? { key: "unitPrice", noun: "每股分红", ask: "每股多少？" }
            : { key: "unitPrice", noun: "价格", ask: "什么价？" },
        ]),
    {
      key: "institutionId",
      noun: "机构",
      says:
        kind === "buy"
          ? "买入要有来源：请选它存放在哪家机构，现金才会从对的账户扣出。"
          : `这笔${kindWord(kind)}要说明持有位置：请选机构，现金才会进对的账户。`,
    },
    { key: "currency", noun: "货币", says: CURRENCIES_TRADED },
    ...(isClose
      ? []
      : [{ key: "priceCurrency", noun: "货币", says: CURRENCIES_TRADED }]),
  ];
}
