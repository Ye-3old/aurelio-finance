import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createExpense,
  createIncomeSource,
  deleteExpense,
  deleteIncomeSource,
  getCashFlowSummary,
  getExpenses,
  getIncomeSources,
  updateExpense,
  updateIncomeSource,
  type CashFlowSummary,
  type Expense,
  type ExpenseCreate,
  type IncomeSource,
  type IncomeSourceCreate,
} from "../api/cashflow";
import {
  createTransfer,
  deleteTransfer,
  getTransfers,
  updateTransfer,
  type Transfer,
} from "../api/transfers";
import {
  createAccumulationPlan,
  deleteAccumulationPlan,
  getAccumulationPlans,
  updateAccumulationPlan,
  type AccumulationPlan,
} from "../api/accumulationPlans";
import { getInstitutions, type Institution } from "../api/institutions";
import { getAllCashAnchors, type CashAnchor } from "../api/cash";
import { accountCurrencyOn } from "./proposedCurrency";
import { InstrumentPicker, type InstrumentChoice } from "./InstrumentPicker";
import { getPortfolio, type PortfolioRow } from "../api/portfolio";
import {
  EditorButtons,
  Row,
  RowsOrEmpty,
  SAVINGS_RATE,
  Section,
  StatCard,
  apiError,
  btnClass,
  inputClass,
  money,
  todayISO,
  CURRENCY_LIST,
} from "./ui";
import { useListEditor, type Draft } from "./listEditor";
import { IN_FORCE, leftOutLine, notCounted, undatedLine } from "./inForce";
import { EXPENSE as EXPENSE_NEEDS, INCOME as INCOME_NEEDS, PLAN, TRANSFER, marks, refusal, type Need } from "./required";
import {
  FIRST_PAYMENT_NOTE,
  PLAN_DATE_LABEL,
  PLAN_NOTE,
  afterSaveLine,
  flowDateLabel,
  pastBuys,
  pastBuysWarning,
  startsLine,
} from "./firstDate";
import type { Focus } from "../nav";

const KINDS = ["", "active", "passive"];
const NATURES = ["", "essential", "discretionary"];
const FREQUENCIES = ["", "monthly", "quarterly", "semiannual", "annual", "one_off"];
const PAC_FREQUENCIES = ["monthly", "quarterly", "semiannual", "annual"];
const INCOME_CATEGORIES = ["", "salary", "freelance", "business", "rental", "dividends", "interest", "pension", "other"];
const EXPENSE_CATEGORIES = ["", "housing", "food", "transport", "utilities", "health", "insurance", "debt", "leisure", "education", "other"];

function pct(x: number | null): string {
  return x == null ? "暂无" : `${Math.round(x * 100)}%`;
}

function subtitle(parts: (string | null | undefined)[]): string | undefined {
  const kept = parts.filter(Boolean);
  return kept.length ? kept.join(" · ") : undefined;
}

function dateRange(start: string | null, end: string | null): string | undefined {
  if (start && end) return `${start} → ${end}`;
  if (start) return `自 ${start}`;
  if (end) return `至 ${end}`;
  return undefined;
}

export default function CashFlow({
  focus,
  onFocused,
  onOpenAccount,
}: {
  /** Set when the reader arrived from the account page's cash sentence rather
      than by pressing "Cash flow". Three of that sentence's terms are kept in
      three different sections of THIS page, and landing at the top of all four
      would leave the reader to find the one they asked for. */
  focus: Focus | null;
  onFocused: () => void;
  /** Opens an account's page, where its situation and its cash are recorded:
      where a plan started on its next date sends the reader for today's. */
  onOpenAccount: (i: Institution) => void;
}) {
  const [summary, setSummary] = useState<CashFlowSummary | null>(null);
  const [incomes, setIncomes] = useState<IncomeSource[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [plans, setPlans] = useState<AccumulationPlan[]>([]);
  const [positions, setPositions] = useState<PortfolioRow[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [anchors, setAnchors] = useState<CashAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Up here, not in the plan section: a save reloads this page, which draws
  // "Loading…" in place of every section and so forgets what they held.
  const [planSaved, setPlanSaved] = useState<PlanSaved | null>(null);
  // The three sections a term of the cash sentence can name. Movement is the
  // only arrival cue on purpose: a highlight would need a colour, a duration
  // and a rule for not firing on an ordinary visit — a new concept on a page
  // where every row already prints the institution it belongs to.
  const incomeRef = useRef<HTMLDivElement>(null);
  const expenseRef = useRef<HTMLDivElement>(null);
  const transferRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [s, i, e, t, p, inst, pf, a] = await Promise.all([
        getCashFlowSummary(),
        getIncomeSources(),
        getExpenses(),
        getTransfers(),
        getAccumulationPlans(),
        getInstitutions(),
        getPortfolio(),
        getAllCashAnchors(),
      ]);
      setSummary(s);
      setIncomes(i);
      setExpenses(e);
      setTransfers(t);
      setPlans(p);
      setInstitutions(inst);
      setAnchors(a);
      setPositions(pf.rows);
    } catch (err) {
      setError(apiError(err, "无法连接后端。它是否运行在 :8000 上？"));
    } finally {
      setLoading(false);
    }
  }

  function instName(id: number | null): string | undefined {
    if (id == null) return undefined;
    return institutions.find((x) => x.id === id)?.name;
  }

  // Arriving AT a section rather than at the page. The wait for `loading` is
  // the whole subtlety: this component renders "Loading…" first, so on the
  // render that carries the focus none of these sections exist yet and
  // scrolling would silently do nothing.
  useEffect(() => {
    if (!focus || loading) return;
    const target =
      focus === "income" ? incomeRef : focus === "expenses" ? expenseRef : transferRef;
    target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Consumed once. Left set, every later re-render of this page would drag
    // the reader back to the same heading mid-typing.
    onFocused();
  }, [focus, loading, onFocused]);

  if (loading) return <p className="text-ink-soft">加载中…</p>;
  if (error) return <p className="text-down">{error}</p>;
  // The base the reader chose, as the summary was computed in: what a new row
  // with no account to ask is proposed in.
  const base = summary?.base_currency ?? "";
  // What the four figures leave out, said under them; each left-out row says
  // its own reason in the lists below.
  const leftOut = summary ? notCounted(summary) : null;
  const undated = summary ? undatedLine(summary.undated) : null;

  return (
    <div className="space-y-8">
      {summary && (
        <div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="每月收入" value={money(summary.base_currency).format(summary.monthly_income)} valueClass="text-up" />
            <StatCard label="每月支出" value={money(summary.base_currency).format(summary.monthly_expenses)} valueClass="text-down" />
            <StatCard
              label="每月结余"
              value={money(summary.base_currency).format(summary.monthly_net)}
              valueClass={summary.monthly_net >= 0 ? "text-ink" : "text-down"}
            />
            <StatCard label="储蓄率" value={pct(summary.savings_rate)} valueClass="text-olive" explain={SAVINGS_RATE} />
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            收入：主动 {money(summary.base_currency).format(summary.active_income)} · 被动{" "}
            {money(summary.base_currency).format(summary.passive_income)}。支出：必要{" "}
            {money(summary.base_currency).format(summary.essential_expenses)} · 可选{" "}
            {money(summary.base_currency).format(summary.discretionary_expenses)}。{IN_FORCE}
          </p>
          {(leftOut || undated) && (
            <p className="mt-1 text-sm text-ink-soft">
              {[leftOut && `未计入：${leftOut}（下方已标注）。`, undated].filter(Boolean).join(" ")}
            </p>
          )}
        </div>
      )}

      <div ref={incomeRef} className="scroll-mt-6">
        <CashFlowSection spec={INCOME} items={incomes} summary={summary} institutions={institutions} anchors={anchors} base={base} instName={instName} onChanged={loadAll} />
      </div>
      <div ref={expenseRef} className="scroll-mt-6">
        <CashFlowSection spec={EXPENSE} items={expenses} summary={summary} institutions={institutions} anchors={anchors} base={base} instName={instName} onChanged={loadAll} />
      </div>
      <PlanSection
        items={plans}
        institutions={institutions}
        anchors={anchors}
        base={base}
        positions={positions}
        instName={instName}
        onChanged={loadAll}
        onOpenAccount={onOpenAccount}
        saved={planSaved}
        onSaved={setPlanSaved}
      />
      {/* Last on purpose: a transfer moves money you already have between two
          places you already own, so it changes no total. Income, expenses and
          plans do — they belong above it. */}
      <div ref={transferRef} className="scroll-mt-6">
        <TransferSection items={transfers} institutions={institutions} anchors={anchors} base={base} instName={instName} onChanged={loadAll} />
      </div>
    </div>
  );
}

function InstitutionSelect({
  value,
  onChange,
  institutions,
  placeholder = "机构…",
  required = false,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  institutions: Institution[];
  placeholder?: string;
  /** Blank is not an answer here, so the placeholder cannot be chosen back
      once something has been picked. Off by default: a transfer's "from" may
      legitimately be external, and an expense may belong to no account. It is
      on for the two fields of a plan, where blank is the two-null condition
      that made a plan's spending add itself to the net worth. On, the box
      is also aria-required. */
  required?: boolean;
  title?: string;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      title={title}
      aria-required={required || undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled={required}>{placeholder}</option>
      {institutions.map((i) => (
        <option key={i.id} value={i.id}>{i.name}</option>
      ))}
    </select>
  );
}

// A small labelled date input (date pickers can't show a placeholder).
function DateField({
  label,
  value,
  onChange,
  mark,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** aria-required, when the form needs this date (see required.ts). */
  mark?: { "aria-required"?: true };
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-ink-soft">
      {label}
      <input className={inputClass} type="date" {...mark} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/* Income and Expense are the same section, twice.

   They were built as two components, ~130 lines each, identical except for one
   field name and two vocabularies — so a fix to one (the delete prompt, the
   error voice, resetting the form after deleting the row being edited) landed
   in one of them and not the other.

   They are NOT the same concept, and the tables stay separate: `kind` says
   active or passive, `nature` says essential or discretionary, and those are
   not one axis with four values. The cash register signs them oppositely. What
   was duplicated is the MECHANISM, and only that is shared here. */

/** The fields both sides carry, as the API returns them. */
type CashFlowRow = {
  id: number;
  name: string;
  category: string | null;
  amount: number;
  currency: string;
  frequency: string | null;
  institution_id: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};

/** The same fields on the way back, minus the id and the note. The note is
    shown on the row and never sent: the form has no box for it, and an edit
    leaves out what it does not send, so the stored note survives every save. */
type CashFlowBase = Omit<CashFlowRow, "id" | "notes">;

type CashFlowSpec<T extends CashFlowRow, P> = {
  /** Which side of the summary's left-out lists a row of this kind is on. */
  side: "income" | "expense";
  title: string;
  hint: string;
  /** What a row of this kind cannot be saved without. */
  needs: Need[];
  emptyText: string;
  /** How the confirm dialog names one of these. */
  noun: string;
  /** The single field name the two sides disagree on — `kind` or `nature`.
      It labels its own select, so the placeholder never drifts from it. */
  tagField: string;
  tagOptions: string[];
  tagOf: (item: T) => string | null;
  categories: string[];
  /** Put the tag back under its own name. The only place either side needs to
      know which name that is. */
  withTag: (base: CashFlowBase, tag: string | null) => P;
  create: (data: P) => Promise<unknown>;
  update: (id: number, data: P) => Promise<unknown>;
  destroy: (id: number) => Promise<unknown>;
};

function CashFlowSection<T extends CashFlowRow, P>({
  spec,
  items,
  summary,
  institutions,
  anchors,
  base,
  instName,
  onChanged,
}: {
  spec: CashFlowSpec<T, P>;
  items: T[];
  /** The figures above, which list the rows they leave out: a row still to
      start or ended says so on its own line. */
  summary: CashFlowSummary | null;
  /** The base the reader chose: what a flow with no account is proposed in. */
  base: string;
  /** Every account's cash anchors: the currency box proposes the linked
      account's on the start date. */
  anchors: CashAnchor[];
  institutions: Institution[];
  instName: (id: number | null) => string | undefined;
  onChanged: () => Promise<void> | void;
}) {
  /* What the currency box proposes while the reader has not typed one (the
     draft's `currency` stays "" until they do): the linked account's currency
     on the start date — its anchor in force then, or its first — and the
     base only with no account, or an account with no anchor. A
     salary credited to a dollar account opened at EUR, hidden, before this. */
  const proposed = (d: Draft) =>
    accountCurrencyOn(
      anchors,
      d.institutionId ? Number(d.institutionId) : null,
      d.startDate || todayISO(),
    ) ?? base;

  const ed = useListEditor<T, P>({
    blank: {
      name: "",
      tag: "",
      category: "",
      amount: "",
      currency: "",
      frequency: "monthly",
      institutionId: "",
      startDate: todayISO(),
      endDate: "",
    },
    toDraft: (i) => ({
      name: i.name,
      tag: spec.tagOf(i) ?? "",
      category: i.category ?? "",
      amount: String(i.amount),
      currency: i.currency,
      frequency: i.frequency ?? "",
      institutionId: i.institution_id ? String(i.institution_id) : "",
      startDate: i.start_date ?? "",
      endDate: i.end_date ?? "",
    }),
    needs: spec.needs,
    toPayload: (d) => {
      return spec.withTag(
        {
          name: d.name.trim(),
          category: d.category || null,
          amount: Number(d.amount),
          currency: d.currency || proposed(d),
          frequency: d.frequency || null,
          institution_id: d.institutionId ? Number(d.institutionId) : null,
          start_date: d.startDate || null,
          end_date: d.endDate || null,
        },
        d.tag || null,
      );
    },
    create: spec.create,
    update: spec.update,
    destroy: spec.destroy,
    confirmDelete: (i) => `删除${spec.noun}「${i.name}」？`,
    onChanged,
  });

  return (
    <Section title={spec.title} hint={spec.hint} note={FIRST_PAYMENT_NOTE}>
      <form onSubmit={ed.submit} className="flex flex-wrap items-center gap-2">
        <input className={inputClass} aria-label="名称" {...marks(spec.needs, "name")} value={ed.draft.name} onChange={(e) => ed.set("name")(e.target.value)} />
        <select className={inputClass} value={ed.draft.tag} onChange={(e) => ed.set("tag")(e.target.value)}>
          {spec.tagOptions.map((t) => (<option key={t} value={t}>{t || `${spec.tagField}…`}</option>))}
        </select>
        <select className={inputClass} value={ed.draft.category} onChange={(e) => ed.set("category")(e.target.value)}>
          {spec.categories.map((c) => (<option key={c} value={c}>{c || "分类…"}</option>))}
        </select>
        <input className={inputClass + " w-28"} type="number" step="0.01" aria-label="金额" {...marks(spec.needs, "amount")} value={ed.draft.amount} onChange={(e) => ed.set("amount")(e.target.value)} />
        <input
          className={inputClass + " w-20"}
          placeholder="货币"
          list={CURRENCY_LIST}
          title="金额所用的货币。默认按首笔收付日该机构的现金货币填写；手动改过就保持你输入的值。"
          value={ed.draft.currency || proposed(ed.draft)}
          onChange={(e) => ed.set("currency")(e.target.value)}
        />
        <select className={inputClass} value={ed.draft.frequency} onChange={(e) => ed.set("frequency")(e.target.value)}>
          {FREQUENCIES.map((f) => (<option key={f} value={f}>{f || "频率…"}</option>))}
        </select>
        <InstitutionSelect value={ed.draft.institutionId} onChange={ed.set("institutionId")} institutions={institutions} />
        <DateField label={flowDateLabel(ed.draft.frequency)} value={ed.draft.startDate} onChange={ed.set("startDate")} />
        <DateField label="结束" value={ed.draft.endDate} onChange={ed.set("endDate")} />
        <EditorButtons editing={ed.editing} submitting={ed.submitting} onCancel={ed.reset} />
      </form>
      {ed.error && <p className="text-down">{ed.error}</p>}
      <RowsOrEmpty loading={false} error={null} empty={items.length === 0} emptyText={spec.emptyText}>
        {items.map((i) => (
          <Row
            key={i.id}
            onEdit={() => ed.startEdit(i)}
            onDelete={() => void ed.destroy(i)}
            title={i.name}
            badge={spec.tagOf(i)}
            subtitle={subtitle([i.category, i.frequency, instName(i.institution_id), dateRange(i.start_date, i.end_date)])}
            detail={summary ? leftOutLine(summary, spec.side, i.id) : undefined}
            note={i.notes}
            value={money(i.currency).format(i.amount)}
          />
        ))}
      </RowsOrEmpty>
    </Section>
  );
}

const INCOME: CashFlowSpec<IncomeSource, IncomeSourceCreate> = {
  side: "income",
  title: "收入",
  hint: "机构 = 入账的地方（记入该机构的现金）。",
  needs: INCOME_NEEDS,
  emptyText: "还没有收入。",
  noun: "收入",
  tagField: "kind",
  tagOptions: KINDS,
  tagOf: (i) => i.kind,
  categories: INCOME_CATEGORIES,
  withTag: (base, tag) => ({ ...base, kind: tag }),
  create: createIncomeSource,
  update: updateIncomeSource,
  destroy: deleteIncomeSource,
};

const EXPENSE: CashFlowSpec<Expense, ExpenseCreate> = {
  side: "expense",
  title: "支出",
  hint: "机构 = 付款的地方（从该机构的现金支出）。",
  needs: EXPENSE_NEEDS,
  emptyText: "还没有支出。",
  noun: "支出",
  tagField: "nature",
  tagOptions: NATURES,
  tagOf: (x) => x.nature,
  categories: EXPENSE_CATEGORIES,
  withTag: (base, tag) => ({ ...base, nature: tag }),
  create: createExpense,
  update: updateExpense,
  destroy: deleteExpense,
};

/** One sum on both sides: the same currency, and nothing lost on the way. */
function sameSum(t: Transfer): boolean {
  return t.to_currency === t.currency && t.to_amount === t.amount;
}

function TransferSection({
  items,
  institutions,
  anchors,
  base,
  instName,
  onChanged,
}: {
  items: Transfer[];
  institutions: Institution[];
  /** The base: what a side with no anchor at all is proposed in. */
  base: string;
  /** Every account's cash anchors: each side's currency is proposed from the
      anchor of its account in force on the transfer's date. */
  anchors: CashAnchor[];
  instName: (id: number | null) => string | undefined;
  onChanged: () => Promise<void> | void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  /* The two sides of a transfer: what left the source account, and what the
     destination was credited in. Each is the reader's choice when they made
     one (null until then) and otherwise the proposal below. `arrived` is the
     credit itself when the reader has it from the destination's statement;
     left blank across two currencies, the backend works it out at the ECB
     rate of the date and says which day. */
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [toCurrencyChoice, setToCurrencyChoice] = useState<string | null>(null);
  const [arrived, setArrived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEditId(null);
    setDate(todayISO());
    setFromId("");
    setToId("");
    setAmount("");
    setCurrencyChoice(null);
    setToCurrencyChoice(null);
    setArrived("");
  }

  function startEdit(t: Transfer) {
    setEditId(t.id);
    setDate(t.date);
    setFromId(t.from_institution_id ? String(t.from_institution_id) : "");
    setToId(t.to_institution_id ? String(t.to_institution_id) : "");
    setAmount(String(t.amount));
    // What a stored transfer says it moved is the reader's, not a proposal:
    // moving its date or its accounts does not rewrite it.
    setCurrencyChoice(t.currency);
    setToCurrencyChoice(t.to_currency);
    // A credit the reader typed comes back into the box; one worked out from a
    // rate does not, so that changing the date works it out again.
    setArrived(t.fx_as_of == null && !sameSum(t) ? String(t.to_amount) : "");
  }

  /* Each side proposes its account's currency on the date: the anchor in force
     then, or the account's first. The base only for an account with no anchor
     at all. An EXTERNAL side has no account to ask, and takes
     the other side's currency — a sum from or to outside is stated in the
     currency of the account it touches, and proposing any other would have
     the backend convert it on the way in. */
  const ownCurrency = (id: string) =>
    id ? (accountCurrencyOn(anchors, Number(id), date) ?? base) : null;
  const fromSide = currencyChoice ?? ownCurrency(fromId);
  const toSide = toCurrencyChoice ?? ownCurrency(toId);
  const currency = fromSide ?? toSide ?? base;
  const toCurrency = toSide ?? fromSide ?? base;

  // Two currencies, or a credit that differs from what left: the second sum
  // cannot be read off the first, so its box is shown.
  const acrossCurrencies = currency.trim() !== toCurrency.trim();
  const showArrived = acrossCurrencies || arrived !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const refused = refusal(TRANSFER, { date, amount, ends: fromId || toId, currency, toCurrency });
    if (refused) {
      setError(refused);
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      date,
      from_institution_id: fromId ? Number(fromId) : null,
      to_institution_id: toId ? Number(toId) : null,
      amount: Number(amount),
      currency: currency.trim(),
      to_currency: toCurrency.trim(),
      // Only when the reader has it: otherwise the backend works it out and
      // records the rate's day.
      to_amount: showArrived && arrived !== "" ? Number(arrived) : null,
    };
    try {
      if (editId != null) await updateTransfer(editId, payload);
      else await createTransfer(payload);
      reset();
      await onChanged();
    } catch (err) {
      setError(apiError(err, "保存失败。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(t: Transfer) {
    if (!window.confirm("删除这笔转账？")) return;
    setError(null);
    try {
      await deleteTransfer(t.id);
      if (editId === t.id) reset();
      await onChanged();
    } catch (err) {
      setError(apiError(err, "删除失败。"));
    }
  }

  return (
    <Section
      title="转账"
      hint="在你名下的两个机构之间划转现金。转出方现金减少，转入方现金增加。跨货币时，到账金额默认按当日 ECB 汇率折算，除非你按对账单手动填写。"
    >
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <DateField label="日期" value={date} onChange={setDate} mark={marks(TRANSFER, "date")} />
        <InstitutionSelect value={fromId} onChange={setFromId} institutions={institutions} placeholder="转出（或外部）…" />
        <span className="text-ink-faint">→</span>
        <InstitutionSelect value={toId} onChange={setToId} institutions={institutions} placeholder="转入（或外部）…" />
        <input className={inputClass + " w-28"} type="number" step="0.01" aria-label="金额" {...marks(TRANSFER, "amount")} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input
          className={inputClass + " w-20"}
          placeholder="货币"
          list={CURRENCY_LIST}
          title="从转出账户划出的货币"
          {...marks(TRANSFER, "currency")}
          value={currency}
          onChange={(e) => setCurrencyChoice(e.target.value)}
        />
        <span className="text-ink-faint">→</span>
        <input
          className={inputClass + " w-20"}
          placeholder="货币"
          list={CURRENCY_LIST}
          title="转入账户入账的货币"
          {...marks(TRANSFER, "toCurrency")}
          value={toCurrency}
          onChange={(e) => setToCurrencyChoice(e.target.value)}
        />
        {showArrived && (
          <input
            className={inputClass + " w-40"}
            type="number"
            step="any"
            min="0"
            placeholder={`到账（${toCurrency || "…"}）`}
            title="转入账户实际入账的金额，按对账单填写。留空则按当日 ECB 汇率折算，与你银行的实际汇率会略有出入。"
            value={arrived}
            onChange={(e) => setArrived(e.target.value)}
          />
        )}
        <button className={btnClass} disabled={submitting}>{submitting ? "..." : editId != null ? "保存" : "添加"}</button>
        {editId != null && (
          <button type="button" onClick={reset} className="rounded-sm px-3 py-2 text-sm text-ink-soft hover:text-ink">
            取消
          </button>
        )}
      </form>
      {error && <p className="text-down">{error}</p>}
      <RowsOrEmpty loading={false} error={null} empty={items.length === 0} emptyText="还没有转账。">
        {items.map((t) => (
          <Row
            key={t.id}
            onEdit={() => startEdit(t)}
            onDelete={() => remove(t)}
            title={`${instName(t.from_institution_id) ?? "外部"} → ${instName(t.to_institution_id) ?? "外部"}`}
            subtitle={[
              t.date,
              // A credit fixed at one day's rate says which day, so it can be
              // held against the statement.
              t.fx_as_of ? `按 ${t.fx_as_of} 的 ECB 汇率` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            note={t.note}
            value={
              sameSum(t)
                ? money(t.currency).format(t.amount)
                : `${money(t.currency).format(t.amount)} → ${money(t.to_currency).format(t.to_amount)}`
            }
          />
        ))}
      </RowsOrEmpty>
    </Section>
  );
}

type TargetDraft = {
  key: number;
  symbol: string;
  name: string;
  isin: string;
  institutionId: string;
  weight: string;
};

let targetKey = 0;
/** `institutionId` is a parameter because a new target row added to a plan
    that already names its source starts AT that source — visibly, in the
    field, not as a fallback applied on the way out. See `pickSource`. */
const emptyTarget = (institutionId = ""): TargetDraft => ({
  key: ++targetKey,
  symbol: "",
  name: "",
  isin: "",
  institutionId,
  weight: "1",
});

/** A plan just saved from its next date, and the accounts it touches, where
    today's situation and cash are recorded. */
type PlanSaved = { name: string; start: string; accounts: Institution[] };

function PlanSection({
  items,
  institutions,
  anchors,
  base,
  positions,
  instName,
  onChanged,
  onOpenAccount,
  saved,
  onSaved,
}: {
  items: AccumulationPlan[];
  institutions: Institution[];
  /** Every account's cash anchors: the plan's currency is proposed from its
      source account's. */
  anchors: CashAnchor[];
  /** The base: what a plan funded by an account with no anchor is proposed in. */
  base: string;
  positions: PortfolioRow[];
  instName: (id: number | null) => string | undefined;
  onChanged: () => Promise<void> | void;
  /** See `CashFlow`'s prop of the same name. */
  onOpenAccount: (i: Institution) => void;
  /** The plan just saved from its next date, until the next save or edit. */
  saved: PlanSaved | null;
  onSaved: (s: PlanSaved | null) => void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  // What the contribution is paid in: the source account's cash. The reader's
  // choice once they typed one (null until then); see `currency` below for the
  // proposal. The funds it buys are priced in their own listings' currencies,
  // converted at each close.
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [frequency, setFrequency] = useState("monthly");
  const [execution, setExecution] = useState("whole_units");
  const [sourceId, setSourceId] = useState("");
  const [targets, setTargets] = useState<TargetDraft[]>([emptyTarget()]);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The next date the one press put in the date box, while the box still
  // holds it: the form then says what is left to do. A date typed over it
  // takes that back.
  const [pressed, setPressed] = useState<string | null>(null);

  // Proposed from the source account on the start date — its anchor in force
  // then, or its first — and the base only for an account with no
  // anchor. A plan funded by a dollar account used to be saved as a euro plan,
  // with no box on the form to say so.
  const currency =
    currencyChoice ??
    accountCurrencyOn(anchors, sourceId ? Number(sourceId) : null, startDate || todayISO()) ??
    base;

  function reset() {
    setEditId(null);
    setName("");
    setAmount("");
    setCurrencyChoice(null);
    setFrequency("monthly");
    setExecution("whole_units");
    setSourceId("");
    setTargets([emptyTarget()]);
    setStartDate(todayISO());
    setEndDate("");
    setPressed(null);
  }

  function startEdit(p: AccumulationPlan) {
    setPressed(null);
    onSaved(null);
    setEditId(p.id);
    setName(p.name);
    setAmount(String(p.amount));
    // A stored plan's currency is what it says, not a proposal.
    setCurrencyChoice(p.currency);
    setFrequency(p.frequency ?? "monthly");
    setExecution(p.execution ?? "whole_units");
    setSourceId(p.source_institution_id ? String(p.source_institution_id) : "");
    setTargets(
      p.targets.length
        ? p.targets.map((t) => ({
            key: ++targetKey,
            symbol: t.symbol,
            name: t.asset_name ?? "",
            isin: t.isin ?? "",
            institutionId: t.institution_id ? String(t.institution_id) : "",
            weight: String(t.weight),
          }))
        : [emptyTarget()],
    );
    setStartDate(p.start_date ?? "");
    setEndDate(p.end_date ?? "");
  }

  function patchTarget(key: number, patch: Partial<TargetDraft>) {
    setTargets((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  /* Most people buy where the cash is, so naming the source answers the second
     question too — and the whole difference between help and a trap is WHERE
     the answer lands.

     It is written into the target's own field, so the select reads "Broker A"
     instead of "Where is it held?" and the reader is looking at the answer
     they are about to save. A fallback applied at submit time would show a
     blank field and send an institution, which on a field this load-bearing is
     how a wrong one gets saved without anybody choosing it.

     Only targets that have not answered yet. A target the reader picked from
     the "you already hold this" lane carries the institution it is ACTUALLY
     held at (`applyPick`), and that is a fact about a real position, not a
     guess — changing the source must not overwrite it.

     Nothing is seeded on LOAD. A saved plan whose target names no institution
     opens with that field blank, exactly as it was stored, because writing a
     value into a form the reader has not touched is how they save something
     they never chose. Naming the source afterwards does seed it — that is a
     deliberate act, and the seeded name is on screen in front of them when
     they press Save. Load and act are different things. */
  function pickSource(v: string) {
    setSourceId(v);
    if (!v) return;
    setTargets((ts) => ts.map((t) => (t.institutionId ? t : { ...t, institutionId: v })));
  }

  // A plan that points at a position you already hold is the normal case, and
  // getting the ticker wrong is not cosmetic: executions are matched to
  // positions by (institution, symbol), so a mistyped ticker silently starts a
  // SECOND position for the same fund instead of adding to the one you have.
  const owned = positions.filter((p) => p.symbol);
  const ownedForPicker = owned.map((p) => ({
    symbol: p.symbol ?? "",
    name: p.asset_name,
    institution: p.institution,
  }));
  const matchOf = (symbol: string) =>
    owned.find((p) => (p.symbol ?? "").toUpperCase() === symbol.trim().toUpperCase());

  // One pick, three sources. The catalogue gives an identity and no ticker;
  // the other two give a ticker. Only the owned lane can also say WHERE the
  // position is held, and filling that is not a nicety: executions are matched
  // by (institution, symbol), so a target with the right ticker at the wrong
  // institution starts a second position just as surely as a typo would.
  function applyPick(key: number, c: InstrumentChoice) {
    if (c.source === "catalogue") {
      patchTarget(key, { name: c.name, isin: c.isin });
      return;
    }
    const patch: Partial<TargetDraft> = { name: c.name, symbol: c.symbol };
    if (c.source === "owned") {
      const inst = institutions.find((i) => i.name === c.institution);
      if (inst) patch.institutionId = String(inst.id);
    }
    patchTarget(key, patch);
  }

  const filled = targets.filter((t) => t.symbol.trim());
  const weightTotal = filled.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);
  const unknown = filled.filter((t) => !matchOf(t.symbol));
  const share = (t: TargetDraft) =>
    weightTotal > 0 ? Math.round(((Number(t.weight) || 0) / weightTotal) * 100) : 0;

  const homeless = filled.filter((t) => !t.institutionId);

  // What this save would write before today, said before it is pressed. An
  // edit starts from the plan as stored, whose own months are not new.
  const stored = editId != null ? (items.find((p) => p.id === editId) ?? null) : null;
  const past = pastBuys(
    { start: startDate, frequency, end: endDate || null },
    stored?.start_date ? { start: stored.start_date, frequency: stored.frequency, end: stored.end_date } : null,
    todayISO(),
  );
  const warning = past ? pastBuysWarning(past, startDate) : null;
  const next = past?.next ?? null;

  /** The accounts a plan touches, the source first: one link each after it is
      saved from its next date. */
  function touched(): Institution[] {
    const ids = [...new Set([sourceId, ...filled.map((t) => t.institutionId)].filter(Boolean))];
    return ids.flatMap((id) => institutions.filter((i) => String(i.id) === id));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const refused = refusal(PLAN, { name, amount, ticker: filled.length > 0 ? "yes" : "", sourceId });
    if (refused) {
      setError(refused);
      return;
    }
    /* Both ends of one sentence: money moves FROM an account INTO a holding,
       and a plan that names neither is describing a purchase nobody made.

       With both blank the plan's spending added itself to the net worth —
       every buy it writes gets `cash_institution_id` from the source, so with
       no source both institution columns are null, the cash register skips a
       row that matches no institution there is, and the position it created
       counts in full. Measured at 1000.00 of cash: two contributions of 100.00
       read 1200.00, with the cash still 1000.00.

       The two are said separately because they fail differently. A missing
       source moves a total. A missing target institution does not — it makes a
       position no situation can photograph and no sale can settle, which is a
       different wrong.

       Last, after the fields the form already required, so the sentence
       arrives when the institution is the one thing left. Both halves are
       needed: the placeholder is `disabled`, so blank cannot be chosen BACK,
       and this catches the two ways it can still be blank here — a form nobody
       has touched, and a plan loaded for editing that was saved without one.
       Validation on its own would leave a pickable option that writes a null;
       a disabled option on its own would let both of those through. */
    // The source's sentence is PLAN's, in required.ts: said by the check
    // above once the plain fields are in.
    if (homeless.length > 0) {
      setError(
        `请说明 ${homeless.map((t) => t.symbol.trim().toUpperCase() || "它").join(", ")} 将存放在哪个机构。没有存放机构的持仓，快照无法拍到它，卖出也无法结算。`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      name: name.trim(),
      amount: Number(amount),
      currency,
      frequency: frequency || null,
      execution: execution || null,
      source_institution_id: Number(sourceId),
      start_date: startDate || null,
      end_date: endDate || null,
      targets: filled.map((t) => ({
        symbol: t.symbol.trim(),
        isin: t.isin.trim().toUpperCase() || null,
        asset_name: t.name.trim() || null,
        institution_id: Number(t.institutionId),
        weight: Number(t.weight) > 0 ? Number(t.weight) : 1,
      })),
    };
    onSaved(null);
    try {
      if (editId != null) await updateAccumulationPlan(editId, payload);
      else await createAccumulationPlan(payload);
      // Saved from the one press: what is left of the better way is the
      // broker's numbers for today, on the pages of the accounts it touches.
      if (pressed !== null && pressed === startDate) {
        onSaved({ name: payload.name, start: startDate, accounts: touched() });
      }
      reset();
      await onChanged();
    } catch (err) {
      setError(apiError(err, "保存失败。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(p: AccumulationPlan) {
    if (!window.confirm(`删除计划「${p.name}」？`)) return;
    setError(null);
    try {
      await deleteAccumulationPlan(p.id);
      if (editId === p.id) reset();
      await onChanged();
    } catch (err) {
      setError(apiError(err, "删除失败。"));
    }
  }

  function planSubtitle(p: AccumulationPlan): string | undefined {
    const total = p.targets.reduce((s, t) => s + (t.weight > 0 ? t.weight : 0), 0) || 1;
    // Show the normalised share, not what was typed: someone who wrote 3 and 2
    // meant 60/40, and 60/40 is what the plan will actually buy.
    const tgt = p.targets.length
      ? p.targets
          .map((t) =>
            p.targets.length > 1
              ? `${t.asset_name || t.symbol} ${Math.round((t.weight / total) * 100)}%`
              : t.asset_name || t.symbol,
          )
          .join(" + ")
      : "暂无标的";
    const insts = [...new Set(p.targets.map((t) => instName(t.institution_id)).filter(Boolean))];
    return subtitle([
      `从 ${instName(p.source_institution_id) ?? "现金"} → ${tgt}`,
      insts.join(", ") || undefined,
      dateRange(p.start_date, p.end_date),
    ]);
  }

  /** Money set aside and not yet invested is the saver's fact, not the
      scheduler's bookkeeping — so it gets the line that does not truncate,
      and cents, which the whole-unit format would round away to "0 €" on a remainder that is
      smaller than one unit by construction. It is a running balance rather
      than one occurrence's change, hence "set aside", not "left over last
      time". Silent when there is nothing waiting.

      A finished plan gets the other sentence, because nothing ever clears the
      remainder when the schedule runs out: promising it to "the next
      contribution" would be promising one that is never coming. */
  function planDetail(p: AccumulationPlan): string | undefined {
    if (!p.carried_remainder) return undefined;
    const amount = money(p.currency, "cents").format(p.carried_remainder);
    const ended = p.end_date != null && p.end_date < todayISO();
    return ended
      ? `${amount} 已留存但从未投入：该计划已结束`
      : `${amount} 已留存，等待下一次投入`;
  }

  return (
    <Section
      title="定投"
      hint="定期买入：每次投多少、买进什么、多久一次。"
      note={PLAN_NOTE}
      explain={{
        question: "定投是怎么运作的？",
        text: "计划要写明两端（每期扣款的账户，以及持仓存放的机构），因为钱从前者流向后者，两端都不写的计划描述的是一笔不存在的买入。多个标的共用一个预算池，整数份额的券商只会留下一笔小额余数（而不是每只基金各留一笔），并结转到下一次投入。",
      }}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className={inputClass} aria-label="计划名称" {...marks(PLAN, "name")} value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputClass + " w-28"} type="number" step="0.01" aria-label="预算" {...marks(PLAN, "amount")} title="每期投入的总金额，按下方标的分配" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input
            className={inputClass + " w-20"}
            placeholder="货币"
            list={CURRENCY_LIST}
            title="每期投入所用的货币：来自出资账户的现金。默认按首笔买入日该账户的货币填写；手动改过就保持你输入的值。"
            value={currency}
            onChange={(e) => setCurrencyChoice(e.target.value)}
          />
          <select className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {PAC_FREQUENCIES.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
          <select
            className={inputClass}
            value={execution}
            onChange={(e) => setExecution(e.target.value)}
            title="你的券商如何成交：只买整数份额（余数留在现金），或按金额精确到分买入。确认你的券商是哪一种，这决定每期买到多少。"
          >
            <option value="whole_units">整数份额</option>
            <option value="fractional">碎股</option>
          </select>
          <InstitutionSelect
            value={sourceId}
            onChange={pickSource}
            institutions={institutions}
            placeholder="哪个账户出资？"
            required
            title="每期扣款的账户。必填：不写钱从哪来的计划无处扣款，它的买入花的是不属于任何账户的钱。"
          />
          <DateField label={PLAN_DATE_LABEL} value={startDate} onChange={setStartDate} />
          <DateField label="结束" value={endDate} onChange={setEndDate} />
        </div>

        {/* In view, under the date that causes it: a consequence, which a "?"
            never holds, said before Add is pressed. */}
        {warning ? (
          <div className="space-y-2 border-l-2 border-warn bg-warn-tint px-3 py-2 text-xs text-warn">
            <p className="max-w-[76ch]">
              <b>{warning.lead}</b> {warning.body}
            </p>
            {warning.alternative && next && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="max-w-[68ch]">{warning.alternative}</p>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(next);
                    setPressed(next);
                  }}
                  className="rounded-sm border border-olive px-3 py-1 text-xs font-medium text-olive transition hover:bg-surface"
                >
                  {warning.button}
                </button>
              </div>
            )}
          </div>
        ) : (
          pressed !== null && pressed === startDate && <p className="text-xs text-ink-soft">{startsLine(pressed)}</p>
        )}

        <div className="flex flex-col gap-2 border-l-2 border-rule pl-3">
          {targets.map((t, i) => (
            <div key={t.key} className="flex flex-wrap items-center gap-2">
              <span className="w-4 text-xs tabular-nums text-ink-faint">{i + 1}</span>
              <InstrumentPicker
                value={t.name}
                onChange={(v) => patchTarget(t.key, { name: v })}
                owned={ownedForPicker}
                placeholder="买什么？输入以搜索"
                onPick={(c) => applyPick(t.key, c)}
              />
              <input className={inputClass + " w-32"} aria-label="代码" placeholder="代码" {...(i === 0 ? marks(PLAN, "ticker") : {})} title="Yahoo 代码，带交易所后缀（如 VWCE.MI）。其他货币的标的按当日 ECB 汇率折算成计划货币，以当日收盘价买入" value={t.symbol} onChange={(e) => patchTarget(t.key, { symbol: e.target.value })} />
              <input className={inputClass + " w-36"} placeholder="ISIN（可选）" value={t.isin} onChange={(e) => patchTarget(t.key, { isin: e.target.value })} />
              <InstitutionSelect
                value={t.institutionId}
                onChange={(v) => patchTarget(t.key, { institutionId: v })}
                institutions={institutions}
                placeholder="存放在哪？"
                required
                title="这笔投资将存放的机构。必填：没有存放机构的持仓，快照无法拍到它，卖出也无法结算。默认已填入计划的出资账户，若这笔买在别处请修改。"
              />
              <input
                className={inputClass + " w-20"}
                type="number"
                step="0.1"
                min="0"
                placeholder="占比"
                title="预算的相对占比：1/1/1 和 40/30/30 是同一个意思"
                value={t.weight}
                onChange={(e) => patchTarget(t.key, { weight: e.target.value })}
              />
              <span className="w-11 text-right text-xs tabular-nums text-ink-soft">
                {t.symbol.trim() && weightTotal > 0 ? `${share(t)}%` : ""}
              </span>
              {targets.length > 1 && (
                <button
                  type="button"
                  onClick={() => setTargets((ts) => ts.filter((x) => x.key !== t.key))}
                  className="rounded-sm px-2 py-1 text-sm text-ink-faint hover:text-down"
                  title="移除该标的"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setTargets((ts) => [...ts, emptyTarget(sourceId)])}
              className="rounded-sm text-sm text-olive hover:underline"
            >
              + 再加一个投资标的
            </button>
            {filled.length > 1 && amount && (
              <span className="text-xs text-ink-faint">
                {money(currency).format(Number(amount))} 按 {filled.map((t) => `${share(t)}%`).join(" / ")} 分配
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className={btnClass} disabled={submitting}>
            {submitting ? "..." : editId != null ? "保存" : "添加"}
          </button>
          {editId != null && (
            <button type="button" onClick={reset} className="rounded-sm px-3 py-2 text-sm text-ink-soft hover:text-ink">
              取消
            </button>
          )}
        </div>
      </form>
      {error && <p className="text-down">{error}</p>}
      {saved && (
        <p className="text-sm text-ink-soft">
          {afterSaveLine(saved.name, saved.start)}{" "}
          {saved.accounts.map((i, n) => (
            <span key={i.id}>
              {n > 0 && " · "}
              <button type="button" onClick={() => onOpenAccount(i)} className="text-olive underline-offset-2 hover:underline">
                打开 {i.name}
              </button>
            </span>
          ))}
        </p>
      )}
      {unknown.length > 0 && (
        <p
          className="border-l-2 border-warn bg-warn-tint px-3 py-2 text-xs text-warn"
          title="成交按代码精确匹配持仓，拼写稍有不同就会为同一只基金静默开出第二个持仓，而不是加到你已有的持仓上。如果你是在为还没买过的标的新开计划，这是正常的：第一笔成交会创建它。"
        >
          <b>{unknown.map((t) => t.symbol.trim().toUpperCase()).join(", ")}</b> 与你持有的任何持仓都不匹配：
          新开计划没问题，但代码拼错会另开一个持仓，而不是加到你已有的持仓上。
        </p>
      )}
      <RowsOrEmpty loading={false} error={null} empty={items.length === 0} emptyText="还没有定投。">
        {items.map((p) => (
          <Row
            key={p.id}
            onEdit={() => startEdit(p)}
            onDelete={() => remove(p)}
            title={p.name}
            badge={p.frequency}
            subtitle={planSubtitle(p)}
            detail={planDetail(p)}
            note={p.notes}
            value={money(p.currency).format(p.amount)}
          />
        ))}
      </RowsOrEmpty>
    </Section>
  );
}
