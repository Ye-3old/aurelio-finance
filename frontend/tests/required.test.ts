/* What a form cannot be sent without, and what it says when pressed anyway.

   Thirteen forms used to answer an empty field with silence. These pin the
   rule that replaced it: one list per form, read three ways (the sentence,
   aria-required, the question in the empty box), so the three cannot drift.
   The order cases are the ones the forms were written around: a sentence
   with a reason of its own arrives only when its field is the one thing left.

   Run by `npm test` with Node's own test runner, which strips the types
   itself. Type-checked by `tsc -b` through tsconfig.node.json. */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEBT,
  EXPENSE,
  INCOME,
  INSTITUTION,
  PLAN,
  REAL_ASSET,
  TRANSFER,
  dated,
  goal,
  holding,
  marks,
  missing,
  refusal,
  transaction,
} from "../src/components/required.ts";

const keys = (needs: { key: string }[]) => needs.map((n) => n.key);

test("nothing missing: no sentence", () => {
  assert.equal(refusal(INCOME, { name: "Salary", amount: "3000" }), null);
});

test("one plain field missing is named alone", () => {
  assert.equal(refusal(INSTITUTION, { name: "  " }), "请填写名称。");
});

test("every plain field missing is named in one sentence, in the form's order", () => {
  assert.equal(refusal(EXPENSE, {}), "请填写名称和金额。");
  assert.equal(
    refusal(transaction("buy", false), {}),
    "请填写标的、代码、数量和价格。",
  );
});

test("a zero is a value, not an empty box", () => {
  assert.equal(refusal(INCOME, { name: "Gift", amount: 0 }), null);
  assert.equal(refusal(transaction("close", true), { assetName: "X", fees: "0", institutionId: "1", currency: "EUR" }), null);
});

test("a sentence of its own waits for the plain fields", () => {
  const debt = { name: "", currency: "" };
  assert.equal(refusal(DEBT, debt), "请填写名称。");
  assert.equal(refusal(DEBT, { ...debt, name: "Mortgage" }), "请说明这笔负债是什么货币。");
  assert.equal(refusal(REAL_ASSET, { name: "Flat", currency: "" }), "请说明这项资产以什么货币计价。");
});

test("the transaction's institution speaks before its currencies, as the form was written", () => {
  const filled = { assetName: "VWCE", symbol: "VWCE.MI", quantity: "2", unitPrice: "100" };
  assert.match(refusal(transaction("buy", false), filled) ?? "", /^买入要有来源/);
  assert.match(refusal(transaction("sell", false), filled) ?? "", /^这笔卖出要说明持有位置/);
  assert.match(
    refusal(transaction("buy", false), { ...filled, institutionId: "3", currency: "EUR" }) ?? "",
    /^请说明这两种货币各是什么：价格用的货币/,
  );
});

test("a close needs what came back, and no ticker, quantity, price or price currency", () => {
  assert.deepEqual(keys(transaction("close", true)), ["assetName", "fees", "institutionId", "currency"]);
  assert.equal(refusal(transaction("close", true), {}), "请填写标的和回款。");
  assert.equal(refusal(transaction("close", true), { assetName: "X" }), "请填写回款。");
});

test("a dividend's price is what each share paid", () => {
  assert.equal(
    refusal(transaction("dividend", false), { assetName: "X", symbol: "X", quantity: "10" }),
    "请填写每股分红。",
  );
});

test("a holding needs a value in total mode, a quantity and a price in qty mode", () => {
  assert.deepEqual(keys(holding("total")), ["name", "value"]);
  assert.deepEqual(keys(holding("qty")), ["name", "quantity", "unitPrice"]);
  assert.equal(refusal(holding("qty"), { name: "VWCE", quantity: "3" }), "请填写价格。");
});

test("a goal's label is needed only for 'other', where it is the goal", () => {
  assert.deepEqual(keys(goal("house")), ["type", "currency"]);
  assert.deepEqual(keys(goal("other")), ["type", "name", "currency"]);
  assert.equal(refusal(goal("other"), { type: "other", currency: "EUR" }), "请填写目标内容。");
});

test("a plan names what is missing before it asks for the source", () => {
  assert.equal(refusal(PLAN, { name: "PAC", amount: "", ticker: "" }), "请填写预算和代码。");
  assert.match(refusal(PLAN, { name: "PAC", amount: "300", ticker: "1" }) ?? "", /^定投计划总要从某处扣钱/);
});

test("a transfer asks for a source or a destination before its currencies", () => {
  assert.equal(
    refusal(TRANSFER, { date: "2026-09-24", amount: "100", currency: "EUR", toCurrency: "EUR" }),
    "请选择转出机构和/或转入机构。",
  );
  assert.equal(refusal(TRANSFER, { date: "2026-09-24", amount: "", ends: "" }), "请填写金额。");
});

test("a transfer's two currencies share one sentence", () => {
  const base = { date: "2026-09-24", amount: "100", ends: "2" };
  const said = refusal(TRANSFER, { ...base, currency: "EUR" });
  assert.equal(said, refusal(TRANSFER, { ...base, toCurrency: "USD" }));
  assert.match(said ?? "", /^请说明这两种货币各是什么：从转出方扣的是什么/);
});

test("a dated series needs its date and its amount, under the amount's own noun", () => {
  assert.equal(refusal(dated("市值", "值多少？"), {}), "请填写日期和市值。");
});

test("marks: aria-required on every need, the question only where a box can show one", () => {
  assert.deepEqual(marks(INCOME, "amount"), { "aria-required": true, placeholder: "多少钱？" });
  assert.deepEqual(marks(TRANSFER, "date"), { "aria-required": true });
  assert.deepEqual(marks(PLAN, "sourceId"), { "aria-required": true });
  assert.deepEqual(marks(goal("house"), "name"), {});
});

test("every question is a question; only selects, dates, the either-or and currency boxes ask none", () => {
  const all = [INSTITUTION, INCOME, EXPENSE, REAL_ASSET, DEBT, TRANSFER, PLAN, dated("市值", "值多少？"),
    goal("other"), holding("total"), holding("qty"), transaction("buy", false), transaction("close", true)].flat();
  for (const n of all) if (n.ask) assert.match(n.ask, /[?？]/, n.key);
  const unasked = all.filter((n) => !n.ask).map((n) => n.key);
  assert.deepEqual([...new Set(unasked)].sort(), [
    "currency", "date", "ends", "institutionId", "priceCurrency", "sourceId", "toCurrency", "type",
  ]);
});

test("missing keeps the form's order", () => {
  assert.deepEqual(keys(missing(transaction("buy", false), { symbol: "X" })), [
    "assetName", "quantity", "unitPrice", "institutionId", "currency", "priceCurrency",
  ]);
});
