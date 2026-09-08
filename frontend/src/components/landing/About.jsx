/** Stage 4 — the two-column About block, revealed on scroll. */

import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  AlarmClock, ArrowRight, Clock4, Gauge, Ruler, Ship, TrendingUp,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PortVisual from "./PortVisual";

gsap.registerPlugin(ScrollTrigger);

// Every claim here maps to something the platform actually computes. Vessel
// classes come from domain.VESSELS, horizons from ml_engine.HORIZONS, berth
// limits from steel_engine._price_route. Nothing aspirational.
const FEATURES = [
  { icon: Clock4, title: "Optimal Market Entry Timing", note: "Best fixture day on the forward curve" },
  { icon: Ship, title: "Vessel Class Optimization", note: "Supramax · Panamax · Capesize" },
  { icon: Ruler, title: "East Coast Port Constraint Mapping", note: "Draft and DWT berth limits" },
  { icon: TrendingUp, title: "Predictive Freight Rate Forecasting", note: "14-day gradient-boosted model" },
  { icon: Gauge, title: "Virtual Arrival & Bunker Savings", note: "Slow-steaming vs. demurrage trade-off" },
  { icon: AlarmClock, title: "Port Congestion Cost Exposure", note: "Anchorage queue priced per tonne" },
];

// Replaced the placeholder testimonial card: the review count and star rating
// were invented. These four numbers are read straight off the running system.
const PROOF = [
  { value: "12", label: "Priced routings" },      // 3 origins x 4 discharge ports
  { value: "0.71", label: "14-day model R²" },    // ml_engine.MODEL_R2[14]
  { value: "9", label: "Model features" },        // ml_engine.FEATURE_ORDER
  { value: "3", label: "Steel plants served" },   // domain.PLANTS
];

export default function About() {
  const root = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const reveal = (target, vars = {}) =>
        gsap.from(target, {
          scrollTrigger: { trigger: target, start: "top 85%", once: true },
          y: 42, autoAlpha: 0, duration: 0.9, ease: "power3.out", ...vars,
        });

      reveal("[data-reveal='visual']", { x: -36, y: 0 });
      reveal("[data-reveal='badge']", { y: 26, delay: 0.25, duration: 0.7 });
      reveal("[data-reveal='copy'] > *", { stagger: 0.09 });
      reveal("[data-reveal='feature']", { stagger: 0.07, y: 26, duration: 0.7 });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="about"
      ref={root}
      className="relative overflow-hidden bg-[#05101f] py-24 sm:py-32"
    >
      {/* ambient field */}
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-blue-600/12 blur-[130px]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[380px] w-[380px] rounded-full bg-amber-500/12 blur-[130px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        {/* ------------------------------- left: visual -------------------- */}
        <div data-reveal="visual" className="relative">
          <div className="relative overflow-hidden rounded-3xl border border-blue-500/20 shadow-[0_40px_90px_-30px_rgba(0,0,0,.9)]">
            <PortVisual className="h-[380px] w-full sm:h-[520px]" />

            {/* glass tag, top-left */}
            <div className="glass absolute left-5 top-5 rounded-xl px-3.5 py-2">
              {/* Figures from domain.PORTS — no berth telemetry exists to be "live". */}
              <p className="font-mono text-[9px] tracking-[0.2em] text-amber-300">DISCHARGE PORT</p>
              <p className="mt-0.5 text-xs font-semibold text-white">Visakhapatnam · 18.1 m draft</p>
            </div>

            <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10" />
          </div>

          {/* floating trust card, bottom corner */}
          <div
            data-reveal="badge"
            className="glass-gold absolute -bottom-8 left-4 right-4 rounded-2xl p-4 shadow-[0_30px_60px_-25px_rgba(0,0,0,.95)] sm:-bottom-10 sm:left-8 sm:right-auto sm:w-[356px] sm:p-5"
          >
            <div className="grid grid-cols-4 gap-2">
              {PROOF.map((s) => (
                <div key={s.label} className="flex flex-col items-center text-center">
                  <span className="font-display text-lg font-extrabold leading-none text-amber-300">
                    {s.value}
                  </span>
                  <span className="mt-1 text-[9px] leading-tight text-blue-200/60">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-3 border-t border-amber-400/20 pt-3 text-[12.5px] font-semibold leading-snug text-blue-50">
              Every routing priced end to end — FOB, ocean freight, demurrage,
              FOIS rail and stockyard holding.
            </p>
          </div>
        </div>

        {/* ------------------------------- right: content ------------------ */}
        <div data-reveal="copy" className="mt-14 lg:mt-0">
          <span className="kicker">About the Platform</span>

          <h2 className="mt-3.5 text-balance font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-[42px]">
            Predictive Freight Analytics for{" "}
            <span className="gradient-text">Optimized Chartering</span>
          </h2>

          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-blue-100/70">
            We transform bulk cargo procurement from a reactive daily market approach
            into a proactive, data-driven strategy. By forecasting freight rate
            volatility, modeling global trade lane dynamics, and calculating
            port-specific constraints, the platform enables optimal timing and vessel
            selection for East Coast Indian ports.
          </p>

          <div className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, note }) => (
              <div key={title} data-reveal="feature" className="group flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-amber-400/25 bg-amber-400/10 text-amber-300 transition-colors group-hover:border-amber-400/60 group-hover:bg-amber-400/20">
                  <Icon size={15} strokeWidth={2.2} />
                </span>
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-semibold leading-snug text-blue-50">
                    {title}
                  </span>
                  <span className="text-[11.5px] text-blue-200/50">{note}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link to="/register" className="btn-gold">
              Get Started <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="btn-ghost">
              View the live dashboard
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
