/**
 * Stages 1–3 of the landing story, driven by one pinned GSAP ScrollTrigger.
 *
 *   Stage 1  Hero        the VORTEX container hangs on chains over open ocean
 *   Stage 2  Arrival     the vessel enters from the left and stops beneath it
 *            The Drop    chains lower the container at a steady pace; it locks
 *                        onto the three deck boxes with a shudder on impact
 *   Stage 3  Departure   a gold wipe hands over to the outbound leg, and the
 *                        fully stacked vessel glides right to left
 *
 * The whole picture lives in ShipScene's fixed 1280x720 coordinate space and is
 * scaled to the viewport, so the container always lands exactly on the stack.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ShipScene from "./ShipScene";
import { SCENE } from "../../lib/scene";

gsap.registerPlugin(ScrollTrigger);

const STAGES = [
  { at: 0.0, label: "Suspended", detail: "Cargo on the hook" },
  { at: 0.14, label: "Arrival", detail: "Vessel inbound to berth" },
  { at: 0.34, label: "Alignment", detail: "Twist-locks aligned" },
  { at: 0.52, label: "Lowering", detail: "Chains paying out" },
  { at: 0.62, label: "Locked", detail: "Stack secured" },
  { at: 0.72, label: "Departure", detail: "Underway, laden" },
];

/**
 * Layered ocean swell.
 *
 * Each band's path is four identical 960-unit periods across a 3840-unit strip,
 * so the -25% xPercent drift wraps with no visible seam.
 *
 * The bands straddle the vessel: "back" draws behind her (distant sea), "front"
 * draws after her so its crests break over the hull and she sits *in* the water
 * rather than on top of it.
 */
const SWELL = [
  { layer: "back", top: 0, amp: 20, fill: "rgba(19,64,116,.85)", opacity: 0.9 },
  { layer: "back", top: 12, amp: 15, fill: "rgba(11,37,69,.92)", opacity: 0.95 },
  { layer: "front", top: 18, amp: 12, fill: "#071b33", opacity: 1 },
];

function swellPath(amp) {
  // one period = a crest then a trough; relative cubics keep every repeat identical
  const period = `c 160 ${-amp}, 320 ${-amp}, 480 0 c 160 ${amp}, 320 ${amp}, 480 0`;
  const crests = Array.from({ length: 4 }, () => period).join(" ");
  return `M0 40 ${crests} L3840 220 L0 220 Z`;
}

function Ocean({ layer }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: -1280, top: SCENE.waterline - 48, width: 3840, height: 240 }}
    >
      {SWELL.filter((b) => b.layer === layer).map((b) => (
        <svg
          key={b.fill}
          data-el="wave"
          className="absolute"
          style={{ left: 0, top: b.top, width: 3840, height: 220, opacity: b.opacity }}
          viewBox="0 0 3840 220"
          preserveAspectRatio="none"
        >
          <path d={swellPath(b.amp)} fill={b.fill} />
        </svg>
      ))}

      {/* specular glitter along the surface */}
      {layer === "back" && (
        <div className="absolute inset-x-0 top-[34px] h-[3px] bg-gradient-to-r from-transparent via-amber-200/25 to-transparent blur-[2px]" />
      )}
    </div>
  );
}

export default function ScrollStage() {
  const sectionRef = useRef(null);
  const pinRef = useRef(null);
  const oceanBgRef = useRef(null);
  const goldBgRef = useRef(null);
  const sunRef = useRef(null);
  const heroCopyRef = useRef(null);
  const cueRef = useRef(null);
  const outroRef = useRef(null);
  const wipeRef = useRef(null);
  const sceneRef = useRef(null);
  const progressRef = useRef(null);

  const [stage, setStage] = useState(0);
  const stageRef = useRef(0);

  /* ---- keep the fixed-coordinate scene fitted to the viewport ------------ */
  useLayoutEffect(() => {
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale =
        vw < 900 ? Math.min(vw / 900, vh / 720) : Math.min(vw / 1280, vh / 720);
      if (sceneRef.current) {
        sceneRef.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  /* ---- the scroll story -------------------------------------------------- */
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Selector strings inside a gsap.context are scoped to the section, so the
    // scene is addressed by data-el tag rather than by a bag of refs.
    const ctx = gsap.context(() => {
      /* ambient motion — independent of scroll position */
      gsap.utils.toArray("[data-el='wave']").forEach((band, i) => {
        gsap.fromTo(
          band,
          { xPercent: 0 },
          { xPercent: -25, duration: 22 + i * 9, ease: "none", repeat: -1 }
        );
        gsap.to(band, {
          y: 6 + i * 3, duration: 3.4 + i * 0.8, ease: "sine.inOut", repeat: -1, yoyo: true,
        });
      });

      gsap.to("[data-el='ship']", {
        y: -7, rotation: 0.45, duration: 3.1, ease: "sine.inOut", repeat: -1, yoyo: true,
      });

      gsap.to("[data-el='chain']", {
        skewX: 0.7, duration: 4.2, ease: "sine.inOut", repeat: -1, yoyo: true,
        transformOrigin: "top center",
      });

      if (reduced) {
        // Land straight on the final composition; no scroll choreography.
        gsap.set("[data-el='rig']", { y: SCENE.dropDistance });
        gsap.set("[data-el='chain']", { autoAlpha: 0 });
        gsap.set("[data-el='locks']", { autoAlpha: 1 });
        return;
      }

      /* pin the frame for the length of the story */
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "bottom bottom",
        pin: pinRef.current,
        pinSpacing: false,
        anticipatePin: 1,
      });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          onUpdate: (self) => {
            const idx = STAGES.reduce((acc, s, i) => (self.progress >= s.at ? i : acc), 0);
            if (idx !== stageRef.current) {
              stageRef.current = idx;
              setStage(idx);
            }
            if (progressRef.current) {
              progressRef.current.style.transform = `scaleX(${self.progress})`;
            }
          },
        },
        defaults: { ease: "none" },
      });

      /* -- Stage 1 → 2 : hero copy clears, the vessel comes in ------------- */
      tl.to(cueRef.current, { autoAlpha: 0, y: 20, duration: 0.4 }, 0)
        .to(heroCopyRef.current, { autoAlpha: 0, y: -40, duration: 0.8 }, 0.1)
        .fromTo(
          "[data-el='ship']",
          { x: -1500 },
          { x: 0, duration: 1.9, ease: "power2.out" },
          0.7
        )
        // bow wave settles as she comes off her approach
        .fromTo(
          "[data-el='deckboxes']",
          { rotation: -0.6, transformOrigin: "700px 556px" },
          { rotation: 0, duration: 0.7 },
          2.2
        );

      /* -- The Drop : steady chain pay-out, then the lock ------------------ */
      tl.to(
        "[data-el='rig']",
        { y: SCENE.dropDistance, duration: 2.0, ease: "none" },
        3.0
      ).to(
        "[data-el='chain']",
        { height: SCENE.topRestY, duration: 2.0, ease: "none" },
        3.0
      );

      /* impact: shudder through the frame, flash, twist-locks engage */
      tl.to("[data-el='impact']", { autoAlpha: 1, scale: 1.15, duration: 0.12 }, 5.0)
        .to("[data-el='impact']", { autoAlpha: 0, scale: 1.5, duration: 0.28 }, 5.12)
        .to(
          pinRef.current,
          { keyframes: { x: [-7, 6, -4, 3, -1, 0] }, duration: 0.42 },
          5.0
        )
        .to(
          "[data-el='deckboxes']",
          { keyframes: { scaleY: [0.965, 1.012, 0.995, 1] }, transformOrigin: "700px 556px", duration: 0.45 },
          5.02
        )
        .to(
          "[data-el='topbox']",
          { keyframes: { y: [5, -2, 1, 0] }, duration: 0.4 },
          5.02
        )
        .to("[data-el='locks']", { autoAlpha: 1, duration: 0.25 }, 5.3);

      /* chains release and retract out of frame */
      tl.to(
        "[data-el='chain']",
        { autoAlpha: 0, y: -140, duration: 0.6 },
        5.6
      );

      /* -- Stage 3 : gold wipe, then the outbound glide -------------------- */
      tl.to("[data-el='ship'], [data-el='rig']", { x: -260, duration: 0.8 }, 6.2)
        .to(wipeRef.current, { scaleX: 1, duration: 0.55, ease: "power3.inOut" }, 6.4)
        .to(goldBgRef.current, { autoAlpha: 1, duration: 0.3 }, 6.6)
        .to(oceanBgRef.current, { autoAlpha: 0.15, duration: 0.3 }, 6.6)
        .to(sunRef.current, { autoAlpha: 1, scale: 1, duration: 0.5 }, 6.6)
        .set("[data-el='ship'], [data-el='rig']", { x: 1600 }, 6.75)
        .set("[data-el='hull']", { scaleX: -1, transformOrigin: "700px 600px" }, 6.75)
        .to(
          wipeRef.current,
          { scaleX: 0, transformOrigin: "right center", duration: 0.55, ease: "power3.inOut" },
          6.85
        )
        .fromTo(outroRef.current, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 7.1);

      /* the cinematic pass — constant speed, right to left */
      tl.to(
        "[data-el='ship'], [data-el='rig']",
        { x: -1700, duration: 3.0, ease: "none" },
        7.0
      );

      /* gentle vibration of the stack while she runs */
      tl.to(
        "[data-el='deckboxes']",
        { keyframes: { y: [0, -1.4, 0.9, -0.6, 0] }, duration: 3.0, repeat: 0 },
        7.0
      );

      /* hand off to the About section */
      tl.to(outroRef.current, { autoAlpha: 0, y: -30, duration: 0.5 }, 9.6)
        .to(sceneRef.current, { autoAlpha: 0, scale: 0.96, duration: 0.6 }, 9.7);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const current = STAGES[stage];

  return (
    <section ref={sectionRef} id="story" style={{ height: "640vh" }} className="relative">
      <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
        {/* ---------------- backdrops ---------------------------------------- */}
        <div
          ref={oceanBgRef}
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 8%, #16345f 0%, #0b2545 34%, #0a192f 62%, #05101f 100%)",
          }}
        />
        <div
          ref={goldBgRef}
          className="absolute inset-0 opacity-0"
          style={{
            background:
              "radial-gradient(120% 85% at 50% 18%, #fde68a 0%, #fbbf24 28%, #f59e0b 54%, #b45309 82%, #78350f 100%)",
          }}
        />

        {/* low sun that appears on the outbound leg */}
        <div
          ref={sunRef}
          className="absolute left-1/2 top-[24%] h-[280px] w-[280px] rounded-full opacity-0"
          style={{
            transform: "translateX(-50%) scale(0.7)",
            background:
              "radial-gradient(circle, rgba(255,251,235,.95) 0%, rgba(253,224,71,.65) 38%, rgba(245,158,11,0) 72%)",
          }}
        />

        <div className="grid-lines pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(2,6,23,.75)_100%)]" />

        {/* ---------------- the scaled scene --------------------------------- */}
        <div
          ref={sceneRef}
          className="absolute left-1/2 top-1/2"
          style={{
            width: SCENE.W,
            height: SCENE.H,
            transform: "translate(-50%,-50%)",
            transformOrigin: "center center",
          }}
        >
          <Ocean layer="back" />
          <ShipScene />
          <Ocean layer="front" />
        </div>

        {/* ---------------- hero copy ---------------------------------------- */}
        <div
          ref={heroCopyRef}
          className="pointer-events-none absolute inset-x-0 top-[13%] flex flex-col items-center px-6 text-center"
        >
         
         
        </div>

        {/* ---------------- outro copy on the gold leg ----------------------- */}
        <div
          ref={outroRef}
          className="pointer-events-none absolute inset-x-0 top-[16%] flex flex-col items-center px-6 text-center opacity-0"
        >
          <span className="text-[11px] font-bold tracking-[0.34em] text-amber-950/70">
            CARGO SECURED · UNDERWAY
          </span>
          <h2 className="mt-3 max-w-3xl text-balance font-display text-3xl font-extrabold leading-tight text-[#3b1d05] sm:text-5xl">
            Every tonne, timed to the market.
          </h2>
          <p className="mt-3 max-w-lg text-sm font-medium text-[#5a3208]">
            Ten east-coast ports. Seven vessel classes. One optimised decision.
          </p>
        </div>

        {/* ---------------- transition wipe ---------------------------------- */}
        <div
          ref={wipeRef}
          className="pointer-events-none absolute inset-0 origin-left"
          style={{
            transform: "scaleX(0)",
            background: "linear-gradient(105deg,#fde047 0%,#eab308 45%,#f59e0b 100%)",
          }}
        >
          <div className="absolute inset-y-0 right-0 w-[3px] bg-[#0a192f]/40" />
        </div>

        {/* ---------------- stage HUD ---------------------------------------- */}
        <div className="pointer-events-none absolute bottom-8 left-6 right-6 flex items-end justify-between gap-6 sm:left-10 sm:right-10">
          <div className="glass rounded-xl px-4 py-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-amber-400" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-amber-300">
                {String(stage + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}
              </span>
            </div>
            <p className="mt-1.5 font-display text-sm font-bold tracking-wide text-white">
              {current.label}
            </p>
            <p className="text-[11px] text-blue-200/60">{current.detail}</p>
          </div>

          <div
            ref={cueRef}
            className="hidden flex-col items-center gap-1 text-blue-200/70 sm:flex"
          >
            <span className="text-[10px] font-semibold tracking-[0.24em]">SCROLL</span>
            <ChevronDown size={16} className="animate-bounce" />
          </div>
        </div>

        {/* scroll progress rail */}
        <div className="absolute bottom-0 left-0 h-[3px] w-full bg-white/5">
          <div
            ref={progressRef}
            className="h-full w-full origin-left bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
      </div>
    </section>
  );
}
