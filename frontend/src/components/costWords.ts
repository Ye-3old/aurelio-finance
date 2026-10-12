/* What a position's average price and its P/L say about where its cost came
   from, on the Portfolio table (brief AI).

   A cost is estimated when any unit behind it is (`positions.replay` on the
   backend): a photographed cost derived from a reported return, or a plan's
   buy, which is priced at the market close and marked estimated until the
   reader corrects it. The titles named the first source only, so a position
   bought by a PAC said its price was "derived from a reported return", and
   until brief AI it was not even marked.

   Pure, so `tests/costWords.test.ts` runs it under Node without a bundler. */

type CostRow = { cost_known: boolean; cost_estimated: boolean };

/** The title over a row's average price. */
export function avgCostTitle(r: CostRow): string {
  if (!r.cost_known) {
    return "没有买入价记录：这是快照记账时的价格，不是你的买入成本";
  }
  if (r.cost_estimated) {
    return "平均买入价，部分为预估：其中部分或全部来自定投按收盘价计的买入，或由申报收益率倒推的成本，并非交割单";
  }
  return "实际平均买入价，来自已记录的买入";
}

/** The title over a row's profit or loss. */
export function plTitle(r: CostRow): string {
  if (!r.cost_known) {
    return "快照记账以来的波动，并非盈亏：没有买入价记录";
  }
  if (r.cost_estimated) {
    return "相对部分预估的买入价的盈亏（定投按收盘价计的买入，或由申报收益率倒推的成本）：真实但未经交割单核对";
  }
  return "相对平均买入价的盈亏";
}
