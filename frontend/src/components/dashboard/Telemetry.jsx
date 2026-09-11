/**
 * Mid-voyage telemetry — ML/app.py's "Real-Time Mid-Voyage Telemetry" card.
 *
 * Reads the allocated routing as a parcel already at sea: how far along she is,
 * how long the queue at the discharge port is, and whether easing off the
 * throttle can still absorb that queue before she arrives. The passage left to
 * run is the whole budget virtual arrival has to spend — past it the ship is
 * early whatever she does, and the rest of the wait is demurrage.
 */

import { Anchor, Ship, Timer, TriangleAlert } from "lucide-react";
import { Panel } from "./ui";
import { num, usd } from "../../lib/format";

const STATUS = {
  ABSORBED: {
    label: "Absorbed",
    icon: Anchor,
    wrap: "border-emerald-500/25 bg-emerald-500/8",
    ink: "text-emerald-300",
    note: "Virtual arrival active",
  },
  PARTIAL: {
    label: "Partially absorbed",
    icon: Timer,
    wrap: "border-amber-400/25 bg-amber-400/8",
    ink: "text-amber-300",
    note: "Speed reduction cap reached",
  },
  EXPOSED: {
    label: "Exposed",
    icon: TriangleAlert,
    wrap: "border-rose-500/25 bg-rose-500/8",
    ink: "text-rose-300",
    note: "Slow-steaming inactive",
  },
};

/** One figure from the card. Kept flat — four of these read as a strip. */
function Cell({ label, value, sub, ink = "text-white" }) {
  return (
    <div className="rounded-xl border border-blue-500/15 bg-[#02060f]/40 p-3">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-blue-200/50">
        {label}
      </p>
      <p className={`mt-1 font-display text-[18px] font-extrabold leading-none ${ink}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[10px] leading-snug text-blue-200/45">{sub}</p>}
    </div>
  );
}

export default function Telemetry({ plan }) {
  const t = plan?.telemetry;
  if (!t?.tracking) return null;

  const tone = STATUS[t.status] || STATUS.PARTIAL;
  const Icon = tone.icon;

  return (
    <Panel
      title="Mid-Voyage Telemetry"
      subtitle={`Day ${t.voyage_day} of ${t.sailing_days} · ${t.supplier} → ${t.port_short}`}
      action={
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${tone.wrap} ${tone.ink}`}
        >
          <Icon size={11} />
          {tone.label}
        </span>
      }
    >
      {/* ------------------------------------------------- passage progress */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-blue-100/70">
            <Ship size={12} className="text-amber-300" />
            {t.vessel} underway from {t.supplier}
          </span>
          <span className="font-mono text-blue-200/50">
            {t.days_to_eta} day{t.days_to_eta === 1 ? "" : "s"} to ETA
          </span>
        </div>
        <div
          className="relative h-2 w-full overflow-hidden rounded-full bg-white/5"
          role="progressbar"
          aria-valuenow={Math.round(t.progress_pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Voyage progress"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-amber-500"
            style={{ width: `${t.progress_pct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9.5px] text-blue-200/35">
          <span>Loaded {t.supplier}</span>
          <span>{num(t.progress_pct, 0)}% of passage</span>
          <span>{t.port_short}</span>
        </div>
      </div>

      {/* ------------------------------------------------------ the figures */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Cell
          label="Voyage day"
          value={`${t.voyage_day} / ${t.sailing_days}`}
          sub={`${t.days_to_eta} days of passage left to lose`}
        />
        <Cell
          label="Discharge queue"
          value={`${num(t.queue_days, 1)} d`}
          sub={`Anchorage wait at ${t.port_short}`}
        />
        <Cell
          label="Absorbable by slowing"
          value={t.slow_steaming ? `${t.absorbable_days} d` : "—"}
          ink={t.slow_steaming ? "text-sky-300" : "text-blue-200/40"}
          sub={
            t.slow_steaming
              ? "Remaining passage is the speed-reduction budget"
              : "Virtual arrival is switched off"
          }
        />
        <Cell
          label="Demurrage risk"
          value={usd(t.demurrage_risk_usd, 0)}
          ink={t.demurrage_risk_usd > 0 ? "text-rose-300" : "text-emerald-300"}
          sub={
            t.demurrage_risk_usd > 0
              ? `${num(t.exposed_days, 1)} d at ${usd(t.demurrage_day_usd, 0)}/day`
              : "No time at anchorage"
          }
        />
      </div>

      <div className={`mt-3 rounded-xl border p-3 ${tone.wrap}`}>
        <p className={`text-[10px] font-bold uppercase tracking-wider ${tone.ink}`}>
          {tone.note}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-blue-100/70">
          {t.status_detail}
        </p>
      </div>
    </Panel>
  );
}
