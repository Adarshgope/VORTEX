/**
 * LTC vs Spot contract ledger — ML/app.py's "PSU Procurement Contract
 * Breakdown" tab.
 *
 * A public sector plant buys on two tiers at once: a long-term framework
 * contract carrying the baseload so the blast furnaces never run dry, and spot
 * auction tenders chasing freight dips with the balance. The optimiser prices
 * and routes each tranche on its own terms — and they need not land on the same
 * port, because the LTC stack drops exactly the demurrage and charter-hire
 * terms that separate one berth's queue from another's.
 */

import { Building2, Zap } from "lucide-react";
import { ErrorState, Panel, Skeleton } from "./ui";
import { crore, inr, mt, num } from "../../lib/format";

/** One tier's card — same shape either side, so the pair reads as a comparison. */
function TierCard({ tier, tone, icon: Icon, footer }) {
  return (
    <div className={`rounded-xl border p-4 ${tone.wrap}`}>
      <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${tone.ink}`}>
        <Icon size={12} />
        {tier.title} · {num(tier.ratio_pct, 0)}%
      </p>

      <p className="mt-2 font-display text-[24px] font-extrabold leading-none text-white">
        {mt(tier.volume_t)}
      </p>

      {tier.routing && (
        <p className="mt-1.5 text-[11.5px] text-blue-100/70">
          {tier.routing} ·{" "}
          <span className="font-mono font-semibold text-white">
            {inr(tier.landed_inr_per_t, 0)}
          </span>
          <span className="text-blue-200/45">/MT landed</span>
        </p>
      )}

      <dl className="mt-3 space-y-2 border-t border-white/8 pt-3">
        <div>
          <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-blue-200/45">
            Pricing mechanism
          </dt>
          <dd className="mt-0.5 text-[11px] leading-relaxed text-blue-100/65">{tier.pricing}</dd>
        </div>
        <div>
          <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-blue-200/45">
            Demurrage exposure
          </dt>
          <dd className="mt-0.5 text-[11px] leading-relaxed text-blue-100/65">{tier.demurrage}</dd>
        </div>
      </dl>

      {footer && (
        <p className={`mt-3 border-t border-white/8 pt-2.5 text-[11px] ${tone.ink}`}>{footer}</p>
      )}
    </div>
  );
}

const LTC_TONE = { wrap: "border-sky-500/25 bg-sky-500/8", ink: "text-sky-300" };
const SPOT_TONE = { wrap: "border-amber-400/25 bg-amber-400/8", ink: "text-amber-300" };

export default function ContractLedger({ plan, error, onRetry }) {
  const c = plan?.contract;

  if (!c) {
    return (
      <Panel title="LTC vs Spot Contract Ledger" subtitle="Dual-tier procurement split">
        {error && !plan ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : plan ? (
          <p className="text-[12px] text-blue-200/50">
            No contract split to show — the optimiser found no feasible routing for this
            vessel and plant.
          </p>
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </Panel>
    );
  }

  return (
    <Panel
      title="LTC vs Spot Contract Ledger"
      subtitle={`${num(c.ltc_ratio_pct, 0)}% framework contract · ${num(c.spot_ratio_pct, 0)}% spot auction`}
    >
      {/* ------------------------------------------------------- the split */}
      <div className="mb-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="bg-gradient-to-r from-sky-600 to-sky-400"
            style={{ width: `${c.ltc_ratio_pct}%` }}
            title={`LTC: ${mt(c.ltc_volume_t)}`}
          />
          <div
            className="bg-gradient-to-r from-yellow-300 to-amber-500"
            style={{ width: `${c.spot_ratio_pct}%` }}
            title={`Spot: ${mt(c.spot_volume_t)}`}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11px]">
          <span className="text-sky-300/85">
            LTC {crore(c.ltc_crore)} · {mt(c.ltc_volume_t)}
          </span>
          <span className="text-amber-300/85">
            Spot {crore(c.spot_crore)} · {mt(c.spot_volume_t)}
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------- the tiers */}
      <div className="grid gap-3 lg:grid-cols-2">
        <TierCard
          tier={c.ltc}
          tone={LTC_TONE}
          icon={Building2}
          footer={
            c.ltc_discount_inr > 0
              ? `Framework terms saved ${crore(c.ltc_discount_crore)} against buying this same tonnage, on this same routing, at spot.`
              : null
          }
        />
        <TierCard
          tier={c.spot}
          tone={SPOT_TONE}
          icon={Zap}
          footer={`Execution window fixed on day ${c.execution_day} (${c.execution_label}) to catch the forecast's tactical low.`}
        />
      </div>

      {/* --------------------------------------------------- the comparison */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-blue-200/45">
              <th className="whitespace-nowrap py-2 pr-4 font-semibold">Category</th>
              <th className="whitespace-nowrap px-4 py-2 font-semibold text-sky-300/70">
                Long-term contract
              </th>
              <th className="whitespace-nowrap py-2 pl-4 font-semibold text-amber-300/70">
                Spot market bidding
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-500/8">
            {c.comparison.map((row) => (
              <tr key={row.category}>
                <td className="py-2 pr-4 text-[11.5px] text-blue-200/55">{row.category}</td>
                <td className="px-4 py-2 text-[11.5px] text-blue-50">{row.ltc}</td>
                <td className="py-2 pl-4 text-[11.5px] text-blue-50">{row.spot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 border-t border-blue-500/10 pt-2.5 text-[10.5px] leading-relaxed text-blue-200/40">
        The framework tranche is priced at {num(c.fob_discount_pct, 1)}% off FOB and{" "}
        {num(c.freight_discount_pct, 0)}% off the committed freight leg, with no demurrage
        or extra charter hire — a pre-booked berthing slot puts the discharge window on the
        supplier. Both tranches are solved in one program, so they can land on different
        ports when the queue economics say they should.
      </p>
    </Panel>
  );
}
