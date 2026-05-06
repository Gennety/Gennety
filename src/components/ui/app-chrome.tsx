"use client";

import type { HTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const pageFrameClass = "px-5 py-7 sm:px-6 lg:px-8 lg:py-9";
export const pageTitleClass = "text-[1.875rem] font-semibold text-white";
export const pageSubtitleClass = "mt-2 max-w-2xl text-sm leading-6 text-neutral-400";
export const sectionDividerClass = "border-t border-white/[0.08] pt-6";
export const sectionShellClass = "group border-b border-white/[0.08] py-6 transition-colors hover:border-white/[0.14]";
export const sectionHeaderClass = "-mx-3 mb-4 rounded-xl px-3 py-2 transition-colors group-hover:bg-white/[0.03]";
export const sectionTitleClass = "text-[13px] font-semibold uppercase text-neutral-300 transition-colors group-hover:text-white";
export const sectionDescriptionClass = "mt-1.5 max-w-2xl text-[13px] leading-5 text-neutral-400";
export const panelClass = "rounded-xl bg-neutral-950/58 ring-1 ring-inset ring-white/[0.08]";
export const panelSoftClass = "rounded-xl bg-white/[0.035] ring-1 ring-inset ring-white/[0.07]";
export const codePanelClass = "rounded-xl bg-neutral-950/78 ring-1 ring-inset ring-white/[0.08]";
export const chipBaseClass = "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium";
export const mattePillBaseClass =
  "inline-flex min-h-7 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium leading-none";
export const subtleButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-neutral-950/58 px-4 py-2.5 text-sm font-medium text-neutral-300 ring-1 ring-inset ring-white/[0.10] transition hover:bg-neutral-900/80 hover:text-white hover:ring-white/[0.16] disabled:opacity-50";
export const subtleButtonSmallClass =
  "inline-flex min-h-9 items-center justify-center rounded-xl bg-neutral-950/58 px-3 py-2 text-[13px] font-medium text-neutral-300 ring-1 ring-inset ring-white/[0.10] transition hover:bg-neutral-900/80 hover:text-white hover:ring-white/[0.16] disabled:opacity-50";
export const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50";
export const primaryButtonSmallClass =
  "inline-flex min-h-9 items-center justify-center rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50";
export const dangerButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50";
export const dangerButtonSmallClass =
  "inline-flex min-h-9 items-center justify-center rounded-xl bg-red-500/90 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-red-500 disabled:opacity-50";
export const dangerSubtleButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-red-500/[0.12] px-4 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-500/[0.18] hover:text-red-100 disabled:opacity-50";
export const inputClass =
  "w-full min-h-10 rounded-xl bg-neutral-950/68 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 ring-1 ring-inset ring-white/[0.10] transition focus:outline-none focus:ring-white/[0.18]";
export const tabBaseClass =
  "inline-flex min-h-9 items-center rounded-full px-4 py-2 text-[13px] font-medium transition-all";
export const tabIdleClass =
  "bg-white/[0.04] text-neutral-400 ring-1 ring-inset ring-white/[0.07] hover:bg-white/[0.06] hover:text-neutral-200";
export const tabActiveClass =
  "bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.08)]";
export const metricCardClass = "rounded-xl bg-neutral-950/58 p-4 ring-1 ring-inset ring-white/[0.08]";

export type MattePillTone =
  | "neutral"
  | "muted"
  | "success"
  | "warning"
  | "info"
  | "blue"
  | "violet"
  | "gold";

const mattePillToneClass: Record<MattePillTone, string> = {
  neutral: "bg-white/[0.06] text-neutral-200",
  muted: "bg-white/[0.04] text-neutral-400",
  success: "bg-emerald-950/70 text-emerald-200",
  warning: "bg-amber-950/55 text-amber-200",
  info: "bg-sky-950/55 text-sky-200",
  blue: "bg-blue-950/45 text-blue-200",
  violet: "bg-indigo-950/45 text-indigo-200",
  gold: "bg-amber-950/42 text-amber-200",
};

const matteDotToneClass: Record<MattePillTone, string> = {
  neutral: "bg-white/72",
  muted: "bg-neutral-500",
  success: "bg-emerald-400",
  warning: "bg-amber-300",
  info: "bg-sky-300",
  blue: "bg-blue-300",
  violet: "bg-indigo-300",
  gold: "bg-amber-300",
};

const matteGlowOuterClass: Record<MattePillTone, string> = {
  neutral: "bg-white/[0.08]",
  muted: "bg-white/[0.06]",
  success: "bg-emerald-400/12",
  warning: "bg-amber-400/10",
  info: "bg-sky-400/12",
  blue: "bg-blue-400/12",
  violet: "bg-indigo-400/12",
  gold: "bg-amber-400/12",
};

const matteGlowMidClass: Record<MattePillTone, string> = {
  neutral: "bg-white/[0.14]",
  muted: "bg-white/[0.1]",
  success: "bg-emerald-400/18",
  warning: "bg-amber-400/15",
  info: "bg-sky-400/18",
  blue: "bg-blue-400/18",
  violet: "bg-indigo-400/18",
  gold: "bg-amber-400/18",
};

const matteGlowShadowClass: Record<MattePillTone, string> = {
  neutral: "",
  muted: "",
  success: "shadow-[0_0_10px_rgba(52,211,153,0.55)]",
  warning: "shadow-[0_0_10px_rgba(251,191,36,0.35)]",
  info: "shadow-[0_0_10px_rgba(125,211,252,0.4)]",
  blue: "shadow-[0_0_10px_rgba(96,165,250,0.4)]",
  violet: "shadow-[0_0_10px_rgba(129,140,248,0.38)]",
  gold: "shadow-[0_0_10px_rgba(245,158,11,0.32)]",
};

export function getMattePillClass(tone: MattePillTone = "neutral", className?: string) {
  return cx(mattePillBaseClass, mattePillToneClass[tone], className);
}

export function getMatteDotClass(tone: MattePillTone = "neutral", className?: string) {
  return cx("h-1.5 w-1.5 shrink-0 rounded-full", matteDotToneClass[tone], className);
}

export function LiveStatusDot({
  tone = "success",
  className,
}: {
  tone?: MattePillTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative inline-flex h-4 w-4 items-center justify-center rounded-full",
        matteGlowOuterClass[tone],
        className
      )}
    >
      <span className={cx("absolute h-2.5 w-2.5 rounded-full", matteGlowMidClass[tone])} />
      <span
        className={cx(
          "relative h-1.5 w-1.5 rounded-full",
          matteDotToneClass[tone],
          matteGlowShadowClass[tone]
        )}
      />
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className={pageTitleClass}>{title}</h1>
        {subtitle ? <p className={pageSubtitleClass}>{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Surface({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(panelClass, className)} {...props}>{children}</div>;
}

export function SoftSurface({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(panelSoftClass, className)} {...props}>{children}</div>;
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-xs font-medium uppercase text-neutral-500">
            {eyebrow}
          </p>
        ) : null}
        <h2 className={cx("text-[15px] font-semibold text-white", eyebrow && "mt-1")}>{title}</h2>
        {subtitle ? <p className="mt-1 text-[13px] leading-5 text-neutral-400">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  value,
  label,
  detail,
}: {
  value: ReactNode;
  label: string;
  detail?: string;
}) {
  return (
    <div className={metricCardClass}>
      <div className="text-[1.75rem] font-semibold leading-none text-white">
        {value}
      </div>
      <div className="mt-3 text-[13px] text-neutral-400">{label}</div>
      {detail ? <div className="mt-1 text-xs text-neutral-500">{detail}</div> : null}
    </div>
  );
}
