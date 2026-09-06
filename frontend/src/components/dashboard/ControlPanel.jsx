/**
 * Sourcing controls — the left rail.
 *
 * Everything the optimiser and the freight models take as input lives here, so
 * the right-hand side is purely output. Changing anything re-runs the plan.
 */

import { RotateCcw } from "lucide-react";
import { Panel, Segmented, Slider, Toggle } from "./ui";
import { num, usd } from "../../lib/format";

const HORIZONS = [
  { label: "14-Day", value: 14 },
  { label: "30-Day", value: 30 },
];

export default function ControlPanel({ options, scenario, onChange, onReset }) {
  const plants = options?.plants || [];
  const vessels = options?.vessels || [];
  const limits = options?.limits;

  const set = (key) => (value) => onChange({ ...scenario, [key]: value });

  /**
   * Bunkers price off Brent at a fixed parity, so moving the crude shock drags
   * VLSFO with it — until the operator overrides bunkers directly, after which
   * their number is respected. `vlsfo_touched` is what remembers that.
   */
  const setCrudeShock = (pct) => {
    const next = { ...scenario, crude_shock_pct: pct };
    if (!scenario.vlsfo_touched && options?.macro) {
      next.vlsfo_usd_per_t = Math.round(
        options.macro.brent_usd * (1 + pct / 100) * 7.33);
    }
    onChange(next);
  };

  const setVlsfo = (value) =>
    onChange({ ...scenario, vlsfo_usd_per_t: value, vlsfo_touched: true });

  const brentNow = options?.macro
    ? options.macro.brent_usd * (1 + scenario.crude_shock_pct / 100)
    : null;

  return (
    <Panel
      title="Sourcing Controls"
      subtitle="Order, fleet and macro stress test"
      action={
        <button
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-500/25 px-2 py-1 text-[10.5px] font-semibold text-blue-200/70 transition-colors hover:border-amber-400/50 hover:text-amber-300"
        >
          <RotateCcw size={11} /> Reset
        </button>
      }
    >
      <div className="space-y-5">
        {/* ------------------------------------------------------ the order */}
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-blue-200/55">
              Destination steel plant
            </span>
            <select
              className="field"
              value={scenario.plant}
              onChange={(e) => set("plant")(e.target.value)}
            >
              {plants.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0a192f]">
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-[10.5px] font-semibold uppercase tracking-wider text-blue-200/55">
              Order volume
              <span className="font-mono normal-case tracking-normal text-blue-200/40">
                MT
              </span>
            </span>
            <input
              type="number"
              className="field font-mono"
              value={scenario.volume_t}
              min={limits?.volume_t.min ?? 10000}
              max={limits?.volume_t.max ?? 500000}
              step={limits?.volume_t.step ?? 10000}
              onChange={(e) =>
                set("volume_t")(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-blue-200/55">
              Vessel class
            </span>
            <Segmented
              full
              size="sm"
              options={vessels.map((v) => ({ label: v.name, value: v.id }))}
              value={scenario.vessel}
              onChange={set("vessel")}
            />
          </div>
        </div>

        {/* --------------------------------------------- macro stress test */}
        <div className="space-y-4 border-t border-blue-500/10 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300/80">
            Macro stress test
          </p>

          <Slider
            label="Brent crude shock"
            unit="%"
            value={scenario.crude_shock_pct}
            min={limits?.crude_shock_pct.min ?? -30}
            max={limits?.crude_shock_pct.max ?? 50}
            step={limits?.crude_shock_pct.step ?? 5}
            onChange={setCrudeShock}
            format={(v) => `${v > 0 ? "+" : ""}${v}`}
            hint={brentNow ? `Brent ${usd(brentNow, 2)}/bbl` : undefined}
          />

          <Slider
            label="Bunker fuel · VLSFO"
            unit="$/MT"
            value={scenario.vlsfo_usd_per_t}
            min={limits?.vlsfo_usd_per_t.min ?? 350}
            max={limits?.vlsfo_usd_per_t.max ?? 1150}
            step={limits?.vlsfo_usd_per_t.step ?? 5}
            onChange={setVlsfo}
            format={(v) => num(v, 0)}
            hint={
              scenario.vlsfo_touched
                ? "Manual override — Reset restores Brent parity"
                : "Tracking Brent at 7.33 parity"
            }
          />

          <Slider
            label="Forex · USD/INR"
            unit="₹/$"
            value={scenario.usd_inr}
            min={limits?.usd_inr.min ?? 80}
            max={limits?.usd_inr.max ?? 106}
            step={limits?.usd_inr.step ?? 0.25}
            onChange={set("usd_inr")}
            format={(v) => num(v, 2)}
          />

          <Slider
            label="Baltic dry index · BDRY"
            unit="pts"
            value={scenario.bdry}
            min={limits?.bdry.min ?? 6}
            max={limits?.bdry.max ?? 22}
            step={limits?.bdry.step ?? 0.05}
            onChange={set("bdry")}
            format={(v) => num(v, 2)}
            hint="Scales ocean freight and seeds the forecast"
          />
        </div>

        {/* -------------------------------------------------------- toggles */}
        <div className="space-y-3 border-t border-blue-500/10 pt-4">
          <Toggle
            label="Virtual arrival (slow-steaming)"
            hint="Meet the berth window instead of paying demurrage at anchorage"
            checked={scenario.slow_steaming}
            onChange={set("slow_steaming")}
          />

          <div>
            <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-blue-200/55">
              Forecast horizon
            </span>
            <Segmented
              full
              size="sm"
              options={HORIZONS}
              value={scenario.horizon}
              onChange={set("horizon")}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
