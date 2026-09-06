/**
 * The post-login application shell.
 *
 * One screen, not a tab stack: controls on the left, the sourcing decision on
 * the right. Everything below the header is driven by a single scenario object
 * posted to `/api/steel/plan`, which carries the optimiser result and the
 * freight-model forecast in one payload.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Container, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import ControlPanel from "../components/dashboard/ControlPanel";
import MetricsBar, { TacticalBanner } from "../components/dashboard/MetricsBar";
import SourcingPlan from "../components/dashboard/SourcingPlan";
import CostBreakdown from "../components/dashboard/CostBreakdown";
import Ledger from "../components/dashboard/Ledger";
import ForecastPanel from "../components/dashboard/ForecastPanel";
import { useAuth } from "../lib/authContext";
import { useApi, useCompute, useHealth } from "../lib/useApi";
import { API_BASE, endpoints } from "../lib/api";

/** Until `/api/steel/options` lands, drive the panel from these. */
const SEED = {
  plant: "rourkela",
  vessel: "capesize",
  volume_t: 150000,
  crude_shock_pct: 0,
  vlsfo_usd_per_t: 654,
  usd_inr: 96.28,
  bdry: 12.19,
  slow_steaming: true,
  horizon: 14,
  vlsfo_touched: false,
};

export default function Dashboard() {
  // `overrides` holds only what the operator has actually touched. The live
  // scenario is SEED <- server defaults <- overrides, derived during render, so
  // the panel adopts real macro levels the moment `/api/steel/options` lands
  // without an effect writing state back into the tree.
  const [overrides, setOverrides] = useState({});
  const [railOpen, setRailOpen] = useState(true);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const health = useHealth();

  const { data: options } = useApi("steelOptions", endpoints.steelOptions());

  const scenario = useMemo(
    () => ({ ...SEED, ...(options?.defaults || {}), ...overrides }),
    [options, overrides]
  );

  // `vlsfo_touched` is panel state, not a model input, so the body is built
  // field by field rather than by stripping keys out of the scenario.
  const body = useMemo(
    () => ({
      plant: scenario.plant,
      vessel: scenario.vessel,
      volume_t: scenario.volume_t === "" ? 10000 : scenario.volume_t,
      crude_shock_pct: scenario.crude_shock_pct,
      vlsfo_usd_per_t: scenario.vlsfo_usd_per_t,
      usd_inr: scenario.usd_inr,
      bdry: scenario.bdry,
      slow_steaming: scenario.slow_steaming,
      horizon: scenario.horizon,
    }),
    [scenario]
  );

  const { data: plan, source } = useCompute("steelPlan", endpoints.steelPlan(), body);

  const logout = () => {
    signOut();
    navigate("/", { replace: true });
  };

  const initials = (user?.name || "Demo Desk")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // Clearing the overrides drops straight back to the server's own baseline.
  const reset = () => setOverrides({});

  return (
    <div className="min-h-screen bg-[#050d19] text-slate-100">
      {/* ---------------------------------------------------------- top bar */}
      <header className="sticky top-0 z-40 border-b border-blue-500/15 bg-[#050d19]/90 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => setRailOpen((v) => !v)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-500/25 text-blue-200/70 transition-colors hover:border-amber-400/50 hover:text-amber-300"
            aria-label={railOpen ? "Hide controls" : "Show controls"}
          >
            {railOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>

          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600">
              <Container size={18} className="text-[#0a192f]" strokeWidth={2.4} />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-display text-base font-extrabold tracking-[0.16em] text-white">
                VORTEX
              </span>
              <span className="mt-0.5 font-mono text-[8px] tracking-[0.2em] text-blue-300/55">
                SIH26006 · BULK CARGO SOURCING
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <span
              title={health.detail || API_BASE}
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider sm:inline-flex ${
                health.online === null
                  ? "bg-slate-500/12 text-slate-300"
                  : health.online
                  ? "bg-emerald-500/12 text-emerald-300"
                  : "bg-amber-500/12 text-amber-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  health.online === null
                    ? "bg-slate-400"
                    : health.online
                    ? "bg-emerald-400"
                    : "bg-amber-400"
                }`}
              />
              {health.online === null ? "CHECKING" : health.online ? "API LIVE" : "DEMO MODE"}
            </span>

            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-[11px] font-bold text-white">
                {initials}
              </span>
              <span className="hidden flex-col leading-tight md:flex">
                <span className="text-[12.5px] font-semibold text-white">
                  {user?.name || "Demo Charterer"}
                </span>
                <span className="text-[10px] text-blue-200/50">
                  {user?.role || "Procurement Desk"}
                </span>
              </span>
            </div>

            <button
              onClick={logout}
              className="grid h-9 w-9 place-items-center rounded-lg border border-blue-500/25 text-blue-200/70 transition-colors hover:border-rose-400/50 hover:text-rose-300"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------- content */}
      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6">
        <div
          className={`grid gap-5 ${railOpen ? "xl:grid-cols-[320px_minmax(0,1fr)]" : "grid-cols-1"}`}
        >
          {railOpen && (
            <aside className="xl:sticky xl:top-[88px] xl:self-start">
              <ControlPanel
                options={options}
                scenario={scenario}
                onChange={setOverrides}
                onReset={reset}
              />
            </aside>
          )}

          <main className="min-w-0 space-y-5">
            <TacticalBanner tactical={plan?.tactical} />
            <MetricsBar plan={plan} />
            <SourcingPlan plan={plan} source={source} />

            <div className="grid gap-5 lg:grid-cols-2">
              <CostBreakdown plan={plan} />
              <Ledger plan={plan} />
            </div>

            <ForecastPanel forecast={plan?.forecast} />
          </main>
        </div>
      </div>

      <footer className="border-t border-blue-500/12 px-6 py-5">
        <p className="text-center text-[11px] text-blue-200/35">
          VORTEX · Intelligent Bulk Cargo Sourcing &amp; Freight Optimizer ·
          Ministry of Steel · Smart India Hackathon 2026
        </p>
      </footer>
    </div>
  );
}
