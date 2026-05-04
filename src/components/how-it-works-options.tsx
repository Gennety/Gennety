"use client";

import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { MouseEvent } from "react";

interface Step {
  num: string;
  title: string;
  desc: string;
}

// --- OPTION 1: Flow Animation ---
export function HowItWorksFlow({ steps }: { steps: Step[] }) {
  return (
    <div className="w-full relative py-12">
      <h3 className="text-center text-xs text-neutral-500 font-mono mb-12 uppercase tracking-widest">Option 1: Flow Spark</h3>
      
      <div className="relative">
        {/* The line connecting them */}
        <div className="hidden sm:block absolute top-12 left-[16%] right-[16%] h-px bg-[#1a1a1a] z-0" />
        
        {/* The spark */}
        <motion.div 
          className="hidden sm:block absolute top-12 left-[16%] w-24 h-px bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_15px_white] z-0"
          animate={{ x: ["0%", "500%"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 relative z-10">
          {steps.map((step, i) => (
            <motion.div 
              key={step.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.2 }}
              className="p-6 sm:p-8 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] group hover:border-[#333] transition-colors relative"
            >
              <motion.div 
                className="text-4xl sm:text-5xl font-bold text-[#1a1a1a] transition-all duration-700 group-hover:text-white group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]"
              >
                {step.num}
              </motion.div>
              <h3 className="text-base font-medium text-white mt-3 sm:mt-4">{step.title}</h3>
              <p className="text-sm text-neutral-500 mt-2 sm:mt-3 leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- OPTION 2: Spotlight Hover ---
function SpotlightCard({ step }: { step: Step }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      className="group relative p-6 sm:p-8 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden"
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              300px circle at ${mouseX}px ${mouseY}px,
              rgba(255,255,255,0.06),
              transparent 80%
            )
          `,
        }}
      />
      <div className="relative z-10">
        <div className="text-4xl sm:text-5xl font-bold text-[#1a1a1a] transition-colors duration-300 group-hover:text-[#444]">{step.num}</div>
        <h3 className="text-base font-medium text-white mt-3 sm:mt-4">{step.title}</h3>
        <p className="text-sm text-neutral-500 mt-2 sm:mt-3 leading-relaxed">{step.desc}</p>
      </div>
    </div>
  );
}

export function HowItWorksSpotlight({ steps }: { steps: Step[] }) {
  return (
    <div className="w-full relative py-12">
      <h3 className="text-center text-xs text-neutral-500 font-mono mb-8 uppercase tracking-widest">Option 2: Tactile Spotlight (Staggered)</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {steps.map((step, i) => (
          <motion.div
            key={step.num}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
          >
            <SpotlightCard step={step} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// --- OPTION 3: SVG Draw Numbers ---
export function HowItWorksSVG({ steps }: { steps: Step[] }) {
  return (
    <div className="w-full relative py-12">
      <h3 className="text-center text-xs text-neutral-500 font-mono mb-8 uppercase tracking-widest">Option 3: SVG Path Draw</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {steps.map((step, i) => (
          <div key={step.num} className="relative p-6 sm:p-8 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden group">
            
            {/* Animated SVG Text */}
            <div className="absolute top-0 right-2 pointer-events-none">
              <svg width="120" height="120" viewBox="0 0 100 100">
                {/* Outline drawing */}
                <motion.text 
                  x="50%" y="80%" 
                  textAnchor="middle" 
                  fontSize="70" 
                  fontWeight="900" 
                  fill="transparent" 
                  stroke="rgba(255,255,255,0.4)" 
                  strokeWidth="1"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 2, delay: i * 0.3, ease: "easeInOut" }}
                >
                  {step.num}
                </motion.text>
                
                {/* Liquid glass fill coming in later */}
                <motion.text 
                  x="50%" y="80%" 
                  textAnchor="middle" 
                  fontSize="70" 
                  fontWeight="900" 
                  fill="rgba(255,255,255,0.03)" 
                  stroke="transparent" 
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 1.5, delay: (i * 0.3) + 1.5 }}
                >
                  {step.num}
                </motion.text>
              </svg>
            </div>

            <div className="relative z-10 pt-8">
              <h3 className="text-base font-medium text-white mt-12 sm:mt-16">{step.title}</h3>
              <p className="text-sm text-neutral-500 mt-2 sm:mt-3 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- WRAPPER SHOWCASE ---
export function HowItWorksShowcase({ steps, title }: { steps: Step[], title: string }) {
  return (
    <section className="px-4 sm:px-6 max-w-5xl mx-auto my-20">
      <div className="border border-dashed border-[#2a2a2a] rounded-3xl p-8 sm:p-12 bg-[#030303]">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-[#34d399] mb-4 text-center font-bold">
          --- DEMO: HOW IT WORKS OPTIONS ---
        </p>
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-12 text-center">
          {title}
        </p>
        
        <div className="space-y-16 divide-y divide-[#1a1a1a]">
          <HowItWorksFlow steps={steps} />
          <HowItWorksSpotlight steps={steps} />
          <HowItWorksSVG steps={steps} />
        </div>
      </div>
    </section>
  );
}
