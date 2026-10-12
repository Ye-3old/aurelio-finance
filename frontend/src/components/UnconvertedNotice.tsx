import type { UnconvertedAmount } from "../api/dashboard";

/* Amounts that reached a total without being converted, because the app has no
   rate for the currency they are written in.

   The other direction of the rule `OmissionsNotice` carries: nothing leaves the
   totals in silence, and nothing enters them in the wrong unit in silence
   either. The fallback itself is deliberate  an amount the feed has never
   priced is kept rather than dropped, because a total quietly short by a whole
   holding is as wrong as one quietly inflated  so what was missing was only
   the saying so. Measured on the reader's own database: a real asset written in
   `Doll` puts 2,324.00 into a net worth of 1,343,911.34 as if it were euro.

   Two cases arrive here and the reader tells them apart at a glance, which is
   why the code is printed exactly as it is stored:

     - a typo (`Doll`, `EURO`)  correctable on the row, and refused outright
       from now on, so only rows written before the shape check can show it;
     - a real currency the ECB does not quote (`TWD`, `GBp`)  nothing is wrong
       with the row and nobody can convert it, so the figure simply is in
       another unit and the total says so rather than pretending.

   WHAT THE NUMBER IS, AND WHAT IT IS NOT. It is a sum over ROWS, not the amount
   any figure above is wrong by, and the sentence has to say so because the two
   look identical sitting under a net worth. One converter serves several
   totals, and an amount can reach them in roles that do not add up. It is not
   a bound either  measured, it goes wrong in both directions:

     - a holding worth 1,000 TWD that COST 900 reports 1,900.00 over 2, against
       an investments total of 1,000.00;
     - adding an asset and a debt of 1,000 TWD each reports 3,900.00 over 4
       while the net worth does not move at all;
     - and an income of 100 TWD a month against an anchor dated a year earlier
       puts 1,200.00 into the net worth and reports 100.00 over 1  a recurring
       amount is converted once and multiplied afterwards.

   An earlier draft read "3,900.00 TWD is counted above as if already in EUR",
   under a net worth the amount had no such effect on. A second draft claimed
   the volume at least says whether to expect five or five thousand; the third
   case above is what disproved that, so the number is printed for what it
   literally is and for nothing more. What makes the notice ACTIONABLE is the
   code and the count, not the sum: the code says whether the reader owns
   anything in that currency, and the count says how many rows to look for. */

/* Printed plainly, not through `money`. `Intl.NumberFormat` needs a currency it
   recognises and the whole point of this notice is a code it does not  and
   more than that, a figure under a currency SYMBOL would read as a second total
   in the base, which is exactly the misreading being warned about. The code sits
   after the digits instead. */
function plain(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* Deliberately no grand total across the list either: 9,000 TWD and 1,000 GBp
   do not add up to 10,000 of anything, and a converter that could add them is
   the one thing missing here. Each currency states its own. */
export function UnconvertedNotice({
  items,
  /** The currency the totals above are in: the base of the payload they came
      from. It is the unit these amounts are being counted as. */
  baseCurrency,
}: {
  items: UnconvertedAmount[];
  baseCurrency: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="border-l-2 border-warn bg-warn-tint px-3 py-2 text-xs text-warn"
      title="这些货币没有已知汇率，写在其中的金额按面值计入，就像已经是本位币一样。因此上面的数字混用了不止一种单位。"
    >
      {items.map((u, i) => (
        <span key={u.currency ?? `none-${i}`}>
          {i > 0 && " · "}
          <b>
            {u.currency ?? "未标货币"} 的 {u.count} 笔金额
          </b>
          {": "}
          按写法原样 {plain(u.amount)}
        </span>
      ))}{" "}
      在这里没有汇率，因此在上面任何出现的地方都按面值计入。
      <div className="mt-0.5 text-ink-soft">
        这些合计只是把各行加起来，并不是上面某个数字差了多少：成本和它所属的市值并排计数，负债在这里计数、在那里做减法。代码写错了 → 在该行更正。真实货币但欧洲央行没有公布汇率 → 谁也无法换算，上面的数字与{" "}
        {baseCurrency} 并存、不止一种单位。
      </div>
    </div>
  );
}
