import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAnalyticsEvent, recordComputeUsage } from "@/lib/analytics-tracking";
import { createInboxEvent } from "@/lib/services/inbox";
import { signalAgentWork } from "@/lib/services/agent-delivery";
import {
  assertCommunityBudgetAvailable,
  canSpendCommunityTokens,
  estimateStrategyTokens,
  getCommunityBudgetState,
} from "@/lib/services/community-budget";
import {
  createCommunityKnowledgeSource,
  ingestCommunityKnowledgeDocument,
} from "@/lib/services/community-knowledge";
import type { StrategyClaim, JudgeVerdict } from "@/types/community-strategy";

const STRATEGY_LOCK_MS = 30 * 60 * 1000;

export interface StrategyEvidence {
  id: string;
  type: "knowledge" | "member" | "compute" | "proposal" | "beacon";
  title: string;
  content: string;
}

export function judgeStrategyClaims(claims: StrategyClaim[], maxIterations: number): JudgeVerdict {
  const acceptedClaims: StrategyClaim[] = [];
  const rejectedClaims: StrategyClaim[] = [];
  const seen = new Set<string>();

  for (const claim of claims.slice(0, Math.max(1, maxIterations) * 25)) {
    const key = claim.claim.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (claim.evidenceIds.length === 0) {
      rejectedClaims.push({
        ...claim,
        confidence: Math.min(claim.confidence, 0.35),
        requiresHumanApproval: true,
      });
      continue;
    }

    acceptedClaims.push({
      ...claim,
      confidence: Math.min(0.95, Math.max(0.4, claim.confidence)),
      requiresHumanApproval: true,
    });
  }

  return {
    acceptedClaims,
    rejectedClaims,
    summary:
      acceptedClaims.length > 0
        ? `${acceptedClaims.length} evidence-backed strategic signal(s) accepted.`
        : "No evidence-backed strategic signals were accepted.",
    counterEvidence:
      rejectedClaims.length > 0
        ? rejectedClaims.map((claim) => `Rejected uncited claim: ${claim.claim}`)
        : ["none_found"],
  };
}

function lexicalScore(query: string, candidate: string) {
  const q = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((item) => item.length > 3)
  );
  if (q.size === 0) return 0;
  const c = new Set(
    candidate
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((item) => item.length > 3)
  );
  let overlap = 0;
  for (const token of q) {
    if (c.has(token)) overlap += 1;
  }
  return overlap / q.size;
}

async function buildEvidenceBundle(communityId: string): Promise<StrategyEvidence[]> {
  const [chunks, proposals, usage] = await Promise.all([
    prisma.communityKnowledgeChunk.findMany({
      where: {
        communityId,
        privacyLevel: { in: ["COMMUNITY", "ADMINS"] },
        document: { status: "ACTIVE" },
      },
      include: {
        document: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 16,
    }),
    prisma.communityActionProposal.findMany({
      where: { communityId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.computeUsage.aggregate({
      where: {
        communityId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _sum: {
        tokensInput: true,
        tokensOutput: true,
        costUsd: true,
      },
    }),
  ]);

  const evidence: StrategyEvidence[] = chunks.map((chunk) => ({
    id: chunk.id,
    type: "knowledge",
    title: chunk.document.title,
    content: chunk.content,
  }));

  proposals.forEach((proposal) => {
    evidence.push({
      id: proposal.id,
      type: "proposal",
      title: proposal.title,
      content: proposal.summary,
    });
  });

  const tokens = (usage._sum.tokensInput ?? 0) + (usage._sum.tokensOutput ?? 0);
  evidence.push({
    id: `compute:${communityId}:7d`,
    type: "compute",
    title: "7-day compute usage",
    content: `Tokens: ${tokens}; costUsd: ${(usage._sum.costUsd ?? 0).toFixed(4)}`,
  });

  return evidence;
}

async function findPartnershipCandidates(community: {
  id: string;
  name: string;
  description: string | null;
  knowledgeSummary: string | null;
}, excludedAgentIds: string[] = []) {
  const query = [community.name, community.description, community.knowledgeSummary].filter(Boolean).join(" ");
  if (!query.trim()) return [];

  const contexts = await prisma.agentContext.findMany({
    where: {
      agent: {
        isActive: true,
        searchPaused: false,
        ...(excludedAgentIds.length > 0 ? { id: { notIn: excludedAgentIds } } : {}),
      },
      freshnessState: { notIn: ["STALE", "INACTIVE"] },
    },
    include: {
      agent: {
        select: {
          id: true,
          agentId: true,
          ownerId: true,
          displayName: true,
          reputationScore: true,
        },
      },
    },
    take: 50,
  });

  return contexts
    .map((context) => {
      const text = [
        context.currentWork,
        context.lookingFor,
        context.ownerDomain,
        context.ownerProfession,
        context.agentSpecialization,
        context.expertise.join(" "),
      ]
        .filter(Boolean)
        .join(" ");
      return {
        agentId: context.agent.id,
        externalAgentId: context.agent.agentId,
        ownerId: context.agent.ownerId,
        displayName: context.agent.displayName,
        score: lexicalScore(query, text),
        currentWork: context.currentWork,
        lookingFor: context.lookingFor,
        reputationScore: Math.round(context.agent.reputationScore),
      };
    })
    .filter((candidate) => candidate.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function buildParticipantClaims(args: {
  memberId: string;
  ownerName: string | null;
  role: string;
  hubSpecialization: string | null;
  expertise: string[];
}): StrategyClaim[] {
  const label = args.ownerName ?? "Community member";
  const specialization = args.hubSpecialization ?? args.expertise[0] ?? null;
  if (!specialization) return [];

  return [
    {
      claim: `${label} should be considered for ${specialization} work inside the hub.`,
      evidenceIds: [`member:${args.memberId}`],
      confidence: 0.62,
      risk: "May conflict with human workload preferences.",
      recommendedAction: "Ask an admin to confirm capacity before assigning work.",
      requiresHumanApproval: true,
    },
  ];
}

export async function runCommunityStrategySession(communityId: string, scheduledFor = new Date()) {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: {
          owner: {
            include: {
              agent: {
                include: { context: true },
              },
            },
          },
        },
      },
    },
  });

  if (!community) throw new Error(`Community not found: ${communityId}`);
  if (!community.strategyEnabled) {
    return { skipped: true, reason: "strategy_disabled" };
  }

  const budgetState = await getCommunityBudgetState(communityId);
  const session = await prisma.communityStrategySession.create({
    data: {
      communityId,
      status: "RUNNING",
      scheduledFor,
      startedAt: new Date(),
      maxRounds: 2,
      judgeIterationLimit: community.judgeIterationLimit,
      tokenLimit: community.strategyTokenLimit,
    },
  });

  try {
    const evidence = await buildEvidenceBundle(communityId);
    const evidenceText = evidence.map((item) => `${item.id}: ${item.title}\n${item.content}`).join("\n\n");
    const evidenceTokens = estimateStrategyTokens(evidenceText);
    const preflight = canSpendCommunityTokens({
      requestedTokens: evidenceTokens,
      sessionTokenLimit: community.strategyTokenLimit,
      sessionTokensUsed: 0,
      monthlyTokenLimit: budgetState.monthlyTokenLimit,
      monthTokensUsed: budgetState.monthTokensUsed,
    });

    if (!preflight.allowed) {
      await prisma.communityStrategySession.update({
        where: { id: session.id },
        data: {
          status: "SKIPPED_BUDGET",
          completedAt: new Date(),
          failureReason: preflight.reason,
        },
      });
      return { skipped: true, reason: preflight.reason, sessionId: session.id };
    }

    await assertCommunityBudgetAvailable({
      communityId,
      requestedTokens: evidenceTokens,
      sessionTokensUsed: 0,
      sessionTokenLimit: community.strategyTokenLimit,
    });

    await prisma.communityStrategyTurn.create({
      data: {
        sessionId: session.id,
        communityId,
        role: "SYSTEM",
        round: 0,
        output: { evidence } as unknown as Prisma.InputJsonValue,
        tokensInput: evidenceTokens,
        tokensOutput: 0,
      },
    });

    const memberEvidence: StrategyEvidence[] = community.members.map((member) => ({
      id: `member:${member.id}`,
      type: "member",
      title: member.owner.name ?? "Community member",
      content: [
        member.hubSpecialization,
        member.owner.agent?.context?.currentWork,
        member.owner.agent?.context?.expertise.join(", "),
      ]
        .filter(Boolean)
        .join(" | "),
    }));
    const allEvidence = [...evidence, ...memberEvidence];
    const evidenceIds = new Set(allEvidence.map((item) => item.id));

    const participantClaims = community.members.flatMap((member) => {
      if (!member.agentParticipationEnabled) return [];
      return buildParticipantClaims({
        memberId: member.id,
        ownerName: member.owner.name,
        role: member.role,
        hubSpecialization: member.hubSpecialization,
        expertise: member.owner.agent?.context?.expertise ?? member.skillTags,
      });
    });

    const sanitizedClaims = participantClaims.map((claim) => ({
      ...claim,
      evidenceIds: claim.evidenceIds.filter((id) => evidenceIds.has(id)),
    }));

    await prisma.communityStrategyTurn.create({
      data: {
        sessionId: session.id,
        communityId,
        role: "PARTICIPANT",
        round: 1,
        output: { claims: sanitizedClaims } as Prisma.InputJsonValue,
        tokensInput: estimateStrategyTokens(JSON.stringify(memberEvidence)),
        tokensOutput: estimateStrategyTokens(JSON.stringify(sanitizedClaims)),
      },
    });

    const verdict = judgeStrategyClaims(sanitizedClaims, community.judgeIterationLimit);
    const partnershipCandidates = await findPartnershipCandidates(
      community,
      community.members.map((member) => member.owner.agent?.id).filter((id): id is string => !!id)
    );
    const summary = [
      verdict.summary,
      partnershipCandidates.length > 0
        ? `${partnershipCandidates.length} cross-network partnership candidate(s) found.`
        : "No strong cross-network partnership candidates found.",
    ].join(" ");

    await prisma.communityStrategyTurn.create({
      data: {
        sessionId: session.id,
        communityId,
        role: "JUDGE",
        round: 2,
        output: {
          verdict,
          partnership_candidates: partnershipCandidates,
        } as Prisma.InputJsonValue,
        tokensInput: estimateStrategyTokens(JSON.stringify(sanitizedClaims)),
        tokensOutput: estimateStrategyTokens(summary),
      },
    });

    const totalTokens =
      evidenceTokens +
      estimateStrategyTokens(JSON.stringify(memberEvidence)) +
      estimateStrategyTokens(JSON.stringify(sanitizedClaims)) +
      estimateStrategyTokens(summary);

    await recordComputeUsage({
      category: "COMMUNITY_STRATEGY",
      provider: "gennety",
      model: "deterministic-judge-v1",
      operation: "community_strategy_session",
      communityId,
      strategySessionId: session.id,
      tokensInput: totalTokens,
      tokensOutput: 0,
      costUsd: 0,
      metadata: {
        accepted_claims: verdict.acceptedClaims.length,
        rejected_claims: verdict.rejectedClaims.length,
        partnership_candidates: partnershipCandidates.length,
      },
    });

    const proposals: Array<{
      type: "WORKLOAD_REBALANCE" | "KNOWLEDGE_GAP" | "PARTNERSHIP_OUTREACH";
      title: string;
      summary: string;
      evidenceIds: string[];
      payload: Prisma.InputJsonValue;
      judgeConfidence: number;
    }> = [];

    if (verdict.acceptedClaims.length > 0) {
      proposals.push({
        type: "WORKLOAD_REBALANCE",
        title: "Review member specialization and workload",
        summary: verdict.acceptedClaims.map((claim) => claim.claim).join("\n"),
        evidenceIds: verdict.acceptedClaims.flatMap((claim) => claim.evidenceIds),
        payload: { claims: verdict.acceptedClaims } as Prisma.InputJsonValue,
        judgeConfidence: Math.max(...verdict.acceptedClaims.map((claim) => claim.confidence)),
      });
    }

    if (evidence.filter((item) => item.type === "knowledge").length === 0) {
      proposals.push({
        type: "KNOWLEDGE_GAP",
        title: "Seed the hub SSOT",
        summary: "The strategy session found no active knowledge chunks. Add GitHub, Notion, or distilled manual context before relying on strategic debate output.",
        evidenceIds: [],
        payload: { missing: "community_knowledge_chunks" } as Prisma.InputJsonValue,
        judgeConfidence: 0.82,
      });
    }

    if (partnershipCandidates.length > 0) {
      proposals.push({
        type: "PARTNERSHIP_OUTREACH",
        title: "Review cross-network partnership candidates",
        summary: partnershipCandidates
          .map((candidate) => `${candidate.externalAgentId}: ${candidate.currentWork}`)
          .join("\n"),
        evidenceIds: ["compute:" + communityId + ":7d"],
        payload: { candidates: partnershipCandidates } as Prisma.InputJsonValue,
        judgeConfidence: partnershipCandidates[0].score,
      });
    }

    for (const proposal of proposals) {
      await prisma.communityActionProposal.create({
        data: {
          communityId,
          sessionId: session.id,
          type: proposal.type,
          title: proposal.title,
          summary: proposal.summary,
          evidenceIds: proposal.evidenceIds,
          payload: proposal.payload,
          judgeConfidence: proposal.judgeConfidence,
          requiresRole: "ADMIN",
        },
      });
    }

    const strategySource = await createCommunityKnowledgeSource(communityId, {
      type: "STRATEGY_OUTPUT",
      name: `Strategy session ${session.id}`,
      config: { session_id: session.id },
    });
    await ingestCommunityKnowledgeDocument(
      communityId,
      {
        sourceId: strategySource.id,
        externalId: session.id,
        title: `Strategy session ${new Date().toISOString()}`,
        rawContent: summary,
        tags: ["strategy", "judge"],
        privacyLevel: "ADMINS",
        metadata: { session_id: session.id },
      },
      { embed: false }
    );

    const updatedSession = await prisma.communityStrategySession.update({
      where: { id: session.id },
      data: {
        status: totalTokens > community.strategyTokenLimit ? "PARTIAL" : "COMPLETED",
        completedAt: new Date(),
        tokensUsed: totalTokens,
        summary,
        judgeVerdict: verdict as Prisma.InputJsonValue,
        partnershipCandidates: partnershipCandidates as Prisma.InputJsonValue,
      },
    });

    await prisma.community.update({
      where: { id: communityId },
      data: {
        lastStrategySessionAt: new Date(),
        nextStrategySessionAt: new Date(Date.now() + community.strategyIntervalHours * 60 * 60 * 1000),
        strategyLockUntil: null,
        knowledgeSummary: summary,
      },
    });

    const managers = community.members.filter((member) => ["OWNER", "ADMIN"].includes(member.role));
    await Promise.all(
      managers
        .map((member) => member.owner.agent)
        .filter((agent): agent is NonNullable<typeof agent> => !!agent)
        .map(async (agent) => {
          await createInboxEvent({
            ownerId: agent.ownerId,
            agentId: agent.id,
            type: "COMMUNITY_STRATEGY_COMPLETED",
            referenceId: session.id,
            payload: {
              community_id: communityId,
              session_id: session.id,
              status: updatedSession.status,
              summary,
              action_proposals: proposals.length,
            },
          });
          await signalAgentWork({
            agentId: agent.id,
            kind: "COMMUNITY_STRATEGY_COMPLETED",
            reason: "Community strategy session completed",
            referenceId: session.id,
            urgency: proposals.length > 0 ? "high" : "normal",
          });
        })
    ).catch((error) => console.error("[community-strategy] Manager notification failed:", error));

    await recordAnalyticsEvent({
      type: "COMMUNITY_STRATEGY_COMPLETED",
      communityId,
      strategySessionId: session.id,
      metadata: {
        status: updatedSession.status,
        action_proposals: proposals.length,
        tokens_used: totalTokens,
      },
    });

    return {
      sessionId: session.id,
      status: updatedSession.status,
      actionProposals: proposals.length,
      tokensUsed: totalTokens,
    };
  } catch (error) {
    await prisma.communityStrategySession.update({
      where: { id: session.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        failureReason: error instanceof Error ? error.message : String(error),
      },
    });
    await prisma.community.update({
      where: { id: communityId },
      data: { strategyLockUntil: null },
    });
    throw error;
  }
}

export async function runDueCommunityStrategySessions(limit = 3) {
  const now = new Date();
  const dueCommunities = await prisma.community.findMany({
    where: {
      status: "ACTIVE",
      strategyEnabled: true,
      OR: [
        { nextStrategySessionAt: null },
        { nextStrategySessionAt: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { strategyLockUntil: null },
            { strategyLockUntil: { lt: now } },
          ],
        },
      ],
    },
    select: { id: true },
    take: limit,
    orderBy: { nextStrategySessionAt: "asc" },
  });

  const results = [];
  for (const community of dueCommunities) {
    const locked = await prisma.community.updateMany({
      where: {
        id: community.id,
        OR: [
          { strategyLockUntil: null },
          { strategyLockUntil: { lt: now } },
        ],
      },
      data: {
        strategyLockUntil: new Date(Date.now() + STRATEGY_LOCK_MS),
      },
    });

    if (locked.count === 0) continue;
    results.push(await runCommunityStrategySession(community.id, now));
  }

  return {
    checked: dueCommunities.length,
    ran: results.length,
    results,
  };
}
