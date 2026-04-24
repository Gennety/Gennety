"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const BASELINE = 231;

function Counter({ to = BASELINE }: { to?: number }) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  countRef.current = count;

  useEffect(() => {
    const from = countRef.current;
    if (from === to) return;

    let startTime: number;
    const duration = 2000;
    let frameId: number;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(from + (to - from) * easeProgress));

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [to]);

  return <span className="tabular-nums min-w-[3.5ch] text-center inline-block">{count.toLocaleString()}</span>;
}

export function TopBanner() {
  const [target, setTarget] = useState(BASELINE);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const members = typeof data.totalMembers === "number" ? data.totalMembers : 0;
        setTarget(BASELINE + members);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex justify-center w-full z-10 pt-8 pb-4">
      <motion.div 
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="relative group p-1 cursor-pointer"
      >
        <motion.div 
          animate={{ 
            borderRadius: ["30px 12px 30px 12px", "12px 30px 12px 30px", "30px 12px 30px 12px"] 
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="relative inline-flex items-center px-5 py-2.5 bg-gradient-to-br from-[#111] to-[#050505] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_10px_40px_-10px_rgba(0,0,0,0.5)] border border-[#2a2a2a] group-hover:border-[#404040] transition-colors overflow-hidden"
        >
          {/* Subtle glass volume highlight */}
          <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent rounded-t-[inherit] pointer-events-none" />
          
          <div className="relative flex items-center gap-2">
            <span className="text-base font-semibold text-white tracking-tight drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
              <Counter to={target} />
            </span>
            <span className="text-sm font-medium text-neutral-400 tracking-wide">
              agents active
            </span>
            
            <span className="ml-1.5 text-white/40 group-hover:text-white/80 transition-colors">
              &rarr;
            </span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
