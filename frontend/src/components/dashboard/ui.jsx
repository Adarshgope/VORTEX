/** Shared dashboard primitives — panels, controls, metric tiles, chart chrome. */

import { levelTone } from "../../lib/format";

/* --------------------------------------------------------------- surfaces */

export function Panel({ title, subtitle, action, children, className = "", padded = true }) {
  return (
    <section
      className={`glass rounded-2xl shadow-[0_24px_60px_-32px_rgba(0,0,0,.95)] ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-blue-500/12 px-5 py-3.5">
          <div className="min-w-0">
            {title && (
              <h3 className="font-display text-[13.5px] font-bold tracking-wide text-white">
                {title}
              </h3>
            )}
            {subtitle && <p className="mt-0.5 text-[11.5px] text-blue-200/50">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Skeleton({ className = "h-4 w-full" }) {
  return <div className={`animate-pulse rounded bg-blue-500/10 ${className}`} />;
}

/* --------------------------------------------------------------- controls */

export function Segmented({ options, value, onChange, size = "md", full = false }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-[12px]";
  return (
    <div
      className={`inline-flex rounded-lg border border-blue-500/20 bg-[#02060f]/70 p-0.5 ${
        full ? "w-full" : ""
      }`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-[6px] font-semibold transition-all ${pad} ${
              full ? "flex-1" : ""
            } ${
              active
                ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-[#0a192f] shadow-[0_4px_14px_-6px_rgba(234,179,8,.9)]"
                : "text-blue-200/60 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Labelled range input for the macro stress-test controls. */
export function Slider({ label, unit, value, min, max, step, onChange, format, hint }) {
  const pos = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-blue-200/55">
          {label}
        </span>
        <span className="font-mono text-[11.5px] font-bold text-amber-300">
          {format ? format(value) : value}
          {unit ? <span className="ml-0.5 text-[9.5px] text-blue-200/45">{unit}</span> : null}
        </span>
      </span>
      <input
        type="range"
        className="slider"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{
          background: `linear-gradient(90deg, rgba(234,179,8,.75) ${pos}%, rgba(59,130,246,.22) ${pos}%)`,
        }}
      />
      {hint && <span className="mt-1 block text-[10px] text-blue-200/35">{hint}</span>}
    </label>
  );
}

export function Toggle({ label, hint, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl border border-blue-500/20 bg-[#02060f]/50 p-3 text-left transition-colors hover:border-amber-400/40"
    >
      <span
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
          checked ? "bg-gradient-to-r from-yellow-300 to-amber-500" : "bg-blue-500/25"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${
            checked ? "left-[16px]" : "left-[2px]"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[11.5px] font-semibold text-white">{label}</span>
        {hint && <span className="block text-[10px] leading-snug text-blue-200/45">{hint}</span>}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------- badges */

export function Badge({ tone = "info", icon: Icon, children }) {
  const t = levelTone(tone);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider ${t.bg} ${t.border} ${t.text}`}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

/** "Live" vs "Demo" data provenance chip. */
export function SourceChip({ source }) {
  if (!source) return null;
  const live = source === "live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-wider ${
        live ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
      }`}
      title={live ? "Served by the Flask API" : "Flask API unreachable — computed in-browser"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
      {live ? "LIVE" : "DEMO"}
    </span>
  );
}

/* ------------------------------------------------------------ metric tile */

export function Metric({ label, value, unit, accent = "text-white", footer, meter }) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-blue-200/55">
        {label}
      </p>
      <p
        className={`mt-1.5 flex items-baseline gap-1.5 font-display text-[25px] font-extrabold leading-none tracking-tight ${accent}`}
      >
        {value}
        {unit && <span className="text-[11px] font-medium text-blue-200/50">{unit}</span>}
      </p>
      {meter != null && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-amber-500"
            style={{ width: `${Math.round(meter * 100)}%` }}
          />
        </div>
      )}
      {footer && <div className="mt-2 text-[11px] leading-snug text-blue-200/45">{footer}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ chart chrome */

/** Recharts tooltip skinned to the panel surface. */
export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 shadow-2xl">
      {label != null && (
        <p className="mb-1.5 font-mono text-[10px] tracking-wider text-blue-200/60">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((row) => (
          <div key={row.dataKey ?? row.name} className="flex items-center gap-2.5">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: row.color || row.stroke }}
            />
            <span className="text-[11px] text-blue-100/70">{row.name}</span>
            <span className="ml-auto font-mono text-[11.5px] font-semibold text-white">
              {formatter ? formatter(row.value, row.dataKey, row) : row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legend row — always rendered when a chart carries two or more series. */
export function Legend({ items }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{
              background: it.dashed ? "transparent" : it.color,
              border: it.dashed ? `2px dashed ${it.color}` : "none",
            }}
          />
          <span className="text-[11px] font-medium text-blue-100/65">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
