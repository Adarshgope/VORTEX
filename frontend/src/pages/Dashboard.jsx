/**
 * The post-login application shell.
 *
 * Controls on the left; the sourcing decision on the right, split across three
 * tabs so only one of the heavy panels is mounted at a time. A single scenario
 * object drives two services:
 *
 *   POST /api/steel/plan      the routing optimiser, ledger and tactical call
 *   POST /api/predict/freight the freight-index model behind the forecast chart
 *
 * Both are derived from the same controls, so the panels stay consistent while
 * each half keeps rendering if the other fails.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Container, LogOut, PanelLeftClose, PanelLeftOpen, RefreshCw, WifiOff,
} from "lucide-react";
import ControlPanel from "../components/dashboard/ControlPanel";
import MetricsBar, { TacticalBanner } from "../components/dashboard/MetricsBar";
import SourcingPlan from "../components/dashboard/SourcingPlan";
import CostBreakdown from "../components/dashboard/CostBreakdown";
import Ledger from "../components/dashboard/Ledger";
import ForecastPanel from "../components/dashboard/ForecastPanel";
import { useAuth } from "../lib/authContext";
import { useApi, useCompute, useHealth } from "../lib/useApi";
import { API_LABEL, endpoints, refreshLiveData } from "../lib/api";

/** Until `/api/steel/options` lands, drive the panel from these. */
const SEED = {
  plant: "rourkela",
  vessel: "capesize",
  volume_t: 150000,
  crude_shock_pct: 0,
  port_delay_days: 0,
  godown_rate_inr: 48,
  slow_steaming: true,
  godown_touched: false,
};

/** The three result views. Order is the order they are read in. */
const TABS = [
  { id: "sourcing", label: "Optimal Sourcing Plan" },
  { id: "cost", label: "Multi-Modal Cost Stack" },
  { id: "forecast", label: "Freight Index Forecast" },
];

export default function Dashboard() {
  // `overrides` holds only what the operator has actually touched. The live
  // scenario is SEED <- server defaults <- overrides, derived during render, so
  // the panel adopts real macro levels the moment `/api/steel/options` lands
  // without an effect writing state back into the tree.
  const [overrides, setOverrides] = useState({});
  const [railOpen, setRailOpen] = useState(true);
  const [tab, setTab] = useState(TABS[0].id);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const health = useHealth();

  const {
    data: options, refresh: refreshOptions,
  } = useApi("steelOptions", endpoints.steelOptions());

  const scenario = useMemo(
    () => ({ ...SEED, ...(options?.defaults || {}), ...overrides }),
    [options, overrides]
  );

  // `godown_touched` is panel state, not a model input, so the body is built
  // field by field rather than by stripping keys out of the scenario.
  const body = useMemo(
    () => ({
      plant: scenario.plant,
      vessel: scenario.vessel,
      volume_t: scenario.volume_t === "" ? 10000 : scenario.volume_t,
      crude_shock_pct: scenario.crude_shock_pct,
      port_delay_days: scenario.port_delay_days,
      godown_rate_inr: scenario.godown_rate_inr,
      slow_steaming: scenario.slow_steaming,
    }),
    [scenario]
  );

  const {
    data: plan, source, error: planError, reason: planReason, refresh: refreshPlan,
  } = useCompute("steelPlan", endpoints.steelPlan(), body);

  /**
   * The freight forecast is fetched from the model service in its own right
   * rather than read off the sourcing plan, so `/api/predict/freight` is the
   * component's actual data source and the chart still renders if the
   * optimiser errors. Its inputs are the ML/app.py curve inputs: crude shock,
   * port congestion spike, godown rate and the vessel class.
   */
  const forecastBody = useMemo(
    () => ({
      crude_shock_pct: scenario.crude_shock_pct,
      port_delay_days: scenario.port_delay_days,
      godown_rate_inr: scenario.godown_rate_inr,
      vessel: scenario.vessel,
    }),
    [scenario.crude_shock_pct, scenario.port_delay_days, scenario.godown_rate_inr, scenario.vessel]
  );

  const {
    data: forecast, source: forecastSource, error: forecastError, refresh: refreshForecast,
  } = useCompute("predictFreight", endpoints.predictFreight(), forecastBody);

  // While the dedicated call is still in flight — or if it failed outright —
  // the plan carries its own copy of the same forecast. Use it so one dead
  // endpoint degrades to the other rather than to an empty panel.
  const liveForecast = forecast || plan?.forecast;

  // Start-up race: /api/steel/options can land on the CSV baseline a few
  // seconds before the backend's live macro pull finishes. When the first plan
  // comes back flagged live and the options block is not, re-pull options so
  // the sliders re-seed to today's market instead of a stale snapshot.
  const planIsLive = plan?.macro?.is_live;
  const optionsIsLive = options?.macro?.is_live;
  useEffect(() => {
    if (planIsLive && options && !optionsIsLive) refreshOptions();
  }, [planIsLive, optionsIsLive, options, refreshOptions]);

  // Any panel on the mirror means the API is not being reached.
  const demo = source === "demo" || forecastSource === "demo";

  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");

  const pullLiveData = useCallback(async () => {
    setRefreshing(true);
    setRefreshNote("");
    try {
      const res = await refreshLiveData();
      setRefreshNote(
        res.refreshed
          ? `Market data updated — BDRY ${res.macro?.bdry} as of ${res.macro?.as_of}`
          : `Already current — BDRY ${res.macro?.bdry} as of ${res.macro?.as_of}`
      );
      // Re-seed the sliders and re-run both services against the new macro.
      refreshOptions();
      refreshPlan();
      refreshForecast();
    } catch (err) {
      setRefreshNote(`Live feed unavailable — ${err.message}`);
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshNote(""), 6000);
    }
  }, [refreshOptions, refreshPlan, refreshForecast]);

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
            {refreshNote && (
              <span className="hidden max-w-[320px] truncate rounded-full bg-blue-500/12 px-2.5 py-1 text-[10px] font-semibold text-blue-200/80 lg:inline-block">
                {refreshNote}
              </span>
            )}

            <button
              onClick={pullLiveData}
              disabled={refreshing}
              title="Re-pull the live market feed (BDRY, Brent, USD/INR)"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-500/25 px-2.5 text-[10.5px] font-semibold text-blue-200/70 transition-colors hover:border-amber-400/50 hover:text-amber-300 disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              <span className="hidden md:inline">
                {refreshing ? "Syncing…" : "Sync market"}
              </span>
            </button>

            <span
              title={health.detail || API_LABEL}
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

      {demo && (
        <div className="border-b border-amber-400/25 bg-amber-400/10 px-4 py-2 sm:px-6">
          <p className="flex items-start gap-2 text-[11.5px] leading-snug text-amber-100/90">
            <WifiOff size={14} className="mt-0.5 shrink-0 text-amber-300" />
            <span>
              <span className="font-bold text-amber-300">Showing the in-browser mirror, not the API.</span>{" "}
              {planReason || health.detail || "Flask is not answering."} Start it with{" "}
              <code className="rounded bg-black/30 px-1 font-mono text-[10.5px]">./start_dev.sh</code>{" "}
              (or <code className="rounded bg-black/30 px-1 font-mono text-[10.5px]">python run.py</code> on
              port 5050) and this strip disappears.
            </span>
          </p>
        </div>
      )}

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
            <TacticalBanner tactical={plan?.tactical} error={planError} onRetry={refreshPlan} />
            <MetricsBar plan={plan} forecast={liveForecast} error={planError} onRetry={refreshPlan} />

            <div
              role="tablist"
              aria-label="Sourcing views"
              className="glass flex gap-1 overflow-x-auto rounded-2xl p-1"
            >
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    id={`tab-${t.id}`}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    aria-controls={`panel-${t.id}`}
                    onClick={() => setTab(t.id)}
                    className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 font-display text-[12.5px] font-bold tracking-wide transition-all ${
                      active
                        ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-[#0a192f] shadow-[0_6px_18px_-8px_rgba(234,179,8,.9)]"
                        : "text-blue-200/60 hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {tab === "sourcing" && (
              <div id="panel-sourcing" role="tabpanel" aria-labelledby="tab-sourcing">
                <SourcingPlan plan={plan} source={source} error={planError} onRetry={refreshPlan} />
              </div>
            )}

            {tab === "cost" && (
              <div
                id="panel-cost"
                role="tabpanel"
                aria-labelledby="tab-cost"
                className="grid gap-5 lg:grid-cols-2"
              >
                <CostBreakdown plan={plan} error={planError} onRetry={refreshPlan} />
                <Ledger plan={plan} error={planError} onRetry={refreshPlan} />
              </div>
            )}

            {tab === "forecast" && (
              <div id="panel-forecast" role="tabpanel" aria-labelledby="tab-forecast">
                <ForecastPanel
                  forecast={liveForecast}
                  source={forecast ? forecastSource : source}
                  error={forecastError}
                  onRetry={refreshForecast}
                />
              </div>
            )}
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
