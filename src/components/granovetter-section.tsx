"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function GranovetterSection() {
  const t = useTranslations("landing");

  return (
    <section className="pt-8 pb-16 sm:pt-12 sm:pb-24 px-4 sm:px-6 max-w-5xl mx-auto relative overflow-hidden">
      {/* Background glow to anchor the section */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-white/[0.01] blur-[100px] rounded-full pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center relative z-10">

        {/* Left Col: Text */}
        <div className="space-y-8">
          <div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white leading-tight">
              {t("granovetterTitle")}
            </h2>
          </div>

          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-8 relative shadow-lg">
            <div className="absolute top-0 left-8 -translate-y-1/2 bg-[#050505] px-3 border border-[#1a1a1a] rounded-full flex items-center justify-center">
              <span className="text-xl leading-none text-neutral-600 font-serif pt-1">&quot;</span>
            </div>
            <p className="text-lg text-neutral-300 leading-relaxed italic">
              {t("granovetterQuote")}
            </p>
          </div>
        </div>

        {/* Right Col: Radar Animation (Option 3) */}
        <div className="relative w-full max-w-[400px] mx-auto aspect-square flex items-center justify-center">

          {/* Radar background rings */}
          <div className="absolute inset-0 rounded-full border border-white/[0.05]" />
          <div className="absolute inset-[15%] rounded-full border border-white/[0.05]" />
          <div className="absolute inset-[30%] rounded-full border border-white/[0.05]" />
          <div className="absolute inset-[45%] rounded-full border border-white/[0.05]" />

          {/* Rotating radar sweep */}
          <motion.div
            className="absolute inset-0 rounded-full opacity-30 origin-center"
            style={{ background: "conic-gradient(from 0deg, transparent 70%, rgba(255,255,255,0.8) 100%)" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />

          {/* Central subtle glow */}
          <div className="absolute inset-0 bg-white/[0.02] blur-xl rounded-full pointer-events-none" />

          {/* SVG Elements */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400">
            {/* The straight data line from outer edge to center */}
            <path d="M 200 200 L 350 80" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

            {/* Flowing data (dashes representing Morse / Data stream) */}
            <motion.path
              d="M 350 80 L 200 200"
              stroke="#fff"
              strokeWidth="2"
              strokeDasharray="4 12"
              initial={{ strokeDashoffset: 100 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />

            {/* Pulsing effect at the distant node */}
            <motion.circle
              cx="350" cy="80" r="15"
              fill="rgba(255,255,255,0.1)"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Distant Opportunity Node */}
            <circle cx="350" cy="80" r="4" fill="#fff" />
            <text x="350" y="65" fill="#888" fontSize="10" textAnchor="middle" fontFamily="monospace" letterSpacing="1">{t("weakTies")}</text>
            <text x="350" y="52" fill="#555" fontSize="8" textAnchor="middle" fontFamily="monospace" letterSpacing="1">{t("opportunities")}</text>

            {/* Core Node Glow */}
            <circle cx="200" cy="200" r="10" fill="rgba(255,255,255,0.1)" />
            <motion.circle
              cx="200" cy="200" r="20"
              fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Core Node Center */}
            <circle cx="200" cy="200" r="4" fill="#fff" />
            <text x="200" y="240" fill="#888" fontSize="10" textAnchor="middle" fontFamily="monospace" letterSpacing="1">{t("yourCircle")}</text>
          </svg>
        </div>
      </div>
    </section>
  );
}
