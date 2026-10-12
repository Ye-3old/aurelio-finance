import { useEffect, useState } from "react";
import {
  getSurvey,
  getSurveyQuestions,
  saveSurvey,
  type SurveyAnswer,
  type SurveyQuestion,
} from "../api/survey";
import {
  getTaxSettings,
  saveTaxSettings,
  type TaxCountryDefault,
  type TaxSettingsRead,
} from "../api/tax";
import { getBaseCurrency, saveBaseCurrency, type BaseCurrencySetting } from "../api/baseCurrency";
import { choicesOf, isVisible, topicsOf, unshownAnswer } from "./questionnaire";

// Display labels for the yes/no answers. The stored and compared values stay
// the English tokens the backend speaks ("yes" / "unsure" / "no").
const BOOLEAN_LABEL: Record<string, string> = { yes: "是", unsure: "不确定", no: "否" };
import { apiError, btnClass, cardClass, inputClass } from "./ui";

/* The questions are the backend's (`GET /api/survey/questions`, app/questionnaire.py):
   the chat's answers to them are checked against the same list, so the two
   cannot disagree about what a question takes. Booleans store "yes"/"no" (or
   "unsure" when allowed). The keys in that list are the ones this form is
   authoritative for; everything else stored under /api/survey belongs to
   somebody else, today the chat, which can write an answer to a question this
   list never asked, because the analyses declare what they do not know about
   you and a form cannot ask that in advance. */

export default function Profile() {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /* Answers stored under keys this form does not render, kept so they can be
     posted back untouched. PUT /api/survey replaces the WHOLE set — it deletes
     what its payload does not name — which is correct for a caller that reads
     everything and writes everything back, and is only correct while this form
     IS that caller. Without this, pressing Save here would silently delete
     every question the chat had recorded in conversation. */
  const [carried, setCarried] = useState<SurveyAnswer[]>([]);
  /* The tax settings are a different resource from the questionnaire — three
     keys in `settings`, not survey answers — but they share this page's ONE
     save button on purpose. Two save buttons on one screen is how an edit gets
     lost: you change a rate, press the button you can see, and the rate never
     left the browser. */
  const [tax, setTax] = useState<TaxSettingsRead | null>(null);
  /* Held as strings, so "" can mean cleared. A number input bound to a number
     cannot express "I have not said" — it collapses to 0, which is the reader
     claiming they pay no tax. */
  const [taxCountry, setTaxCountry] = useState("");
  const [cgRate, setCgRate] = useState("");
  const [divRate, setDivRate] = useState("");
  /* The base, as stored and as picked. Saved with the same button, for the
     reason written above; sent only when it changed, because changing it is
     the one save here that asks the rate feed for something. */
  const [base, setBase] = useState<BaseCurrencySetting | null>(null);
  const [pickedBase, setPickedBase] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [asked, existing, taxes, currentBase] = await Promise.all([
        getSurveyQuestions(),
        getSurvey(),
        getTaxSettings(),
        getBaseCurrency(),
      ]);
      setQuestions(asked);
      setBase(currentBase);
      setPickedBase(currentBase.base_currency);
      setTax(taxes);
      setTaxCountry(taxes.country ?? "");
      setCgRate(taxes.capital_gains_rate?.toString() ?? "");
      setDivRate(taxes.dividend_withholding_rate?.toString() ?? "");
      const map: Record<string, string> = {};
      for (const a of existing) if (a.answer != null) map[a.question_key] = a.answer;
      setAnswers(map);
      const own = new Set(asked.map((q) => q.key));
      setCarried(
        existing
          .filter((a) => !own.has(a.question_key) && a.answer != null)
          .map(({ question_key, topic, question, answer }) => ({
            question_key,
            topic,
            question,
            answer,
          })),
      );
    } catch (err) {
      setError(apiError(err, "无法连接后端，后端是否在 :8000 上运行？"));
    } finally {
      setLoading(false);
    }
  }

  function setAnswer(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload: SurveyAnswer[] = questions.filter(
        (q) => isVisible(q, answers) && (answers[q.key] ?? "") !== "",
      ).map((q) => ({
        question_key: q.key,
        topic: q.topic,
        question: q.text,
        answer: answers[q.key],
      }));
      await saveSurvey([...payload, ...carried]);
      // An empty field CLEARS the key rather than storing 0. The backend
      // deletes it, so "not said" has one representation instead of three
      // that look identical on screen.
      setTax(
        await saveTaxSettings({
          country: taxCountry.trim() || null,
          capital_gains_rate: cgRate === "" ? null : Number(cgRate),
          dividend_withholding_rate: divRate === "" ? null : Number(divRate),
        }),
      );
      // Last, so a feed that does not answer leaves everything above saved and
      // says, in the backend's own words, that the base did not change.
      if (base && pickedBase !== base.base_currency) {
        setBase(await saveBaseCurrency(pickedBase));
      }
      setSaved(true);
    } catch (err) {
      setError(apiError(err, "保存失败。"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-ink-soft">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">档案与目标</h2>
        <p className="text-sm text-ink-soft">
          一份简短的问卷，把你的背景告诉 Aurelio。内容保存在你自己的机器上；当你运行分析或向对话提问时，才会经 OpenRouter 发给 AI 模型。
        </p>
      </div>

      {error && <p className="text-down">{error}</p>}

      {topicsOf(questions).map((topic) => {
        const qs = questions.filter((q) => q.topic === topic && isVisible(q, answers));
        if (qs.length === 0) return null;
        return (
          <section key={topic} className={cardClass + " space-y-4 p-5"}>
            <h3 className="text-sm font-semibold text-ink">{topic}</h3>
            {qs.map((q) => (
              <QuestionField
                key={q.key}
                q={q}
                value={answers[q.key] ?? ""}
                onChange={(v) => setAnswer(q.key, v)}
              />
            ))}
          </section>
        );
      })}

      <TaxSection
        known={tax?.known_countries ?? []}
        country={taxCountry}
        capitalGains={cgRate}
        dividends={divRate}
        onChange={(field, value) => {
          setSaved(false);
          if (field === "country") setTaxCountry(value);
          else if (field === "cg") setCgRate(value);
          else setDivRate(value);
        }}
        onUseDefault={(d) => {
          setSaved(false);
          setCgRate(d.capital_gains_rate.toString());
          setDivRate(d.dividend_withholding_rate.toString());
        }}
      />

      <BaseCurrencySection
        current={base?.base_currency ?? ""}
        available={base?.available ?? []}
        picked={pickedBase}
        onPick={(code) => {
          setSaved(false);
          setPickedBase(code);
        }}
      />

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className={btnClass}>
          {saving ? "保存中…" : "保存档案"}
        </button>
        {saved && <span className="text-sm text-up">已保存 ✓</span>}
      </div>
    </div>
  );
}

/* The currency every total is shown in.

   What the reader has to know before changing it is what moves and what does
   not. Every total moves — the net worth, the history, every converted figure —
   because it is the same wealth measured in another unit, at the ECB rate of
   each figure's own day. Nothing recorded moves: an amount keeps the currency
   it was typed in, and a sum fixed on its day stays what it was. The choices
   are the currencies the ECB publishes, because a total can only be converted
   into one somebody publishes a rate for. */
function BaseCurrencySection({
  current,
  available,
  picked,
  onPick,
}: {
  current: string;
  available: string[];
  picked: string;
  onPick: (code: string) => void;
}) {
  return (
    <section className={cardClass + " space-y-3 p-5"}>
      <h3 className="text-sm font-semibold text-ink">本位币</h3>
      <p className="text-sm text-ink-soft">
        所有合计都用这种货币显示：你的净资产、它的历史、每一个换算后的数字。改币种会牵动全部数字，历史也一样：还是同一笔财富，换了个单位，按各数字当天的欧洲央行汇率换算。你记下的内容不会被改写：每笔金额保留你输入时的货币，按当天记账的支出或转账也保持原样。
      </p>
      <label className="flex items-center gap-2 text-sm text-ink">
        合计显示为
        <select
          className={inputClass + " w-28"}
          value={picked}
          onChange={(e) => onPick(e.target.value)}
        >
          {available.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      {picked !== current && (
        <p className="text-xs text-warn">
          保存会把所有合计从 {current} 切换到 {picked}。会先取兑 {" "}
          {picked} 的汇率；如果行情源连不上，什么都不会变。
        </p>
      )}
      {available.length <= 1 && (
        <p className="text-xs text-ink-faint">
          行情源还没有回应，所以目前只有 {current} 一种货币可选。
        </p>
      )}
    </section>
  );
}

/* WHAT THIS SECTION IS FOR, AND WHAT IT REFUSES TO BE.

   Two rates and a country name. That is the whole tax model, and keeping it
   that small is the feature rather than a shortcut: a real engine for Italy
   alone would need the 12.5% government-bond rate, harmonised versus
   non-harmonised funds, a four-year loss basket and the rest of it, and the
   way that project fails is by being PRECISE AND WRONG. A reader told
   "roughly 26%, and it says estimated" checks it against their broker. A
   reader shown a confident number does not.

   The country is a LABEL and a seed, never a gate. Nothing downstream branches
   on it: the two rates are what every reader of this figure actually reads, so
   someone whose country this app ships nothing for types their own two numbers
   and gets the identical estimate. Being listed buys a pre-fill and nothing
   else — which is the point, because a rate you looked up this year beats any
   table shipped with an app. France's moved 1.4 points in January. */
function TaxSection({
  known,
  country,
  capitalGains,
  dividends,
  onChange,
  onUseDefault,
}: {
  known: TaxCountryDefault[];
  country: string;
  capitalGains: string;
  dividends: string;
  onChange: (field: "country" | "cg" | "div", value: string) => void;
  onUseDefault: (d: TaxCountryDefault) => void;
}) {
  const match = known.find(
    (d) => d.country.toLowerCase() === country.trim().toLowerCase(),
  );
  const nothingSet = capitalGains === "" && dividends === "";

  return (
    <section className={cardClass + " space-y-4 p-5"}>
      <div>
        <h3 className="text-sm font-semibold text-ink">税费</h3>
        <p className="mt-1 text-sm text-ink-soft">
          你自己的税率，用来在持仓数字旁给出一个估算。Aurelio 从不把税算进合计里：净资产不算，账面价值也不算。不知道的字段留空就好：留空和填 0 不一样，估算会说明哪一半它算不出来。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm text-ink">
          你在哪个国家缴纳投资税？
        </label>
        <input
          className={inputClass + " w-full"}
          type="text"
          list="tax-countries"
          placeholder="任意国家（在下面自己填税率都一样好使）"
          value={country}
          onChange={(e) => onChange("country", e.target.value)}
        />
        <datalist id="tax-countries">
          {known.map((d) => (
            <option key={d.country} value={d.country} />
          ))}
        </datalist>
      </div>

      {match && (
        <div className="rounded-sm bg-tint p-3 text-sm">
          <p className="text-ink">
            {match.country}：{match.regime}（资本利得 {match.capital_gains_rate}%，
            分红 {match.dividend_withholding_rate}%）。
          </p>
          {/* Offered, never applied on its own. A figure that changed itself
              because a text field changed is a figure nobody declared, and the
              reader cannot tell it apart from one they typed. */}
          <p className="mt-1 text-ink-faint">{match.omits}</p>
          <button
            type="button"
            onClick={() => onUseDefault(match)}
            className="mt-2 rounded-sm border border-olive px-3 py-1.5 text-sm text-olive-deep transition hover:bg-olive-tint"
          >
            以此为起点填入
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-6">
        <RateField
          label="资本利得税率"
          hint="适用于卖出已锁定的盈利"
          value={capitalGains}
          onChange={(v) => onChange("cg", v)}
        />
        <RateField
          label="分红预扣税率"
          hint="只适用于仍按市场税前总额显示的分红"
          value={dividends}
          onChange={(v) => onChange("div", v)}
        />
      </div>

      {nothingSet && (
        <p className="text-sm text-ink-faint">
          还什么都没填，所以任何地方都不显示税费估算：不是按零算，也不是悄悄略过。持仓页会说明它缺什么。
        </p>
      )}
    </section>
  );
}

function RateField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-ink">{label}</label>
      <div className="flex items-center gap-2">
        <input
          className={inputClass + " w-28"}
          type="number"
          min={0}
          max={100}
          step="0.001"
          placeholder="未设置"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-sm text-ink-soft">%</span>
      </div>
      <p className="mt-1 text-xs text-ink-faint">{hint}</p>
    </div>
  );
}

function QuestionField({
  q,
  value,
  onChange,
}: {
  q: SurveyQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  // An answer on record that no button, option or number box can show: written
  // before the chat's answers were checked against the question (brief AL).
  const unshown = unshownAnswer(q, value);
  return (
    <div>
      <label className="mb-1 block text-sm text-ink">{q.text}</label>

      {q.type === "boolean" ? (
        <div className="flex gap-2">
          {choicesOf(q).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={
                "rounded-sm border px-3 py-1.5 text-sm transition " +
                (value === opt
                  ? "border-olive bg-olive-tint text-olive-deep"
                  : "border-rule text-ink-soft hover:bg-ground")
              }
            >
              {BOOLEAN_LABEL[opt] ?? opt}
            </button>
          ))}
        </div>
      ) : q.type === "single" ? (
        <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">请选择…</option>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : q.type === "number" ? (
        <input
          className={inputClass + " w-32"}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : q.type === "longtext" ? (
        <textarea
          className={inputClass + " min-h-40 w-full leading-relaxed"}
          rows={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={inputClass + " w-full"}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {unshown && <p className="mt-2 text-sm text-warn">{unshown}</p>}

      {q.explain_when && value === q.explain_when.equals && (
        <p className="mt-2 rounded-sm bg-warn-tint p-3 text-sm text-warn">
          {q.explain_when.text}
        </p>
      )}
    </div>
  );
}
