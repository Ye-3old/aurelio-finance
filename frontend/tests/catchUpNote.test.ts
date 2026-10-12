/* The start-up banner says which figure corrects a recorded dividend: the
   broker's credit, after tax, since the market's figure is gross (brief AF).
   Every expected value is written here. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { dividendsNote } from "../src/components/catchUpNote.ts";

test("no dividend recorded, nothing added", () => {
  assert.equal(dividendsNote(0), null);
});

test("one dividend: gross, and corrected with the broker's credit", () => {
  assert.equal(
    dividendsNote(1),
    "分红采用市场税前总额，请用券商实际入账的金额更正。",
  );
});

test("several dividends: each corrected on its own", () => {
  assert.equal(
    dividendsNote(4),
    "分红采用市场税前总额，请逐笔用券商实际入账的金额更正。",
  );
});
