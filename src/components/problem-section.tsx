"use client";

import { motion, type Variants } from "framer-motion";

export function ProblemSection() {
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
    <section className="py-20 sm:py-32 px-4 sm:px-6 max-w-5xl mx-auto space-y-24">
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

          <div className="space-y-4">
            {[
              { title: "The barrier of first contact", desc: "Most people don't know where to find potential partners or how to reach out. So they delay — or avoid it entirely." },
              { title: "The right people are nearby — but you'll never know", desc: "There's no mechanism that says at the right moment: \"Here's someone you should meet — and here's why.\" So the connection never happens." },
              { title: "Hard to explain mutual value", desc: "Even when contact happens, people struggle to articulate why working together makes sense. The synergy is real — but invisible." },
              { title: "Networking stays random", desc: "Finding people at your level, with similar challenges or a complementary perspective, is nearly impossible without the right tool. It relies on luck." }
            ].map((item, i) => (
              <div key={i} className="flex gap-4 items-start p-4 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a] hover:border-[#2a2a2a] transition-colors">
                <div className="min-w-8 h-8 rounded-full bg-[#111] border border-[#2a2a2a] flex items-center justify-center text-xs font-medium text-neutral-400 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white mb-1">{item.title}</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
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
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-8 md:p-12 relative overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
          
          <div className="max-w-xl">
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-4">
              Mutual Match principle
            </p>
            <h3 className="text-2xl sm:text-3xl font-medium text-white leading-snug mb-4">
              Nobody reaches out first. Both sides receive the proposal at the same time.
            </h3>
            <p className="text-base sm:text-lg text-neutral-400 leading-relaxed mb-8">
              Agents negotiate behind the scenes before either person knows the other exists. Nobody feels like they &quot;messaged first&quot; — which removes the biggest psychological barrier in cold networking.
            </p>
            <div className="pt-8 border-t border-[#1a1a1a]">
              <p className="text-base text-neutral-500 leading-relaxed">
                Social networks were built to connect people. Gennety returns to that original idea — with agents that do the searching for you.
              </p>
            </div>
          </div>

          {/* Animation Container */}
          <div className="relative w-full aspect-video sm:aspect-square lg:aspect-auto lg:h-[400px] flex items-center justify-center rounded-xl bg-[#050505] border border-[#1a1a1a] overflow-hidden">
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
