/**
 * VORTEX API client.
 *
 * In development every request is same-origin: Vite proxies `/api` to Flask
 * (see vite.config.js), so there is no port for the browser to get wrong. A
 * production build uses VITE_API_URL if set, else stays same-origin for a
 * deployment that serves the bundle and the API from one host.
 *
 * Calls degrade to a local generator in `fallback.js` when the backend is
 * unreachable, so the UI is never empty during a demo — `useApi` reports which
 * source it got, and the dashboard says so on screen rather than passing the
 * mirror off as live data.
 */

import { fallbackFor } from "./fallback";

const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";

/** Absolute base for the API, or "" for same-origin. */
export const API_BASE = import.meta.env.DEV ? "" : configured;

/** What to tell a human when the API cannot be reached. */
export const API_LABEL = API_BASE || `${window.location.origin} (proxied to Flask)`;

const TIMEOUT_MS = 8000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(path, { method = "GET", body, token, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort());

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // A proxy error page, AirPlay's empty 403, an HTML 502 — none of these
        // is the API. Report the status rather than a bare SyntaxError.
        throw new ApiError(`Backend returned non-JSON (${res.status}) from ${API_LABEL}`,
                           res.status);
      }
    }
    if (!res.ok) {
      const detail = data.detail ? ` — ${data.detail}` : "";
      throw new ApiError((data.error || `Request failed (${res.status})`) + detail, res.status);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Raw call — throws. Use for actions where failure must surface (auth). */
export const api = {
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
};

/**
 * Resilient call — returns { data, source } where source is "live" | "demo".
 * `key` selects the offline generator; `args` is what that generator needs
 * (the POST body, or the query params a GET encoded into its path).
 */
export async function fetchOrFallback(key, path, { method = "GET", body, args } = {}) {
  try {
    const data = await request(path, { method, body });
    return { data, source: "live" };
  } catch (err) {
    // A 4xx means *this* request was wrong — a bad field, an unknown route.
    // Masking that as demo data is how a real bug stays hidden; surface it.
    // Everything else (backend down, proxy 502, timeout, non-JSON) is exactly
    // what the mirror exists for.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
    const data = fallbackFor(key, args ?? body);
    if (!data) throw err;
    return { data, source: "demo", reason: err.message };
  }
}

export const endpoints = {
  health: () => "/api/health",

  // Sourcing optimiser
  steelOptions: () => "/api/steel/options",
  steelPlan: () => "/api/steel/plan",

  // Freight index models
  predictFreight: () => "/api/predict/freight",
  predictStatus: () => "/api/predict/status",
  predictMacro: () => "/api/predict/macro",
  predictRefresh: () => "/api/predict/refresh",
};

/**
 * Force the backend to re-pull the live market feed (Yahoo Finance BDRY /
 * Brent / USD-INR) and report what it now holds.
 *
 * Throws on failure so the caller can show the button failing rather than
 * silently pretending the data refreshed.
 */
export function refreshLiveData() {
  return api.post(endpoints.predictRefresh(), {});
}
