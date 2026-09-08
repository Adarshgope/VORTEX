/**
 * Offline mirror of the Flask API.
 *
 * Runs only when Flask is unreachable, so a demo never shows an empty screen.
 * Reference data is identical to backend/app/domain.py; the cost stack
 * reproduces steel_engine.py line for line; the forecast reproduces ML/app.py's
 * 14-day curve on top of the same analytic estimator ml_engine.py falls back to
 * when the pickle cannot load. Response shapes match the API field for field.
 *
 * Two things cannot be mirrored and are said so on the badges: the trained
 * model does not run in the browser, and there is no live market feed without
 * Flask, so the mirror scores its own deterministic macro baseline.
 */

/* ---------------------------------------------------------- reference */

export const PORTS = [
  { code: "INDHM", name: "Dhamra Port", short: "Dhamra", state: "Odisha",
    max_draft_m: 18.5, max_dwt: 180000, wait_hours: 12.0, tariff_usd_per_t: 3.40,
    demurrage_day_usd: 25000, queue_delay_days: 0.5,
    note: "Deepest private berth on the coast; shortest queue." },
  { code: "INPRT", name: "Paradip Port", short: "Paradip", state: "Odisha",
    max_draft_m: 17.1, max_dwt: 180000, wait_hours: 18.5, tariff_usd_per_t: 2.80,
    demurrage_day_usd: 25000, queue_delay_days: 1.5,
    note: "Lowest tariff; mechanised coal handling plant." },
  { code: "INVTZ", name: "Visakhapatnam Port", short: "Vizag", state: "Andhra Pradesh",
    max_draft_m: 18.1, max_dwt: 200000, wait_hours: 24.2, tariff_usd_per_t: 3.10,
    demurrage_day_usd: 28000, queue_delay_days: 2.0,
    note: "Only berth on the coast built for 200k DWT; feeds RINL by conveyor." },
  { code: "INHLD", name: "Haldia Dock Complex", short: "Haldia", state: "West Bengal",
    max_draft_m: 11.5, max_dwt: 65000, wait_hours: 38.4, tariff_usd_per_t: 4.20,
    demurrage_day_usd: 20000, queue_delay_days: 3.0,
    note: "Riverine draft limit caps intake at Supramax; longest queue." },
];

export const PLANTS = [
  { id: "rourkela", name: "SAIL Rourkela Steel Plant", short: "Rourkela", state: "Odisha", godown_rate_inr: 48.0 },
  { id: "bokaro", name: "SAIL Bokaro Steel Plant", short: "Bokaro", state: "Jharkhand", godown_rate_inr: 42.0 },
  { id: "vizag", name: "RINL Vizag Steel Plant", short: "RINL Vizag", state: "Andhra Pradesh", godown_rate_inr: 35.0 },
];

const RAIL_LEGS = [
  { port: "INDHM", plant: "rourkela", distance_km: 330, fois_inr_per_t: 630.0 },
  { port: "INPRT", plant: "rourkela", distance_km: 365, fois_inr_per_t: 680.0 },
  { port: "INHLD", plant: "rourkela", distance_km: 420, fois_inr_per_t: 790.0 },
  { port: "INVTZ", plant: "rourkela", distance_km: 680, fois_inr_per_t: 1180.0 },
  { port: "INHLD", plant: "bokaro", distance_km: 370, fois_inr_per_t: 695.0 },
  { port: "INDHM", plant: "bokaro", distance_km: 450, fois_inr_per_t: 820.0 },
  { port: "INPRT", plant: "bokaro", distance_km: 480, fois_inr_per_t: 870.0 },
  { port: "INVTZ", plant: "bokaro", distance_km: 790, fois_inr_per_t: 1340.0 },
  { port: "INVTZ", plant: "vizag", distance_km: 25, fois_inr_per_t: 95.0 },
  { port: "INPRT", plant: "vizag", distance_km: 550, fois_inr_per_t: 980.0 },
  { port: "INDHM", plant: "vizag", distance_km: 610, fois_inr_per_t: 1090.0 },
  { port: "INHLD", plant: "vizag", distance_km: 890, fois_inr_per_t: 1520.0 },
];
const RAIL_FALLBACK = { distance_km: 950.0, fois_inr_per_t: 1800.0 };

export const VESSELS = [
  { id: "capesize", name: "Capesize", dwt: 170000, draft_req_m: 17.5, fuel_full_tpd: 45.0, fuel_slow_tpd: 26.0,
    scale_freight_factor: 1.0, hire_usd_per_day: 25000, note: "Cheapest per tonne, but only Dhamra, Vizag and Paradip can berth her." },
  { id: "panamax", name: "Panamax", dwt: 75000, draft_req_m: 13.0, fuel_full_tpd: 28.0, fuel_slow_tpd: 16.0,
    scale_freight_factor: 1.35, hire_usd_per_day: 17000, note: "The workhorse; clears every east-coast berth except Haldia." },
  { id: "supramax", name: "Supramax", dwt: 58000, draft_req_m: 10.5, fuel_full_tpd: 22.0, fuel_slow_tpd: 13.0,
    scale_freight_factor: 1.6, hire_usd_per_day: 13500, note: "The only class Haldia's river draft accepts." },
];

export const SUPPLIERS = [
  { id: "australia", name: "Australia", grade: "Premium Hard Coking", fob_usd_per_t: 222.0, sailing_days: 14, base_freight_usd_per_t: 16.5, quality_adj_usd_per_t: 0.0 },
  { id: "south_africa", name: "South Africa", grade: "Semi-Soft Coking", fob_usd_per_t: 210.0, sailing_days: 18, base_freight_usd_per_t: 19.0, quality_adj_usd_per_t: 4.5 },
  { id: "indonesia", name: "Indonesia", grade: "Sub-bituminous Thermal", fob_usd_per_t: 196.0, sailing_days: 9, base_freight_usd_per_t: 13.0, quality_adj_usd_per_t: 10.0 },
];

const VLSFO_CRUDE_PARITY = 7.33;
const FREE_LAYTIME_DAYS = 2.0;
const MIN_VOLUME_T = 10000;
const MAX_VOLUME_T = 500000;

const PLANT_BY_ID = Object.fromEntries(PLANTS.map((p) => [p.id, p]));
const VESSEL_BY_ID = Object.fromEntries(VESSELS.map((v) => [v.id, v]));
const RAIL_BY_PAIR = Object.fromEntries(RAIL_LEGS.map((r) => [`${r.port}|${r.plant}`, r]));

/* ------------------------------------------------------------ helpers */

/** Deterministic PRNG seeded from strings, so the mirror is stable across reloads. */
function rng(...parts) {
  let h = 2166136261;
  for (const ch of parts.join("::")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}
const gauss = (r, mu = 0, sigma = 1) => {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const isoDay = (d) => d.toISOString().slice(0, 10);
const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (d) => WEEKDAYS[d.getUTCDay()];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const numOr = (v, d) => {
  if (v === null || v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/* -------------------------------------------------- freight model mirror */

const FEATURES = [
  "BDRY_P_Diff_1", "BDRY_P_Diff_5", "BDRY_P_Diff_14", "BDRY_EMA_7", "BDRY_EMA_21",
  "Crude_P_Diff_7", "Crude_EMA_14", "USDINR_Diff_7", "Rolling_Vol_14",
];
const R2 = 0.706;
const HORIZON = 14;

// ML/app.py's forward-curve coefficients, verbatim (see ml_engine.py).
const CRUDE_SLOPE_PER_PCT = 0.042 / 100;
const PORT_RISK_SLOPE_PER_DAY = 0.024 / 8;
const VESSEL_SPREAD_COEF = 0.018;
const HOLDING_PRESSURE_COEF = 0.012 / 100;
const HOLDING_BASELINE_INR = 35;
const CYCLE_AMPLITUDE = 0.12;
const CYCLE_FREQ = 0.45;
const NEUTRAL_BAND = 1.02;
const BOOK_NOW_DAYS = 3;
const ESCALATION_PCT = 2.0;

/** Same deterministic walk ml_engine uses when no CSV ships with the build. */
function macroSeries(days = 900) {
  const r = rng("macro-fallback");
  const start = addDays(today(), -days);
  const dates = [], bdry = [], crude = [], usdinr = [];
  let b = 12.4, c = 84, f = 88;
  for (let i = 0; i < days; i++) {
    b = Math.max(6, b + gauss(r, 0, 0.22) + 0.02 * (12.4 - b));
    c = Math.max(45, c + gauss(r, 0, 0.7) + 0.02 * (84 - c));
    f += gauss(r, 0.004, 0.05);
    dates.push(isoDay(addDays(start, i)));
    bdry.push(b); crude.push(c); usdinr.push(f);
  }
  return { dates, bdry, crude, usdinr, source: "in-browser macro baseline" };
}
const MACRO = macroSeries();

/** pandas `ewm(span).mean()` with adjust=true, at the last index. */
function ewmLast(values, span) {
  const decay = 1 - 2 / (span + 1);
  let num = 0, den = 0;
  for (const v of values) { num = v + decay * num; den = 1 + decay * den; }
  return num / den;
}
/** Sample std-dev of the last `window` daily changes. */
function trailingVol(values, window) {
  const diffs = [];
  for (let i = values.length - window; i < values.length; i++) diffs.push(values[i] - values[i - 1]);
  const mean = diffs.reduce((a, x) => a + x, 0) / window;
  return Math.sqrt(diffs.reduce((a, x) => a + (x - mean) ** 2, 0) / (window - 1));
}
/** The nine features ML/src/src/train_model.py builds, at the last session. */
function featuresAt(bdry, crude, usdinr) {
  const n = bdry.length - 1;
  return {
    BDRY_P_Diff_1: bdry[n] - bdry[n - 1],
    BDRY_P_Diff_5: bdry[n] - bdry[n - 5],
    BDRY_P_Diff_14: bdry[n] - bdry[n - 14],
    BDRY_EMA_7: ewmLast(bdry, 7) - bdry[n],
    BDRY_EMA_21: ewmLast(bdry, 21) - bdry[n],
    Crude_P_Diff_7: crude[n] - crude[n - 7],
    Crude_EMA_14: ewmLast(crude, 14) - crude[n],
    USDINR_Diff_7: usdinr[n] - usdinr[n - 7],
    Rolling_Vol_14: trailingVol(bdry, 14),
  };
}
/** ml_engine._analytic_delta — the stand-in for the pickle. */
function analyticDelta(f) {
  const momentum = f.BDRY_P_Diff_14 / 14 + f.BDRY_P_Diff_5 / 5;
  const reversion = f.BDRY_EMA_21 * 0.35;
  const fuel = f.Crude_P_Diff_7 * 0.012;
  const fx = f.USDINR_Diff_7 * 0.05;
  return momentum * 2.6 + reversion + fuel + fx;
}

export function modelStatus() {
  const last = MACRO.dates[MACRO.dates.length - 1];
  return {
    status: "fallback",
    active: false,
    detail: "Flask API unreachable — analytic forecast generated in-browser.",
    algorithm: "HistGradientBoostingRegressor (delta target)",
    label: "AI Model: Fallback · analytic forecast",
    horizon_days: HORIZON,
    feature_count: FEATURES.length,
    features: FEATURES,
    r2: R2,
    data_source: MACRO.source,
    data_as_of: last,
    data_rows: MACRO.dates.length,
    data_is_live: false,
    live_feed: { enabled: false, available: false, connected: false,
                 last_error: "backend unreachable — in-browser mirror active" },
  };
}

export function macroBaseline() {
  const i = MACRO.bdry.length - 1;
  return {
    bdry: +MACRO.bdry[i].toFixed(2),
    brent_usd: +MACRO.crude[i].toFixed(2),
    usd_inr: +MACRO.usdinr[i].toFixed(2),
    as_of: MACRO.dates[i],
    source: MACRO.source,
    is_live: false,
  };
}

function signalFor(day, price, spot, bestDay) {
  if (day === bestDay) return ["OPTIMAL", "Optimal buy window — execute fixture"];
  if (price <= spot * NEUTRAL_BAND) return ["NEUTRAL", "Neutral window — hold and monitor"];
  return ["ESCALATION", "Escalation zone — avoid booking"];
}

/** ml_engine.forecast_index, with the analytic estimator in the model's seat. */
export function forecastIndex(body = {}) {
  const crudeShock = clamp(numOr(body.crude_shock_pct, 0), -30, 50);
  const portDelay = clamp(numOr(body.port_delay_days, 0), 0, 8);
  const godown = clamp(numOr(body.godown_rate_inr, HOLDING_BASELINE_INR), 20, 120);
  const vessel = VESSEL_BY_ID[String(body.vessel || "").toLowerCase()] || VESSELS[0];
  const vFactor = vessel.scale_freight_factor;

  const { bdry, crude, usdinr } = MACRO;
  const spot = bdry[bdry.length - 1];
  const delta = analyticDelta(featuresAt(bdry, crude, usdinr));

  const modelSlope = spot ? (delta / spot) / HORIZON : 0;
  const crudeSlope = crudeShock * CRUDE_SLOPE_PER_PCT;
  const portRiskSlope = portDelay * PORT_RISK_SLOPE_PER_DAY;
  const vesselSpread = (vFactor - 1) * VESSEL_SPREAD_COEF;
  const holdingPressure = (godown - HOLDING_BASELINE_INR) * HOLDING_PRESSURE_COEF;
  const drift = modelSlope + crudeSlope + portRiskSlope + vesselSpread + holdingPressure;

  const start = today();
  const prices = [];
  for (let d = 1; d <= HORIZON; d++) {
    prices.push(Math.max(spot * (1 + drift * d + CYCLE_AMPLITUDE * Math.sin(d * CYCLE_FREQ)), spot * 0.4));
  }
  const target = prices[HORIZON - 1];
  const changePct = spot ? ((target - spot) / spot) * 100 : 0;
  let bestIdx = 0, peakIdx = 0;
  prices.forEach((p, i) => { if (p < prices[bestIdx]) bestIdx = i; if (p > prices[peakIdx]) peakIdx = i; });
  const bestDay = bestIdx + 1;
  const bestPrice = prices[bestIdx];
  const peakPrice = prices[peakIdx];
  const windowSaving = peakPrice ? ((peakPrice - bestPrice) / peakPrice) * 100 : 0;

  const points = prices.map((price, i) => {
    const day = i + 1;
    const date = addDays(start, day);
    const [signal, signalLabel] = signalFor(day, price, spot, bestDay);
    return {
      date: isoDay(date), weekday: weekday(date), day,
      forecast: +price.toFixed(2),
      change_pct: spot ? +(((price - spot) / spot) * 100).toFixed(2) : 0,
      signal, signal_label: signalLabel,
    };
  });

  const bestDate = addDays(start, bestDay);
  const bestLabel = `${weekday(bestDate)}, ${bestDate.getUTCDate()} ${bestDate.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
  const timing = bestDay <= BOOK_NOW_DAYS
    ? { level: "critical", action: `BOOK IMMEDIATELY — DAY ${bestDay}`,
        detail: `Forward freight pressure is accelerating. Best booking day is within ${bestDay} day(s) (${bestLabel}). Booking before rate escalation saves up to ${windowSaving.toFixed(2)}% against the 14-day peak.` }
    : { level: "clear", action: `STAGGER & FIX ON DAY ${bestDay}`,
        detail: `Forward indicators show freight reaching a tactical low of ${bestPrice.toFixed(2)} on day ${bestDay} (${bestLabel}). Buffer inventory at plant and fix the charter fixture on day ${bestDay}.` };

  return {
    horizon_days: HORIZON,
    unit: "BDRY pts",
    as_of: MACRO.dates[MACRO.dates.length - 1],
    data_source: MACRO.source,
    data_is_live: false,
    spot_index: +spot.toFixed(2),
    forecast_index: +target.toFixed(2),
    change_pct: +changePct.toFixed(2),
    trend_direction: changePct > ESCALATION_PCT ? "RISING" : changePct < -ESCALATION_PCT ? "FALLING" : "STABLE",
    escalating: changePct > ESCALATION_PCT,
    model_delta: +delta.toFixed(3),
    model_target: +(spot + delta).toFixed(2),
    drift: {
      model: +modelSlope.toFixed(5), crude_shock: +crudeSlope.toFixed(5),
      port_risk: +portRiskSlope.toFixed(5), vessel_spread: +vesselSpread.toFixed(5),
      holding_pressure: +holdingPressure.toFixed(5), total_per_day: +drift.toFixed(5),
    },
    history: MACRO.dates.slice(-90).map((d, i) => ({ date: d, index: +bdry[bdry.length - 90 + i].toFixed(2) })),
    points,
    best_entry: { date: points[bestIdx].date, weekday: points[bestIdx].weekday, day: bestDay,
                  index: +bestPrice.toFixed(2), change_pct: spot ? +(((bestPrice - spot) / spot) * 100).toFixed(2) : 0 },
    peak: { date: points[peakIdx].date, day: peakIdx + 1, index: +peakPrice.toFixed(2) },
    window_saving_pct: +windowSaving.toFixed(2),
    timing,
    scenario: { crude_shock_pct: crudeShock, port_delay_days: portDelay, vessel_factor: vFactor, godown_rate_inr: godown },
    model: { ...modelStatus(), served_by_model: false },
  };
}

/* ------------------------------------------------------- sourcing optimiser */

function railLeg(portCode, plantId) {
  const leg = RAIL_BY_PAIR[`${portCode}|${plantId}`];
  return leg
    ? [leg.fois_inr_per_t, leg.distance_km, true]
    : [RAIL_FALLBACK.fois_inr_per_t, RAIL_FALLBACK.distance_km, false];
}

/** steel_engine._price_route, line for line. */
function priceRoute(supplier, port, vessel, { plantId, usdInr, vlsfo, slowSteaming, portDelayDays, godownInr }) {
  if (vessel.draft_req_m > port.max_draft_m) {
    return { feasible: false, reason: `${vessel.name} needs ${vessel.draft_req_m.toFixed(1)} m draft; ${port.short} allows ${port.max_draft_m.toFixed(1)} m` };
  }
  if (vessel.dwt > port.max_dwt) {
    return { feasible: false, reason: `${vessel.name} is ${vessel.dwt.toLocaleString("en-US")} DWT; ${port.short} tops out at ${port.max_dwt.toLocaleString("en-US")} DWT` };
  }
  const dwt = vessel.dwt;
  const delayDays = port.queue_delay_days + portDelayDays;
  const totalWaitDays = port.wait_hours / 24 + delayDays;
  const chargeableDays = Math.max(0, totalWaitDays - FREE_LAYTIME_DAYS);
  const demurrageFullSpeed = (chargeableDays * port.demurrage_day_usd) / dwt;

  let demurrage, extraCharter, bunkerSaved;
  if (slowSteaming) {
    demurrage = 0;
    extraCharter = (delayDays * vessel.hire_usd_per_day) / dwt;
    bunkerSaved = ((vessel.fuel_full_tpd - vessel.fuel_slow_tpd) * supplier.sailing_days * vlsfo) / dwt;
  } else {
    demurrage = demurrageFullSpeed;
    extraCharter = 0;
    bunkerSaved = 0;
  }
  const freight = supplier.base_freight_usd_per_t * vessel.scale_freight_factor;
  const oceanUsd = supplier.fob_usd_per_t + freight + supplier.quality_adj_usd_per_t + port.tariff_usd_per_t
    + demurrage + extraCharter - bunkerSaved;
  const [railInr, railKm, railPublished] = railLeg(port.code, plantId);
  const landedInr = oceanUsd * usdInr + railInr + godownInr;
  const r2 = (x) => +x.toFixed(2);
  return {
    feasible: true,
    reason: `Clear to berth at ${port.short}`,
    ocean_usd_per_t: r2(oceanUsd),
    landed_inr_per_t: r2(landedInr),
    rail_km: railKm,
    rail_published: railPublished,
    total_wait_days: r2(totalWaitDays),
    queue_delay_days: r2(delayDays),
    demurrage_avoided_usd_per_t: r2(slowSteaming ? demurrageFullSpeed : 0),
    breakdown: {
      fob: r2(supplier.fob_usd_per_t * usdInr), ocean_freight: r2(freight * usdInr),
      grade_adj: r2(supplier.quality_adj_usd_per_t * usdInr), port_handling: r2(port.tariff_usd_per_t * usdInr),
      demurrage: r2(demurrage * usdInr), extra_charter: r2(extraCharter * usdInr),
      bunker_saved: r2(-bunkerSaved * usdInr), rail_fois: r2(railInr), godown: r2(godownInr),
    },
    usd_components: {
      fob: supplier.fob_usd_per_t, freight: r2(freight), grade_adj: supplier.quality_adj_usd_per_t,
      tariff: port.tariff_usd_per_t, demurrage: r2(demurrage), extra_charter: r2(extraCharter), bunker_saved: r2(bunkerSaved),
    },
  };
}

export function steelOptions() {
  const base = macroBaseline();
  const vlsfo = +(base.brent_usd * VLSFO_CRUDE_PARITY).toFixed(2);
  return {
    plants: PLANTS, ports: PORTS, vessels: VESSELS, suppliers: SUPPLIERS,
    macro: { ...base, vlsfo_usd_per_t: vlsfo },
    congestion: {
      source: "reference",
      detail: "Indian Ports Association reference averages. No live berth-queue feed is published for these ports.",
      ports: Object.fromEntries(PORTS.map((p) => [p.code, p.queue_delay_days])),
    },
    defaults: {
      plant: PLANTS[0].id, vessel: VESSELS[0].id, volume_t: 150000, crude_shock_pct: 0,
      port_delay_days: 0, godown_rate_inr: PLANTS[0].godown_rate_inr, slow_steaming: true,
    },
    limits: {
      volume_t: { min: MIN_VOLUME_T, max: MAX_VOLUME_T, step: 10000 },
      crude_shock_pct: { min: -30, max: 50, step: 5 },
      port_delay_days: { min: 0, max: 8, step: 0.5 },
      godown_rate_inr: { min: 20, max: 120, step: 2 },
    },
    model: modelStatus(),
  };
}

function tactical(forecast) {
  const p = forecast.change_pct;
  const sign = p > 0 ? "+" : "";
  if (forecast.escalating) {
    return { level: "critical", action: "ADVANCE SPOT CHARTER BOOKINGS",
      detail: `The 14-day ML engine (R² = ${R2}) projects freight to rise by ${sign}${p.toFixed(2)}%. Lock vessel fixtures immediately to hedge against escalation.` };
  }
  return { level: "clear", action: "STAGGER CHARTER CONTRACTS",
    detail: `14-day freight outlook remains stable/soft (${sign}${p.toFixed(2)}%). Rely on safety buffer stock and negotiate spot charter discounts.` };
}

/** steel_engine.plan — same inputs, same ledger, closed-form allocation. */
export function steelPlan(body = {}) {
  const payload = body && typeof body === "object" ? body : {};
  const plant = PLANT_BY_ID[payload.plant] || PLANTS[0];
  const vessel = VESSEL_BY_ID[payload.vessel] || VESSELS[0];
  const volume = clamp(numOr(payload.volume_t, 150000), MIN_VOLUME_T, MAX_VOLUME_T);
  const slowSteaming = payload.slow_steaming === undefined ? true : Boolean(payload.slow_steaming);
  const crudeShock = clamp(numOr(payload.crude_shock_pct, 0), -30, 50);
  const portDelay = clamp(numOr(payload.port_delay_days, 0), 0, 8);
  const godown = clamp(numOr(payload.godown_rate_inr, plant.godown_rate_inr), 20, 120);

  const base = macroBaseline();
  const brent = base.brent_usd * (1 + crudeShock / 100);
  const vlsfo = brent * VLSFO_CRUDE_PARITY;
  const usdInr = base.usd_inr;

  const forecast = forecastIndex({ crude_shock_pct: crudeShock, port_delay_days: portDelay,
    godown_rate_inr: godown, vessel: vessel.id });

  const macro = {
    bdry: base.bdry, brent_usd: +brent.toFixed(2), vlsfo_usd_per_t: +vlsfo.toFixed(2),
    usd_inr: +usdInr.toFixed(2), crude_shock_pct: crudeShock, as_of: base.as_of,
    source: base.source, is_live: false,
  };
  const inputs = { plant, vessel, volume_t: Math.round(volume), slow_steaming: slowSteaming,
    port_delay_days: portDelay, godown_rate_inr: godown, macro };

  const routes = [], infeasible = [];
  for (const supplier of SUPPLIERS) {
    for (const port of PORTS) {
      const priced = priceRoute(supplier, port, vessel,
        { plantId: plant.id, usdInr, vlsfo, slowSteaming, portDelayDays: portDelay, godownInr: godown });
      const row = {
        id: `${supplier.id}-${port.code}`, supplier: supplier.name, supplier_id: supplier.id,
        grade: supplier.grade, sailing_days: supplier.sailing_days, port: port.name,
        port_short: port.short, port_code: port.code, allocated_t: 0, ...priced,
      };
      (priced.feasible ? routes : infeasible).push(row);
    }
  }
  routes.sort((a, b) => a.landed_inr_per_t - b.landed_inr_per_t);
  routes.forEach((r, i) => {
    r.rank = i + 1;
    r.premium_inr_per_t = +(r.landed_inr_per_t - routes[0].landed_inr_per_t).toFixed(2);
  });

  if (!routes.length) {
    return {
      ...inputs, feasible: false, routes: [], infeasible, allocation: null, ledger: null,
      allocation_split: [], solver: null, advisory: null, forecast,
      tactical: { level: "critical", action: "NO FEASIBLE ROUTING",
        detail: `${vessel.name} cannot berth at any port serving ${plant.short}. Select a smaller vessel class.` },
    };
  }

  const best = routes[0];
  best.allocated_t = Math.round(volume);
  const worst = routes[routes.length - 1];
  const totalInr = best.landed_inr_per_t * volume;
  const baselineInr = worst.landed_inr_per_t * volume;
  const savingsInr = baselineInr - totalInr;
  const bunkerSavedUsd = best.usd_components.bunker_saved * volume;
  const demurragePaidUsd = best.usd_components.demurrage * volume;
  const demurrageAvoidedUsd = best.demurrage_avoided_usd_per_t * volume;
  const solver = "closed form (in-browser mirror)";

  const advisory = portDelay > 2
    ? { title: "Mid-voyage advisory",
        detail: `High port wait (${portDelay.toFixed(1)} days added) detected. ` + (slowSteaming
          ? `Speed parameters were recalculated to absorb the delay, avoiding $${Math.round(demurrageAvoidedUsd).toLocaleString("en-US")} in dead-freight fines.`
          : `Steaming full ahead into this queue incurs $${Math.round(demurragePaidUsd).toLocaleString("en-US")} in demurrage — enable Virtual Arrival to absorb it.`) }
    : null;

  return {
    ...inputs, feasible: true,
    allocation: {
      supplier: best.supplier, grade: best.grade, port: best.port, port_short: best.port_short,
      vessel: vessel.name, volume_t: Math.round(volume), landed_inr_per_t: best.landed_inr_per_t,
      ocean_usd_per_t: best.ocean_usd_per_t, rail_km: best.rail_km, sailing_days: best.sailing_days,
      queue_delay_days: best.queue_delay_days, breakdown: best.breakdown,
    },
    allocation_split: [{ id: best.id, supplier: best.supplier, port_short: best.port_short,
      allocated_t: Math.round(volume), landed_inr_per_t: best.landed_inr_per_t }],
    solver,
    routes, infeasible,
    ledger: {
      total_inr: Math.round(totalInr), total_crore: +(totalInr / 1e7).toFixed(2),
      avg_landed_inr_per_t: +(totalInr / volume).toFixed(2),
      baseline_inr_per_t: worst.landed_inr_per_t, baseline_crore: +(baselineInr / 1e7).toFixed(2),
      savings_inr: Math.round(savingsInr), savings_crore: +(savingsInr / 1e7).toFixed(2),
      savings_pct: baselineInr ? +((savingsInr / baselineInr) * 100).toFixed(2) : 0,
      bunker_saved_usd: Math.round(bunkerSavedUsd), demurrage_paid_usd: Math.round(demurragePaidUsd),
      demurrage_avoided_usd: Math.round(demurrageAvoidedUsd),
      parcels: Math.max(1, Math.ceil(volume / vessel.dwt)), solver,
    },
    advisory,
    forecast,
    tactical: tactical(forecast),
  };
}

/* ---------------------------------------------------------------- lookup */

const GENERATORS = {
  steelOptions: () => steelOptions(),
  steelPlan: (body) => steelPlan(body),
  predictFreight: (body) => forecastIndex(body),
  predictStatus: () => modelStatus(),
  predictMacro: () => ({ ...macroBaseline(), feed: modelStatus().live_feed }),
};

/** Offline answer for `key`, or null when there is no generator for it. */
export function fallbackFor(key, arg) {
  const gen = GENERATORS[key];
  if (!gen) return null;
  try {
    return gen(arg);
  } catch {
    return null;
  }
}
