"use client";

import { useLocale, useTranslations } from "next-intl";

interface LogEntry {
  role: "initiator" | "responder";
  displayName: string;
  type: string;
  content: string;
  createdAt: string;
}

interface NegotiationTimelineProps {
  logs: LogEntry[];
}

const typeColors: Record<string, string> = {
  reasoning: "text-neutral-300",
  proposal: "text-neutral-300",
  evaluation: "text-neutral-300",
  agreement: "text-neutral-100",
  decline: "text-neutral-500",
};

function formatTimestamp(dateStr: string, locale: string) {
  const d = new Date(dateStr);
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  const month = d.toLocaleString(locale, { month: "short" });
  const day = d.getDate();
  return `${hours}:${mins} · ${month} ${day}`;
}

export function NegotiationTimeline({ logs }: NegotiationTimelineProps) {
  const locale = useLocale();
  const t = useTranslations("landing");

  function getTypeLabel(type: string) {
    switch (type) {
      case "reasoning":
        return t("timelineTypeReasoning");
      case "proposal":
        return t("timelineTypeProposal");
      case "evaluation":
        return t("timelineTypeEvaluation");
      case "agreement":
        return t("timelineTypeAgreement");
      case "decline":
        return t("timelineTypeDecline");
      default:
        return type;
    }
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-600 mb-8">
        {t("timelineTitle")}
      </p>

      <div className="space-y-4">
        {logs.map((log, i) => {
          const isAgreement = log.type === "agreement";
          const isDecline = log.type === "decline";
          const colorClass = typeColors[log.type] || "text-neutral-600";

          let borderClass = "border-white/[0.06]";
          let bgClass = "bg-white/[0.02]";

          if (isAgreement) {
            borderClass = "border-white/[0.08]";
            bgClass = "bg-white/[0.04]";
          } else if (isDecline) {
            borderClass = "border-white/[0.05]";
            bgClass = "bg-white/[0.015]";
          }

          return (
            <div
              key={i}
              className={`border ${borderClass} rounded-xl p-6 ${bgClass}`}
            >
              {/* Step header */}
              <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-4">
                {t("timelineStep", { step: i + 1 })} ·{" "}
                <span className={colorClass}>{getTypeLabel(log.type)}</span>
              </p>

              {/* Agent info */}
              {isAgreement ? (
                <p className="text-sm font-medium text-neutral-100 mb-2">
                  <span className="mr-2">&#10003;</span>{t("timelineMutualAgreement")}
                </p>
              ) : isDecline ? (
                <p className="text-sm font-medium text-neutral-400 mb-2">
                  {t("timelineDeclined")}
                </p>
              ) : (
                <p className="text-sm font-medium text-white mb-2">
                  {t("timelineAgent", { name: log.displayName })}
                  {log.type === "proposal" && (
                    <span className="text-xs text-neutral-500 ml-2">
                      &rarr; {t("timelineProposalBadge")}
                    </span>
                  )}
                </p>
              )}

              {/* Content */}
              <p
                className={`text-sm font-mono leading-relaxed whitespace-pre-wrap ${
                  isAgreement
                    ? "text-neutral-200"
                    : isDecline
                    ? "text-neutral-400"
                    : "text-neutral-400"
                }`}
              >
                {log.content}
              </p>

              {/* Timestamp */}
              <p className="text-[10px] text-neutral-700 text-right mt-4">
                {formatTimestamp(log.createdAt, locale)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
