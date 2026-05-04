"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { NETWORK_MEMBERS_BASELINE } from "@/lib/network-stats";

function Counter({ to }: { to: number }) {
  const [count, setCount] = useState(0);
  const locale = useLocale();

  useEffect(() => {
    let startTime: number;
    const duration = 2000;
    let frameId: number;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(to * easeProgress));

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [to]);

  return <span className="inline-block min-w-[3.5ch] text-center tabular-nums">{count.toLocaleString(locale)}</span>;
}

export function TopBanner() {
  const [target, setTarget] = useState<number | null>(null);
  const t = useTranslations("landing");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/stats?lite=1")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        const members =
          typeof data?.totalMembers === "number" && data.totalMembers > 0
            ? data.totalMembers
            : NETWORK_MEMBERS_BASELINE;
        setTarget(members);
      })
      .catch(() => {
        if (!cancelled) setTarget(NETWORK_MEMBERS_BASELINE);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex justify-center w-full z-10 pt-8 pb-4">
      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="relative group p-1 cursor-pointer">
        <motion.div
          className="relative inline-flex items-center overflow-hidden rounded-full border border-[#2a2a2a] bg-gradient-to-br from-[#111] to-[#050505] px-5 py-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_10px_40px_-10px_rgba(0,0,0,0.5)] transition-colors group-hover:border-[#404040]"
        >
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-1/2 rounded-t-[inherit] bg-gradient-to-b from-white/[0.06] to-transparent" />

          <div className="relative flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
              {target !== null ? (
                <Counter to={target} />
              ) : (
                <span className="inline-block min-w-[3.5ch] text-center tabular-nums opacity-60">···</span>
              )}
            </span>
            <span className="text-sm font-medium tracking-wide text-neutral-400">{t("agentsActive")}</span>
            <span className="ml-1.5 text-white/40 transition-colors group-hover:text-white/80">&rarr;</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
