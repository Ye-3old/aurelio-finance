/* A dividend entered by hand on top of the one the app recorded (brief AI).

   The catch-up records a dividend on its ex-date at the market's gross
   figure, marked estimated, and the reader is meant to correct that row with
   what the broker credited. Typed as a new row instead, it was stored beside
   it, and the cash, the dividends collected and the tax panel all counted
   both (measured 2026-10-07 on a copy of the test database): one dividend
   gross and again net, and a withholding estimated on money already taxed.
   The API cannot tell that from a special dividend paid on the same
   day, so nothing is refused (the reader's rule): the form names the
   estimated rows the new one may be, and offers to correct one instead.

   Wider than the same day: a statement shows the PAYMENT date, which follows
   the ex-date, and a row typed on it was counted twice the same way. So every
   still-estimated dividend of that account and ticker dated on or before the
   typed date is offered, newest first.

   The ex-date is also how the catch-up knows a dividend is recorded: a row
   moved off it leaves that day empty, and the next start records the dividend
   there again (measured the same day). So a correction keeps the row's own
   date, and moving the date of a row the app recorded is said, not refused.

   Pure, so `tests/sameDividend.test.ts` runs it under Node without a
   bundler. Dates go in as ISO strings; `fmt` is how the page prints them. */

/** The ledger fields these rules read, as `TransactionRead` carries them. */
export type LedgerRow = {
  id: number;
  kind: string;
  date: string;
  institution_id: number | null;
  symbol: string | null;
  amount: number;
  currency: string;
  estimated: boolean;
  note: string | null;
};

/** How many estimated rows are named; any older ones are counted. */
export const SHOWN = 3;

/** The start of the note the catch-up writes on every dividend it records
    (`pac.execute_dividends`). An edit keeps it, and the backend's tests pin
    it (`test_a_stamp_says_where_a_row_came_from.py`). */
export const AUTO_STAMP = "Auto-recorded from market data";

const asIs = (iso: string) => iso;

/** The still-estimated dividends of one account and ticker dated on or before
    `date`, newest first: the rows a dividend being typed may already be. */
export function estimatedDividends<T extends LedgerRow>(
  rows: T[],
  typed: { institutionId: number | null; symbol: string; date: string },
): T[] {
  const symbol = typed.symbol.trim().toUpperCase();
  if (typed.institutionId == null || !symbol || !typed.date) return [];
  return rows
    .filter(
      (t) =>
        t.kind === "dividend" &&
        t.estimated &&
        t.institution_id === typed.institutionId &&
        (t.symbol ?? "").toUpperCase() === symbol &&
        t.date <= typed.date,
    )
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
}

/** The sentence over the offered rows. */
export function offerLine(symbol: string, where: string): string {
  return `${where} 已有 ${symbol.trim().toUpperCase()} 的记录，仍是预估（市场税前总额）。如果你正在录入的分红就是其中之一，请改为更正它：再加一行会重复计算。`;
}

/** What is said of the estimated rows beyond the ones named, or null. */
export function olderLine(count: number): string | null {
  const older = count - SHOWN;
  if (older <= 0) return null;
  return older === 1 ? "还有 1 笔更早的。" : `还有 ${older} 笔更早的。`;
}

/** Said once the form has become the correction of a row. */
export function correctingLine(rowDate: string, typedDate: string, fmt = asIs): string {
  const said = `正在用你的数字更正 ${fmt(rowDate)} 的分红：保存即替换原记录。`;
  return typedDate && typedDate !== rowDate
    ? `${said}日期保持 ${fmt(rowDate)} 不变：应用按除息日找它：所以 ${fmt(typedDate)} 不会生效。`
    : said;
}

/** Whether the app's catch-up recorded this row, by the stamp it wrote. */
export function recordedByTheApp(row: Pick<LedgerRow, "kind" | "note">): boolean {
  return row.kind === "dividend" && (row.note ?? "").startsWith(AUTO_STAMP);
}

/** The line under the form when a dividend the app recorded is being moved
    off its ex-date, or null. */
export function movedOffItsDay(
  row: Pick<LedgerRow, "kind" | "note" | "date">,
  date: string,
  fmt = asIs,
): string | null {
  if (!recordedByTheApp(row) || !date || date === row.date) return null;
  return `应用在除息日 ${fmt(row.date)} 记下了这笔分红，并按该日期找它。若改到 ${fmt(date)}，下次启动时 ${fmt(row.date)} 的分红会被再次记入，除非该账户有一份日期不早于它的快照。`;
}
