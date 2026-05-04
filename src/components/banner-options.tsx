"use client";

import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";

// --- Shared Counter Component ---
function Counter({ from = 0, to = 2450 }) {
  const [count, setCount] = useState(from);

  useEffect(() => {
    let startTime: number;
    const duration = 2000;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      // easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(from + (to - from) * easeProgress));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [from, to]);

  return <span>{count.toLocaleString()}</span>;
}

// --- Option 1: Liquid Glass Pill ---
export function LiquidGlassPill() {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-neutral-500 font-mono tracking-widest uppercase">Option 1: Liquid Glass Pill</p>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="group relative inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_-8px_rgba(255,255,255,0.1)] transition-all duration-500 overflow-hidden"
      >
        {/* Shimmer sweep effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -translate-x-[150%]"
          initial={false}
          animate={{ translateX: ["-150%", "150%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
        />
        
        <div className="relative flex items-center gap-2.5">
          {/* Glowing dot */}
          <div className="relative flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-[#34d399] z-10" />
            <div className="absolute w-2 h-2 rounded-full bg-[#34d399] animate-ping opacity-75" />
            <div className="absolute w-4 h-4 rounded-full bg-[#34d399] blur-sm opacity-40" />
          </div>
          
          <span className="text-sm font-medium text-white/90 tracking-wide">
            <Counter to={2450} /> <span className="text-neutral-400">agents active</span>
          </span>
          
          <span className="ml-1 text-white/40 group-hover:text-white/80 transition-colors">
            &rarr;
          </span>
        </div>
      </motion.button>
    </div>
  );
}

// --- Option 2: Magnetic Edge Banner ---
export function MagneticEdgeBanner() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
      <p className="text-xs text-neutral-500 font-mono tracking-widest uppercase">Option 2: Magnetic Edge Banner</p>
      <div 
        className="group relative w-full overflow-hidden rounded-xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-md cursor-pointer"
        onMouseMove={handleMouseMove}
      >
        {/* Interactive Spotlight Hover */}
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-300 group-hover:opacity-100"
          style={{
            background: useMotionTemplate`
              radial-gradient(
                300px circle at ${mouseX}px ${mouseY}px,
                rgba(255,255,255,0.1),
                transparent 80%
              )
            `,
          }}
        />
        
        <div className="relative px-6 py-3 flex items-center justify-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="flex items-center gap-3 font-mono text-sm">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
            <span className="text-white"><Counter to={2450} /></span>
            <span className="text-neutral-500 tracking-wider">AGENTS ONLINE</span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
      </div>
    </div>
  );
}

// --- Option 3: Morphing Live Widget (Updated Hybrid) ---
export function MorphingLiveWidget() {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-neutral-500 font-mono tracking-widest uppercase">Option 3: Updated (Hybrid)</p>
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="group relative inline-flex items-center px-5 py-2.5 bg-gradient-to-br from-[#111] to-[#050505] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_10px_40px_-10px_rgba(0,0,0,0.5)] border border-[#2a2a2a] rounded-full cursor-pointer hover:border-[#404040] transition-colors overflow-hidden"
      >
        {/* Subtle glass volume highlight */}
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent rounded-t-[inherit] pointer-events-none" />
        
        <div className="relative flex items-center gap-2">
          <span className="text-base font-semibold text-white tracking-tight drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
            <Counter to={2450} />
          </span>
          <span className="text-sm font-medium text-neutral-400 tracking-wide">
            agents active
          </span>
          
          <span className="ml-1.5 text-white/40 group-hover:text-white/80 transition-colors">
            &rarr;
          </span>
        </div>
      </motion.button>
    </div>
  );
}

// --- Wrapper for Demonstration ---
export function BannerShowcase() {
  return (
    <div className="w-full flex flex-col items-center gap-12 pt-8 pb-4 border-b border-white/[0.05] bg-[#050505]/50 rounded-3xl p-8 mb-8 backdrop-blur-md">
      <h3 className="text-xs text-neutral-600 font-mono text-center tracking-widest">--- TOP BANNER PREVIEWS ---</h3>
      <LiquidGlassPill />
      <MagneticEdgeBanner />
      <MorphingLiveWidget />
      <h3 className="text-xs text-neutral-600 font-mono text-center tracking-widest mt-4">--- CHOOSE THE BEST ONE ---</h3>
    </div>
  );
}
