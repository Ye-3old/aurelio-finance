/* The Profile form's questions, read as the form reads them.

   Brief AL: the list is the backend's, and an answer on record that no button,
   option or number box can show is said under its question, in words, and
   left on record until the reader picks another. Every answer here is
   invented.

   Run by `npm test` with Node's own test runner. Type-checked by `tsc -b`
   through tsconfig.node.json. */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SurveyQuestion } from "../src/api/survey.ts";
import {
  canShow,
  choicesOf,
  isVisible,
  topicsOf,
  unshownAnswer,
} from "../src/components/questionnaire.ts";

function question(fields: Partial<SurveyQuestion> & Pick<SurveyQuestion, "key" | "type">): SurveyQuestion {
  return {
    topic: "Major purchases",
    text: "A question?",
    options: [],
    unsure: false,
    show_if: null,
    explain_when: null,
    ...fields,
  };
}

const BIG = question({ key: "big_purchase", type: "boolean", text: "Any large purchase planned?", unsure: true });
const DETAIL = question({
  key: "big_purchase_detail",
  type: "text",
  text: "What and roughly when?",
  show_if: { key: "big_purchase", equals: "yes" },
});
const KNOWS = question({ key: "lit_inflation", type: "boolean", topic: "Financial literacy" });
const RISK = question({
  key: "risk_tolerance",
  type: "single",
  topic: "Risk & values",
  options: ["Low", "Medium", "High"],
});
const AGE = question({ key: "about_age", type: "number", topic: "About you", text: "Your age?" });

test("a yes/no question offers yes and no, and unsure between them where it is allowed", () => {
  assert.deepEqual(choicesOf(BIG), ["yes", "unsure", "no"]);
  assert.deepEqual(choicesOf(KNOWS), ["yes", "no"]);
  assert.deepEqual(choicesOf(RISK), ["Low", "Medium", "High"]);
  assert.deepEqual(choicesOf(DETAIL), []);
});

test("a goal stored in a yes/no question is said under it, and stays on record", () => {
  const stored = "Yes: a goal of 12,000 for a new kitchen by 2029";

  assert.equal(canShow(BIG, stored), false);
  assert.equal(
    unshownAnswer(BIG, stored),
    '已记录：「Yes: a goal of 12,000 for a new kitchen by 2029」，不在这些答案里。' +
      "点一个来替换它；不选就保存的话，它会原样保留。",
  );
});

test("an answer the form offers, and no answer at all, say nothing", () => {
  assert.equal(unshownAnswer(BIG, "yes"), null);
  assert.equal(unshownAnswer(BIG, ""), null);
  assert.equal(unshownAnswer(RISK, "Medium"), null);
  assert.equal(unshownAnswer(AGE, "35"), null);
  assert.equal(unshownAnswer(DETAIL, "Anything at all, in words"), null);
});

test("a choice the options do not hold is said with what to do", () => {
  assert.equal(
    unshownAnswer(RISK, "Quite high"),
    '已记录：「Quite high」，不在这些选项里。' +
      "选一个来替换它；不选就保存的话，它会原样保留。",
  );
});

test("a number box cannot show words, so they are said under it", () => {
  assert.equal(
    unshownAnswer(AGE, "35 anni"),
    '已记录：「35 anni」，不是一个数字。' +
      "输一个来替换它；不选就保存的话，它会原样保留。",
  );
  assert.equal(canShow(AGE, " "), false);
});

test("a question that follows another is shown only while that answer is the one it follows", () => {
  assert.equal(isVisible(DETAIL, { big_purchase: "yes" }), true);
  assert.equal(isVisible(DETAIL, { big_purchase: "unsure" }), false);
  assert.equal(isVisible(DETAIL, { big_purchase: "Yes: a goal" }), false);
  assert.equal(isVisible(DETAIL, {}), false);
  assert.equal(isVisible(BIG, {}), true);
});

test("the topics come in the order the questions bring them, once each", () => {
  assert.deepEqual(topicsOf([AGE, BIG, KNOWS, DETAIL, RISK]), [
    "About you",
    "Major purchases",
    "Financial literacy",
    "Risk & values",
  ]);
});
