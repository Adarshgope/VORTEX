/**
 * 14-day freight index forecast — ML/app.py's "14-Day Tactical Decision
 * Engine" tab: realised BDRY flowing into the forward curve, the optimal
 * charter window, its four timing metrics and the day-by-day procurement
 * schedule with the green / amber / red signals.
 *
 * Fed by `POST /api/predict/freight`, which scores `freight_forecast_14d.pkl`
 * over the nine stationary features in `ML/src/src/train_model.py` and shapes
 * the path with ML/app.py's curve. The badges report which model answered and
 * which macro series it was scored against — the live Yahoo feed or the
 * bundled training snapshot — so a stale chart is never passed off as live.
 */

import {
  CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, BrainCircuit, CalendarCheck, Radio } from "lucide-react";
import { Badge, ChartTooltip, ErrorState, Legend, Metric, Panel, Skeleton } from "./ui";
import { axisProps, CHART, dayMonth, num, pct } from "../../lib/format";

const SIGNAL = {
  OPTIMAL: { chip: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400", row: "bg-emerald-500/8" },
  NEUTRAL: { chip: "bg-amber-500/15 text-amber-300", dot: "bg-amber-400", row: "" },
  ESCALATION: { chip: "bg-rose-500/15 text-rose-300", dot: "bg-rose-400", row: "" },
};

function ModelBadge({ model }) {
  if (!model) return null;
  return (
    <span
      title={model.detail}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${
        model.active
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      <BrainCircuit size={12} />
      {model.label}
    </span>
  );
}

/** Which macro series the forecast was scored against, and how fresh it is. */
function FeedBadge({ forecast, source }) {
  const live = forecast.data_is_live;
  const demo = source === "demo";
  const label = demo ? "Offline mirror" : live ? `Live feed · ${forecast.as_of}` : `Snapshot · ${forecast.as_of}`;
  return (
    <span
      title={forecast.data_source || "Bundled training snapshot"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${
        demo
          ? "border-slate-500/30 bg-slate-500/10 text-slate-300"
          : live
          ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      <Radio size={12} />
      {label}
    </span>
  );
}

export default function ForecastPanel({ forecast, source, error, onRetry }) {
  if (!forecast) {
    return (
      <Panel
        title="Freight Index Forecast · 14-Day"
        subtitle={error ? "The model service did not answer" : "Loading model output…"}
      >
        {error
          ? <ErrorState title="Forecast unavailable" message={error} onRetry={onRetry} />
          : <Skeleton className="h-[280px] w-full" />}
      </Panel>
    );
  }

  const rows = [
    ...forecast.history.map((p) => ({ date: p.date, actual: p.index })),
    ...forecast.points.map((p) => ({ date: p.date, forecast: p.forecast })),
  ];
  // Bridge the seam so the dashed forecast starts where the solid line ends.
  const seam = rows.findIndex((r) => r.forecast != null);
  if (seam > 0) rows[seam - 1].forecast = rows[seam - 1].actual;

  const lastActual = forecast.history[forecast.history.length - 1]?.date;
  const best = forecast.best_entry;
  const timing = forecast.timing;
  const urgent = timing?.level === "critical";
  const TimingIcon = urgent ? AlertTriangle : CalendarCheck;

  return (
    <Panel
      title="Freight Index Forecast · 14-Day"
      subtitle={`BDRY ${num(forecast.spot_index, 2)} → ${num(forecast.forecast_index, 2)} pts · model Δ ${num(forecast.model_delta, 2)} pts · R² ${num(forecast.model.r2, 3)}`}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <FeedBadge forecast={forecast} source={source} />
          <ModelBadge model={forecast.model} />
          <Badge
            tone={
              forecast.trend_direction === "RISING" ? "critical"
                : forecast.trend_direction === "FALLING" ? "clear"
                : "warning"
            }
          >
            {forecast.trend_direction} {pct(forecast.change_pct, 1)}
          </Badge>
        </div>
      }
    >
      {/* ---------------------------- ML/app.py's four timing metrics */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Live spot index" value={num(forecast.spot_index, 2)} unit="pts"
                footer={forecast.data_is_live ? `Yahoo Finance · ${forecast.as_of}` : `Snapshot · ${forecast.as_of}`} />
        <Metric label="Optimal day to book" value={`Day ${best.day}`} accent="text-emerald-300"
                footer={`${best.weekday}, ${dayMonth(best.date)}`} />
        <Metric label="Tactical low target" value={num(best.index, 2)} unit="pts"
                footer={<span className={best.change_pct < 0 ? "text-emerald-300" : "text-rose-300"}>{pct(best.change_pct, 2)} vs spot</span>} />
        <Metric label="Max window savings" value={pct(forecast.window_saving_pct, 2).replace("+", "")}
                footer={`vs the 14-day peak on day ${forecast.peak.day}`} />
      </div>

      <Legend
        items={[
          { label: "Realised BDRY", color: CHART.series[1] },
          { label: "14-day forecast curve", color: CHART.accent, dashed: true },
        ]}
      />

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 6, right: 14, left: 4, bottom: 4 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={dayMonth} minTickGap={44} />
          <YAxis {...axisProps} width={44} domain={["auto", "auto"]} tickFormatter={(v) => v.toFixed(0)} />
          <Tooltip
            cursor={{ stroke: CHART.accent, strokeWidth: 1, strokeDasharray: "3 3" }}
            content={<ChartTooltip labelFormatter={dayMonth} formatter={(v) => `${num(v, 2)} pts`} />}
          />
          <Line dataKey="actual" name="Realised BDRY" type="monotone"
                stroke={CHART.series[1]} strokeWidth={2} dot={false} isAnimationActive={false}
                activeDot={{ r: 4, fill: CHART.series[1], stroke: CHART.surface, strokeWidth: 2 }} />
          <Line dataKey="forecast" name="Forecast" type="monotone"
                stroke={CHART.accent} strokeWidth={2} strokeDasharray="5 4" dot={false}
                connectNulls isAnimationActive={false}
                activeDot={{ r: 4, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 }} />
          {lastActual && (
            <ReferenceLine
              x={lastActual} stroke="rgba(148,163,184,.45)" strokeDasharray="3 3"
              label={{ value: "TODAY", position: "insideTopRight", fill: CHART.inkMuted, fontSize: 9, fontWeight: 700 }}
            />
          )}
          <ReferenceDot
            x={best.date} y={best.index} r={6}
            fill="#34d399" stroke={CHART.surface} strokeWidth={2}
            label={{ value: `BEST DAY ${best.day}`, position: "top", fill: "#34d399", fontSize: 9, fontWeight: 700 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* ---------------------------------- recommended timing callout */}
      {timing && (
        <div className={`mt-4 flex items-start gap-3 rounded-xl border p-3.5 ${
          urgent ? "border-rose-500/30 bg-rose-500/10" : "border-emerald-500/25 bg-emerald-500/8"
        }`}>
          <TimingIcon size={15} className={`mt-0.5 shrink-0 ${urgent ? "text-rose-300" : "text-emerald-300"}`} />
          <p className="text-[12px] leading-relaxed text-blue-50/85">
            <span className={`font-bold uppercase tracking-wider ${urgent ? "text-rose-300" : "text-emerald-300"}`}>
              Recommended timing · {timing.action}
            </span>
            {" — "}{timing.detail}
          </p>
        </div>
      )}

      {/* ------------------------------ day-by-day tactical schedule */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-blue-500/12">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-blue-200/45">
              {["Day", "Date", "Forecast", "vs current", "Procurement signal"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-500/8">
            {forecast.points.map((p) => {
              const tone = SIGNAL[p.signal] || SIGNAL.NEUTRAL;
              return (
                <tr key={p.day} className={tone.row}>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-blue-200/60">Day {p.day}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-[11.5px] text-blue-50">{p.weekday}, {dayMonth(p.date)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11.5px] font-semibold text-white">{num(p.forecast, 2)}</td>
                  <td className={`whitespace-nowrap px-3 py-1.5 font-mono text-[11px] ${p.change_pct < 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(p.change_pct, 2)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.chip}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                      {p.signal_label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
