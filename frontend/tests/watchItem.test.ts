/* What a watchlist line says about the instrument it names.

   Brief AG: a line can now be a single share, named by the symbol Yahoo lists
   it under and with no ISIN. These pin that a share's line says so, and that
   "null" never stands where an ISIN would, while a fund's line says exactly
   what it said before.

   Run by `npm test` with Node's own test runner. Type-checked by `tsc -b`
   through tsconfig.node.json. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { identityOf, isShare, prefillNote } from "../src/components/watchItem.ts";

const SHARE = { isin: null, symbol: "ACME.MI" };
const FUND = { isin: "XA0000000011", symbol: "EXF1.MI" };
const BARE_FUND = { isin: "XA0000000011", symbol: null };
const YOURS =
  " 你持有多少、买入价多少、放在哪家机构，也要一并填。记录后关注列表这一行会留在原处：想法落地后点 ✕ 移除即可。";

test("a line with no ISIN is a share, and one with an ISIN a fund", () => {
  assert.equal(isShare(SHARE), true);
  assert.equal(isShare(FUND), false);
  assert.equal(isShare(BARE_FUND), false);
});

test("a share's line names it by its symbol, as Yahoo lists it", () => {
  assert.equal(identityOf(SHARE), "ACME.MI · 股票，Yahoo 收录的代码");
});

test("a fund's line names it by its ISIN, with the ticker beside it as before", () => {
  assert.equal(identityOf(FUND), "XA0000000011 · EXF1.MI");
  assert.equal(identityOf(BARE_FUND), "XA0000000011");
});

test("the ledger form says where a share's symbol came from, and never null", () => {
  const note = prefillNote(SHARE);
  assert.equal(
    note,
    "ACME.MI：Yahoo 收录这只股票的代码，生成卡片时核对过，你接受时又核对过。请确认这就是你买入的那个上市地。" +
      YOURS,
  );
  assert.ok(!note.includes("null"));
});

test("the ledger form says for a fund what it said before", () => {
  assert.equal(
    prefillNote(FUND),
    "XA0000000011 · EXF1.MI：ISIN 标识基金，代码来自实时查询，请确认这就是你实际买入的那个上市地。" +
      YOURS,
  );
  assert.equal(
    prefillNote(BARE_FUND),
    "XA0000000011。它标识了这只基金，但不提供价格：你买入的上市地的代码仍需你来填。" +
      YOURS,
  );
});
