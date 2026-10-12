/* Where a position's cost came from, in the Portfolio table's titles
   (brief AI).

   A cost is estimated when any unit behind it is: a photographed cost derived
   from a reported return, or a plan's buy at the market close. The titles
   named the first source only, so a position bought by a PAC would have said
   its price was derived from a reported return. Every expected value is
   written here. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { avgCostTitle, plTitle } from "../src/components/costWords.ts";

const ESTIMATED = { cost_known: true, cost_estimated: true };
const PAID = { cost_known: true, cost_estimated: false };
const UNKNOWN = { cost_known: false, cost_estimated: false };

test("an estimated average price names both of its sources", () => {
  assert.equal(
    avgCostTitle(ESTIMATED),
    "平均买入价，部分为预估：其中部分或全部来自定投按收盘价计的买入，或由申报收益率倒推的成本，并非交割单",
  );
});

test("a profit or loss on an estimated price says so, and names both sources", () => {
  assert.equal(
    plTitle(ESTIMATED),
    "相对部分预估的买入价的盈亏（定投按收盘价计的买入，或由申报收益率倒推的成本）：真实但未经交割单核对",
  );
});

test("a price paid and a price unknown read as they did", () => {
  assert.equal(avgCostTitle(PAID), "实际平均买入价，来自已记录的买入");
  assert.equal(plTitle(PAID), "相对平均买入价的盈亏");
  assert.equal(
    avgCostTitle(UNKNOWN),
    "没有买入价记录：这是快照记账时的价格，不是你的买入成本",
  );
  assert.equal(
    plTitle(UNKNOWN),
    "快照记账以来的波动，并非盈亏：没有买入价记录",
  );
});

test("a cost nobody recorded is unknown, whatever the estimate flag says", () => {
  assert.equal(avgCostTitle({ cost_known: false, cost_estimated: true }), avgCostTitle(UNKNOWN));
});
