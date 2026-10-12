/* The first date of something that repeats says what it does (brief AE).

   A PAC whose first buy is in the past says how many buys a save writes, and
   offers a plan that has not run yet its next date in one press. A flow's
   date is its first payment. The schedule keeps a 29th, 30th or 31st after a
   shorter month, as the backend's does.

   Run by `npm test` with Node's own test runner, which strips the types itself.
   Every expected value is written here, not read from the module. */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIRST_PAYMENT_NOTE,
  PLAN_DATE_LABEL,
  PLAN_NOTE,
  addMonths,
  afterSaveLine,
  flowDateLabel,
  nextAfter,
  pastBuys,
  pastBuysWarning,
  schedule,
  startsLine,
} from "../src/components/firstDate.ts";

const TODAY = "2026-10-05";
const monthly = (start: string, end: string | null = null) => ({ start, frequency: "monthly", end });

test("a 29th, 30th or 31st keeps its day after February", () => {
  assert.deepEqual(schedule("2026-01-29", "monthly", null, "2026-04-30"), ["2026-01-29", "2026-02-28", "2026-03-29", "2026-04-29"]);
  assert.deepEqual(schedule("2026-01-30", "monthly", null, "2026-04-30"), ["2026-01-30", "2026-02-28", "2026-03-30", "2026-04-30"]);
  assert.deepEqual(schedule("2026-01-31", "monthly", null, "2026-05-31"), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
    "2026-05-31",
  ]);
});

test("in a leap year February has its 29th, and March goes back to the day", () => {
  assert.deepEqual(schedule("2028-01-30", "monthly", null, "2028-03-31"), ["2028-01-30", "2028-02-29", "2028-03-30"]);
  assert.deepEqual(schedule("2024-02-29", "annual", null, "2028-02-29"), [
    "2024-02-29",
    "2025-02-28",
    "2026-02-28",
    "2027-02-28",
    "2028-02-29",
  ]);
});

test("the other frequencies step from the start too, and the end bounds them", () => {
  assert.deepEqual(schedule("2025-11-30", "quarterly", null, "2026-08-31"), ["2025-11-30", "2026-02-28", "2026-05-30", "2026-08-30"]);
  assert.deepEqual(schedule("2026-01-31", "monthly", "2026-03-31", "2026-12-31"), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.equal(addMonths("2026-12-31", 2), "2027-02-28");
});

test("the next date is the first one after today, never today", () => {
  assert.equal(nextAfter("2025-09-16", "monthly", null, TODAY), "2026-10-16");
  assert.equal(nextAfter("2025-09-05", "monthly", null, TODAY), "2026-11-05");
  assert.equal(nextAfter("2025-09-16", "monthly", "2026-06-30", TODAY), null);
});

test("a new plan from 2025-09-16 writes 13 buys, and is offered 2026-10-16", () => {
  const p = pastBuys(monthly("2025-09-16"), null, TODAY);
  assert.ok(p);
  assert.equal(p.dates.length, 13);
  assert.equal(p.dates[0], "2025-09-16");
  assert.equal(p.dates[12], "2026-09-16");
  assert.equal(p.hasRun, false);
  assert.equal(p.next, "2026-10-16");

  const w = pastBuysWarning(p, "2025-09-16");
  assert.equal(w.lead, "2025-09-16 在过去。");
  assert.equal(
    w.body,
    "这样保存，应用会写入 13 笔买入记录，日期从 2025-09-16 到 2026-09-16，按 Yahoo 收盘价而非券商实际成交价计，并标记为预估。",
  );
  assert.equal(
    w.alternative,
    "券商那边已经在投了？那就把到今天为止的都算作券商的：从下一个日期启动计划，并在账户页按对账单录入今天的份额和现金。",
  );
  assert.equal(w.button, "从 2026-10-16 启动");
});

test("the one press leaves nothing in the past", () => {
  const p = pastBuys(monthly("2025-09-16"), null, TODAY);
  assert.ok(p?.next);
  assert.equal(pastBuys(monthly(p.next), null, TODAY), null);
  assert.equal(
    startsLine(p.next),
    "2026-10-16 启动。保存后，请到账户页按券商对账单录入今天的份额和现金。",
  );
});

test("a first buy of today, or later, warns of nothing", () => {
  assert.equal(pastBuys(monthly(TODAY), null, TODAY), null);
  assert.equal(pastBuys(monthly("2026-10-16"), null, TODAY), null);
  assert.equal(pastBuys(monthly(""), null, TODAY), null);
});

test("one past date is said in the singular", () => {
  const p = pastBuys(monthly("2026-09-20"), null, TODAY);
  assert.ok(p);
  assert.deepEqual(p.dates, ["2026-09-20"]);
  assert.equal(
    pastBuysWarning(p, "2026-09-20").body,
    "这样保存，应用会写入一笔买入记录，日期 2026-09-20，按 Yahoo 收盘价而非券商实际成交价计，并标记为预估。",
  );
});

test("a plan that ended before today is told what it writes, and offered nothing", () => {
  const p = pastBuys(monthly("2026-01-10", "2026-03-10"), null, TODAY);
  assert.ok(p);
  assert.deepEqual(p.dates, ["2026-01-10", "2026-02-10", "2026-03-10"]);
  assert.equal(p.next, null);
  const w = pastBuysWarning(p, "2026-01-10");
  assert.equal(w.alternative, null);
  assert.equal(w.button, null);
});

test("a running plan opened with its first buy unchanged says nothing", () => {
  // The reader's own plan: monthly from 2026-10-04, a day before today.
  const stored = monthly("2026-10-04");
  assert.equal(pastBuys(stored, stored, TODAY), null);
  // Its day moved: the months are its own already.
  assert.equal(pastBuys(monthly("2026-10-01"), stored, TODAY), null);
});

test("a running plan moved earlier is told the months it adds, and offered nothing", () => {
  const p = pastBuys(monthly("2026-08-04"), monthly("2026-10-04"), TODAY);
  assert.ok(p);
  assert.deepEqual(p.dates, ["2026-08-04", "2026-09-04"]);
  assert.equal(p.hasRun, true);
  assert.equal(p.next, null);
  const w = pastBuysWarning(p, "2026-08-04");
  assert.equal(w.lead, "这次修改会新增今天之前的日期。");
  assert.equal(w.button, null);
});

test("a frequency switched on a running plan is told the months it adds", () => {
  // Measured on the backend: quarterly from 2026-01-15, switched to monthly,
  // wrote 02-15, 03-15, 05-15, 06-15, 08-15 and 09-15.
  const p = pastBuys(monthly("2026-01-15"), { start: "2026-01-15", frequency: "quarterly", end: null }, TODAY);
  assert.ok(p);
  assert.deepEqual(p.dates, ["2026-02-15", "2026-03-15", "2026-05-15", "2026-06-15", "2026-08-15", "2026-09-15"]);
  assert.equal(
    pastBuysWarning(p, "2026-01-15").body,
    "这样保存，应用会写入 6 笔买入记录，日期从 2026-02-15 到 2026-09-15，按 Yahoo 收盘价而非券商实际成交价计，并标记为预估。",
  );
});

test("a plan stored to start later and moved into the past is offered its next date", () => {
  const p = pastBuys(monthly("2026-07-20"), monthly("2026-11-20"), TODAY);
  assert.ok(p);
  assert.equal(p.hasRun, false);
  assert.equal(p.next, "2026-10-20");
});

test("after the save, the line names the plan and its first buy", () => {
  assert.equal(
    afterSaveLine("PAC All-World", "2026-10-16"),
    "PAC All-World 将从 2026-10-16 启动。请按券商对账单录入今天的快照和现金余额（快照从上一份复制起步，其他持仓才会保留）：",
  );
});

test("a flow's date is its first payment, or the day a one-off happens", () => {
  assert.equal(flowDateLabel("monthly"), "首次扣款");
  assert.equal(flowDateLabel(""), "首次扣款");
  assert.equal(flowDateLabel("annual"), "首次扣款");
  assert.equal(flowDateLabel("one_off"), "发生于");
  assert.equal(PLAN_DATE_LABEL, "首次买入");
  assert.equal(
    FIRST_PAYMENT_NOTE,
    "首次扣款的那一天就是以后每次重复的日子。填过去的日期是安全的：账户最近一次余额之前的扣款已经包含在余额里了。",
  );
});

test("no sentence carries an em dash or an en dash", () => {
  const p = pastBuys(monthly("2025-09-16"), null, TODAY);
  assert.ok(p?.next);
  const w = pastBuysWarning(p, "2025-09-16");
  const texts = [
    w.lead,
    w.body,
    w.alternative ?? "",
    w.button ?? "",
    startsLine(p.next),
    afterSaveLine("PAC All-World", p.next),
    FIRST_PAYMENT_NOTE,
    PLAN_NOTE,
    flowDateLabel("monthly"),
    flowDateLabel("one_off"),
    PLAN_DATE_LABEL,
  ];
  const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
  for (const t of texts) for (const d of dashes) assert.ok(!t.includes(d), t);
});
