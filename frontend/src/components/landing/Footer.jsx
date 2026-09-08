/** Stage 5 — deep navy footer with the suggestion box. */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Container, Mail, Send } from "lucide-react";

/* Brand marks are inlined — lucide v1 no longer ships third-party logos. */

function InstagramIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  );
}

function XIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const SOCIALS = [
  { name: "Instagram", Icon: InstagramIcon },
  { name: "Facebook", Icon: FacebookIcon },
  { name: "X", Icon: XIcon },
];

const LINKS = [
  {
    heading: "Platform",
    items: [
      { label: "Freight Rate Predictor", to: "/dashboard" },
      { label: "Route Optimization", to: "/dashboard" },
      { label: "Landed Cost Calculator", to: "/dashboard" },
      { label: "Port Constraints", to: "/dashboard" },
    ],
  },
  {
    // The four discharge ports in backend/app/domain.py — Chennai, Ennore,
    // Gangavaram, Krishnapatnam and Kakinada were never modelled and are gone.
    heading: "Ports Covered",
    items: [
      { label: "Paradip · Odisha", to: "/dashboard" },
      { label: "Dhamra · Odisha", to: "/dashboard" },
      { label: "Visakhapatnam · Andhra Pradesh", to: "/dashboard" },
      { label: "Haldia · West Bengal", to: "/dashboard" },
    ],
  },
];

export default function Footer() {
  const [suggestion, setSuggestion] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!suggestion.trim()) return;
    // Prototype: suggestions are acknowledged locally.
    setSent(true);
    setSuggestion("");
    setTimeout(() => setSent(false), 3200);
  };

  return (
    <footer className="relative overflow-hidden border-t border-blue-500/15 bg-[#071528]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-[320px] w-[620px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          {/* brand */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600">
                <Container size={18} className="text-[#0a192f]" strokeWidth={2.4} />
              </span>
              <span className="font-display text-lg font-extrabold tracking-[0.16em] text-white">
                VORTEX
              </span>
            </div>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-blue-200/55">
              Vessel Optimization &amp; Rate Tracking for East-coast eXports/imports.
              Built for Smart India Hackathon 2026 — Problem Statement SIH26006.
            </p>

            <div className="mt-6 flex items-center gap-2.5">
              {SOCIALS.map(({ name, Icon }) => (
                <a
                  key={name}
                  href=""
                  aria-label={name}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-blue-500/25 bg-[#0a192f] text-blue-200/70 transition-all hover:-translate-y-0.5 hover:border-amber-400/60 hover:text-amber-300"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* link columns */}
          {LINKS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300/90">
                {col.heading}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="text-[13px] text-blue-200/60 transition-colors hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* suggestion box */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300/90">
              Suggestion Box
            </h4>
            <p className="mt-3 text-[13px] leading-relaxed text-blue-200/55">
              Tell us what would make chartering decisions easier on your desk.
            </p>

            <form onSubmit={submit} className="mt-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  placeholder="Your suggestion…"
                  aria-label="Suggestion"
                  className="field flex-1"
                />
                <button
                  type="submit"
                  aria-label="Send suggestion"
                  className="grid h-[38px] w-[42px] shrink-0 place-items-center rounded-lg bg-gradient-to-br from-yellow-300 to-amber-500 text-[#0a192f] transition-transform hover:-translate-y-0.5"
                >
                  {sent ? <Check size={16} /> : <Send size={15} />}
                </button>
              </div>
              {sent && (
                <p className="mt-2 text-[11.5px] font-medium text-emerald-300">
                  Thanks — noted for the next release.
                </p>
              )}
            </form>

            <a
              href=""
              className="mt-5 inline-flex items-center gap-2 text-[13px] font-semibold text-amber-300 transition-colors hover:text-amber-200"
            >
              <Mail size={14} /> Contact Us
            </a>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-blue-500/15 pt-6 sm:flex-row">
          <p className="text-[12px] text-blue-200/45">
            © {new Date().getFullYear()} VORTEX · Smart India Hackathon 2026 prototype.
          </p>
          <p className="font-mono text-[11px] tracking-[0.16em] text-blue-300/40">
            EAST COAST · INDIA · SIH26006
          </p>
        </div>
      </div>
    </footer>
  );
}
