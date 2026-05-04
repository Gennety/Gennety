"use client";

import { forwardRef, type MouseEvent } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";

interface Step {
  num: string;
  title: string;
  desc: string;
}

interface HowItWorksSectionProps {
  title: string;
  steps: Step[];
}

function SpotlightCard({ step }: { step: Step }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      className="group relative p-6 sm:p-8 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden h-full"
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
      <div className="relative z-10 flex flex-col h-full">
        <div className="text-4xl sm:text-5xl font-bold text-[#1a1a1a] transition-colors duration-300 group-hover:text-[#444]">{step.num}</div>
        <h3 className="text-base font-medium text-white mt-3 sm:mt-4">{step.title}</h3>
        <p className="text-sm text-neutral-500 mt-2 sm:mt-3 leading-relaxed flex-1">{step.desc}</p>
      </div>
    </div>
  );
}

export const HowItWorksSection = forwardRef<HTMLElement, HowItWorksSectionProps>(
  ({ title, steps }, ref) => {
    return (
      <section ref={ref} className="py-[74px] sm:py-[122px] px-4 sm:px-6 max-w-5xl mx-auto">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-10 sm:mb-16 text-center">
          {title}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: index * 0.15, ease: "easeOut" }}
              className="h-full"
            >
              <SpotlightCard step={step} />
            </motion.div>
          ))}
        </div>
      </section>
    );
  }
);

HowItWorksSection.displayName = "HowItWorksSection";
