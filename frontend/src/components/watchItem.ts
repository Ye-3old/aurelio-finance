/* What a watchlist line says about the instrument it names.

   A line is a FUND from the catalogue, named by its ISIN, with perhaps a
   ticker from Yahoo's lookup beside it as a hint; or, since brief AG, a single
   SHARE, named by the symbol Yahoo lists it under and with no ISIN, because
   nothing this app can ask gives a share's. The ISIN alone tells them apart,
   and the sentences differ because the symbol means two things: a hint to
   check on a fund's line, the identity on a share's.

   No runtime imports, so `npm test` reaches it. */

/** The two fields that say what a line names. */
export interface WatchedInstrument {
  isin?: string | null;
  symbol?: string | null;
}

/** Whether the line names a single share rather than a fund. */
export function isShare(item: WatchedInstrument): boolean {
  return !item.isin;
}

/** The line under the name: what identifies it, and the hint beside it. */
export function identityOf(item: WatchedInstrument): string {
  if (isShare(item)) return `${item.symbol ?? ""} · 股票，Yahoo 收录的代码`;
  return [item.isin, item.symbol].filter(Boolean).join(" · ");
}

const YOURS =
  " 你持有多少、买入价多少、放在哪家机构，也要一并填。记录后关注列表这一行会留在原处：想法落地后点 ✕ 移除即可。";

/** What the ledger form says when "Record a buy" brings a line into it. */
export function prefillNote(item: WatchedInstrument): string {
  if (isShare(item)) {
    return (
      `${item.symbol}：Yahoo 收录这只股票的代码，生成卡片时核对过，你接受时又核对过。请确认这就是你买入的那个上市地。` +
      YOURS
    );
  }
  return (
    (item.symbol
      ? `${item.isin} · ${item.symbol}：ISIN 标识基金，代码来自实时查询，请确认这就是你实际买入的那个上市地。`
      : `${item.isin}。它标识了这只基金，但不提供价格：你买入的上市地的代码仍需你来填。`) +
    YOURS
  );
}
