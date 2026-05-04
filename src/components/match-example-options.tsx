"use client";

import { motion, useInView } from "framer-motion";
import { useEffect, useState, useRef } from "react";

export interface MatchExampleTexts {
  title: string;
  agentA: string;
  agentAQuote: string;
  negotiating: string;
  agentB: string;
  agentBQuote: string;
  matchResultQuote: string;
}

// ----------------------------------------------------
// Helper: Matrix Decode Effect
// ----------------------------------------------------
function DecodeText({ text, startDelay = 0 }: { text: string; startDelay?: number }) {
  const [displayed, setDisplayed] = useState("");
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!isInView) return;

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
    let intervalId: NodeJS.Timeout | null = null;

    const timeoutId = setTimeout(() => {
      let iteration = 0;
      // Depending on length, adjust speed so it decodes in ~1.5s
      const speed = Math.max(10, Math.floor(1500 / text.length)); 

      intervalId = setInterval(() => {
        setDisplayed(() =>
          text
            .split("")
            .map((letter, index) => {
              if (index < iteration) return text[index];
              if (letter === " " || letter === "\n") return letter;
              return chars[Math.floor(Math.random() * chars.length)];
            })
            .join("")
        );
        
        if (iteration >= text.length) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }

        // Speed multiplier to decode multiple chars per tick if string is long
        iteration += text.length > 50 ? 3 : 1; 
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, startDelay, isInView]);

  return <span ref={ref}>{displayed || "\u00A0"}</span>;
}

// ----------------------------------------------------
// Option 1: AI Scanner & Highlights
// ----------------------------------------------------
function MatchExampleAIAnalysis({ texts }: { texts: MatchExampleTexts }) {
  return (
    <div className="w-full relative py-12">
      <h3 className="text-center text-xs text-neutral-500 font-mono mb-12 uppercase tracking-widest">Option 1: AI Scanner (Analysis)</h3>
      
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6 sm:gap-12 relative z-10">
        {/* Agent A */}
        <div className="flex-1 border border-[#1a1a1a] rounded-xl p-5 sm:p-6 bg-[#050505] relative overflow-hidden">
          {/* Scanner Line */}
          <motion.div 
            className="absolute left-0 right-0 h-16 bg-gradient-to-b from-transparent via-[#34d399]/5 to-[#34d399]/20 border-b border-[#34d399]/50 pointer-events-none"
            initial={{ top: "-30%", opacity: 0 }}
            whileInView={{ top: ["-30%", "120%"], opacity: [0, 1, 1, 0] }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 2.5, ease: "linear", delay: 0.5 }}
          />
          <p className="text-xs uppercase tracking-wider text-neutral-600">{texts.agentA}</p>
          <div className="font-mono text-sm text-neutral-400 mt-3 leading-relaxed">
            {texts.agentAQuote}
          </div>
        </div>

        {/* Agent B */}
        <div className="flex-1 border border-[#1a1a1a] rounded-xl p-5 sm:p-6 bg-[#050505] relative overflow-hidden">
          {/* Scanner Line */}
          <motion.div 
            className="absolute left-0 right-0 h-16 bg-gradient-to-b from-transparent via-[#34d399]/5 to-[#34d399]/20 border-b border-[#34d399]/50 pointer-events-none"
            initial={{ top: "-30%", opacity: 0 }}
            whileInView={{ top: ["-30%", "120%"], opacity: [0, 1, 1, 0] }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 2.5, ease: "linear", delay: 0.8 }}
          />
          <p className="text-xs uppercase tracking-wider text-neutral-600">{texts.agentB}</p>
          <div className="font-mono text-sm text-neutral-400 mt-3 leading-relaxed">
            {texts.agentBQuote}
          </div>
        </div>
      </div>

      {/* Match result */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.8, delay: 3.5, ease: "easeOut" }}
        className="mt-8 font-mono text-sm text-[#34d399] border border-[#34d399]/30 bg-[#34d399]/[0.05] shadow-[0_0_30px_rgba(52,211,153,0.1)] rounded-xl p-5 sm:p-6 leading-relaxed text-center relative"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-[#34d399] to-transparent" />
        {texts.matchResultQuote}
      </motion.div>
    </div>
  );
}

// ----------------------------------------------------
// Option 2: Matrix / Code Decode
// ----------------------------------------------------
function MatchExampleMatrixDecode({ texts }: { texts: MatchExampleTexts }) {
  return (
    <div className="w-full relative py-12">
      <h3 className="text-center text-xs text-neutral-500 font-mono mb-12 uppercase tracking-widest">Option 2: Matrix Decode</h3>
      
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-8">
        {/* Agent A */}
        <div className="flex-1 border border-[#1a1a1a] rounded-xl p-5 sm:p-6 bg-[#0a0a0a] min-h-[140px]">
          <p className="text-xs uppercase tracking-wider text-neutral-600">{texts.agentA}</p>
          <div className="font-mono text-sm text-white mt-3 leading-relaxed break-words">
            <DecodeText text={texts.agentAQuote} startDelay={500} />
          </div>
        </div>

        {/* Central visual indicator (replaces text) */}
        <div className="flex-shrink-0 flex items-center justify-center opacity-70">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="w-8 h-8 border-2 border-dashed border-[#444] rounded-full"
          />
        </div>

        {/* Agent B */}
        <div className="flex-1 border border-[#1a1a1a] rounded-xl p-5 sm:p-6 bg-[#0a0a0a] min-h-[140px]">
          <p className="text-xs uppercase tracking-wider text-neutral-600">{texts.agentB}</p>
          <div className="font-mono text-sm text-white mt-3 leading-relaxed break-words">
            <DecodeText text={texts.agentBQuote} startDelay={1000} />
          </div>
        </div>
      </div>

      {/* Match result */}
      <div className="mt-6 sm:mt-8 font-mono text-sm text-[#34d399] border border-[#2a2a2a] bg-[#111] rounded-xl p-5 sm:p-6 leading-relaxed min-h-[80px]">
        <DecodeText text={"✓ MATCH IDENTIFIED:\n" + texts.matchResultQuote} startDelay={2500} />
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Option 3: Convergence Graph (Funnel)
// ----------------------------------------------------
function MatchExampleConvergence({ texts }: { texts: MatchExampleTexts }) {
  return (
    <div className="w-full relative py-12">
      <h3 className="text-center text-xs text-neutral-500 font-mono mb-12 uppercase tracking-widest">Option 3: Convergence Graph</h3>
      
      {/* Top Cards */}
      <div className="flex gap-4 sm:gap-12 relative z-10 w-full max-w-3xl mx-auto">
        <div className="flex-1 border border-[#1a1a1a] rounded-xl p-4 sm:p-6 bg-[#0a0a0a] shadow-lg">
          <p className="text-xs uppercase tracking-wider text-neutral-600 mb-2 text-center">{texts.agentA}</p>
          <p className="font-mono text-xs sm:text-sm text-neutral-400 leading-relaxed text-center opacity-70 line-clamp-3">
            {texts.agentAQuote}
          </p>
        </div>
        <div className="flex-1 border border-[#1a1a1a] rounded-xl p-4 sm:p-6 bg-[#0a0a0a] shadow-lg">
          <p className="text-xs uppercase tracking-wider text-neutral-600 mb-2 text-center">{texts.agentB}</p>
          <p className="font-mono text-xs sm:text-sm text-neutral-400 leading-relaxed text-center opacity-70 line-clamp-3">
            {texts.agentBQuote}
          </p>
        </div>
      </div>

      {/* SVG Connecting Paths (The Funnel) */}
      <div className="relative h-24 sm:h-32 w-full max-w-3xl mx-auto flex justify-center -mt-2 -mb-2 z-0">
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <filter id="convergence-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          
          {/* Faint static paths */}
          <path d="M 25 0 C 25 50, 50 50, 50 100" fill="none" stroke="#222" strokeWidth="0.5" />
          <path d="M 75 0 C 75 50, 50 50, 50 100" fill="none" stroke="#222" strokeWidth="0.5" />

          {/* Animated glowing paths drawing from top to bottom */}
          <motion.path 
            d="M 25 0 C 25 50, 50 50, 50 100" 
            fill="none" stroke="#34d399" strokeWidth="1" filter="url(#convergence-glow)"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 1.5, delay: 0.5, ease: "easeInOut" }}
          />
          <motion.path 
            d="M 75 0 C 75 50, 50 50, 50 100" 
            fill="none" stroke="#34d399" strokeWidth="1" filter="url(#convergence-glow)"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 1.5, delay: 0.5, ease: "easeInOut" }}
          />
        </svg>
      </div>

      {/* Merged Result */}
      <div className="flex justify-center relative z-10 w-full">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.8, delay: 2, ease: "easeOut" }}
          className="font-mono text-sm text-white border border-[#34d399]/40 bg-gradient-to-b from-[#111] to-[#050505] rounded-2xl p-5 sm:p-8 leading-relaxed max-w-xl text-center shadow-[0_20px_40px_-10px_rgba(52,211,153,0.1)] relative"
        >
          {/* Subtle spark at the top center of this card where lines meet */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#34d399] rounded-full blur-md opacity-50" />
          
          {texts.matchResultQuote}
        </motion.div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Wrapper Showcase
// ----------------------------------------------------
export function MatchExampleShowcase({ texts }: { texts: MatchExampleTexts }) {
  return (
    <section className="px-4 sm:px-6 max-w-5xl mx-auto my-20">
      <div className="border border-dashed border-[#2a2a2a] rounded-3xl p-8 sm:p-12 bg-[#030303]">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-[#34d399] mb-4 text-center font-bold">
          --- DEMO: ADVANCED AI MATCH OPTIONS ---
        </p>
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-12 text-center">
          {texts.title}
        </p>
        
        <div className="space-y-24 divide-y divide-[#1a1a1a]">
          <MatchExampleAIAnalysis texts={texts} />
          <MatchExampleMatrixDecode texts={texts} />
          <MatchExampleConvergence texts={texts} />
        </div>
      </div>
    </section>
  );
}
