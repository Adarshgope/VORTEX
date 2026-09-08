/** Shared login / registration screen. */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Container, Loader2, Ship } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";
import PortVisual from "../components/landing/PortVisual";

const ROLES = [
  "Chartering Manager", "Procurement Head", "Supply Chain Analyst",
  "Port Operations", "Trading Desk",
];

export default function AuthPage({ mode }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [form, setForm] = useState({
    name: "", email: "", password: "", company: "", role: ROLES[0],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = isRegister ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegister
        ? form
        : { email: form.email, password: form.password };
      const data = await api.post(path, payload);
      signIn(data.user, data.token);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err.status
          ? err.message
          : "Backend unreachable. Start the Flask API, or continue with the demo account below."
      );
    } finally {
      setBusy(false);
    }
  };

  /** Offline escape hatch so the dashboard is always reachable in a demo. */
  const demo = () => {
    signIn(
      { name: "Demo Charterer", email: "demo@vortex.in", company: "VORTEX Demo", role: "Chartering Manager" },
      "demo-token"
    );
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="grid min-h-screen bg-[#05101f] lg:grid-cols-2">
      {/* ---------------------------------------------------- visual side */}
      <div className="relative hidden overflow-hidden lg:block">
        <PortVisual className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05101f] via-[#05101f]/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <span className="kicker">East Coast Freight OS</span>
          <h2 className="mt-3 max-w-md font-display text-4xl font-extrabold leading-[1.1] text-white">
            Charter with the market, not against it.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-blue-100/65">
            Live freight indices, berth constraint envelopes and 14-day
            rate forecasts across the east coast bulk corridor.
          </p>
          {/* Counts read off backend/app/domain.py: 4 ports, 3 vessel classes,
              3 origins x 4 ports = 12 priced trade lanes. */}
          <div className="mt-8 flex gap-8">
            {[
              ["4", "Ports mapped"],
              ["3", "Vessel classes"],
              ["12", "Trade lanes"],
            ].map(([v, l]) => (
              <div key={l}>
                <p className="font-display text-2xl font-extrabold text-amber-300">{v}</p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-blue-200/50">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- form side */}
      <div className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-30" />
        <div className="pointer-events-none absolute right-0 top-10 h-72 w-72 rounded-full bg-amber-500/10 blur-[110px]" />

        <div className="relative w-full max-w-md">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-2 text-[13px] text-blue-200/60 transition-colors hover:text-amber-300"
          >
            <ArrowLeft size={15} /> Back to site
          </Link>

          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600">
              <Container size={19} className="text-[#0a192f]" strokeWidth={2.4} />
            </span>
            <span className="font-display text-xl font-extrabold tracking-[0.16em] text-white">
              VORTEX
            </span>
          </div>

          <h1 className="mt-7 font-display text-3xl font-extrabold text-white">
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-blue-200/60">
            {isRegister
              ? "Set up a desk profile to start optimising fixtures."
              : "Sign in to the chartering dashboard."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {isRegister && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-blue-200/60">
                    Full name
                  </span>
                  <input className="field" value={form.name} onChange={set("name")}
                         placeholder="Ritu Raj" required />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-blue-200/60">
                    Company
                  </span>
                  <input className="field" value={form.company} onChange={set("company")}
                         placeholder="Steel / Power / Trading" />
                </label>
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-blue-200/60">
                Work email
              </span>
              <input type="email" className="field" value={form.email} onChange={set("email")}
                     placeholder="you@company.in" required />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-blue-200/60">
                Password
              </span>
              <input type="password" className="field" value={form.password} onChange={set("password")}
                     placeholder="At least 6 characters" minLength={6} required />
            </label>

            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-blue-200/60">
                  Desk
                </span>
                <select className="field" value={form.role} onChange={set("role")}>
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="bg-[#0a192f]">{r}</option>
                  ))}
                </select>
              </label>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-300" />
                <p className="text-[12.5px] leading-relaxed text-amber-100">{error}</p>
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-gold w-full justify-center">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Ship size={16} />}
              {isRegister ? "Create account" : "Sign in"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-blue-500/20" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-blue-300/40">or</span>
            <span className="h-px flex-1 bg-blue-500/20" />
          </div>

          <button onClick={demo} className="btn-ghost w-full justify-center">
            Explore with the demo desk
          </button>

          <p className="mt-6 text-center text-[13px] text-blue-200/55">
            {isRegister ? "Already have an account? " : "New to VORTEX? "}
            <Link
              to={isRegister ? "/login" : "/register"}
              className="font-semibold text-amber-300 hover:text-amber-200"
            >
              {isRegister ? "Sign in" : "Create one"}
            </Link>
          </p>

          {!isRegister && (
            <p className="mt-3 text-center font-mono text-[11px] text-blue-300/40">
              demo@vortex.in · vortex2026
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
