"use client";

import { forwardRef } from "react";

interface MatchExampleSectionProps {
  title: string;
  agentA: string;
  agentAQuote: string;
  negotiating: string;
  agentB: string;
  agentBQuote: string;
  matchResultQuote: string;
}

export const MatchExampleSection = forwardRef<HTMLElement, MatchExampleSectionProps>(
  ({
    title,
    agentA,
    agentAQuote,
    negotiating,
    agentB,
    agentBQuote,
    matchResultQuote,
  }, ref) => {
    return (
      <section ref={ref} className="py-[74px] sm:py-[122px] px-4 sm:px-6 max-w-5xl mx-auto">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-10 sm:mb-16 text-center">
          {title}
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-0 animate-detail-in">
          <div className="flex-1 border border-[#1a1a1a] rounded-xl p-5 sm:p-6 bg-[#0a0a0a] min-h-[140px] transition-transform duration-300 hover:-translate-y-1">
            <p className="text-xs uppercase tracking-wider text-neutral-600">{agentA}</p>
            <p className="font-mono text-sm text-neutral-400 mt-3 leading-relaxed break-words">
              {agentAQuote}
            </p>
          </div>

          <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-center sm:w-40 opacity-70">
            <div className="sm:hidden flex flex-col items-center gap-2 py-3">
              <div className="w-px h-5 border-l border-dashed border-[#2a2a2a]" />
              <span className="text-xs text-neutral-600 font-mono">
                {negotiating}
                <span className="inline-flex">
                  <span className="animate-dot-blink">.</span>
                  <span className="animate-dot-blink" style={{ animationDelay: "0.2s" }}>.</span>
                  <span className="animate-dot-blink" style={{ animationDelay: "0.4s" }}>.</span>
                </span>
              </span>
              <div className="w-px h-5 border-l border-dashed border-[#2a2a2a]" />
            </div>
            <div className="hidden sm:flex items-center w-full">
              <div className="flex-1 border-t border-dashed border-[#2a2a2a]" />
              <span className="px-3 text-xs text-neutral-600 font-mono whitespace-nowrap">
                {negotiating}
                <span className="inline-flex">
                  <span className="animate-dot-blink">.</span>
                  <span className="animate-dot-blink" style={{ animationDelay: "0.2s" }}>.</span>
                  <span className="animate-dot-blink" style={{ animationDelay: "0.4s" }}>.</span>
                </span>
              </span>
              <div className="flex-1 border-t border-dashed border-[#2a2a2a]" />
            </div>
          </div>

          <div className="flex-1 border border-[#1a1a1a] rounded-xl p-5 sm:p-6 bg-[#0a0a0a] min-h-[140px] transition-transform duration-300 hover:-translate-y-1">
            <p className="text-xs uppercase tracking-wider text-neutral-600">{agentB}</p>
            <p className="font-mono text-sm text-neutral-400 mt-3 leading-relaxed break-words">
              {agentBQuote}
            </p>
          </div>
        </div>

        <div className="mt-6 sm:mt-8 font-mono text-sm text-neutral-300 border border-[#2a2a2a] bg-[#111] rounded-xl p-5 sm:p-6 leading-relaxed min-h-[80px] animate-detail-in animate-detail-in-d2 transition-transform duration-300 hover:-translate-y-1">
          {matchResultQuote}
        </div>
      </section>
    );
  }
);

MatchExampleSection.displayName = "MatchExampleSection";
