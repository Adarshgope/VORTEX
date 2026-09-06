/**
 * Offline mirror of the Flask service.
 *
 * If the backend is unreachable, `fetchOrFallback` serves these instead so the
 * dashboard never renders empty. The reference data is identical to
 * `backend/app/domain.py` and the cost stack reproduces
 * `services/steel_engine.py` line for line, so the rupee figures match.
 *
 * The one thing that cannot be mirrored is the trained model: the pickles do not
 * run in the browser, so the forecast uses the same analytic estimator the Python
 * service falls back to when scikit-learn is absent. The model badge says so.
 */

/* ---------------------------------------------------------------- reference */

export const PORTS = [
  { code: "INDHM", name: "Dhamra Port", short: "Dhamra", state: "Odisha",
    max_draft_m: 18.5, max_dwt: 180000, wait_hours: 12.0, tariff_usd_per_t: 3.4,
    demurrage_day_usd: 25000, live_delay_days: 0.5,
    note: "Deepest private berth on the coast; shortest queue." },
  { code: "INPRT", name: "Paradip Port", short: "Paradip", state: "Odisha",
    max_draft_m: 17.1, max_dwt: 180000, wait_hours: 18.5, tariff_usd_per_t: 2.8,
    demurrage_day_usd: 25000, live_delay_days: 1.5,
    note: "Lowest tariff; mechanised coal handling plant." },
  { code: "INVTZ", name: "Visakhapatnam Port", short: "Vizag", state: "Andhra Pradesh",
    max_draft_m: 18.1, max_dwt: 200000, wait_hours: 24.2, tariff_usd_per_t: 3.1,
    demurrage_day_usd: 28000, live_delay_days: 2.0,
    note: "Only berth on the coast built for 200k DWT; feeds RINL by conveyor." },
  { code: "INHLD", name: "Haldia Dock Complex", short: "Haldia", state: "West Bengal",
    max_draft_m: 11.5, max_dwt: 65000, wait_hours: 38.4, tariff_usd_per_t: 4.2,
    demurrage_day_usd: 20000, live_delay_days: 3.0,
    note: "Riverine draft limit caps intake at Supramax; longest queue." },
];

export const PLANTS = [
  { id: "rourkela", name: "SAIL Rourkela Steel Plant", short: "Rourkela",
    state: "Odisha", godown_rate_inr: 48.0 },
  { id: "bokaro", name: "SAIL Bokaro Steel Plant", short: "Bokaro",
    state: "Jharkhand", godown_rate_inr: 42.0 },
  { id: "vizag", name: "RINL Vizag Steel Plant", short: "RINL Vizag",
    state: "Andhra Pradesh", godown_rate_inr: 35.0 },
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
  { id: "capesize", name: "Capesize", dwt: 170000, draft_req_m: 17.5, fuel_full_tpd: 45.0,
    fuel_slow_tpd: 26.0, scale_freight_factor: 1.0, hire_usd_per_day: 25000,
    note: "Cheapest per tonne, but only Dhamra, Vizag and Paradip can berth her." },
  { id: "panamax", name: "Panamax", dwt: 75000, draft_req_m: 13.0, fuel_full_tpd: 28.0,
    fuel_slow_tpd: 16.0, scale_freight_factor: 1.35, hire_usd_per_day: 17000,
    note: "The workhorse; clears every east-coast berth except Haldia." },
  { id: "supramax", name: "Supramax", dwt: 58000, draft_req_m: 10.5, fuel_full_tpd: 22.0,
    fuel_slow_tpd: 13.0, scale_freight_factor: 1.6, hire_usd_per_day: 13500,
    note: "The only class Haldia's river draft accepts." },
];

export const SUPPLIERS = [
  { id: "australia", name: "Australia", grade: "Premium Hard Coking",
    fob_usd_per_t: 222.0, sailing_days: 14, base_freight_usd_per_t: 16.5,
    quality_adj_usd_per_t: 0.0 },
  { id: "south_africa", name: "South Africa", grade: "Semi-Soft Coking",
    fob_usd_per_t: 210.0, sailing_days: 18, base_freight_usd_per_t: 19.0,
    quality_adj_usd_per_t: 4.5 },
  { id: "indonesia", name: "Indonesia", grade: "Sub-bituminous Thermal",
    fob_usd_per_t: 196.0, sailing_days: 9, base_freight_usd_per_t: 13.0,
    quality_adj_usd_per_t: 10.0 },
];

const VLSFO_CRUDE_PARITY = 7.33;
const FREE_LAYTIME_DAYS = 2.0;
const MIN_VOLUME_T = 10000;
const MAX_VOLUME_T = 500000;

const PORT_BY_CODE = Object.fromEntries(PORTS.map((p) => [p.code, p]));
const PLANT_BY_ID = Object.fromEntries(PLANTS.map((p) => [p.id, p]));
const VESSEL_BY_ID = Object.fromEntries(VESSELS.map((v) => [v.id, v]));
const SUPPLIER_BY_ID = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s]));
const RAIL_BY_PAIR = Object.fromEntries(RAIL_LEGS.map((r) => [`${r.port}|${r.plant}`, r]));

/* ------------------------------------------------------------ deterministic */

/** mulberry32 seeded from a string — same key, same series, every reload. */
function rng(...parts) {
  const key = parts.join("::");
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r, mu = 0, sigma = 1) => {
  const u = Math.max(r(), 1e-9);
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

const isoDay = (d) => d.toISOString().slice(0, 10);
const today = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const numOr = (v, d) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : d;
};

/* ------------------------------------------------- freight index + forecast */

const FEATURES = [
  "BDRY_P_Diff_1", "BDRY_P_Diff_5", "BDRY_P_Diff_14",
  "BDRY_EMA_7", "BDRY_EMA_21",
  "Crude_P_Diff_7", "Crude_EMA_14",
  "USDINR_Diff_7", "Rolling_Vol_14",
];

const FEATURE_LABELS = {
  BDRY_P_Diff_1: "Freight momentum · 1 day",
  BDRY_P_Diff_5: "Freight momentum · 5 day",
  BDRY_P_Diff_14: "Freight momentum · 14 day",
  BDRY_EMA_7: "Short trend gap · 7d EMA",
  BDRY_EMA_21: "Medium trend gap · 21d EMA",
  Crude_P_Diff_7: "Brent crude · 7 day move",
  Crude_EMA_14: "Bunker fuel trend · 14d EMA",
  USDINR_Diff_7: "USD/INR · 7 day move",
  Rolling_Vol_14: "Freight volatility · 14 day",
};

const R2 = { 14: 0.706, 30: 0.612 };
const HORIZONS = [14, 30];
const RAMP_DAYS = 21;

/** Deterministic macro history — BDRY index, Brent crude, USD/INR. */
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

/** pandas `ewm(span).mean()` with adjust=true. */
function ewmMean(values, span) {
  const decay = 1 - 2 / (span + 1);
  let num = 0, den = 0;
  return values.map((v) => {
    num = v + decay * num;
    den = 1 + decay * den;
    return num / den;
  });
}

/** Trailing sample std-dev of the last `window` daily changes. */
function trailingVol(values, window) {
  const tail = values.slice(-window - 1);
  const d = tail.slice(1).map((v, i) => v - tail[i]);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (d.length - 1));
}

/** The nine training features, evaluated at the end of the series. */
function featuresAt(bdry, crude, usdinr) {
  const i = bdry.length - 1;
  return {
    BDRY_P_Diff_1: bdry[i] - bdry[i - 1],
    BDRY_P_Diff_5: bdry[i] - bdry[i - 5],
    BDRY_P_Diff_14: bdry[i] - bdry[i - 14],
    BDRY_EMA_7: ewmMean(bdry, 7)[i] - bdry[i],
    BDRY_EMA_21: ewmMean(bdry, 21)[i] - bdry[i],
    Crude_P_Diff_7: crude[i] - crude[i - 7],
    Crude_EMA_14: ewmMean(crude, 14)[i] - crude[i],
    USDINR_Diff_7: usdinr[i] - usdinr[i - 7],
    Rolling_Vol_14: trailingVol(bdry, 14),
  };
}

/** Same momentum + mean-reversion form as `ml_engine._analytic_delta`. */
function analyticDelta(f, horizon) {
  const momentum = f.BDRY_P_Diff_14 / 14 + f.BDRY_P_Diff_5 / 5;
  const reversion = f.BDRY_EMA_21 * 0.35;
  const fuel = f.Crude_P_Diff_7 * 0.012;
  const fx = f.USDINR_Diff_7 * 0.05;
  return (momentum * 2.6 + reversion + fuel + fx) * Math.sqrt(horizon / 14);
}

/**
 * A shock (crude, FX) is a move, so it is ramped into the tail; the BDRY control
 * is a level, so the whole series is rescaled. Mirrors `_apply_scenario`.
 */
function applyScenario(crudeShock, fxShock, bdryLevel) {
  let bdry = MACRO.bdry;
  const crude = MACRO.crude.slice();
  const usdinr = MACRO.usdinr.slice();

  if (bdryLevel != null && bdry[bdry.length - 1] > 0) {
    const ratio = bdryLevel / bdry[bdry.length - 1];
    if (Math.abs(ratio - 1) > 1e-9) bdry = bdry.map((v) => v * ratio);
  }
  if (crudeShock || fxShock) {
    const span = RAMP_DAYS;
    for (let step = 0; step <= span; step++) {
      const i = crude.length - 1 - step;
      const w = (span - step) / span;
      crude[i] *= 1 + (crudeShock / 100) * w;
      usdinr[i] *= 1 + (fxShock / 100) * w;
    }
  }
  return { bdry, crude, usdinr };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Historical medians, the neutral value used in driver ablation. */
const MEDIANS = (() => {
  const rows = [];
  for (let i = MACRO.bdry.length - 240; i < MACRO.bdry.length; i++) {
    rows.push(featuresAt(MACRO.bdry.slice(0, i + 1), MACRO.crude.slice(0, i + 1),
                         MACRO.usdinr.slice(0, i + 1)));
  }
  return Object.fromEntries(FEATURES.map((k) => [k, median(rows.map((r) => r[k]))]));
})();

export function modelStatus() {
  return {
    status: "fallback",
    active: false,
    detail: "Flask API unreachable — analytic forecast generated in-browser.",
    algorithm: "HistGradientBoostingRegressor (delta target)",
    label: "AI Model: Fallback · analytic forecast",
    horizons: HORIZONS,
    feature_count: FEATURES.length,
    features: FEATURES,
    r2: { 14: R2[14], 30: R2[30] },
    training_rows: MACRO.dates.length,
    training_source: MACRO.source,
    trained_through: MACRO.dates[MACRO.dates.length - 1],
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
  };
}

export function forecastIndex(body = {}) {
  const horizon = HORIZONS.reduce(
    (best, h) => (Math.abs(h - numOr(body.horizon, 14)) < Math.abs(best - numOr(body.horizon, 14)) ? h : best),
    HORIZONS[0]);
  const crudeShock = clamp(numOr(body.crude_shock_pct, 0), -30, 50);
  const fxShock = clamp(numOr(body.fx_shock_pct, 0), -15, 15);
  const bdryLevel = body.bdry_level == null ? null : clamp(numOr(body.bdry_level, null), 4, 60);

  const { bdry, crude, usdinr } = applyScenario(crudeShock, fxShock, bdryLevel);
  const features = featuresAt(bdry, crude, usdinr);
  const spot = bdry[bdry.length - 1];

  const delta = analyticDelta(features, horizon);
  const target = Math.max(spot + delta, spot * 0.4);

  const residual = Math.sqrt(Math.max(1 - R2[horizon], 0.05));
  const relSigma = clamp(
    (features.Rolling_Vol_14 * Math.sqrt(horizon) * residual) / spot, 0.015, 0.3);
  const band = 1.96 * target * relSigma;
  const confidence = +clamp(1 - relSigma * 2.6 - 0.04, 0.42, 0.95).toFixed(2);
  const changePct = ((target - spot) / spot) * 100;

  let mid = null;
  if (horizon > 14) mid = spot + analyticDelta(features, 14);

  const r = rng("bdry-curve", horizon, target.toFixed(3), spot.toFixed(3));
  const start = today();
  const points = [];
  for (let day = 1; day <= horizon; day++) {
    let level;
    if (horizon > 14 && mid != null) {
      level = day <= 14
        ? spot + (mid - spot) * (day / 14) ** 0.85
        : mid + (target - mid) * ((day - 14) / (horizon - 14)) ** 0.9;
    } else {
      level = spot + (target - spot) * (day / horizon) ** 0.85;
    }
    level = Math.max(level * (1 + gauss(r, 0, relSigma * 0.1)), spot * 0.45);
    const sigma = spot * relSigma * Math.sqrt(day / horizon);
    points.push({
      date: isoDay(addDays(start, day)),
      day,
      forecast: +level.toFixed(2),
      lower: +Math.max(level - 1.96 * sigma, spot * 0.35).toFixed(2),
      upper: +(level + 1.96 * sigma).toFixed(2),
    });
  }
  points[points.length - 1].forecast = +target.toFixed(2);

  const best = points.reduce((a, b) => (b.forecast < a.forecast ? b : a));
  const peak = points.reduce((a, b) => (b.forecast > a.forecast ? b : a));

  const drivers = FEATURES.map((key) => {
    const probe = { ...features, [key]: MEDIANS[key] };
    const contribution = delta - analyticDelta(probe, horizon);
    return {
      key,
      label: FEATURE_LABELS[key],
      value: +features[key].toFixed(4),
      impact_pts: +contribution.toFixed(4),
      impact_pct: +((contribution / spot) * 100).toFixed(2),
      direction: contribution > 0 ? "up" : contribution < 0 ? "down" : "flat",
    };
  }).sort((a, b) => Math.abs(b.impact_pct) - Math.abs(a.impact_pct)).slice(0, 5);
  const peakImpact = Math.max(...drivers.map((d) => Math.abs(d.impact_pct)), 1e-6);
  drivers.forEach((d) => { d.weight = +(Math.abs(d.impact_pct) / peakImpact).toFixed(3); });

  return {
    horizon_days: horizon,
    unit: "BDRY pts",
    as_of: MACRO.dates[MACRO.dates.length - 1],
    spot_index: +spot.toFixed(2),
    forecast_index: +target.toFixed(2),
    delta: +delta.toFixed(3),
    change_pct: +changePct.toFixed(2),
    confidence_lower: +Math.max(target - band, spot * 0.35).toFixed(2),
    confidence_upper: +(target + band).toFixed(2),
    confidence,
    trend_direction: changePct > 2 ? "RISING" : changePct < -2 ? "FALLING" : "STABLE",
    history: MACRO.dates.slice(-90).map((d, i) => ({
      date: d, index: +bdry[bdry.length - 90 + i].toFixed(2),
    })),
    points,
    best_entry: { date: best.date, day: best.day, index: best.forecast },
    peak: { date: peak.date, day: peak.day, index: peak.forecast },
    window_saving_pct: +(((peak.forecast - best.forecast) / peak.forecast) * 100).toFixed(2),
    key_drivers: drivers,
    scenario: {
      horizon, crude_shock_pct: crudeShock, fx_shock_pct: fxShock,
      bdry_level: +spot.toFixed(2),
    },
    model: { ...modelStatus(), served_by_model: false, horizon_r2: R2[horizon] },
  };
}

/* ------------------------------------------------------- sourcing optimiser */

function railLeg(portCode, plantId) {
  const leg = RAIL_BY_PAIR[`${portCode}|${plantId}`];
  return leg
    ? [leg.fois_inr_per_t, leg.distance_km, true]
    : [RAIL_FALLBACK.fois_inr_per_t, RAIL_FALLBACK.distance_km, false];
}

/** Full landed cost for one origin/port pair. Mirrors `_price_route`. */
function priceRoute(supplier, port, vessel, plant, { usdInr, vlsfo, freightFactor, slowSteaming }) {
  if (vessel.draft_req_m > port.max_draft_m) {
    return { feasible: false,
      reason: `${vessel.name} needs ${vessel.draft_req_m.toFixed(1)} m draft; ${port.short} allows ${port.max_draft_m.toFixed(1)} m` };
  }
  if (vessel.dwt > port.max_dwt) {
    return { feasible: false,
      reason: `${vessel.name} is ${vessel.dwt.toLocaleString("en-IN")} DWT; ${port.short} tops out at ${port.max_dwt.toLocaleString("en-IN")} DWT` };
  }

  const dwt = vessel.dwt;
  const delayDays = port.live_delay_days;
  const totalWaitDays = port.wait_hours / 24 + delayDays;

  let demurrage = 0, extraCharter = 0, bunkerSaved = 0;
  if (slowSteaming) {
    extraCharter = (delayDays * vessel.hire_usd_per_day) / dwt;
    bunkerSaved = ((vessel.fuel_full_tpd - vessel.fuel_slow_tpd) * supplier.sailing_days * vlsfo) / dwt;
  } else {
    demurrage = (Math.max(0, totalWaitDays - FREE_LAYTIME_DAYS) * port.demurrage_day_usd) / dwt;
  }

  const freight = supplier.base_freight_usd_per_t * vessel.scale_freight_factor * freightFactor;
  const oceanUsd = supplier.fob_usd_per_t + freight + supplier.quality_adj_usd_per_t
    + port.tariff_usd_per_t + demurrage + extraCharter - bunkerSaved;

  const [railInr, railKm, railPublished] = railLeg(port.code, plant.id);
  const godownInr = plant.godown_rate_inr;
  const landedInr = oceanUsd * usdInr + railInr + godownInr;

  return {
    feasible: true,
    reason: `Clear to berth at ${port.short}`,
    ocean_usd_per_t: +oceanUsd.toFixed(2),
    landed_inr_per_t: +landedInr.toFixed(2),
    rail_km: railKm,
    rail_published: railPublished,
    total_wait_days: +totalWaitDays.toFixed(2),
    breakdown: {
      fob: +(supplier.fob_usd_per_t * usdInr).toFixed(2),
      ocean_freight: +(freight * usdInr).toFixed(2),
      grade_adj: +(supplier.quality_adj_usd_per_t * usdInr).toFixed(2),
      port_handling: +(port.tariff_usd_per_t * usdInr).toFixed(2),
      demurrage: +(demurrage * usdInr).toFixed(2),
      extra_charter: +(extraCharter * usdInr).toFixed(2),
      bunker_saved: +(-bunkerSaved * usdInr).toFixed(2),
      rail_fois: +railInr.toFixed(2),
      godown: +godownInr.toFixed(2),
    },
    usd_components: {
      fob: supplier.fob_usd_per_t,
      freight: +freight.toFixed(2),
      grade_adj: supplier.quality_adj_usd_per_t,
      tariff: port.tariff_usd_per_t,
      demurrage: +demurrage.toFixed(2),
      extra_charter: +extraCharter.toFixed(2),
      bunker_saved: +bunkerSaved.toFixed(2),
    },
  };
}

export function steelOptions() {
  const base = macroBaseline();
  const vlsfo = +(base.brent_usd * VLSFO_CRUDE_PARITY).toFixed(2);
  return {
    plants: PLANTS,
    ports: PORTS,
    vessels: VESSELS,
    suppliers: SUPPLIERS,
    macro: { ...base, vlsfo_usd_per_t: vlsfo },
    defaults: {
      plant: PLANTS[0].id, vessel: VESSELS[0].id, volume_t: 150000,
      crude_shock_pct: 0, vlsfo_usd_per_t: vlsfo, usd_inr: base.usd_inr,
      bdry: base.bdry, slow_steaming: true, horizon: 14,
    },
    limits: {
      volume_t: { min: MIN_VOLUME_T, max: MAX_VOLUME_T, step: 10000 },
      crude_shock_pct: { min: -30, max: 50, step: 5 },
      vlsfo_usd_per_t: { min: Math.round(vlsfo * 0.55), max: Math.round(vlsfo * 1.75), step: 5 },
      usd_inr: { min: +(base.usd_inr * 0.9).toFixed(1), max: +(base.usd_inr * 1.1).toFixed(1), step: 0.25 },
      bdry: { min: +(base.bdry * 0.5).toFixed(1), max: +(base.bdry * 1.8).toFixed(1), step: 0.05 },
    },
    model: modelStatus(),
  };
}

function tactical(changePct, bestEntry, horizon) {
  if (changePct > 2) {
    return { level: "critical", action: "ADVANCE SPOT CHARTER BOOKINGS",
      detail: `The ${horizon}-day model projects freight up +${changePct.toFixed(2)}%. Lock vessel fixtures now to hedge the escalation.` };
  }
  if (changePct < -2) {
    return { level: "clear", action: "DEFER FIXTURES — BUY SPOT",
      detail: `Freight is projected ${changePct.toFixed(2)}% over ${horizon} days, with the low on day ${bestEntry.day}. Run down buffer stock and fix against the dip.` };
  }
  return { level: "warning", action: "STAGGER CHARTER CONTRACTS",
    detail: `Outlook is range-bound at ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}% over ${horizon} days. Split the requirement and negotiate spot discounts.` };
}

export function steelPlan(body = {}) {
  const payload = body && typeof body === "object" ? body : {};

  const plant = PLANT_BY_ID[payload.plant] || PLANTS[0];
  const vessel = VESSEL_BY_ID[payload.vessel] || VESSELS[0];
  const volume = clamp(numOr(payload.volume_t, 150000), MIN_VOLUME_T, MAX_VOLUME_T);
  const slowSteaming = payload.slow_steaming !== false;

  const base = macroBaseline();
  const crudeShock = clamp(numOr(payload.crude_shock_pct, 0), -30, 50);
  const brent = base.brent_usd * (1 + crudeShock / 100);
  const vlsfo = clamp(numOr(payload.vlsfo_usd_per_t, brent * VLSFO_CRUDE_PARITY), 50, 3000);
  const usdInr = clamp(numOr(payload.usd_inr, base.usd_inr), 40, 200);
  const bdry = clamp(numOr(payload.bdry, base.bdry), 4, 60);
  const freightFactor = base.bdry ? bdry / base.bdry : 1;

  const horizon = numOr(payload.horizon, 14) >= 22 ? 30 : 14;
  const forecast = forecastIndex({ horizon, crude_shock_pct: crudeShock, bdry_level: bdry });

  const routes = [], infeasible = [];
  for (const supplier of SUPPLIERS) {
    for (const port of PORTS) {
      const priced = priceRoute(supplier, port, vessel, plant,
        { usdInr, vlsfo, freightFactor, slowSteaming });
      const row = {
        id: `${supplier.id}-${port.code}`,
        supplier: supplier.name, supplier_id: supplier.id, grade: supplier.grade,
        sailing_days: supplier.sailing_days,
        port: port.name, port_short: port.short, port_code: port.code,
        allocated_t: 0, ...priced,
      };
      (priced.feasible ? routes : infeasible).push(row);
    }
  }

  routes.sort((a, b) => a.landed_inr_per_t - b.landed_inr_per_t);
  routes.forEach((r, i) => {
    r.rank = i + 1;
    r.premium_inr_per_t = +(r.landed_inr_per_t - routes[0].landed_inr_per_t).toFixed(2);
  });

  const macro = {
    bdry: +bdry.toFixed(2), brent_usd: +brent.toFixed(2),
    vlsfo_usd_per_t: +vlsfo.toFixed(2), usd_inr: +usdInr.toFixed(2),
    crude_shock_pct: crudeShock, freight_factor: +freightFactor.toFixed(4),
    as_of: base.as_of,
  };

  if (!routes.length) {
    return {
      feasible: false, plant, vessel, volume_t: volume, macro,
      routes: [], infeasible, allocation: null, ledger: null, forecast,
      slow_steaming: slowSteaming,
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

  const counterfactual = priceRoute(
    SUPPLIER_BY_ID[best.supplier_id], PORT_BY_CODE[best.port_code], vessel, plant,
    { usdInr, vlsfo, freightFactor, slowSteaming: !slowSteaming });
  const virtualArrivalInr = counterfactual.feasible
    ? (counterfactual.landed_inr_per_t - best.landed_inr_per_t) * volume : 0;

  const bunkerSavedUsd = slowSteaming
    ? ((vessel.fuel_full_tpd - vessel.fuel_slow_tpd)
       * SUPPLIER_BY_ID[best.supplier_id].sailing_days * vlsfo / vessel.dwt) * volume
    : 0;

  return {
    feasible: true,
    plant, vessel, volume_t: Math.round(volume), slow_steaming: slowSteaming, macro,
    allocation: {
      supplier: best.supplier, grade: best.grade, port: best.port,
      port_short: best.port_short, vessel: vessel.name, volume_t: Math.round(volume),
      landed_inr_per_t: best.landed_inr_per_t, ocean_usd_per_t: best.ocean_usd_per_t,
      rail_km: best.rail_km, sailing_days: best.sailing_days, breakdown: best.breakdown,
    },
    routes,
    infeasible,
    ledger: {
      total_inr: Math.round(totalInr),
      total_crore: +(totalInr / 1e7).toFixed(2),
      avg_landed_inr_per_t: best.landed_inr_per_t,
      baseline_inr_per_t: worst.landed_inr_per_t,
      baseline_crore: +(baselineInr / 1e7).toFixed(2),
      savings_inr: Math.round(savingsInr),
      savings_crore: +(savingsInr / 1e7).toFixed(2),
      savings_pct: baselineInr ? +((savingsInr / baselineInr) * 100).toFixed(2) : 0,
      virtual_arrival_inr: Math.round(virtualArrivalInr),
      virtual_arrival_crore: +(virtualArrivalInr / 1e7).toFixed(2),
      bunker_saved_usd: Math.round(bunkerSavedUsd),
      parcels: Math.max(1, Math.ceil(volume / vessel.dwt)),
    },
    forecast,
    tactical: tactical(forecast.change_pct, forecast.best_entry, horizon),
  };
}

/* ------------------------------------------------------------------ dispatch */

const GENERATORS = {
  steelOptions: () => steelOptions(),
  steelPlan: (body) => steelPlan(body),
  predictFreight: (body) => forecastIndex(body),
  predictStatus: () => modelStatus(),
};

/** Look up an offline generator by key. Returns null when there is no mirror. */
export function fallbackFor(key, arg) {
  const gen = GENERATORS[key];
  if (!gen) return null;
  try {
    return gen(arg);
  } catch {
    return null;
  }
}
