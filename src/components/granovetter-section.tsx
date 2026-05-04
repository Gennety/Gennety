"use client";

import { useTranslations } from "next-intl";

export function GranovetterSection() {
  const t = useTranslations("landing");

  return (
    <section className="py-[74px] sm:py-[122px] px-4 sm:px-6 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="space-y-6 animate-detail-in">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white leading-tight">
            {t("granovetterTitle")}
          </h2>

          <p className="text-lg sm:text-xl text-neutral-400 leading-relaxed max-w-lg">
            {t("granovetterQuote")}
          </p>
        </div>

        <div className="relative w-full aspect-square sm:aspect-[4/3] lg:aspect-square flex items-center justify-center animate-detail-in animate-detail-in-d1">
          {/* Symbolic Bridge SVG */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 400" aria-hidden="true">
            {/* The Weak Tie Bridge (Tighter Start Point) */}
            <path
              d="M 116 200 C 150 120, 250 120, 298 200"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              fill="none"
            />
            
            {/* Cluster: Your Circle (Dense) */}
            <g opacity="0.8">
              <circle cx="85" cy="205" r="2.5" fill="white" />
              <circle cx="100" cy="190" r="2.5" fill="white" />
              <circle cx="115" cy="210" r="2.5" fill="white" />
              <path d="M 85 205 L 100 190 L 115 210 Z" stroke="white" strokeWidth="0.5" fill="none" opacity="0.2" />
            </g>

            {/* Opportunity: Weak Tie (Discovery) */}
            <g>
              <circle cx="300" cy="200" r="4" fill="white" className="shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
              <circle cx="315" cy="180" r="2" fill="rgba(255,255,255,0.2)" />
              <circle cx="330" cy="210" r="2" fill="rgba(255,255,255,0.2)" />
            </g>
          </svg>

          {/* Labels - Positioned ABOVE the graphics */}
          <div className="absolute left-[2%] sm:left-[5%] top-1/2 -translate-y-20 z-10 text-center">
            <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
              {t("yourCircle")}
            </span>
          </div>

          <div className="absolute right-[2%] sm:right-[5%] top-1/2 -translate-y-20 z-10 text-center">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest leading-relaxed">
              {t("weakTies")}
              <br />
              <span className="text-white/40">{t("opportunities")}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
