/**
 * Financial ledger — ML/app.py's "Financial Ledger" column: the procurement
 * budget in crores, the average landed cost, and the Virtual Arrival line —
 * fuel saved and demurrage eliminated when slow-steaming, demurrage paid when
 * not — plus its mid-voyage advisory once a congestion spike is dialled in.
 */

import { ErrorState, Panel, Skeleton } from "./ui";
import { crore, inr, num, usd } from "../../lib/format";

export default function Ledger({ plan, error, onRetry }) {
  const ledger = plan?.ledger;

  if (!ledger) {
    return (
      <Panel title="Financial Ledger" subtitle="Procurement budget and savings">
        {error && !plan
          ? <ErrorState message={error} onRetry={onRetry} />
          : <Skeleton className="h-40 w-full" />}
      </Panel>
    );
  }

  const rows = [
    ["Costliest feasible routing", inr(ledger.baseline_inr_per_t, 0)],
    ["Saved against it", `${crore(ledger.savings_crore)} · ${num(ledger.savings_pct, 1)}%`],
    ["Ocean leg", `${usd(plan.allocation.ocean_usd_per_t, 2)}/MT`],
    ["Sailing time", `${plan.allocation.sailing_days} days`],
    ["Anchorage queue", `${num(plan.allocation.queue_delay_days, 1)} days`],
    ["Inland rail", `${num(plan.allocation.rail_km, 0)} km`],
  ];

  return (
    <Panel title="Financial Ledger" subtitle={`${plan.plant.name} · ${plan.vessel.name}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/8 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            Total procurement budget
          </p>
          <p className="mt-1 font-display text-[24px] font-extrabold leading-none text-white">
            {crore(ledger.total_crore)}
          </p>
          <p className="mt-1.5 text-[10.5px] text-blue-200/45">{inr(ledger.total_inr, 0)} total</p>
        </div>

        <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/70">
            Average landed cost
          </p>
          <p className="mt-1 font-display text-[24px] font-extrabold leading-none text-white">
            {inr(ledger.avg_landed_inr_per_t, 0)}
          </p>
          <p className="mt-1.5 text-[10.5px] text-blue-200/45">per MT at the plant stockyard</p>
        </div>
      </div>

      {plan.slow_steaming ? (
        <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            Virtual arrival active
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-blue-100/70">
            Saved <span className="font-semibold text-emerald-300">{usd(ledger.bunker_saved_usd, 0)}</span>{" "}
            in fuel across {ledger.parcels} parcel{ledger.parcels > 1 ? "s" : ""} and eliminated anchorage
            demurrage
            {ledger.demurrage_avoided_usd > 0 && (
              <> — <span className="font-semibold text-emerald-300">{usd(ledger.demurrage_avoided_usd, 0)}</span> that full-speed steaming would have paid</>
            )}.
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/8 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
            Demurrage paid
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-blue-100/70">
            <span className="font-semibold text-rose-300">{usd(ledger.demurrage_paid_usd, 0)}</span>{" "}
            in port congestion penalties. Enable Virtual Arrival to absorb the queue in transit.
          </p>
        </div>
      )}

      {plan.advisory && (
        <div className="mt-3 rounded-xl border border-sky-500/25 bg-sky-500/8 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
            {plan.advisory.title}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-blue-100/70">{plan.advisory.detail}</p>
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
