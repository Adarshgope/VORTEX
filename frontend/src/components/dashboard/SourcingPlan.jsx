/**
 * Optimal sourcing plan.
 *
 * Every origin x discharge-port routing the selected vessel can physically work,
 * priced to the plant stockyard on both procurement tiers and ranked. Each
 * tranche — framework contract and spot auction — goes wholly to the cheapest
 * routing on its own terms, so one or two rows carry the allocation and the rest
 * show what they would have cost. Ocean / port / rail sit in their own columns,
 * which is the multi-modal breakdown read across instead of stacked.
 */

import { Ship } from "lucide-react";
import { ErrorState, Panel, Skeleton, SourceChip } from "./ui";
import { inr, num, usd } from "../../lib/format";

export default function SourcingPlan({ plan, source, error, onRetry }) {
  const routes = plan?.routes || [];
  const infeasible = plan?.infeasible || [];

  return (
    <Panel
      title="Optimal Sourcing Plan"
      subtitle={
        plan?.allocation
          ? `${plan.volume_t.toLocaleString("en-IN")} MT to ${plan.plant.short} · ${plan.vessel.name} · ${plan.contract.ltc_ratio_pct}/${plan.contract.spot_ratio_pct} LTC:spot · ${plan.ledger.parcels} parcel${plan.ledger.parcels > 1 ? "s" : ""}`
          : "Ranking every feasible routing"
      }
      action={<SourceChip source={source} />}
      padded={false}
    >
      {!plan ? (
        <div className="p-5">
          {error
            ? <ErrorState title="Optimiser did not answer" message={error} onRetry={onRetry} />
            : <Skeleton className="h-56 w-full" />}
        </div>
      ) : !routes.length ? (
        <div className="px-5 py-10 text-center">
          <Ship size={22} className="mx-auto text-rose-300/60" />
          <p className="mt-2 text-[13px] font-semibold text-rose-300">
            No feasible routing
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[11.5px] text-blue-200/50">
            {plan.tactical?.detail}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-blue-200/45">
                  {["", "Supplier origin", "Discharge port", "Allocated",
                    "Ocean", "FOIS rail", "Spot ₹/MT", "LTC ₹/MT", "vs best"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-2.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-500/8">
                {routes.map((r) => {
                  const chosen = r.allocated_t > 0;
                  return (
                    <tr
                      key={r.id}
                      className={chosen ? "bg-amber-400/8" : "transition-colors hover:bg-blue-500/6"}
                    >
                      <td className="whitespace-nowrap py-2.5 pl-4 pr-1">
                        <span
                          className={`inline-block w-5 text-center font-mono text-[10.5px] font-bold ${
                            chosen ? "text-amber-300" : "text-blue-200/35"
                          }`}
                        >
                          {r.rank}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="block text-[12px] font-semibold text-white">
                          {r.supplier}
                        </span>
                        <span className="block text-[10px] text-blue-200/45">{r.grade}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="block text-[12px] text-blue-50">{r.port_short}</span>
                        <span className="block text-[10px] text-blue-200/45">
                          {num(r.rail_km, 0)} km rail
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {chosen ? (
                          <span className="flex flex-wrap gap-1">
                            {r.allocated_ltc_t > 0 && (
                              <span
                                title="Long-term framework contract"
                                className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 font-mono text-[10.5px] font-bold text-sky-300"
                              >
                                LTC {r.allocated_ltc_t.toLocaleString("en-IN")}
                              </span>
                            )}
                            {r.allocated_spot_t > 0 && (
                              <span
                                title="Spot auction tender"
                                className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 font-mono text-[10.5px] font-bold text-amber-300"
                              >
                                Spot {r.allocated_spot_t.toLocaleString("en-IN")}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-blue-200/25">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-blue-100/65">
                        {usd(r.usd_components.freight, 2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-blue-100/65">
                        {inr(r.breakdown.rail_fois, 0)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-2.5 font-mono text-[12px] font-bold ${
                          r.allocated_spot_t > 0 ? "text-amber-300" : "text-white"
                        }`}
                      >
                        {inr(r.landed_inr_per_t, 0)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-2.5 font-mono text-[12px] font-bold ${
                          r.allocated_ltc_t > 0 ? "text-sky-300" : "text-blue-100/70"
                        }`}
                      >
                        {inr(r.landed_ltc_inr_per_t, 0)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-blue-200/45">
                        {r.premium_inr_per_t > 0 ? `+${inr(r.premium_inr_per_t, 0)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="border-t border-blue-500/10 px-4 py-2.5 text-[10.5px] leading-relaxed text-blue-200/40">
            Ocean is USD/MT before conversion at ₹{num(plan.macro.usd_inr, 2)}; rail is the
            published FOIS rate. Rank is on the spot stack. Each tranche goes wholly to
            the cheapest routing on its own terms — the LP has no per-port capacity limit —
            and the two can differ, since LTC pricing drops the demurrage and charter
            hire that separate the ports' queues.
            {infeasible.length > 0 && (
              <>
                {" "}
                <span className="text-rose-300/60">
                  {infeasible.length} routing{infeasible.length > 1 ? "s" : ""} excluded:{" "}
                  {infeasible[0].reason}.
                </span>
              </>
            )}
          </p>
        </>
      )}
    </Panel>
  );
}
