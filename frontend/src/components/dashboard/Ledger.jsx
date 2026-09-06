/** Financial ledger — what the plan costs and what the optimiser saved. */

import { Panel, Skeleton } from "./ui";
import { crore, inr, num, usd } from "../../lib/format";

export default function Ledger({ plan }) {
  const ledger = plan?.ledger;

  if (!ledger) {
    return (
      <Panel title="Financial Ledger" subtitle="Procurement budget and savings">
        <Skeleton className="h-40 w-full" />
      </Panel>
    );
  }

  const rows = [
    ["Landed cost / MT", inr(ledger.avg_landed_inr_per_t, 0)],
    ["Worst feasible routing", inr(ledger.baseline_inr_per_t, 0)],
    ["Ocean leg", `${usd(plan.allocation.ocean_usd_per_t, 2)}/MT`],
    ["Sailing time", `${plan.allocation.sailing_days} days`],
    ["Inland rail", `${num(plan.allocation.rail_km, 0)} km`],
  ];

  return (
    <Panel
      title="Financial Ledger"
      subtitle={`${plan.plant.name} · ${plan.vessel.name}`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/8 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            Procurement budget
          </p>
          <p className="mt-1 font-display text-[24px] font-extrabold leading-none text-white">
            {crore(ledger.total_crore)}
          </p>
          <p className="mt-1.5 text-[10.5px] text-blue-200/45">
            {inr(ledger.total_inr, 0)} total
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            Saved vs baseline
          </p>
          <p className="mt-1 font-display text-[24px] font-extrabold leading-none text-white">
            {crore(ledger.savings_crore)}
          </p>
          <p className="mt-1.5 text-[10.5px] text-blue-200/45">
            {ledger.savings_pct}% below the costliest feasible routing
          </p>
        </div>
      </div>

      {plan.slow_steaming && (
        <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/6 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/70">
            Virtual arrival benefit
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-blue-100/70">
            Slow-steaming into the berth window saves{" "}
            <span className="font-semibold text-emerald-300">
              {crore(ledger.virtual_arrival_crore)}
            </span>{" "}
            against steaming full ahead and paying demurrage, and{" "}
            <span className="font-semibold text-emerald-300">
              {usd(ledger.bunker_saved_usd, 0)}
            </span>{" "}
            of bunkers across {ledger.parcels} parcel
            {ledger.parcels > 1 ? "s" : ""}.
          </p>
        </div>
      )}

      <dl className="mt-3 space-y-1.5 border-t border-blue-500/10 pt-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11.5px] text-blue-200/50">{k}</dt>
            <dd className="font-mono text-[11.5px] text-blue-50">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
