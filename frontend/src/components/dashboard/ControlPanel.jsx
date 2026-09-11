/**
 * Sourcing controls — the left rail, mirroring ML/app.py's sidebar control for
 * control: destination plant, order volume, the PSU spot/LTC policy split,
 * vessel class, the three stress-test sliders (Brent crude shock, simulated
 * port congestion spike, plant godown rate), the Virtual Arrival toggle and
 * the mid-voyage telemetry controls.
 *
 * Nothing else. The forecast horizon is fixed at 14 days, and BDRY, Brent,
 * VLSFO and USD/INR are live readings shown in the metric tiles, not inputs.
 */

import { RotateCcw } from "lucide-react";
import { Panel, Segmented, Slider, Toggle } from "./ui";
import { mt, num, usd } from "../../lib/format";

const VLSFO_CRUDE_PARITY = 7.33;

/**
 * The 70:30 split, drawn. A number pair in a hint is easy to skim past; the
 * bar makes the policy the operator is actually setting visible at a glance.
 */
function SplitBar({ spotPct }) {
  const ltcPct = 100 - spotPct;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div className="bg-gradient-to-r from-sky-500 to-sky-400" style={{ width: `${ltcPct}%` }} />
        <div className="bg-gradient-to-r from-yellow-300 to-amber-500" style={{ width: `${spotPct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className="inline-flex items-center gap-1.5 text-sky-300/80">
          <span className="h-2 w-2 rounded-[2px] bg-sky-400" />
          LTC baseload {ltcPct}%
        </span>
        <span className="inline-flex items-center gap-1.5 text-amber-300/80">
          <span className="h-2 w-2 rounded-[2px] bg-amber-400" />
          Spot auction {spotPct}%
        </span>
      </div>
    </div>
  );
}

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

  // ML/app.py opens the crude slider on the market's own 14-day 95% VaR, so the
  // hint says both what that figure is and whether the operator is still on it.
  const varPct = options?.macro?.crude_var_14d_pct;
  const onVar = varPct != null && Math.abs(scenario.crude_shock_pct - varPct) < 0.55;

  const volume = Number(scenario.volume_t) || 0;
  const spotPct = Number(scenario.spot_ratio_pct) || 0;
  const spotVolume = (volume * spotPct) / 100;
  const ltcVolume = volume - spotVolume;

  return (
    <Panel
      title="Sourcing Controls"
      subtitle="Order, policy, fleet and stress test"
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
              min={limits?.volume_t?.min ?? 10000}
              max={limits?.volume_t?.max ?? 500000}
              step={limits?.volume_t?.step ?? 10000}
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

        {/* ------------------------------------- procurement policy split */}
        <div className="space-y-3 border-t border-blue-500/10 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300/80">
            Procurement policy split
          </p>

          <Slider
            label="Spot auction allocation"
            unit="%"
            value={spotPct}
            min={limits?.spot_ratio_pct?.min ?? 0}
            max={limits?.spot_ratio_pct?.max ?? 100}
            step={limits?.spot_ratio_pct?.step ?? 5}
            onChange={set("spot_ratio_pct")}
            format={(v) => num(v, 0)}
            hint={`${mt(ltcVolume)} on framework contract · ${mt(spotVolume)} to auction`}
          />
          <SplitBar spotPct={spotPct} />
          <p className="text-[10px] leading-snug text-blue-200/35">
            PSU standard is a 70% baseload long-term contract plus 30% spot bidding.
            Each tranche is priced and routed on its own terms.
          </p>
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
            min={limits?.crude_shock_pct?.min ?? -30}
            max={limits?.crude_shock_pct?.max ?? 50}
            step={limits?.crude_shock_pct?.step ?? 1}
            onChange={set("crude_shock_pct")}
            format={(v) => `${v > 0 ? "+" : ""}${num(v, 0)}`}
            hint={
              brentNow
                ? `Brent ${usd(brentNow, 2)}/bbl · VLSFO ${usd(brentNow * VLSFO_CRUDE_PARITY, 0)}/MT`
                : "Moves bunker cost and the forward freight curve"
            }
          />
          {varPct != null && (
            <p className="-mt-2.5 text-[10px] leading-snug text-blue-200/40">
              <span className="font-semibold text-sky-300/80">
                Empirical 14-day 95% VaR: +{num(varPct, 1)}%
              </span>{" "}
              — 1.645 σ scaled over √14 off live Brent volatility.{" "}
              {onVar ? "The slider opens here." : "Reset returns the slider to it."}
            </p>
          )}

          <Slider
            label="Port congestion spike"
            unit="days"
            value={scenario.port_delay_days}
            min={limits?.port_delay_days?.min ?? 0}
            max={limits?.port_delay_days?.max ?? 8}
            step={limits?.port_delay_days?.step ?? 0.5}
            onChange={set("port_delay_days")}
            format={(v) => num(v, 1)}
            hint="Added on top of every port's reference anchorage queue — breakdowns, weather shut-ins"
          />

          <Slider
            label="Plant godown / stockyard rate"
            unit="₹/MT"
            value={scenario.godown_rate_inr}
            min={limits?.godown_rate_inr?.min ?? 20}
            max={limits?.godown_rate_inr?.max ?? 120}
            step={limits?.godown_rate_inr?.step ?? 2}
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

        {/* --------------------------------------- mid-voyage telemetry */}
        <div className="space-y-3 border-t border-blue-500/10 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300/80">
            Mid-voyage telemetry
          </p>

          <Toggle
            label="Track vessel currently at sea"
            hint="Read the allocated routing as a parcel already underway"
            checked={scenario.track_in_transit}
            onChange={set("track_in_transit")}
          />

          {scenario.track_in_transit && (
            <Slider
              label="Voyage progress"
              unit="days elapsed"
              value={scenario.voyage_day}
              min={limits?.voyage_day?.min ?? 1}
              max={limits?.voyage_day?.max ?? 20}
              step={limits?.voyage_day?.step ?? 1}
              onChange={set("voyage_day")}
              format={(v) => `Day ${num(v, 0)}`}
              hint="The passage still to run is the only budget virtual arrival has to spend"
            />
          )}
        </div>
      </div>
    </Panel>
  );
}
