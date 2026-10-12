import { useEffect, useState } from "react";
import {
  deleteWatchlistItem,
  getWatchlist,
  type WatchlistItem,
} from "../api/watchlist";
import { RowsOrEmpty, Section, apiError, locale } from "./ui";
import { identityOf, isShare } from "./watchItem";

/* The ideas the chat put in front of you, and what each one rested on.

   It sits under the portfolio because that is the question it answers — you
   have just read what you hold, and this is what you were considering — and
   NOT inside it: nothing here is owned. A watchlist line moves no total, no
   allocation and no cash projection, which is exactly why a model is allowed
   to propose one at all.

   THE REASONING IS THE ROW, so it is not squeezed into a subtitle. The generic
   `Row` truncates, which is right for a list of attributes and wrong for the
   three sentences that are the whole point of the table: why this one, what
   you had declared that it rested on, and what the suggestion did not know.
   Read in a month, the last of those is usually the one that decides — and a
   line that clipped it would be a provenance the app promises and does not
   keep. */

// Two dates, one column. `added_at` is a full timestamp; what is worth reading
// is the day, because "three weeks ago" is the scale on which an idea goes off.
function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function Why({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-xs leading-relaxed text-ink-soft">
      <span className="text-ink-faint">{label} </span>
      {text}
    </p>
  );
}

function Item({
  item,
  onBuy,
  onDrop,
}: {
  item: WatchlistItem;
  onBuy: () => void;
  onDrop: () => void;
}) {
  // The identity, and the hint beside it. They are not the same kind of fact:
  // on a fund's line the ISIN was checked against the local registry when the
  // card was drawn, and the symbol is whatever the live lookup offered,
  // labelled apart here for the same reason the picker keeps two lanes. A
  // share's line (brief AG) has no ISIN: its symbol is the identity, checked
  // with Yahoo, and the line says so.
  const identity = identityOf(item);
  const what = isShare(item) ? "股票" : "基金";
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-ink">{item.name}</div>
          <div className="tnum text-xs text-ink-faint">
            {identity} · added {day(item.added_at)}
          </div>
        </div>
        {/* The second half of the cycle, and the whole reason it is spelled
            out rather than called "Buy": no broker is connected, so buying in
            this app IS recording a purchase you already made. The button hands
            the ledger form what this row knows — the fund — and the reader
            supplies the four things only they can know. It does NOT touch this
            line: see the note above the list. */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onBuy}
            title={`把这只${what}填进下面的流水表单：数量、价格、地点和时间由你提供`}
            className="rounded-sm border border-rule px-2 py-1 text-xs text-ink-soft transition hover:border-olive hover:text-olive"
          >
            Record a buy
          </button>
          <button
            onClick={onDrop}
            aria-label="放弃这个想法"
            title="放弃这个想法"
            className="px-2 text-ink-faint transition hover:text-down"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-1 border-l border-hair pl-3">
        <Why label="理由" text={item.reason} />
        <Why label="基于你说的" text={item.based_on} />
        {/* Kept in the same band as the other two rather than hidden behind a
            fold: what a suggestion did not know is the half that ages worst,
            and it is the half a reader skips if it is made easy to skip. */}
        <Why label="尚不清楚" text={item.unknowns} />
      </div>
    </li>
  );
}

export default function Watchlist({ onBuy }: { onBuy: (item: WatchlistItem) => void }) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await getWatchlist());
    } catch (err) {
      setError(apiError(err, "无法加载关注列表。后端是否在 :8000 上运行？"));
    } finally {
      setLoading(false);
    }
  }

  async function drop(id: number) {
    try {
      await deleteWatchlistItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(apiError(err, "无法移除这个想法。"));
    }
  }

  return (
    <Section
      title="关注列表"
      hint="你看过并留下的金融产品。这里没有你真正持有的东西：任何合计、配置和预测都不把本列表的条目算进去。"
      note="条目来自对话。它只能命名本地登记簿里存在的基金或 Yahoo 收录的股票，每条下面的三句话是当时给出的说法。"
      explain={{
        question: "「记一笔买入」是做什么的？",
        text: "没有连接券商，所以「记一笔买入」就只是记一笔：它把基金或股票填进下面的流水表单，数量、价格、地点和时间由你来填。它不会清掉这一行（已经买了第一批的想法仍然是想法），用完后点 ✕ 移除即可。",
      }}
    >
      <RowsOrEmpty
        loading={loading}
        error={error}
        empty={items.length === 0}
        emptyText="关注列表还是空的。问问对话助手有什么值得看的，它的建议会带着理由出现在这里。"
      >
        {items.map((i) => (
          <Item
            key={i.id}
            item={i}
            onBuy={() => onBuy(i)}
            onDrop={() => void drop(i.id)}
          />
        ))}
      </RowsOrEmpty>
    </Section>
  );
}
