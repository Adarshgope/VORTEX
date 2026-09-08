import Navbar from "../components/landing/Navbar";
import ScrollStage from "../components/landing/ScrollStage";
import About from "../components/landing/About";
import Footer from "../components/landing/Footer";

// The network the optimiser actually prices: four discharge ports, three
// destination plants and three seaborne origins. Anything not in
// backend/app/domain.py does not belong on this strip.
const NETWORK_TICKER = [
  "PARADIP", "DHAMRA", "VISAKHAPATNAM", "HALDIA",
  "SAIL ROURKELA", "SAIL BOKARO", "RINL VIZAG",
  "AUSTRALIA", "SOUTH AFRICA", "INDONESIA",
];

/** Continuous network marquee bridging the scroll story and the About block. */
function PortTicker() {
  const row = [...NETWORK_TICKER, ...NETWORK_TICKER];
  return (
    <div className="relative overflow-hidden border-y border-amber-400/20 bg-[#0a192f] py-3.5">
      <div className="animate-marquee flex w-max items-center gap-10 whitespace-nowrap">
        {row.map((port, i) => (
          <span key={`${port}-${i}`} className="flex items-center gap-10">
            <span className="font-display text-[13px] font-bold tracking-[0.22em] text-blue-100/45">
              {port}
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0a192f] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0a192f] to-transparent" />
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#05101f]">
      <Navbar />
      <main>
        <ScrollStage />
        <PortTicker />
        <About />
      </main>
      <Footer />
    </div>
  );
}
