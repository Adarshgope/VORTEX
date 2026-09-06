/** Shared number/date formatting so every panel reads the same way. */

export const usd = (n, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : `$${Number(n).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}`;

export const usdCompact = (n) => {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

/** Rupee amounts. Indian grouping (12,34,567) is what a plant desk reads. */
export const inr = (n, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : `₹${Number(n).toLocaleString("en-IN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}`;

/** Crores — the unit a procurement budget is actually signed off in. */
export const crore = (n, digits = 2) =>
  n == null || Number.isNaN(n) ? "—" : `₹${Number(n).toFixed(digits)} Cr`;

/** Metric tonnes, Indian grouping. */
export const mt = (n) =>
  n == null ? "—" : `${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT`;

export const tonnes = (n) =>
  n == null ? "—" : `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })} t`;

export const num = (n, digits = 1) =>
  n == null || Number.isNaN(n)
    ? "—"
    : Number(n).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

export const pct = (n, digits = 1) =>
  n == null || Number.isNaN(n) ? "—" : `${n > 0 ? "+" : ""}${Number(n).toFixed(digits)}%`;

export const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

export const dayMonth = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Signal → palette used by the forecast + timing views. */
export const signalTone = (signal) =>
  ({
    RISING: { text: "text-rose-300", bg: "bg-rose-500/12", ring: "ring-rose-500/30", dot: "#fb7185" },
    FALLING: { text: "text-emerald-300", bg: "bg-emerald-500/12", ring: "ring-emerald-500/30", dot: "#34d399" },
    STABLE: { text: "text-amber-300", bg: "bg-amber-500/12", ring: "ring-amber-500/30", dot: "#fbbf24" },
  }[signal] || { text: "text-slate-300", bg: "bg-slate-500/12", ring: "ring-slate-500/30", dot: "#94a3b8" });

export const levelTone = (level) =>
  ({
    critical: { text: "text-rose-300", bg: "bg-rose-500/12", border: "border-rose-500/30" },
    warning: { text: "text-amber-300", bg: "bg-amber-500/12", border: "border-amber-500/30" },
    elevated: { text: "text-amber-300", bg: "bg-amber-500/12", border: "border-amber-500/30" },
    info: { text: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/30" },
    clear: { text: "text-emerald-300", bg: "bg-emerald-500/12", border: "border-emerald-500/30" },
  }[level] || { text: "text-slate-300", bg: "bg-slate-500/10", border: "border-slate-500/25" });

/**
 * Chart palette.
 *
 * `series` is the categorical order — assigned in sequence, never cycled. These
 * four steps were validated against the dark chart surface (#0f172a): OKLCH
 * lightness inside the 0.48–0.67 dark band, chroma above the floor, worst
 * adjacent CVD ΔE 8.3 (deutan), normal-vision ΔE 24.0, all above 3:1 contrast.
 * Charts with one series use `accent` (the brand gold) instead.
 */
export const CHART = {
  series: ["#d97706", "#3b82f6", "#059669", "#f43f5e"],
  accent: "#eab308",
  accentSoft: "#fde047",
  band: "#3b82f6",
  surface: "#0f172a",
  grid: "rgba(148, 163, 184, 0.12)",
  axis: "#64748b",
  ink: "#e2e8f0",
  inkMuted: "#94a3b8",
};

/** Status ink — reserved for state, never reused as a series colour. */
export const STATUS = {
  good: "#34d399",
  warning: "#fbbf24",
  serious: "#fb923c",
  critical: "#fb7185",
};

/** Recharts axis defaults — recessive ticks, no tick marks, faint axis line. */
export const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.inkMuted, fontSize: 10.5 },
  tickLine: false,
  axisLine: { stroke: "rgba(148,163,184,.18)" },
};
