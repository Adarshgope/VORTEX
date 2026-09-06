/**
 * VORTEX API client.
 *
 * Talks to the Flask service (default http://localhost:5000). Every call
 * degrades to a local generator in `fallback.js` if the backend is unreachable,
 * so the UI is never empty during a demo — `useApi` reports which source it got.
 */

import { fallbackFor } from "./fallback";

export const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:5000";

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
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
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
    const data = fallbackFor(key, args ?? body);
    if (!data) throw err;
    return { data, source: "demo" };
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
};
