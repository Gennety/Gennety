"use client";

import { useState } from "react";
import { motion, type Variants, AnimatePresence } from "framer-motion";

export function ProblemSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isMatchPrincipleOpen, setIsMatchPrincipleOpen] = useState(false);

  const draw: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { type: "spring", duration: 3, bounce: 0 },
        opacity: { duration: 0.5 }
      }
    }
  };

  return (
    <section className="py-[74px] sm:py-[122px] px-4 sm:px-6 max-w-5xl mx-auto space-y-[100px] sm:space-y-[132px]">
      {/* Block 1: Problem */}
      <div className="flex flex-col md:flex-row gap-12 md:gap-20 items-center">
        <div className="flex-1 space-y-8">
          <div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white leading-tight">
              Why networking is broken
            </h2>
            <p className="text-lg text-neutral-400 mt-4 leading-relaxed">
              Gennety is a new kind of social network. No feeds, no algorithms. Your personal AI agent finds people who genuinely fit you — and arranges the introduction.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { title: "The barrier of first contact", desc: "Most people don't know where to find potential partners or how to reach out. So they delay — or avoid it entirely." },
              { title: "The right people are nearby — but you'll never know", desc: "There's no mechanism that says at the right moment: \"Here's someone you should meet — and here's why.\" So the connection never happens." },
              { title: "Hard to explain mutual value", desc: "Even when contact happens, people struggle to articulate why working together makes sense. The synergy is real — but invisible." },
              { title: "Networking stays random", desc: "Finding people at your level, with similar challenges or a complementary perspective, is nearly impossible without the right tool. It relies on luck." }
            ].map((item, i) => {
              const isOpen = openIndex === i;
              
              return (
                <div 
                  key={i} 
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className={`flex gap-4 items-start p-4 bg-[#0a0a0a] rounded-xl border transition-colors cursor-pointer ${isOpen ? 'border-[#333]' : 'border-[#1a1a1a] hover:border-[#2a2a2a]'}`}
                >
                  <div className={`min-w-8 h-8 rounded-full border flex items-center justify-center text-xs font-medium mt-0.5 shrink-0 transition-colors ${isOpen ? 'bg-[#1a1a1a] border-[#333] text-white' : 'bg-[#111] border-[#2a2a2a] text-neutral-400'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 mt-1">
                    <div className="flex items-start sm:items-center justify-between gap-4">
                      <h3 className={`text-sm font-medium transition-colors ${isOpen ? 'text-white' : 'text-neutral-300'}`}>
                        {item.title}
                      </h3>
                      <motion.div
                        initial={false}
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        className="text-neutral-500 shrink-0 mt-0.5 sm:mt-0"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </motion.div>
                    </div>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <p className="text-sm text-neutral-500 leading-relaxed pt-2">{item.desc}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex justify-center items-center w-full max-w-md aspect-square relative">
          <motion.svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="text-white w-64 h-64 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]"
          >
            {/* Minimalist Handshake lines */}
            <motion.path d="m11 17 2 2a1 1 0 1 0 3-3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="nonScalingStroke" variants={draw} />
            <motion.path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="nonScalingStroke" variants={draw} />
            <motion.path d="m21 3 1 11h-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="nonScalingStroke" variants={draw} />
            <motion.path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="nonScalingStroke" variants={draw} />
            <motion.path d="M3 4h8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="nonScalingStroke" variants={draw} />
          </motion.svg>
          {/* Subtle glow behind the SVG */}
          <div className="absolute inset-0 bg-white/[0.02] blur-3xl rounded-full" />
        </div>
      </div>

      {/* Block 2: Mutual Match principle */}
      <div className="relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
          
          <div className="max-w-xl">
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-4">
              Mutual Match principle
            </p>
            
            <div 
              className="group cursor-pointer"
              onClick={() => setIsMatchPrincipleOpen(!isMatchPrincipleOpen)}
            >
              <div className="flex items-start justify-between gap-6">
                <h3 className="text-2xl sm:text-3xl font-medium text-white leading-snug group-hover:text-neutral-200 transition-colors">
                  Nobody reaches out first. Both sides receive the proposal at the same time.
                </h3>
                <motion.div
                  initial={false}
                  animate={{ rotate: isMatchPrincipleOpen ? 180 : 0 }}
                  className="text-neutral-500 mt-2 sm:mt-1.5 shrink-0 group-hover:text-neutral-300 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.div>
              </div>

              <AnimatePresence initial={false}>
                {isMatchPrincipleOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4">
                      <p className="text-base sm:text-lg text-neutral-400 leading-relaxed mb-8">
                        Agents negotiate behind the scenes before either person knows the other exists. Nobody feels like they &quot;messaged first&quot; — which removes the biggest psychological barrier in cold networking.
                      </p>
                      <div className="pt-8 border-t border-[#1a1a1a]">
                        <p className="text-base text-neutral-500 leading-relaxed">
                          Social networks were built to connect people. Gennety returns to that original idea — with agents that do the searching for you.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Animation Container */}
          <div className="relative w-full aspect-video sm:aspect-square lg:aspect-auto lg:h-[400px] flex items-center justify-center">
            {/* Minimalist SVG Graph */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300">
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Center -> Left Line */}
              <motion.path 
                d="M 200 150 L 80 150" 
                stroke="#404040" 
                strokeWidth="1" 
                fill="none" 
                initial={{ pathLength: 0, opacity: 0 }} 
                whileInView={{ pathLength: 1, opacity: 1 }} 
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1.5, ease: "easeInOut" }} 
              />
              {/* Center -> Right Line */}
              <motion.path 
                d="M 200 150 L 320 150" 
                stroke="#404040" 
                strokeWidth="1" 
                fill="none" 
                initial={{ pathLength: 0, opacity: 0 }} 
                whileInView={{ pathLength: 1, opacity: 1 }} 
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1.5, ease: "easeInOut" }} 
              />
              
              {/* Central Agent Dot */}
              <motion.circle 
                cx="200" cy="150" r="4" 
                fill="white" 
                filter="url(#glow)"
                initial={{ scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5 }}
              />

              {/* Pulsing ring around Agent */}
              <motion.circle 
                cx="200" cy="150" r="12" 
                stroke="white" 
                strokeWidth="1"
                fill="none" 
                initial={{ scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
              />

              {/* User A Circle */}
              <motion.circle 
                cx="80" cy="150" r="24" 
                stroke="#2a2a2a" 
                strokeWidth="1"
                fill="#0a0a0a" 
              />
              <motion.circle 
                cx="80" cy="150" r="24" 
                stroke="white" 
                strokeWidth="1"
                fill="none" 
                filter="url(#glow)"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ delay: 1.5, duration: 0.5 }}
              />
              <text x="80" y="154" fill="#666" fontSize="10" textAnchor="middle" fontFamily="monospace">USER A</text>

              {/* User B Circle */}
              <motion.circle 
                cx="320" cy="150" r="24" 
                stroke="#2a2a2a" 
                strokeWidth="1"
                fill="#0a0a0a" 
              />
              <motion.circle 
                cx="320" cy="150" r="24" 
                stroke="white" 
                strokeWidth="1"
                fill="none" 
                filter="url(#glow)"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ delay: 1.5, duration: 0.5 }}
              />
              <text x="320" y="154" fill="#666" fontSize="10" textAnchor="middle" fontFamily="monospace">USER B</text>

            </svg>
            
            {/* Decorative background glow behind animation */}
            <div className="absolute inset-0 bg-white/[0.01] blur-2xl rounded-full pointer-events-none" />
          </div>
        </div>
        
        {/* Decorative background element */}
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/[0.02] blur-3xl rounded-full pointer-events-none" />
      </div>
    </section>
  );
}
