"use client";

import { motion } from "framer-motion";
import { useState } from "react";

export interface Principle {
  title: string;
  desc: string;
}

export interface KeyPrinciplesTexts {
  title: string;
  principles: Principle[];
}

// ----------------------------------------------------
// Option 1: Glass Monolith (Architectural Accordion)
// ----------------------------------------------------
function KeyPrinciplesMonolith({ texts }: { texts: KeyPrinciplesTexts }) {
  const [active, setActive] = useState(0);

  return (
    <div className="w-full relative py-12">
      <h3 className="text-center text-xs text-neutral-500 font-mono mb-12 uppercase tracking-widest">Option 1: Glass Monolith (Accordion)</h3>
      
      {/* Container height is fixed on desktop to allow horizontal expansion */}
      <div className="flex flex-col sm:flex-row h-auto sm:h-[400px] gap-2 sm:gap-4 max-w-5xl mx-auto w-full">
        {texts.principles.map((p, i) => {
          const isActive = active === i;
          return (
            <motion.div
              key={p.title}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              animate={{
                flex: isActive ? 3 : 1, // Expand active, shrink others
                backgroundColor: isActive ? "#0a0a0a" : "#050505",
              }}
              transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }} // Smooth heavy glass feel
              className="relative rounded-2xl border border-[#1a1a1a] overflow-hidden cursor-pointer flex flex-col justify-end p-6 sm:p-8 min-h-[120px] sm:min-h-0"
            >
              {/* Vertical title for non-active items (Desktop only for style) */}
              <motion.div 
                animate={{ opacity: isActive ? 0 : 1 }}
                className="hidden sm:block absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rotate-90 origin-left text-neutral-600 font-medium tracking-widest uppercase text-xs"
              >
                {p.title}
              </motion.div>

              {/* Active Content */}
              <motion.div
                animate={{ 
                  opacity: isActive ? 1 : 0, 
                  y: isActive ? 0 : 20,
                  pointerEvents: isActive ? "auto" : "none"
                }}
                transition={{ duration: 0.4, delay: isActive ? 0.1 : 0 }}
                className="flex flex-col justify-end h-full w-full sm:min-w-[200px]"
              >
                <h3 className="text-xl sm:text-2xl font-medium text-white mb-3">{p.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed max-w-xs">{p.desc}</p>
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Option 2: Morphing Liquid Glass (Abstract Backgrounds)
// ----------------------------------------------------
function KeyPrinciplesLiquidGlass({ texts }: { texts: KeyPrinciplesTexts }) {
  // We define slightly different abstract animation paths for each blob
  const animations = [
    { x: [0, 30, -20, 0], y: [0, -40, 20, 0], scale: [1, 1.2, 0.9, 1] },
    { x: [0, -30, 20, 0], y: [0, 30, -30, 0], scale: [1, 0.8, 1.1, 1] },
    { x: [20, -20, 0, 20], y: [-20, 20, 0, -20], scale: [0.9, 1.2, 1, 0.9] },
    { x: [-20, 20, 0, -20], y: [20, -20, 0, 20], scale: [1.1, 0.9, 1.2, 1.1] },
  ];

  return (
    <div className="w-full relative py-12">
      <h3 className="text-center text-xs text-neutral-500 font-mono mb-12 uppercase tracking-widest">Option 2: Morphing Liquid Glass</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
        {texts.principles.map((p, i) => (
          <div key={p.title} className="relative p-6 sm:p-10 rounded-2xl border border-[#1a1a1a] bg-white/[0.01] backdrop-blur-xl overflow-hidden min-h-[220px] flex flex-col justify-center">
            
            {/* Morphing Blob Background */}
            <motion.div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-[#34d399] opacity-10 blur-[40px] pointer-events-none z-0"
              animate={animations[i]}
              transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Glass reflection layer */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />

            <div className="relative z-10">
              <h3 className="text-lg font-medium text-white mb-3">{p.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Option 3: Cinematic Scroll Reveal (Focus on Typography)
// ----------------------------------------------------
function KeyPrinciplesCinematic({ texts }: { texts: KeyPrinciplesTexts }) {
  return (
    <div className="w-full relative py-20 bg-black">
      <h3 className="text-center text-xs text-neutral-600 font-mono mb-20 uppercase tracking-widest">Option 3: Cinematic Scroll Reveal</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-16 max-w-4xl mx-auto px-4">
        {texts.principles.map((p) => (
          <div key={p.title} className="flex flex-col justify-center">
            {/* Title Cinematic Reveal */}
            <motion.h3 
              className="text-2xl sm:text-3xl font-medium mb-4"
              initial={{ color: "#000000", y: 20 }}
              whileInView={{ color: ["#000000", "#ffffff", "#d4d4d4"], y: 0 }}
              viewport={{ once: false, margin: "-100px" }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            >
              {p.title}
            </motion.h3>

            {/* Description Cinematic Reveal */}
            <motion.p 
              className="text-base leading-relaxed"
              initial={{ color: "#000000" }}
              whileInView={{ color: ["#000000", "#a3a3a3", "#737373"] }}
              viewport={{ once: false, margin: "-100px" }}
              transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
            >
              {p.desc}
            </motion.p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Wrapper Showcase
// ----------------------------------------------------
export function KeyPrinciplesShowcase({ texts }: { texts: KeyPrinciplesTexts }) {
  return (
    <section className="px-4 sm:px-6 max-w-5xl mx-auto my-20">
      <div className="border border-dashed border-[#2a2a2a] rounded-3xl p-4 sm:p-12 bg-[#030303] overflow-hidden">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-[#34d399] mb-4 text-center font-bold">
          --- DEMO: NEW KEY PRINCIPLES CONCEPTS ---
        </p>
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-12 text-center">
          {texts.title}
        </p>
        
        <div className="space-y-24 divide-y divide-[#1a1a1a]">
          <KeyPrinciplesMonolith texts={texts} />
          <KeyPrinciplesLiquidGlass texts={texts} />
          <KeyPrinciplesCinematic texts={texts} />
        </div>
      </div>
    </section>
  );
}
