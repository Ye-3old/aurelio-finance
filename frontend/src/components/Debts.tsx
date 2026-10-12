import { useEffect, useState, type FormEvent } from "react";
import {
  createBalance,
  createLiability,
  deleteBalance,
  deleteLiability,
  getBalances,
  getLiabilities,
  getLiability,
  updateBalance,
  updateLiability,
  type Liability,
  type LiabilityBalance,
} from "../api/liabilities";
import { getRealAssets, type RealAsset } from "../api/realAssets";
import {
  Breadcrumb,
  Row,
  RowsOrEmpty,
  Section,
  apiError,
  btnClass,
  inputClass,
  money,
  type Crumb,
  CURRENCY_LIST,
} from "./ui";
import { CancelButton } from "./ui";
import { getBaseCurrency } from "../api/baseCurrency";
import { DatedAmountEditor } from "./DatedAmountEditor";
import { useReopened } from "./reopen";
import { BALANCE, DEBT, marks, refusal } from "./required";

const KINDS = ["", "mortgage", "personal_loan", "auto_loan", "student_loan", "credit_card", "other"];

// "personal_loan" -> "personal loan". Display only: the stored `kind` stays
// the enum the API speaks.
const KIND_LABEL: Record<string, string> = {
  mortgage: "房贷",
  personal_loan: "个人贷款",
  auto_loan: "车贷",
  student_loan: "学贷",
  credit_card: "信用卡",
  other: "其他",
};

function prettyKind(s: string | null): string | null {
  return s ? (KIND_LABEL[s] ?? s.replace(/_/g, " ")) : s;
}

/* Which debt is open is App's state, so the chat can be told which one "this"
   is, and so the page is where you left it when you come back to Records. On
   arrival the debt is read again; one that is gone climbs to the list. See
   reopen.ts. */
export default function Debts({
  liability,
  onLiability,
}: {
  liability: Liability | null;
  onLiability: (l: Liability | null) => void;
}) {
  const checked = useReopened(liability, getLiability, onLiability);
  if (!checked) return null;

  const crumbs: Crumb[] = [
    { label: "负债", active: !liability, onClick: () => onLiability(null) },
  ];
  if (liability) crumbs.push({ label: liability.name, active: true, onClick: () => {} });

  return (
    <div className="space-y-5">
      <Breadcrumb items={crumbs} />
      {!liability ? (
        <DebtsLevel onSelect={onLiability} />
      ) : (
        <BalancesLevel liability={liability} />
      )}
    </div>
  );
}

function DebtsLevel({ onSelect }: { onSelect: (l: Liability) => void }) {
  const [items, setItems] = useState<Liability[]>([]);
  const [assets, setAssets] = useState<RealAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The form's refusals and failed saves, apart from a failed load: RowsOrEmpty
  // shows an error INSTEAD of the rows, so a sentence about the form must not
  // go there (SnapshotsLevel learned this first).
  const [formError, setFormError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [rate, setRate] = useState("");
  const [assetId, setAssetId] = useState("");
  /* A debt belongs to no account, so there is none to propose its currency
     from: the base the reader chose is the proposal, and what they type in the
     box wins. An edited debt keeps its own. */
  const [base, setBase] = useState("");
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const currency = currencyChoice ?? base;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [liabs, ras, b] = await Promise.all([getLiabilities(), getRealAssets(), getBaseCurrency()]);
      setItems(liabs);
      setAssets(ras);
      setBase(b.base_currency);
    } catch (err) {
      setError(apiError(err, "无法连接后端，后端是否在 :8000 上运行？"));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setEditId(null);
    setName("");
    setKind("");
    setRate("");
    setAssetId("");
    setCurrencyChoice(null);
  }

  function startEdit(l: Liability) {
    setEditId(l.id);
    setName(l.name);
    setKind(l.kind ?? "");
    setRate(l.interest_rate != null ? String(l.interest_rate) : "");
    setAssetId(l.real_asset_id ? String(l.real_asset_id) : "");
    setCurrencyChoice(l.currency);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const refused = refusal(DEBT, { name, currency });
    if (refused) {
      setFormError(refused);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const payload = {
      name: name.trim(),
      kind: kind || null,
      currency: currency.trim(),
      interest_rate: rate ? Number(rate) : null,
      real_asset_id: assetId ? Number(assetId) : null,
    };
    try {
      if (editId != null) await updateLiability(editId, payload);
      else await createLiability(payload);
      reset();
      await load();
    } catch (err) {
      setFormError(apiError(err, "保存失败。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(l: Liability) {
    if (!window.confirm(`删除「${l.name}」？这会同时删掉它的余额历史。`)) return;
    setError(null);
    try {
      await deleteLiability(l.id);
      if (editId === l.id) reset();
      await load();
    } catch (err) {
      setError(apiError(err, "删除失败。"));
    }
  }

  function assetName(id: number | null): string | undefined {
    if (id == null) return undefined;
    return assets.find((a) => a.id === id)?.name;
  }

  function debtSubtitle(l: Liability): string | undefined {
    const parts: string[] = [];
    const linked = assetName(l.real_asset_id);
    if (linked) parts.push(`为 ${linked} 融资`);
    if (l.interest_rate != null) parts.push(`${l.interest_rate}%/年`);
    return parts.length ? parts.join(" · ") : undefined;
  }

  return (
    <Section
      title="负债"
      hint="房贷、贷款……净资产会减去每笔负债的最新余额。把房贷关联到它的资产，就能看到你的净资产（权益）。"
    >
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input className={inputClass} aria-label="名称" {...marks(DEBT, "name")} value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (<option key={k} value={k}>{prettyKind(k) || "类型…"}</option>))}
        </select>
        <input className={inputClass + " w-28"} type="number" step="0.01" placeholder="利率 %/年" value={rate} onChange={(e) => setRate(e.target.value)} />
        <input
          className={inputClass + " w-20"}
          placeholder="货币"
          {...marks(DEBT, "currency")}
          list={CURRENCY_LIST}
          title="这笔负债以什么货币计。默认按你的本位币给出；改成别的就按你输入的保留。"
          value={currency}
          onChange={(e) => setCurrencyChoice(e.target.value)}
        />
        <select className={inputClass} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">为哪项资产融资…</option>
          {assets.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
        </select>
        <button className={btnClass} disabled={submitting}>{submitting ? "..." : editId != null ? "保存" : "添加"}</button>
        {editId != null && <CancelButton onClick={reset} />}
      </form>
      {formError && <p className="text-down">{formError}</p>}
      <RowsOrEmpty loading={loading} error={error} empty={items.length === 0} emptyText="没有负债，真幸运。">
        {items.map((l) => (
          <Row
            key={l.id}
            onClick={() => onSelect(l)}
            onEdit={() => startEdit(l)}
            onDelete={() => remove(l)}
            title={l.name}
            badge={prettyKind(l.kind)}
            subtitle={debtSubtitle(l)}
            note={l.notes}
            value={l.latest_balance != null ? money(l.currency).format(l.latest_balance) : undefined}
          />
        ))}
      </RowsOrEmpty>
    </Section>
  );
}

function BalancesLevel({ liability }: { liability: Liability }) {
  const [items, setItems] = useState<LiabilityBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [liability.id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await getBalances(liability.id));
    } catch (err) {
      setError(apiError(err, "无法加载余额。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      title={`未偿余额：${liability.name}`}
      explain={{
        question: "什么是未偿余额？",
        text: "剩余的本金，以你的还款计划表上的数字为准。",
      }}
    >
      <DatedAmountEditor
        items={items}
        loading={loading}
        loadError={error}
        dateOf={(b) => b.date}
        amountOf={(b) => b.balance}
        currencyOf={() => liability.currency}
        toPayload={(date, balance) => ({ date, balance })}
        create={(p) => createBalance(liability.id, p)}
        update={updateBalance}
        destroy={deleteBalance}
        onChanged={load}
        noun="余额"
        amountLabel="剩余"
        needs={BALANCE}
        emptyText="还没有余额。"
      />
    </Section>
  );
}
