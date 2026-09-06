/** Tactical action banner plus the four live macro readings. */

import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import { Metric, Skeleton } from "./ui";
import { num, pct, usd } from "../../lib/format";

const BANNER = {
  critical: {
    icon: AlertTriangle,
    wrap: "border-rose-500/30 bg-rose-500/10",
    ink: "text-rose-300",
  },
  warning: {
    icon: TrendingUp,
    wrap: "border-amber-400/30 bg-amber-400/10",
    ink: "text-amber-300",
  },
  clear: {
    icon: CheckCircle2,
    wrap: "border-emerald-500/30 bg-emerald-500/10",
    ink: "text-emerald-300",
  },
};

export function TacticalBanner({ tactical }) {
  if (!tactical) return <Skeleton className="h-[74px] w-full rounded-2xl" />;
  const tone = BANNER[tactical.level] || BANNER.warning;
  const Icon = tone.icon;

  return (
    <div className={`flex items-start gap-3.5 rounded-2xl border p-4 ${tone.wrap}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${tone.ink}`} />
      <div className="min-w-0">
        <p className={`font-display text-[14px] font-extrabold tracking-wide ${tone.ink}`}>
          {tactical.action}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-blue-50/80">{tactical.detail}</p>
      </div>
    </div>
  );
}

export default function MetricsBar({ plan }) {
  if (!plan?.macro) {
    return (
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const { macro, forecast } = plan;
  const rising = forecast.change_pct >= 0;
  const Arrow = rising ? TrendingUp : TrendingDown;

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <Metric
        label="Freight index · BDRY"
        value={num(macro.bdry, 2)}
        unit="pts"
        accent="text-white"
        footer={
          <span className="inline-flex items-center gap-1.5">
            <Arrow size={12} className={rising ? "text-rose-300" : "text-emerald-300"} />
            <span className={rising ? "text-rose-300" : "text-emerald-300"}>
              {forecast.horizon_days}d target {num(forecast.forecast_index, 2)}
            </span>
            <span className="text-blue-200/40">({pct(forecast.change_pct, 1)})</span>
          </span>
        }
      />
      <Metric
        label="Brent crude"
        value={usd(macro.brent_usd, 2)}
        unit="/bbl"
        accent="text-white"
        footer={
          macro.crude_shock_pct
            ? `${pct(macro.crude_shock_pct, 0)} shock applied`
            : "At live spot — no shock applied"
        }
      />
      <Metric
        label="Bunker fuel · VLSFO"
        value={usd(macro.vlsfo_usd_per_t, 0)}
        unit="/MT"
        accent="text-white"
        footer="Drives the slow-steaming trade-off"
      />
      <Metric
        label="Forex · USD/INR"
        value={`₹${num(macro.usd_inr, 2)}`}
        unit="/$"
        accent="text-white"
        footer="Converts every seaborne leg to rupees"
      />
    </div>
  );
}
