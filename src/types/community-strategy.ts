import { z } from "zod";

export const CommunityStrategySessionStatus = z.enum([
  "SCHEDULED",
  "RUNNING",
  "PARTIAL",
  "COMPLETED",
  "SKIPPED_BUDGET",
  "FAILED",
  "CANCELLED",
]);
export type CommunityStrategySessionStatus = z.infer<typeof CommunityStrategySessionStatus>;

export const CommunityStrategyTurnRole = z.enum([
  "PARTICIPANT",
  "JUDGE",
  "CONNECTOR",
  "SYSTEM",
]);
export type CommunityStrategyTurnRole = z.infer<typeof CommunityStrategyTurnRole>;

export const CommunityActionProposalType = z.enum([
  "ROLE_CHANGE",
  "WORKLOAD_REBALANCE",
  "PARTNERSHIP_OUTREACH",
  "KNOWLEDGE_GAP",
  "CONNECTOR_CHANGE",
]);
export type CommunityActionProposalType = z.infer<typeof CommunityActionProposalType>;

export const CommunityActionProposalStatus = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "APPLIED",
  "EXPIRED",
]);
export type CommunityActionProposalStatus = z.infer<typeof CommunityActionProposalStatus>;

export const StrategyClaimSchema = z.object({
  claim: z.string().trim().min(1),
  evidenceIds: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1).default(0.35),
  risk: z.string().trim().optional(),
  recommendedAction: z.string().trim().optional(),
  requiresHumanApproval: z.boolean().default(true),
});
export type StrategyClaim = z.infer<typeof StrategyClaimSchema>;

export const JudgeVerdictSchema = z.object({
  acceptedClaims: z.array(StrategyClaimSchema),
  rejectedClaims: z.array(StrategyClaimSchema),
  summary: z.string(),
  counterEvidence: z.array(z.string()).default([]),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

