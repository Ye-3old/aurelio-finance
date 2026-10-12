import { useEffect, useState, type FormEvent } from "react";
import {
  createRealAsset,
  createValuation,
  deleteRealAsset,
  deleteValuation,
  getRealAsset,
  getRealAssets,
  getValuations,
  updateRealAsset,
  updateValuation,
  type RealAsset,
  type RealAssetValuation,
} from "../api/realAssets";
import { getLiabilities, type Liability } from "../api/liabilities";
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
import { REAL_ASSET, VALUATION, marks, refusal } from "./required";

const CATEGORIES = ["", "real_estate", "vehicle", "collectible", "jewelry", "art", "other"];

// Display only: the stored `category` stays the enum the API speaks.
const CATEGORY_LABEL: Record<string, string> = {
  real_estate: "房产",
  vehicle: "车辆",
  collectible: "收藏品",
  jewelry: "珠宝",
  art: "艺术品",
  other: "其他",
};

function categoryLabel(c: string | null | undefined): string {
  return c ? (CATEGORY_LABEL[c] ?? c) : "";
}

/* Which asset is open is App's state, so the chat can be told which one "this"
   is, and so the page is where you left it when you come back to Records. On
   arrival the asset is read again; one that is gone climbs to the list. See
   reopen.ts. */
export default function RealAssets({
  asset,
  onAsset,
}: {
  asset: RealAsset | null;
  onAsset: (a: RealAsset | null) => void;
}) {
  const checked = useReopened(asset, getRealAsset, onAsset);
  if (!checked) return null;

  const crumbs: Crumb[] = [
    { label: "实物资产", active: !asset, onClick: () => onAsset(null) },
  ];
  if (asset) crumbs.push({ label: asset.name, active: true, onClick: () => {} });

  return (
    <div className="space-y-5">
      <Breadcrumb items={crumbs} />
      {!asset ? (
        <AssetsLevel onSelect={onAsset} />
      ) : (
        <ValuationsLevel asset={asset} />
      )}
    </div>
  );
}

function AssetsLevel({ onSelect }: { onSelect: (a: RealAsset) => void }) {
  const [items, setItems] = useState<RealAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The form's refusals and failed saves, apart from a failed load: RowsOrEmpty
  // shows an error INSTEAD of the rows, so a sentence about the form must not
  // go there (SnapshotsLevel learned this first).
  const [formError, setFormError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  /* An asset belongs to no account: its currency is proposed from the base the
     reader chose, and what they type in the box wins. */
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
      const [assets, b] = await Promise.all([getRealAssets(), getBaseCurrency()]);
      setItems(assets);
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
    setCategory("");
    setCurrencyChoice(null);
  }

  function startEdit(a: RealAsset) {
    setEditId(a.id);
    setName(a.name);
    setCategory(a.category ?? "");
    setCurrencyChoice(a.currency);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // The currency is typed here, so it can be left empty. Said rather than
    // sent: the backend would refuse it too, but REAL_ASSET's sentence names
    // the box.
    const refused = refusal(REAL_ASSET, { name, currency });
    if (refused) {
      setFormError(refused);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const payload = {
      name: name.trim(),
      category: category || null,
      currency: currency.trim(),
    };
    try {
      if (editId != null) await updateRealAsset(editId, payload);
      else await createRealAsset(payload);
      reset();
      await load();
    } catch (err) {
      setFormError(apiError(err, "保存失败。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(a: RealAsset) {
    if (!window.confirm(`删除「${a.name}」？这会同时删掉它的估值历史。`)) return;
    setError(null);
    try {
      await deleteRealAsset(a.id);
      if (editId === a.id) reset();
      await load();
    } catch (err) {
      setError(apiError(err, "删除失败。"));
    }
  }

  return (
    <Section title="实物资产">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input className={inputClass} aria-label="名称" {...marks(REAL_ASSET, "name")} value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (<option key={c} value={c}>{categoryLabel(c) || "类别…"}</option>))}
        </select>
        <input className={inputClass + " w-24"} placeholder="货币" {...marks(REAL_ASSET, "currency")} list={CURRENCY_LIST} title="这项资产以什么货币计价。默认按你的本位币给出；改成别的就按你输入的保留。" value={currency} onChange={(e) => setCurrencyChoice(e.target.value)} />
        <button className={btnClass} disabled={submitting}>{submitting ? "..." : editId != null ? "保存" : "添加"}</button>
        {editId != null && <CancelButton onClick={reset} />}
      </form>
      {formError && <p className="text-down">{formError}</p>}
      <RowsOrEmpty loading={loading} error={error} empty={items.length === 0} emptyText="还没有实物资产。">
        {items.map((a) => (
          <Row key={a.id} onClick={() => onSelect(a)} onEdit={() => startEdit(a)} note={a.notes} onDelete={() => remove(a)} title={a.name} badge={categoryLabel(a.category)} subtitle={a.currency} />
        ))}
      </RowsOrEmpty>
    </Section>
  );
}

function ValuationsLevel({ asset }: { asset: RealAsset }) {
  const [items, setItems] = useState<RealAssetValuation[]>([]);
  const [linkedDebts, setLinkedDebts] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [asset.id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [vals, liabs] = await Promise.all([
        getValuations(asset.id),
        getLiabilities(),
      ]);
      setItems(vals);
      setLinkedDebts(liabs.filter((l) => l.real_asset_id === asset.id));
    } catch (err) {
      setError(apiError(err, "无法加载估值。"));
    } finally {
      setLoading(false);
    }
  }

  // Equity = latest valuation − outstanding debt financing this asset, and
  // only when both are in the same currency. These are the figures as typed,
  // each in its own currency; subtracting a dollar balance from a euro
  // valuation here would be a conversion written in the browser, beside the
  // one the backend runs for every total. The net worth converts both.
  const latestValue = items.length ? items[items.length - 1].value : null;
  const sameCurrency = (l: Liability) =>
    l.currency.toUpperCase() === asset.currency.toUpperCase();
  const otherCurrency = linkedDebts.filter((l) => !sameCurrency(l));
  const debtTotal = linkedDebts
    .filter(sameCurrency)
    .reduce((acc, l) => acc + (l.latest_balance ?? 0), 0);
  const equity =
    latestValue != null && otherCurrency.length === 0 ? latestValue - debtTotal : null;
  // All three figures are in the asset's currency, which the guard above is
  // what guarantees.
  const inAsset = money(asset.currency);

  return (
    <Section title={`估值：${asset.name}`}>
      {equity != null && linkedDebts.length > 0 && (
        <p className="rounded-sm bg-ground p-3 text-sm text-ink-soft">
          最新估值 {inAsset.format(latestValue!)} − 负债 {inAsset.format(debtTotal)}（
          {linkedDebts.map((l) => l.name).join("、")}）＝{" "}
          <strong className="text-ink">你的权益 {inAsset.format(equity)}</strong>
        </p>
      )}
      {otherCurrency.length > 0 && (
        <p className="rounded-sm bg-ground p-3 text-sm text-ink-soft">
          这里不计算权益：{" "}
          {otherCurrency.map((l) => `${l.name} 以 ${l.currency} 计`).join("、")}，而这项资产以{" "}
          {asset.currency} 计价。总览里的净资产会把两者都换算。
        </p>
      )}
      <DatedAmountEditor
        items={items}
        loading={loading}
        loadError={error}
        dateOf={(v) => v.date}
        amountOf={(v) => v.value}
        currencyOf={() => asset.currency}
        toPayload={(date, value) => ({ date, value })}
        create={(p) => createValuation(asset.id, p)}
        update={updateValuation}
        destroy={deleteValuation}
        onChanged={load}
        noun="估值"
        amountLabel="价值"
        needs={VALUATION}
        emptyText="还没有估值。"
      />
    </Section>
  );
}
