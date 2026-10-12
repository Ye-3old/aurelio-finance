import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import {
  createInstitution,
  deleteInstitution,
  getInstitution,
  getInstitutions,
  updateInstitution,
  type Institution,
} from "../api/institutions";
import {
  createPrefilledSnapshot,
  createSnapshot,
  deleteSnapshot,
  getSnapshot,
  getSnapshots,
  type Snapshot,
} from "../api/snapshots";
import {
  createHolding,
  deleteHolding,
  getHoldings,
  updateHolding,
  type Holding,
  type HoldingCreate,
} from "../api/holdings";
import { getListingCurrencies, getQuote, refreshHoldingPrice } from "../api/prices";
import { getPortfolio, type PortfolioRow } from "../api/portfolio";
import type { ArrivedPosition, OmittedPosition } from "../api/dashboard";
import { OmissionsNotice } from "./OmissionsNotice";
import { InstrumentPicker } from "./InstrumentPicker";
import type { Focus } from "../nav";
import {
  createCashAnchor,
  deleteCashAnchor,
  getCashAnchors,
  getCashPosition,
  updateCashAnchor,
  type CashAnchor,
  type CashPosition,
} from "../api/cash";
import {
  Breadcrumb,
  Row,
  RowsOrEmpty,
  Section,
  apiError,
  btnClass,
  cardClass,
  inputClass,
  locale,
  todayISO,
  type Crumb,
  CURRENCY_LIST,
} from "./ui";
import { CancelButton, money, policyWord } from "./ui";
import { accountCurrencyOn, listingCurrencyOf } from "./proposedCurrency";
import { CASH_ANCHOR, INSTITUTION, holding, marks, refusal } from "./required";
import { absentTickerCost } from "./absentTicker";
import { DatedAmountEditor } from "./DatedAmountEditor";
import { classOnSave, sortIntoBuckets, type Bucket } from "./buckets";
import { GONE, reread } from "./reopen";
import { dayCount, daysAgo } from "./calendarDays";
import { closeTooFar } from "./closeGap";
import { dividendWord } from "./dividendLine";

// The occasional, destructive twin of a primary action: same size, same
// shape, warning colour. `btnClass` is for the action you take every time;
// this is for the one that replaces what is already there — a difference in
// weight, never in size, because a control that can delete something must not
// be the smallest thing on its form.
const dangerBtnClass =
  "rounded-sm border border-warn px-4 py-2 text-sm font-medium tracking-wide text-warn transition hover:bg-warn-tint disabled:opacity-50";

// The backend's refusals are written as sentences but end without a full stop
// ("Broker B already has a situation on 2026-09-06"), and what we add after one
// has to read as a second sentence rather than a run-on.
const asSentence = (s: string) => (s.endsWith(".") || s.endsWith("。") ? s : s + "。");

// ---- Drill-down: Institutions -> (Cash register + Investment situations) ----
/* Which account and which situation are open is App's state, not this page's.
   It used to be local, which made it the one place in the app a question
   could be about that nothing outside could see: the chat is told what is on
   screen, and "this" on an account's page is that account. `8ac9139` lifted the
   Records sub-page for the same reason, and the same consequence follows — the
   drill-down is where you left it when you come back to Records.

   On arrival both are read again (see reopen.ts). Two levels here where the
   other pages have one, so the climb is written out: a situation that is gone
   climbs to its account, an account that is gone to the list. */
export default function Wealth({
  go,
  institution,
  onInstitution,
  snapshot,
  onSnapshot,
}: {
  go: (f: Focus) => void;
  institution: Institution | null;
  onInstitution: (i: Institution | null) => void;
  snapshot: Snapshot | null;
  onSnapshot: (s: Snapshot | null) => void;
}) {
  // What was open when this page was arrived at. Captured once, so the check
  // below runs for the page you came back to and not for every click inside it.
  const [arrived] = useState(() => ({ institution, snapshot }));
  const [checked, setChecked] = useState(arrived.institution === null);

  useEffect(() => {
    if (arrived.institution === null) return;
    const account = arrived.institution;
    let live = true;
    void (async () => {
      const inst = await reread(() => getInstitution(account.id));
      if (!live) return;
      if (inst === GONE) {
        onSnapshot(null);
        onInstitution(null);
      } else {
        if (inst) onInstitution(inst);
        if (arrived.snapshot) {
          const situation = arrived.snapshot;
          const snap = await reread(() => getSnapshot(situation.id));
          if (!live) return;
          if (snap === GONE || (snap && snap.institution_id !== account.id)) onSnapshot(null);
          else if (snap) onSnapshot(snap);
        }
      }
      setChecked(true);
    })();
    return () => {
      live = false;
    };
  }, [arrived, onInstitution, onSnapshot]);

  if (!checked) return null;

  const crumbs: Crumb[] = [
    {
      label: "机构",
      active: !institution,
      onClick: () => {
        onInstitution(null);
        onSnapshot(null);
      },
    },
  ];
  if (institution)
    crumbs.push({
      label: institution.name,
      active: !snapshot,
      onClick: () => onSnapshot(null),
    });
  if (snapshot)
    crumbs.push({ label: snapshot.date, active: true, onClick: () => {} });

  return (
    <div className="space-y-5">
      <Breadcrumb items={crumbs} />
      {!institution && <InstitutionsLevel onSelect={onInstitution} />}
      {institution && !snapshot && (
        <InstitutionLevel institution={institution} onSelect={onSnapshot} go={go} />
      )}
      {snapshot && <SituationDetail snapshot={snapshot} />}
    </div>
  );
}

function InstitutionsLevel({ onSelect }: { onSelect: (i: Institution) => void }) {
  const [items, setItems] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The form's refusals and failed saves, apart from a failed load: RowsOrEmpty
  // shows an error INSTEAD of the rows, so a sentence about the form must not
  // go there (SnapshotsLevel learned this first).
  const [formError, setFormError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await getInstitutions());
    } catch (err) {
      setError(apiError(err, "无法连接后端，后端是否在 :8000 上运行？"));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setEditId(null);
    setName("");
    setType("");
  }

  function startEdit(it: Institution) {
    setEditId(it.id);
    setName(it.name);
    setType(it.type ?? "");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const refused = refusal(INSTITUTION, { name });
    if (refused) {
      setFormError(refused);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const payload = { name: name.trim(), type: type.trim() || null };
    try {
      if (editId != null) await updateInstitution(editId, payload);
      else await createInstitution(payload);
      reset();
      await load();
    } catch (err) {
      setFormError(apiError(err, "保存失败。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(it: Institution) {
    if (!window.confirm(`删除「${it.name}」？它的快照、持仓和现金锚点也会一并删除。`)) return;
    setError(null);
    try {
      await deleteInstitution(it.id);
      if (editId === it.id) reset();
      await load();
    } catch (err) {
      setError(apiError(err, "删除失败。"));
    }
  }

  return (
    <Section title="机构">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input className={inputClass} aria-label="银行或券商名称" {...marks(INSTITUTION, "name")} value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputClass} placeholder="类型（如：银行）" value={type} onChange={(e) => setType(e.target.value)} />
        <button className={btnClass} disabled={submitting}>{submitting ? "..." : editId != null ? "保存" : "添加"}</button>
        {editId != null && <CancelButton onClick={reset} />}
      </form>
      {formError && <p className="text-down">{formError}</p>}
      <RowsOrEmpty loading={loading} error={error} empty={items.length === 0} emptyText="还没有机构。">
        {items.map((it) => (
          <Row
            key={it.id}
            onClick={() => onSelect(it)}
            onEdit={() => startEdit(it)}
            onDelete={() => remove(it)}
            title={it.name}
            badge={it.type}
            // "One situation" is worth saying out loud: it means there is no
            // history here at all — nothing for the wealth chart to draw
            // between, and every quantity as old as that single day.
            subtitle={
              it.snapshot_count === 0
                ? "还没有记录快照"
                : it.snapshot_count === 1
                  ? `仅一份快照（${it.latest_snapshot}），还没有可对比的历史`
                  : `${it.snapshot_count} 份快照 · 最新 ${it.latest_snapshot}`
            }
            note={it.notes}
          />
        ))}
      </RowsOrEmpty>
    </Section>
  );
}

// Institution detail = its live cash register + its dated investment snapshots.
function InstitutionLevel({
  institution,
  onSelect,
  go,
}: {
  institution: Institution;
  onSelect: (s: Snapshot) => void;
  go: (f: Focus) => void;
}) {
  return (
    <div className="space-y-6">
      <CashRegister institution={institution} go={go} />
      <SnapshotsLevel institution={institution} onSelect={onSelect} />
    </div>
  );
}

/* A term of the cash register's sentence below, and the way to the page that
   owns it.

   The sentence names six quantities and this page is the sole home of ONE of
   them — the anchor, whose list sits directly under this card. So the anchor
   is deliberately not a link: it would lead to where the reader already is.
   The other five are typed in Records → Cash flow and in Portfolio's ledger,
   and until now the page that adds them up named none of them. The link does
   not hide the split between grouping by account and grouping by kind; it
   admits it, and walks you across.

   A ZERO LINKS LIKE ANY OTHER NUMBER, which is the deliberate part. On a
   freshly anchored account five of these six terms read €0 — measured, on a
   re-based anchor: "+ income €0 − expenses €0 · transfers +€0 / −€0 − buys €0
   + sells/dividends €0". And "income €0" with a salary on file that has not
   come round since the anchor date reads exactly like "income €0" with no
   salary at all. The link is the whole difference between them: it goes to the
   one page that can tell them apart. Suppressing it on a zero would withdraw
   the explanation at the moment the number explains itself least. */
function Term({
  go,
  to,
  dest,
  children,
}: {
  go: (f: Focus) => void;
  to: Focus;
  /** Named in the tooltip rather than implied: a link out of an explanation
      should say where it goes before it is pressed, not after. */
  dest: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => go(to)}
      title={dest}
      className="cursor-pointer rounded-sm underline decoration-1 underline-offset-2 hover:text-ink"
    >
      {children}
    </button>
  );
}

function CashRegister({
  institution,
  go,
}: {
  institution: Institution;
  go: (f: Focus) => void;
}) {
  const [position, setPosition] = useState<CashPosition | null>(null);
  const [anchors, setAnchors] = useState<CashAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    void load();
  }, [institution.id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pos, anc] = await Promise.all([
        getCashPosition(institution.id),
        getCashAnchors(institution.id),
      ]);
      setPosition(pos);
      setAnchors(anc);
    } catch (err) {
      setError(apiError(err, "无法加载该账户的现金。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      title="现金"
      aside={
        // Nothing while it loads, as the investments half does: "unknown"
        // is for a position that failed to load, not one still on its way.
        !position && loading ? undefined : (
          <span className="text-right text-sm text-ink-soft">
            今日{" "}
            <span className="text-xl font-semibold text-ink">
              {position ? money(position.base_currency).format(position.projected) : "未知"}
            </span>
          </span>
        )
      }
    >
      {position && position.anchor_date && (
        <p className="text-xs text-ink-soft">
          从锚点 {money(position.base_currency).format(position.anchor_amount)}（{position.anchor_date}）起：{" "}
          <Term go={go} to="income" dest="记录 → 现金流，收入在此录入">
            + 收入 {money(position.base_currency).format(position.income)}
          </Term>{" "}
          <Term go={go} to="expenses" dest="记录 → 现金流，支出在此录入">
            − 支出 {money(position.base_currency).format(position.expenses)}
          </Term>{" "}
          ·{" "}
          <Term go={go} to="transfers" dest="记录 → 现金流，转账在此录入">
            转账 +{money(position.base_currency).format(position.transfers_in)} / −
            {money(position.base_currency).format(position.transfers_out)}
          </Term>{" "}
          <Term go={go} to="ledger" dest="持仓的流水，买入在此录入">
            − 买入 {money(position.base_currency).format(position.buys)}
          </Term>{" "}
          <Term go={go} to="ledger" dest="持仓的流水，卖出和分红在此录入">
            + 卖出/分红 {money(position.base_currency).format(position.sells)}
          </Term>
        </p>
      )}
      {position && !position.anchor_date && anchors.length === 0 && (
        <p className="text-xs text-warn">
          还没有锚点。请在下方填写某一天持有的实际现金。该日期之后关联的收入、支出和转账会自动推算。
        </p>
      )}
      {position && !position.anchor_date && anchors.length > 0 && (
        <p className="text-xs text-warn">
          最早的锚点日期是 {anchors[0].date}，在未来，现金将从该日起推算。若你指的是「今天」，请用 ✎ 修改。
        </p>
      )}

      <DatedAmountEditor
        items={anchors}
        loading={loading}
        loadError={error}
        dateOf={(a) => a.date}
        amountOf={(a) => a.amount}
        subtitleOf={() => "实际余额"}
        currencyOf={(a) => a.currency}
        // An anchor is where an account's currency is SAID, and every proposal
        // elsewhere reads it back: a second anchor opening at the new-row
        // currency would turn a dollar account into a euro one from its date,
        // and every later entry with it. So a new anchor proposes the currency
        // of the anchor in force on its date — the account's own — and the
        // base only for an account with none, as its register declares it.
        proposedCurrency={(date) =>
          accountCurrencyOn(anchors, institution.id, date) ?? position?.base_currency ?? ""
        }
        toPayload={(date, amount, currency) => ({
          date,
          amount,
          currency,
        })}
        create={(p) => createCashAnchor(institution.id, p)}
        update={updateCashAnchor}
        destroy={deleteCashAnchor}
        onChanged={load}
        noun="现金锚点"
        dateLabel="余额日期"
        // Today, because the common case is typing in the cash you are holding
        // as you read it — unlike a valuation, which is as of a day on a
        // statement and should be picked deliberately.
        blankDate={todayISO()}
        amountLabel="实际现金"
        needs={CASH_ANCHOR}
        amountWidth="w-32"
        addLabel="添加锚点"
        emptyText="还没有锚点。"
      />
    </Section>
  );
}

function SnapshotsLevel({
  institution,
  onSelect,
}: {
  institution: Institution;
  onSelect: (s: Snapshot) => void;
}) {
  const [items, setItems] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Failing to CREATE one and failing to LOAD the list are different failures
  // and were the same piece of state: a refusal here used to be handed to
  // RowsOrEmpty, which renders the error INSTEAD of the rows — so the 409
  // "that date is taken" hid the very situation it was talking about.
  const [formError, setFormError] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  // What the app currently records in THIS account, and what it has already
  // failed to account for. Both come from the same read: the projection is
  // what an empty situation would drop, and the omissions are what dropping
  // one previously did. This page is where that situation is written, and
  // until now it was the only page that never mentioned either.
  const [held, setHeld] = useState<PortfolioRow[]>([]);
  const [missing, setMissing] = useState<OmittedPosition[]>([]);
  const [instead, setInstead] = useState<ArrivedPosition[]>([]);
  // Whether that read came back at all. An empty `held` used to mean two
  // different things at once — this account holds nothing, and the portfolio
  // did not load — and the page rendered both as the same silence. Measured:
  // with `/api/dashboard/portfolio` returning 500, the specimen account looked
  // exactly like an account with no investments in it. "Nobody answered" and
  // "there is nothing there" are different claims — presenting the first as
  // the second teaches a reader to believe a total that was never computed,
  // which is the one habit this app exists to break.
  const [heldUnknown, setHeldUnknown] = useState(false);
  // The unit of `held`'s figures, as the portfolio payload declared it.
  const [heldBase, setHeldBase] = useState<string | null>(null);

  // Market value where a market priced it, the value its situation was
  // recorded at where none did — the same fallback the Dashboard's total uses,
  // and `heldCarried` is the same admission it makes: the share of a total
  // that is a figure carried forward rather than one anybody quoted today.
  // Stating it is not caution, it is the difference between a number and a
  // number you can act on.
  const heldCarried = held
    .filter((r) => r.market_value === null)
    .reduce((s, r) => s + r.book_value, 0);
  const heldTotal =
    held.reduce((s, r) => s + (r.market_value ?? 0), 0) + heldCarried;

  // The situation already sitting on the chosen date, if there is one. One
  // photograph per institution per date is the model, so this is not an error
  // state: it is the answer to "what happens if I press the button", known
  // from a list we already hold, before any round trip. The 409 stays the
  // guarantee — this is only the courtesy of saying it while the reader picks.
  const taken = items.find((s) => s.date === date) ?? null;

  // A refusal is red. The same fact, stated before the reader has pressed
  // anything, is not a failure and must not be dressed as one.
  const noticeClass = formError
    ? "border-l-2 border-down bg-down-tint px-3 py-2 text-xs text-down"
    : "border-l-2 border-rule bg-surface px-3 py-2 text-xs text-ink-soft";

  useEffect(() => {
    void load();
  }, [institution.id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await getSnapshots(institution.id));
      // Not fatal, and deliberately not folded into `error`: a portfolio that
      // will not load must not take the situations list down with it. The
      // warning simply has nothing to say.
      try {
        const p = await getPortfolio();
        setHeldBase(p.base_currency);
        const mine = (r: { institution_id?: number | null }) =>
          r.institution_id === institution.id;
        setHeld(
          p.rows.filter(
            (r) => mine(r) && !r.closed_on && (r.quantity === null || r.quantity > 0),
          ),
        );
        setMissing((p.unresolved_omissions ?? []).filter(mine));
        setInstead((p.declared_instead ?? []).filter(mine));
        setHeldUnknown(false);
      } catch {
        setHeld([]);
        setMissing([]);
        setInstead([]);
        // Said once, in the figure's own place. The omissions notice is fed by
        // this same read, so a failure here silently empties that too — one
        // admission beside the total covers both, and there is no second place
        // for the page to apologise from.
        setHeldUnknown(true);
      }
    } catch (err) {
      setError(apiError(err, "无法加载快照。"));
    } finally {
      setLoading(false);
    }
  }

  // Enter in the date field must do the SAFE thing. An empty situation becomes
  // the authority for the whole institution the moment it is saved, so hitting
  // return by reflex would wipe every position — which is why the default is
  // "start from the last one" whenever there is one to start from.
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (taken) return;
    if (items.length > 0) return void prefill();
    await createEmpty();
  }

  // Both paths end the same way now, win or lose: re-read the list, and leave
  // the date exactly where the reader put it.
  //
  // The dead end was here. This one used to re-arm the field with today, so
  // after recording today's situation the box held the single date the
  // uniqueness rule had just spent: buttons enabled, refusal guaranteed.
  // `prefill` did the opposite and blanked the field. One form cannot hold two
  // answers to the same question, and neither answer is needed any more — the
  // date just used is a date `taken` recognises, so the form disables itself
  // and points at the situation rather than offering to create it twice.
  async function createEmpty() {
    if (!date || taken) return;
    // Keyed on what this account HOLDS, not on whether it has been
    // photographed before. The guard used to ask `items.length > 0`, on the
    // premise written beside the button: the danger is "replaces the previous
    // one", so an account with no previous one is not in danger. That premise
    // died with `ca4858d`, which let a buy alone create a position — after it
    // an account can hold value with no situation at all, and its FIRST
    // situation can delete every one of them. Measured on a fresh database:
    // 610.00 of ledger-born positions gone, no dialog before it and, until
    // this sequence, nothing said after it either.
    if (
      held.length > 0 &&
      !window.confirm(
        // One multi-line template literal, so the dialog's shape is visible
        // in the source instead of reconstructed from escapes.
        `\u7a7a\u767d\u5feb\u7167\u5c06\u6210\u4e3a\u8be5\u8d26\u6237 ${date} \u7684\u6743\u5a01\u8bb0\u5f55\u3002

${held.length === 1 ? "\u8be5\u6301\u4ed3" : `\u8fd9 ${held.length} \u4e2a\u6301\u4ed3`}\u82e5\u4e0d\u5728\u6b64\u91cd\u65b0\u5f55\u5165\uff0c\u5c06\u4ece\u4f60\u7684\u51c0\u8d44\u4ea7\u4e2d\u6d88\u5931\uff1a

    ${held.map((r) => r.asset_name).join(" \u00b7 ")}

\u5b83\u4eec\u4f1a\u88ab\u6807\u8bb0\u4e3a\u4e0b\u843d\u4e0d\u660e\uff0c\u800c\u4e0d\u662f\u88ab\u6084\u6084\u5220\u9664\u3002

\u300c\u4ece\u4e0a\u4e00\u4efd\u7ee7\u7eed\u300d\u4f1a\u4fdd\u7559\u5b83\u4eec\u3002\u4ecd\u8981\u7ee7\u7eed\u5417\uff1f`,
      )
    )
      return;
    setSubmitting(true);
    setFormError(null);
    setPrefillNote(null);
    try {
      await createSnapshot(institution.id, { date });
    } catch (err) {
      setFormError(apiError(err, "创建失败。"));
    } finally {
      // Reloaded even on failure: a refusal about a date can only point at the
      // situation holding it if the list in hand is the current one.
      await load();
      setSubmitting(false);
    }
  }

  // The everyday path. A situation that omits a position deletes it, so a
  // blank date would mean re-declaring the whole account from memory — and
  // every re-declaration is a chance to lose a row by forgetting it. Starting
  // from the previous positions turns that into a review, and everything with
  // a ticker arrives already valued at the new date.
  async function prefill() {
    if (!date || taken) return;
    setSubmitting(true);
    setFormError(null);
    setPrefillNote(null);
    try {
      const s = await createPrefilledSnapshot(institution.id, {
        date,
      });
      setPrefillNote(
        s.needs_attention.length
          ? `已从 ${s.copied_from} 复制。${s.repriced.length} 个已按市场价重估。只有 ${s.needs_attention.join("、")} 还需要你处理。`
          : `已从 ${s.copied_from} 复制，全部 ${s.repriced.length} 个持仓均已按市场价重估。`,
      );
    } catch (err) {
      setFormError(apiError(err, "无法从上一份快照开始。"));
    } finally {
      await load();
      setSubmitting(false);
    }
  }

  async function remove(s: Snapshot) {
    if (!window.confirm(`删除 ${s.date} 的快照？它的持仓也会一并删除。`)) return;
    setError(null);
    setFormError(null);
    try {
      await deleteSnapshot(s.id);
      await load();
    } catch (err) {
      setError(apiError(err, "删除失败。"));
    }
  }

  return (
    <Section
      title="投资快照"
      /* The other half of "how much do I have here?". The page already had
         these rows: `held` is fetched for the omissions notice and for the
         dialog that names what an empty situation would drop, so this is the
         total of a read already paid for, not a new call.

         It does NOT sum cash and investments into one figure. The two are
         different claims — one is a balance a person can check against a
         statement, the other a projection re-priced by a market — and adding
         them would hide which half moved. Putting them in the same spot,
         one section above the other, is what a reader needed: before this,
         answering the question meant leaving the page named after the
         account. */
      aside={
        /* The figure is stated in all three of its states, because the reader
           asking "how much do I have here?" is owed an answer or an admission,
           and never a blank. It used to appear only when something was held —
           so an account with no investments said nothing where the number goes,
           and the reader had to infer zero from an absence.

           That inference is a trap. An account with three situations, the
           newest of them empty, carries a notice saying an amount left the
           totals with nothing saying where it went. Its investment half is
           0.00 and the largest figure on the lower screen is that amount, from
           an older situation it no longer holds. A page that stays silent
           there is not being quiet, it is letting a stale row answer for it. */
        loading ? undefined : (
          <span className="text-right text-sm text-ink-soft">
            持有{" "}
            <span className="text-xl font-semibold text-ink">
              {heldUnknown || heldBase == null ? "未知" : money(heldBase).format(heldTotal)}
            </span>
            {heldUnknown ? (
              <span className="block text-xs text-warn">
                持仓未能加载：这不是零
              </span>
            ) : (
              heldCarried > 0 &&
              heldBase != null && (
                <span className="block text-xs text-ink-faint">
                  {/* Naming the share is the point, so it must not name the
                      whole thing twice: when nothing here was priced, "€2 of
                      it" beside "held €2" makes a reader check whether two
                      figures differ.

                      It no longer says WHERE the figure was carried from. A
                      row reaches this total from a situation or from a ledger
                      buy, and nothing on it says which — so "carried from a
                      situation" was printed above "No situations yet." on an
                      account whose only position came from the ledger, two
                      statements contradicting each other on one screen. What
                      the reader needs is the part that is true of both: this
                      much of the total is a figure somebody recorded, not one
                      a market quoted today. */}
                  {heldCarried === heldTotal
                    ? "沿用记录值，未经市场定价"
                    : `其中 ${money(heldBase).format(heldCarried)} 沿用记录值，未经市场定价`}
                </span>
              )
            )}
          </span>
        )
      }
      hint="你在某个日期的投资持仓。现金在上面的「现金」一节。"
      note="更新时，从上一份开始填新日期。编辑旧快照会改写当天的记录。"
    >
      {/* What this account has already failed to account for, on the page where
          the situation that did it is written. The Dashboard and the Portfolio
          both carried this warning; the one screen that never mentioned it was
          the one the reader is standing on when they cause it — and the rows it
          names are this account's, so a whole-portfolio total said here would
          be about four other accounts as well. It sits ABOVE the form on
          purpose: the outstanding question comes before the chance to declare
          another situation on top of it. */}
      {heldBase != null && (
        <OmissionsNotice items={missing} arrivals={instead} where="在持仓中" baseCurrency={heldBase} />
      )}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input className={inputClass} type="date" aria-label="日期" value={date} onChange={(e) => setDate(e.target.value)} />
        <button
          type="button"
          onClick={prefill}
          disabled={submitting || !date || items.length === 0 || taken !== null}
          className={btnClass}
          title={
            items.length === 0
              ? "还没有可起步的快照：该账户的第一份快照需要手动建立。"
              : "复制最新快照的持仓和数量，按此日期对所有带代码的持仓重新定价，并告诉你哪些行还需要处理"
          }
        >
          {submitting ? "..." : "从上一份继续"}
        </button>
        {/* The destructive one, and it used to be the smallest thing here:
            lowercase text beside a solid button, reading as a link while being
            the only control on the form that can delete anything. Its danger
            is not intrinsic — but it is not "replaces the previous one"
            either, which is what this used to be keyed on. It is "becomes the
            authority for everything this account holds", and the ledger can
            fill an account that has never been photographed. So an account
            with nothing in it is safe and looks it; an account with positions
            in it takes the warning colour whether or not it has ever had a
            situation. The LABEL still follows the situations, because the
            first one is genuinely the first one. */}
        <button
          type="button"
          onClick={createEmpty}
          className={held.length === 0 ? btnClass : dangerBtnClass}
          disabled={submitting || !date || taken !== null}
          title={
            held.length === 0
              ? "从零开始建立该账户在此日期的持仓记录。"
              : `空白快照将成为该账户的权威记录：这里记录的 ${held.length} 个持仓若不重新录入，将从你的净资产中消失。`
          }
        >
          {items.length === 0 ? "建立第一份快照" : "从空白开始"}
        </button>
      </form>
      {prefillNote && (
        <p className="border-l-2 border-olive bg-olive/5 px-3 py-2 text-xs text-ink-soft">
          {prefillNote}
        </p>
      )}
      {/* The refusal, and the row it is about. That row is on this very page,
          and the 409 used to name neither it nor a way to it: "already exists"
          is only half an answer when the thing that exists is one click away.
          The other half is what to do instead — change the date — which the
          reader had to discover for themselves. */}
      {taken ? (
        <p className={noticeClass}>
          {asSentence(formError ?? `${taken.date} 已有快照`)}{" "}
          <button
            type="button"
            onClick={() => onSelect(taken)}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            打开它
          </button>
          ，或换一个日期记录新的快照。
        </p>
      ) : formError ? (
        <p className={noticeClass}>{formError}</p>
      ) : null}
      <RowsOrEmpty loading={loading} error={error} empty={items.length === 0} emptyText="还没有快照。">
        {items.map((s) => (
          <Row key={s.id} onClick={() => onSelect(s)} onDelete={() => remove(s)} title={s.date} note={s.note} value={money(s.base_currency).format(s.value_base)} />
        ))}
      </RowsOrEmpty>
    </Section>
  );
}

function SituationDetail({ snapshot }: { snapshot: Snapshot }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  // What a new position's currency is proposed from: the listing's when the
  // price cache knows it, and otherwise the account's on this situation's date.
  const [anchors, setAnchors] = useState<CashAnchor[]>([]);
  const [listing, setListing] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [snapshot.id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [h, a, l] = await Promise.all([
        getHoldings(snapshot.id),
        getCashAnchors(snapshot.institution_id),
        getListingCurrencies(),
      ]);
      setHoldings(h);
      setAnchors(a);
      setListing(l);
    } catch (err) {
      setError(apiError(err, "无法加载持仓。"));
    } finally {
      setLoading(false);
    }
  }

  // `value_base`, never `value`: the second is what the reader typed, in
  // whatever currency they typed it in, and adding two of those together is
  // how 89.40 lira came to sit under a euro sign fifteen pixels beneath the
  // same position valued at 2. The API converts each row; this only adds up.
  const total = holdings.reduce((acc, h) => acc + h.value_base, 0);
  // The unit those converted rows declare; the situation's own when it holds none.
  const baseCurrency = holdings[0]?.base_currency ?? snapshot.base_currency;
  // Counted between calendar days. Rounded from the hours since midnight, it
  // made today's own situation "1 days ago" from noon on, with the warning
  // below telling the reader to start the day they were already in.
  const ageDays = daysAgo(snapshot.date);
  const isPast = ageDays > 0;

  if (loading) return <p className="text-ink-soft">加载中…</p>;
  if (error) return <p className="text-down">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-ink">快照：{snapshot.date}</h2>
        <span className="text-sm text-ink-soft">
          合计 <span className="font-semibold text-ink">{money(baseCurrency).format(total)}</span>
        </span>
      </div>
      <p className="text-sm text-ink-soft">
        现金不在这里录入：它属于该账户的「现金」一节，两边都录会重复计算。
      </p>
      {/* Editing today's photograph is ordinary bookkeeping — you are still
          filling it in. Editing an old one rewrites what that day SAID, which
          is a different act with the same gesture, and the app never told the
          two apart. Only the second is worth a warning. */}
      {isPast && (
        <p
          className="border-l-2 border-warn bg-warn-tint px-3 py-2 text-sm text-warn"
          title="编辑旧快照会改写当天的记录：财富图表会把今天的数字当成当年的数字，与记录值的盈亏也会失真，因为快照开始追着市场跑。"
        >
          <b>{snapshot.date}</b> 的快照，{dayCount(ageDays)}前：在此编辑会改写当天的记录。今天的请用「从上一份继续」。
        </p>
      )}
      {/* Every holding in exactly one bucket, or the buckets stop adding up to
          the total above — see buckets.ts. */}
      {sortIntoBuckets(holdings).map(({ bucket, holdings: shown }) => (
        <BucketSection
          key={bucket.cls}
          bucket={bucket}
          snapshotDate={snapshot.date}
          snapshotId={snapshot.id}
          holdings={shown}
          baseCurrency={baseCurrency}
          accountCurrency={accountCurrencyOn(anchors, snapshot.institution_id, snapshot.date)}
          listing={listing}
          onChanged={load}
        />
      ))}
    </div>
  );
}

function BucketSection({
  bucket,
  snapshotId,
  snapshotDate,
  holdings,
  baseCurrency,
  accountCurrency,
  listing,
  onChanged,
}: {
  bucket: Bucket;
  snapshotId: number;
  // The date this photograph claims to describe. It gates the quantity
  // derivation below: dividing an OLD value by TODAY's price fabricates a
  // number of units that never existed.
  snapshotDate: string;
  holdings: Holding[];
  /** The base the situation's converted figures are in, as declared. */
  baseCurrency: string;
  /** The account's currency on the situation's date (its anchor in force), or
      null for an account with no anchor. */
  accountCurrency: string | null;
  /** The listing currencies the price cache knows, by symbol. */
  listing: Record<string, string>;
  onChanged: () => Promise<void> | void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  // The class of the row being edited, kept as it was: a bucket shows more than
  // one class, and saving must not rename a `fund_etf` to the bucket's `equity`.
  const [editClass, setEditClass] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [isin, setIsin] = useState("");
  const [cost, setCost] = useState("");
  const [mode, setMode] = useState<"total" | "qty">("total");
  const needs = holding(mode);
  const [value, setValue] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [distPolicy, setDistPolicy] = useState("");
  // What leaving the ticker empty costs this row as it stands (absentTicker.ts):
  // said under the form while it is being written, and read with the ticker box.
  const tickerCost = absentTickerCost({
    name,
    symbol,
    isin,
    mode,
    policy: distPolicy,
    assetClass: classOnSave(bucket, editId != null ? { asset_class: editClass } : null),
  });
  const tickerCostId = useId();
  // The ISIN sits behind a disclosure. Its cost is conditional: with a
  // ticker the look-through finds the ISIN itself, and when it cannot, its
  // reason says "Add the fund's ISIN to this holding", pointing here; with
  // no ticker, the line above says so. It opens by itself whenever it holds a
  // value, so a stored or picked ISIN is never hidden. The dividend policy
  // stays in view: an empty one loses a paying security's dividends.
  const [isinOpen, setIsinOpen] = useState(false);
  const isinShown = isinOpen || isin.trim() !== "";
  const [submitting, setSubmitting] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  /* The position's currency: the reader's choice when they typed one (null
     until then), otherwise the proposal — the listing's, as the price cache
     knows it or as a quote in this form just said, then the account's on the
     situation's date, then the base for an account with no anchor.
     A quote teaches the proposal; it no longer overwrites a currency typed by
     hand. */
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [learned, setLearned] = useState<Record<string, string>>({});
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currency =
    currencyChoice ??
    listingCurrencyOf({ ...listing, ...learned }, symbol) ??
    accountCurrency ??
    baseCurrency;

  // Converted rows only — see the situation's total, one component up.
  const subtotal = holdings.reduce((acc, h) => acc + h.value_base, 0);
  const computed =
    mode === "qty" && quantity && unitPrice ? Number(quantity) * Number(unitPrice) : null;

  function reset() {
    setEditId(null);
    setEditClass(null);
    setName("");
    setSymbol("");
    setIsin("");
    setIsinOpen(false);
    setMode("total");
    setValue("");
    setQuantity("");
    setUnitPrice("");
    setCost("");
    setDistPolicy("");
    setCurrencyChoice(null);
    setPriceNote(null);
    setPickNote(null);
  }

  function startEdit(h: Holding) {
    setEditId(h.id);
    setEditClass(h.asset_class ?? null);
    setName(h.asset_name);
    setSymbol(h.symbol ?? "");
    setIsin(h.isin ?? "");
    setCost(h.cost_basis != null ? String(h.cost_basis) : "");
    setDistPolicy(h.distribution_policy ?? "");
    // A stored position's currency is what it says, not a proposal.
    setCurrencyChoice(h.currency);
    setPriceNote(null);
    if (h.quantity != null && h.unit_price != null) {
      setMode("qty");
      setQuantity(String(h.quantity));
      setUnitPrice(String(h.unit_price));
      setValue("");
    } else {
      setMode("total");
      setValue(h.value != null ? String(h.value) : "");
      setQuantity("");
      setUnitPrice("");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const refused = refusal(needs, { name, value, quantity, unitPrice });
    if (refused) {
      setError(refused);
      return;
    }
    // A new row takes this bucket's class; an edited one keeps its own.
    const assetClass = classOnSave(bucket, editId != null ? { asset_class: editClass } : null);
    let payload: HoldingCreate;
    if (mode === "qty") {
      payload = {
        asset_name: name.trim(),
        asset_class: assetClass,
        symbol: symbol.trim() || null,
        isin: isin.trim().toUpperCase() || null,
        quantity: Number(quantity),
        unit_price: Number(unitPrice),
        value: null,
        cost_basis: cost ? Number(cost) : null,
        // The box's currency: the reader's, or the listing's (a USD stock's
        // qty x price is a USD amount), or the account's.
        currency,
        distribution_policy: distPolicy || null,
      };
    } else {
      payload = {
        asset_name: name.trim(),
        asset_class: assetClass,
        symbol: symbol.trim() || null,
        isin: isin.trim().toUpperCase() || null,
        quantity: null,
        unit_price: null,
        value: Number(value),
        cost_basis: cost ? Number(cost) : null,
        currency,
        distribution_policy: distPolicy || null,
      };
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editId != null) await updateHolding(editId, payload);
      else await createHolding(snapshotId, payload);
      reset();
      await onChanged();
    } catch (err) {
      setError(apiError(err, "保存失败。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(h: Holding) {
    if (!window.confirm(`移除「${h.asset_name}」？`)) return;
    setError(null);
    try {
      await deleteHolding(h.id);
      if (editId === h.id) reset();
      await onChanged();
    } catch (err) {
      setError(apiError(err, "删除失败。"));
    }
  }

  // Validate the ticker against the market. `force` (explicit button) always
  // refills the price; on-blur validation only fills it if still empty, so it
  // never clobbers a price you typed by hand. Soft check — failure never blocks
  // saving (you may be offline, or holding an instrument we can't price).

  // Turn an observed VALUE into units, so a hand-maintained row becomes one
  // that prices itself. The guard is the whole point: this is only arithmetic
  // when the value and the price describe the same day. Dividing June's value
  // by today's price invents a quantity that never existed — which is exactly
  // the "implied quantity" that has no business in this app.
  async function deriveQuantity() {
    if (!symbol.trim() || !value) return;
    setFetchingPrice(true);
    setPriceNote(null);
    setError(null);
    try {
      const q = await getQuote(symbol.trim());
      if (closeTooFar(snapshotDate, q.as_of)) {
        setError(
          `该快照的日期是 ${snapshotDate}，但价格来自 ${q.as_of}。` +
            "两者相除会凭空算出你从未持有过的数量。" +
            "请改为填写券商处的份额数。",
        );
        return;
      }
      const units = Number(value) / q.price;
      if (q.symbol && q.symbol !== symbol.trim()) setSymbol(q.symbol);
      setMode("qty");
      setQuantity(String(Number(units.toFixed(8))));
      setUnitPrice(String(q.price));
      const listed = q.currency;
      if (listed) setLearned((prev) => ({ ...prev, [q.symbol]: listed }));
      setPriceNote(
        `${value} ÷ ${q.price} = ${units.toFixed(8)} 份 ${q.name ?? q.symbol}` +
          `（${q.as_of} 收盘价）。此为推算值，请与券商核对。`,
      );
    } catch (err) {
      setError(apiError(err, "无法给该代码定价，因此算不出份额数。"));
    } finally {
      setFetchingPrice(false);
    }
  }

  async function fetchPrice(force = true) {
    if (!symbol.trim()) return;
    setFetchingPrice(true);
    setPriceNote(null);
    setError(null);
    try {
      const typed = symbol.trim();
      const q = await getQuote(typed);
      if (mode === "qty" && (force || !unitPrice)) setUnitPrice(String(q.price));
      const listed = q.currency; // remember the listing currency
      if (listed) setLearned((prev) => ({ ...prev, [q.symbol]: listed }));
      // "Bitcoin" prices fine but is not a symbol — a coin has no price until
      // you say "in what currency". The backend resolves it to a pair; write
      // that back so the stored symbol is the one that will price tomorrow.
      const resolved = q.symbol && q.symbol !== typed ? q.symbol : null;
      if (resolved) setSymbol(resolved);
      // Lead with the instrument, not the number: a wrong ticker still
      // returns a believable price, so the name is the only thing that can
      // tell you it is the wrong fund.
      setPriceNote(
        `✓ ${q.name ?? q.symbol}${resolved ? ` → ${resolved}` : ""}: ${q.price} ${
          q.currency ?? ""
        }（${q.as_of} 收盘价）`,
      );
    } catch (err) {
      setPriceNote(null);
      // Two failures wearing one face. 503 means nothing answered, and telling
      // someone to fix a symbol that was already right is how a helper turns
      // into a liar; 502 means the market answered and does not know it.
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 503
          ? "⚠ 无法连接市场，你的代码很可能是对的。没有任何回应，这说明不了什么。联网后重试。"
          : "✗ 市场上没有匹配。裸代码不行：请加交易所后缀（意大利证交所 VWCE.MI，Xetra 用 .DE，美国不加），或粘贴基金的 ISIN。",
      );
    } finally {
      setFetchingPrice(false);
    }
  }

  async function refreshRow(h: Holding) {
    setRefreshingId(h.id);
    setError(null);
    try {
      await refreshHoldingPrice(h.id);
      await onChanged();
    } catch (err) {
      setError(apiError(err, `「${h.asset_name}」的价格刷新失败。请检查它的代码。`));
    } finally {
      setRefreshingId(null);
    }
  }

  function holdingSubtitle(h: Holding): string | undefined {
    const parts: string[] = [];
    if (h.symbol) parts.push(h.symbol);
    // The figure on the right is in the base. The arithmetic on the left is in
    // whatever was typed, so it has to say so: "20 × 4.47" beside "€2" reads
    // as a contradiction until it reads "20 × 4.47 TRY". A row with no
    // multiplication to show names the typed amount instead, for the same
    // reason — it is the only place the reader can still see what they entered.
    const foreign =
      h.currency && h.currency.toUpperCase() !== h.base_currency.toUpperCase() ? h.currency : null;
    if (h.quantity != null && h.unit_price != null)
      parts.push(`${h.quantity} × ${h.unit_price}${foreign ? ` ${foreign}` : ""}`);
    else if (foreign && h.value != null)
      parts.push(`${h.value.toLocaleString(locale, { maximumFractionDigits: 2 })} ${foreign}`);
    // The stated policy, or, with none stated, when the holding last paid: its
    // own history is what decides its dividends then (`dividendLine`).
    const dividends = dividendWord(h.distribution_policy, h.last_dividend);
    if (dividends) parts.push(dividends);
    return parts.length ? parts.join(" · ") : undefined;
  }

  return (
    <section className={cardClass + " p-4"}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">{bucket.label}</h3>
        <span className="text-sm font-medium text-ink-soft">{money(baseCurrency).format(subtotal)}</span>
      </div>

      <form onSubmit={submit} className="mb-3 flex flex-wrap items-center gap-2">
        {/* The name field IS the catalogue search. Picking fills the fields
            that otherwise stay empty and switch features off in silence — the
            ISIN the look-through needs, and the acc/dist that decides whether
            dividends are ever collected. It fills identity only: the ticker
            and the currency stay as typed, because the catalogue's belong to a
            different listing. */}
        <InstrumentPicker
          value={name}
          onChange={setName}
          mark={marks(needs, "name")}
          onPick={(c) => {
            setName(c.name);
            if (c.source === "catalogue") {
              setIsin(c.isin);
              if (c.distribution_policy) setDistPolicy(c.distribution_policy);
              setPickNote(
                [c.isin, policyWord(c.distribution_policy)].filter(Boolean).join(" · ") +
                  " 来自产品目录。代码仍需你来填：同一只基金在各交易所的代码不同。",
              );
              return;
            }
            // The other two lanes fill the SYMBOL, which is the half the
            // catalogue cannot give — and no ISIN, which is the half Yahoo
            // does not have. Then the existing check runs, because a symbol is
            // only confirmed by a quote coming back with a currency and a name.
            setSymbol(c.symbol);
            setPickNote(
              c.source === "owned"
                ? `${c.symbol}：你持仓上已有的代码${
                    c.institution ? `（在 ${c.institution}）` : ""
                  }。`
                : `${c.symbol}（${c.exchange ?? "其交易所"}）：正在查询它的报价…`,
            );
            void fetchPrice(true);
          }}
        />
        <input
          className={inputClass + " w-44"}
          placeholder="代码或 ISIN"
          aria-label="代码或 ISIN"
          aria-describedby={tickerCost ? tickerCostId : undefined}
          title="带交易所后缀的 Yahoo 代码（VWCE.MI = 意大利证交所，SAP.DE = Xetra，无后缀 = 美国，BTC-EUR = 加密货币）。像 VWCE 这样的裸代码匹配不到。ISIN（如 IE00BK5BQT80）也支持。优先选欧元上市的品种，价格无需换汇。"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onBlur={() => {
            if (symbol.trim()) void fetchPrice(false);
          }}
        />
        {isinShown ? (
          <input
            className={inputClass + " w-40"}
            placeholder="ISIN（可选）"
            aria-label="ISIN"
            autoFocus={isinOpen}
            title="基金的 ISIN。代码用来给持仓定价，穿透数据源则靠 ISIN 看清基金内部：同一只基金在各交易所代码不同，一个字段兼顾不了两者。"
            value={isin}
            onChange={(e) => setIsin(e.target.value)}
          />
        ) : (
          <button
            type="button"
            aria-expanded={false}
            aria-label="添加基金的 ISIN"
            onClick={() => setIsinOpen(true)}
            className="rounded-sm border border-rule px-2 py-2 text-xs text-ink-soft transition hover:border-olive hover:text-olive"
          >
            + ISIN
          </button>
        )}
        <input
          className={inputClass + " w-36"}
          type="number"
          step="0.01"
          placeholder="成本（可选）"
          aria-label="成本"
          title="这个持仓总共花了多少，按它自己的货币计。不知道就留空：空成本表示「成本未知」，这是实话；而瞎猜会让盈亏把波动当成利润。"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
        <select className={inputClass} aria-label="分红政策" value={distPolicy} onChange={(e) => setDistPolicy(e.target.value)} title="跟随历史：应用每天在 Yahoo 读取这个持仓的分红并计入该机构的现金，股票就是这么运作的。分红型：同上，按你或产品目录的声明。累积型：不记录分红（基金会把分红再投资）。">
          <option value="">跟随历史</option>
          <option value="acc">累积型</option>
          <option value="dist">分红型</option>
        </select>
        <select className={inputClass} aria-label="持仓录入方式" value={mode} onChange={(e) => setMode(e.target.value as "total" | "qty")}>
          <option value="total">总金额</option>
          <option value="qty">数量 × 价格</option>
        </select>
        {mode === "total" ? (
          <>
            <input className={inputClass + " w-32"} type="number" step="0.01" aria-label="金额" {...marks(needs, "value")} value={value} onChange={(e) => setValue(e.target.value)} />
            <button
              type="button"
              onClick={deriveQuantity}
              disabled={fetchingPrice || !symbol.trim() || !value}
              title="按这个金融产品的价格算出该金额对应多少份额，让持仓自己定价，而不是留一个要你维护的数字"
              className="rounded-sm border border-rule px-2 py-2 text-xs text-ink-soft transition hover:border-olive hover:text-olive disabled:opacity-50"
            >
              {fetchingPrice ? "…" : "→ 换算份额"}
            </button>
          </>
        ) : (
          <>
            <input className={inputClass + " w-24"} type="number" step="any" aria-label="数量" {...marks(needs, "quantity")} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <span className="text-ink-faint">×</span>
            <input className={inputClass + " w-28"} type="number" step="0.01" aria-label="价格" {...marks(needs, "unitPrice")} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            <button
              type="button"
              onClick={() => fetchPrice(true)}
              disabled={fetchingPrice || !symbol.trim()}
              title="获取这个代码的最新市场价"
              className="rounded-sm border border-rule px-2 py-2 text-xs text-ink-soft transition hover:border-up hover:text-up disabled:opacity-50"
            >
              {fetchingPrice ? "…" : "↻ 实时"}
            </button>
            {computed != null && (
              <span className="text-xs text-ink-soft">= {money(currency).format(computed)}</span>
            )}
          </>
        )}
        <input
          className={inputClass + " w-20"}
          placeholder="货币"
          aria-label="货币"
          list={CURRENCY_LIST}
          title="金额、价格和成本所用的货币。已知上市货币时按上市货币建议，否则按该快照日期账户锚点的货币建议；你改过之后就按你填的来。"
          value={currency}
          onChange={(e) => setCurrencyChoice(e.target.value)}
        />
        <button className={btnClass} disabled={submitting}>{submitting ? "..." : editId != null ? "保存" : "添加"}</button>
        {editId != null && <CancelButton onClick={reset} />}
      </form>

      {tickerCost && (
        <p id={tickerCostId} className="mb-2 text-xs text-ink-soft">
          {tickerCost}
        </p>
      )}
      {pickNote && <p className="mb-2 text-xs text-olive">{pickNote}</p>}
      {priceNote && <p className="mb-2 text-xs text-up">{priceNote}</p>}
      {error && <p className="mb-2 text-down">{error}</p>}
      {holdings.length > 0 && (
        <ul className="divide-y divide-hair rounded-sm border border-hair">
          {holdings.map((h) => (
            <Row
              key={h.id}
              onEdit={() => startEdit(h)}
              onDelete={() => remove(h)}
              onRefresh={h.symbol ? () => refreshRow(h) : undefined}
              refreshing={refreshingId === h.id}
              title={h.asset_name}
              subtitle={holdingSubtitle(h)}
              value={h.value != null ? money(h.base_currency).format(h.value_base) : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
