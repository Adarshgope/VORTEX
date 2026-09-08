/**
 * Sourcing controls — the left rail, mirroring ML/app.py's sidebar control for
 * control: destination plant, order volume, vessel class, the three stress-test
 * sliders (Brent crude shock, simulated port congestion spike, plant godown
 * rate) and the Virtual Arrival toggle.
 *
 * Nothing else. The forecast horizon is fixed at 14 days, and BDRY, Brent,
 * VLSFO and USD/INR are live readings shown in the metric tiles, not inputs.
 */

import { RotateCcw } from "lucide-react";
import { Panel, Segmented, Slider, Toggle } from "./ui";
import { num, usd } from "../../lib/format";

const VLSFO_CRUDE_PARITY = 7.33;

export default function ControlPanel({ options, scenario, onChange, onReset }) {
  const plants = options?.plants || [];
  const vessels = options?.vessels || [];
  const limits = options?.limits;

  const set = (key) => (value) => onChange({ ...scenario, [key]: value });

  /**
   * ML/app.py seeds its godown slider from plant_godown_rates[selected_plant],
   * so changing the plant moves the rate — until the operator drags it, after
   * which their figure sticks. `godown_touched` is what remembers that.
   */
  const setPlant = (id) => {
    const next = { ...scenario, plant: id };
    const plant = plants.find((p) => p.id === id);
    if (!scenario.godown_touched && plant) next.godown_rate_inr = plant.godown_rate_inr;
    onChange(next);
  };

  const setGodown = (value) =>
    onChange({ ...scenario, godown_rate_inr: value, godown_touched: true });

  const brentNow = options?.macro
    ? options.macro.brent_usd * (1 + scenario.crude_shock_pct / 100)
    : null;

  return (
    <Panel
      title="Sourcing Controls"
      subtitle="Order, fleet and stress test"
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
              onChange={(e) => setPlant(e.target.value)}
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

        {/* ---------------------------------- market, port & stockyard test */}
        <div className="space-y-4 border-t border-blue-500/10 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300/80">
            Market, port &amp; stockyard stress test
          </p>

          <Slider
            label="Brent crude shock"
            unit="%"
            value={scenario.crude_shock_pct}
            min={limits?.crude_shock_pct.min ?? -30}
            max={limits?.crude_shock_pct.max ?? 50}
            step={limits?.crude_shock_pct.step ?? 5}
            onChange={set("crude_shock_pct")}
            format={(v) => `${v > 0 ? "+" : ""}${v}`}
            hint={
              brentNow
                ? `Brent ${usd(brentNow, 2)}/bbl · VLSFO ${usd(brentNow * VLSFO_CRUDE_PARITY, 0)}/MT`
                : "Moves bunker cost and the forward freight curve"
            }
          />

          <Slider
            label="Port congestion spike"
            unit="days"
            value={scenario.port_delay_days}
            min={limits?.port_delay_days.min ?? 0}
            max={limits?.port_delay_days.max ?? 8}
            step={limits?.port_delay_days.step ?? 0.5}
            onChange={set("port_delay_days")}
            format={(v) => num(v, 1)}
            hint="Added on top of every port's reference anchorage queue — breakdowns, weather shut-ins"
          />

          <Slider
            label="Plant godown / stockyard rate"
            unit="₹/MT"
            value={scenario.godown_rate_inr}
            min={limits?.godown_rate_inr.min ?? 20}
            max={limits?.godown_rate_inr.max ?? 120}
            step={limits?.godown_rate_inr.step ?? 2}
            onChange={setGodown}
            format={(v) => num(v, 0)}
            hint={
              scenario.godown_touched
                ? "Manual override — Reset restores the plant's own rate"
                : "Plant default · ground rent, yard handling and holding charge"
            }
          />
        </div>

        {/* -------------------------------------------------------- toggle */}
        <div className="border-t border-blue-500/10 pt-4">
          <Toggle
            label="Virtual arrival (slow-steaming)"
            hint="Meet the berth window instead of paying demurrage at anchorage"
            checked={scenario.slow_steaming}
            onChange={set("slow_steaming")}
          />
        </div>
      </div>
    </Panel>
  );
}
