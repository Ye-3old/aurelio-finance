/* What the start-up banner adds when the catch-up recorded dividends.

   A dividend is recorded at the market's figure: Yahoo's amount per share,
   GROSS, because Yahoo has no withholding tax. What lands in the account is
   what the broker credits after tax, so the row is estimated until the reader
   types that amount over it (which also clears `estimated`, and the tax panel
   stops withholding on it). The banner already says "estimated"; this says
   which figure corrects a dividend, because "the real amount" alone reads as
   the same gross figure from another source.

   Pure, and with no runtime imports, so `tests/catchUpNote.test.ts` runs it
   under Node without a bundler. */

/** The sentence for `count` recorded dividends, or null when there are none. */
export function dividendsNote(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "分红采用市场税前总额，请用券商实际入账的金额更正。"
    : "分红采用市场税前总额，请逐笔用券商实际入账的金额更正。";
}
