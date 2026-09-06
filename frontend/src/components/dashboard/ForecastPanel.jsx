/**
 * Freight predictor — realised BDRY flowing into the model's forward curve.
 *
 * The line is served by `freight_forecast_14d.pkl` / `freight_forecast_30d.pkl`;
 * the badge says so, and flips when the browser mirror is standing in.
 */

import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BrainCircuit, CalendarCheck } from "lucide-react";
import { Badge, ChartTooltip, Legend, Panel, Skeleton } from "./ui";
import { axisProps, CHART, dayMonth, num, pct } from "../../lib/format";

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

export default function ForecastPanel({ forecast }) {
  if (!forecast) {
    return (
      <Panel title="Freight Index Forecast" subtitle="Loading model output…">
        <Skeleton className="h-[280px] w-full" />
      </Panel>
    );
  }

  const rows = [
    ...forecast.history.map((p) => ({ date: p.date, actual: p.index })),
    ...forecast.points.map((p) => ({
      date: p.date, forecast: p.forecast, band: [p.lower, p.upper],
    })),
  ];
  // Bridge the seam so the dashed forecast starts where the solid line ends.
  const seam = rows.findIndex((r) => r.forecast != null);
  if (seam > 0) rows[seam - 1].forecast = rows[seam - 1].actual;

  const lastActual = forecast.history[forecast.history.length - 1]?.date;

  return (
    <Panel
      title={`Freight Index Forecast · ${forecast.horizon_days}-Day`}
      subtitle={`BDRY ${num(forecast.spot_index, 2)} → ${num(forecast.forecast_index, 2)} pts · ${Math.round(forecast.confidence * 100)}% confidence · R² ${num(forecast.model.horizon_r2, 3)}`}
      action={
        <div className="flex items-center gap-2">
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
      <Legend
        items={[
          { label: "Realised BDRY", color: CHART.series[1] },
          { label: "Model forecast", color: CHART.accent, dashed: true },
          { label: "95% confidence band", color: "rgba(59,130,246,.35)" },
        ]}
      />

      <ResponsiveContainer width="100%" height={272}>
        <ComposedChart data={rows} margin={{ top: 6, right: 14, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="bdryBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.band} stopOpacity="0.26" />
              <stop offset="100%" stopColor={CHART.band} stopOpacity="0.06" />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={dayMonth} minTickGap={44} />
          <YAxis
            {...axisProps} width={44} domain={["auto", "auto"]}
            tickFormatter={(v) => v.toFixed(0)}
          />
          <Tooltip
            cursor={{ stroke: CHART.accent, strokeWidth: 1, strokeDasharray: "3 3" }}
            content={
              <ChartTooltip
                labelFormatter={dayMonth}
                formatter={(v) =>
                  Array.isArray(v)
                    ? `${num(v[0], 2)} – ${num(v[1], 2)}`
                    : `${num(v, 2)} pts`
                }
              />
            }
          />

          <Area dataKey="band" name="95% confidence" stroke="none" fill="url(#bdryBand)"
                connectNulls isAnimationActive={false} />
          <Line dataKey="actual" name="Realised BDRY" type="monotone"
                stroke={CHART.series[1]} strokeWidth={2} dot={false} isAnimationActive={false}
                activeDot={{ r: 4, fill: CHART.series[1], stroke: CHART.surface, strokeWidth: 2 }} />
          <Line dataKey="forecast" name="Model forecast" type="monotone"
                stroke={CHART.accent} strokeWidth={2} strokeDasharray="5 4" dot={false}
                connectNulls isAnimationActive={false}
                activeDot={{ r: 4, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 }} />

          {lastActual && (
            <ReferenceLine
              x={lastActual} stroke="rgba(148,163,184,.45)" strokeDasharray="3 3"
              label={{ value: "TODAY", position: "insideTopRight", fill: CHART.inkMuted,
                       fontSize: 9, fontWeight: 700 }}
            />
          )}
          <ReferenceDot
            x={forecast.best_entry.date} y={forecast.best_entry.index} r={5}
            fill="#34d399" stroke={CHART.surface} strokeWidth={2}
            label={{ value: "BEST FIXTURE", position: "top", fill: "#34d399",
                     fontSize: 9, fontWeight: 700 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3.5">
        <CalendarCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" />
        <p className="text-[12px] leading-relaxed text-blue-50/85">
          <span className="font-bold uppercase tracking-wider text-emerald-300">
            Optimal charter window
          </span>
          {" — "}
          day {forecast.best_entry.day} ({dayMonth(forecast.best_entry.date)}) at{" "}
          {num(forecast.best_entry.index, 2)} pts, {num(forecast.window_saving_pct, 2)}% below
          the {forecast.horizon_days}-day peak.
        </p>
      </div>
    </Panel>
  );
}
