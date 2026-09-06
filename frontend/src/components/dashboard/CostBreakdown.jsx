/**
 * Multi-modal cost stack for the allocated routing — one rupee-per-tonne bar
 * split into the legs that make it up, so the shape of the landed cost is
 * readable at a glance.
 */

import { Panel, Skeleton } from "./ui";
import { inr } from "../../lib/format";

const LEGS = [
  { key: "fob", label: "FOB cargo", color: "#3b82f6" },
  { key: "ocean_freight", label: "Ocean freight", color: "#d97706" },
  { key: "grade_adj", label: "Coal grade adj.", color: "#8b5cf6" },
  { key: "port_handling", label: "Port handling", color: "#059669" },
  { key: "demurrage", label: "Demurrage", color: "#f43f5e" },
  { key: "extra_charter", label: "Extra charter hire", color: "#fb923c" },
  { key: "rail_fois", label: "FOIS rail", color: "#eab308" },
  { key: "godown", label: "Plant godown", color: "#64748b" },
];

export default function CostBreakdown({ plan }) {
  const breakdown = plan?.allocation?.breakdown;

  if (!breakdown) {
    return (
      <Panel title="Multi-Modal Cost Stack" subtitle="Landed cost by leg">
        <Skeleton className="h-40 w-full" />
      </Panel>
    );
  }

  const legs = LEGS.map((l) => ({ ...l, value: breakdown[l.key] || 0 })).filter(
    (l) => l.value > 0
  );
  const total = legs.reduce((a, l) => a + l.value, 0);
  const saved = breakdown.bunker_saved || 0; // negative: a credit, shown separately

  return (
    <Panel
      title="Multi-Modal Cost Stack"
      subtitle={`${plan.allocation.supplier} → ${plan.allocation.port_short} → ${plan.plant.short}`}
    >
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
        {legs.map((l) => (
          <div
            key={l.key}
            style={{ width: `${(l.value / total) * 100}%`, background: l.color }}
            title={`${l.label}: ${inr(l.value, 0)}/MT`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {legs.map((l) => (
          <li key={l.key} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: l.color }}
            />
            <span className="flex-1 text-[11.5px] text-blue-100/70">{l.label}</span>
            <span className="font-mono text-[11.5px] text-blue-200/50">
              {((l.value / total) * 100).toFixed(1)}%
            </span>
            <span className="w-[86px] text-right font-mono text-[11.5px] font-semibold text-white">
              {inr(l.value, 0)}
            </span>
          </li>
        ))}

        {saved < 0 && (
          <li className="flex items-center gap-2.5 border-t border-blue-500/10 pt-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-emerald-400/60" />
            <span className="flex-1 text-[11.5px] text-emerald-300/80">
              Bunker saved · slow-steaming
            </span>
            <span className="w-[86px] text-right font-mono text-[11.5px] font-semibold text-emerald-300">
              {inr(saved, 0)}
            </span>
          </li>
        )}

        <li className="flex items-center gap-2.5 border-t border-blue-500/12 pt-2">
          <span className="flex-1 text-[11.5px] font-semibold text-white">
            Total landed
          </span>
          <span className="w-[86px] text-right font-mono text-[12.5px] font-extrabold text-amber-300">
            {inr(plan.allocation.landed_inr_per_t, 0)}
          </span>
        </li>
      </ul>
    </Panel>
  );
}
