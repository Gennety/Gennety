/**
 * Seed demo network from test-data/demo-personas.json.
 *
 * Creates Owner + Agent + AgentContext (with embedding) for each persona.
 * All records get isDemo=true and a demoPersona JSON payload the responder
 * uses to condition its LLM calls.
 *
 * Idempotent: re-running only inserts personas whose email doesn't exist yet.
 *
 *   OPENAI_API_KEY=... npx tsx scripts/seed-demo-network.ts
 *
 * Required env:
 *   OPENAI_API_KEY         — used for embeddings (real key, ada-002 is cheap)
 *   DATABASE_URL / DIRECT_URL — Prisma
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { generateEmbedding, contextToEmbeddingText } from "../src/lib/embeddings";
import { demoConfig } from "../src/lib/config/demo";

const prisma = new PrismaClient();

type Persona = {
  name: string;
  email: string;
  agentId: string;
  niche: string;
  goal: "partnership" | "collaboration" | "mentor" | "peer";
  presetKey:
    | "high_active"
    | "medium_active"
    | "new_agent"
    | "aging_medium"
    | "stale_low"
    | "inactive";
  ownerName: string;
  ownerProfession: string;
  ownerDomain: string;
  ownerExperience: string;
  ownerGoals: string;
  ownerLocation: string;
  agentSpecialization: string;
  agentDomains: string[];
  agentConstraints: string;
  collaborationStyle: string;
  communicationStyle: string;
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  notLookingFor: string;
  recentProblems: string;
  recentWins: string;
  location: string;
  networkingGoal: "partnership" | "collaboration" | "mentor" | "peer";
  personalityTraits: string[];
  responseTempo: "fast" | "medium" | "slow";
  agreementBias: number;
};

// Same reputation presets as the main seed script.
const reputationPresets = {
  high_active:   { reputationScore: 82, reputationAcceptanceRate: 0.85, reputationNegotiationRate: 0.75, reputationCompletedMatches: 12, totalProposedMatches: 20, totalInitiatedNegotiations: 16, totalAcceptedByOwner: 17, totalNegotiationsAgreed: 12, interactionCount: 35, freshnessState: "ACTIVE"   as const, daysSinceUpdate: 3 },
  medium_active: { reputationScore: 58, reputationAcceptanceRate: 0.6,  reputationNegotiationRate: 0.5,  reputationCompletedMatches: 4,  totalProposedMatches: 10, totalInitiatedNegotiations: 8,  totalAcceptedByOwner: 6,  totalNegotiationsAgreed: 4,  interactionCount: 15, freshnessState: "ACTIVE"   as const, daysSinceUpdate: 10 },
  new_agent:     { reputationScore: 40, reputationAcceptanceRate: 0,    reputationNegotiationRate: 0,    reputationCompletedMatches: 0,  totalProposedMatches: 0,  totalInitiatedNegotiations: 0,  totalAcceptedByOwner: 0,  totalNegotiationsAgreed: 0,  interactionCount: 0,  freshnessState: "ACTIVE"   as const, daysSinceUpdate: 0 },
  aging_medium:  { reputationScore: 52, reputationAcceptanceRate: 0.5,  reputationNegotiationRate: 0.4,  reputationCompletedMatches: 3,  totalProposedMatches: 8,  totalInitiatedNegotiations: 5,  totalAcceptedByOwner: 4,  totalNegotiationsAgreed: 2,  interactionCount: 10, freshnessState: "AGING"    as const, daysSinceUpdate: 40 },
  stale_low:     { reputationScore: 28, reputationAcceptanceRate: 0.3,  reputationNegotiationRate: 0.2,  reputationCompletedMatches: 1,  totalProposedMatches: 6,  totalInitiatedNegotiations: 5,  totalAcceptedByOwner: 2,  totalNegotiationsAgreed: 1,  interactionCount: 8,  freshnessState: "STALE"    as const, daysSinceUpdate: 70 },
  inactive:      { reputationScore: 15, reputationAcceptanceRate: 0.2,  reputationNegotiationRate: 0.1,  reputationCompletedMatches: 0,  totalProposedMatches: 3,  totalInitiatedNegotiations: 2,  totalAcceptedByOwner: 1,  totalNegotiationsAgreed: 0,  interactionCount: 4,  freshnessState: "INACTIVE" as const, daysSinceUpdate: 100 },
} as const;

function generateApiKey(): string {
  return `gny_demo_${crypto.randomBytes(28).toString("hex")}`;
}

async function main() {
  const inputPath = process.env.DEMO_PERSONA_IN
    ?? path.resolve("test-data/demo-personas.json");

  if (!fs.existsSync(inputPath)) {
    console.error(`Personas file not found: ${inputPath}`);
    console.error("Run: npx tsx scripts/generate-demo-personas.ts");
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as {
    personas: Persona[];
  };
  console.log(`Loaded ${payload.personas.length} personas from ${inputPath}`);

  // Enforce cap.
  const existingDemoCount = await prisma.agent.count({ where: { isDemo: true } });
  const remaining = demoConfig.maxAgents - existingDemoCount;
  if (remaining <= 0) {
    console.error(`Demo agent cap reached: ${existingDemoCount}/${demoConfig.maxAgents}`);
    process.exit(1);
  }
  const personas = payload.personas.slice(0, remaining);
  if (personas.length < payload.personas.length) {
    console.log(`Capping at ${personas.length} (cap=${demoConfig.maxAgents})`);
  }

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    const existing = await prisma.owner.findUnique({ where: { email: p.email } });
    if (existing) {
      skipped++;
      continue;
    }

    const preset = reputationPresets[p.presetKey] ?? reputationPresets.new_agent;

    const owner = await prisma.owner.create({
      data: {
        email: p.email,
        name: p.name,
        networkingGoal: p.networkingGoal,
        privacyConsent: true,
        onboarded: true,
        isDemo: true,
        agentPlatform: "open_claw",
      },
    });

    const agent = await prisma.agent.create({
      data: {
        agentId: p.agentId,
        ownerId: owner.id,
        apiKey: generateApiKey(),
        displayName: p.name,
        isActive: preset.freshnessState !== "INACTIVE",
        isDemo: true,
        demoPersona: {
          niche: p.niche,
          personalityTraits: p.personalityTraits,
          responseTempo: p.responseTempo,
          agreementBias: p.agreementBias,
          communicationStyle: p.communicationStyle,
          collaborationStyle: p.collaborationStyle,
        },
        reputationScore: preset.reputationScore,
        reputationAcceptanceRate: preset.reputationAcceptanceRate,
        reputationNegotiationRate: preset.reputationNegotiationRate,
        reputationCompletedMatches: preset.reputationCompletedMatches,
        totalProposedMatches: preset.totalProposedMatches,
        totalInitiatedNegotiations: preset.totalInitiatedNegotiations,
        totalAcceptedByOwner: preset.totalAcceptedByOwner,
        totalNegotiationsAgreed: preset.totalNegotiationsAgreed,
        interactionCount: preset.interactionCount,
      },
    });

    const embeddingText = contextToEmbeddingText({
      currentWork: p.currentWork,
      expertise: p.expertise,
      lookingFor: p.lookingFor,
      notLookingFor: p.notLookingFor,
      recentProblems: p.recentProblems,
      recentWins: p.recentWins,
      networkingGoal: p.networkingGoal,
      ownerProfession: p.ownerProfession,
      ownerDomain: p.ownerDomain,
      ownerGoals: p.ownerGoals,
      agentSpecialization: p.agentSpecialization,
      agentDomains: p.agentDomains,
      collaborationStyle: p.collaborationStyle,
    });
    const embedding = await generateEmbedding(embeddingText);
    const hash = crypto.createHash("sha256")
      .update(JSON.stringify({
        currentWork: p.currentWork,
        expertise: p.expertise,
        lookingFor: p.lookingFor,
      }))
      .digest("hex");
    const lastSignificantUpdate = new Date(Date.now() - preset.daysSinceUpdate * 24 * 60 * 60 * 1000);

    await prisma.$executeRaw`
      INSERT INTO agent_contexts (
        id, agent_id,
        owner_name, owner_location, owner_profession, owner_domain, owner_experience, owner_goals,
        agent_specialization, agent_domains, agent_constraints,
        collaboration_style, communication_style,
        current_work, expertise, looking_for, not_looking_for, recent_problems, recent_wins,
        location, networking_goal,
        embedding, updated_at, previous_hash, freshness_state, last_significant_update_at
      )
      VALUES (
        ${`ctx_${agent.id}`},
        ${agent.id},
        ${p.ownerName},
        ${p.ownerLocation},
        ${p.ownerProfession},
        ${p.ownerDomain},
        ${p.ownerExperience},
        ${p.ownerGoals},
        ${p.agentSpecialization},
        ${p.agentDomains},
        ${p.agentConstraints},
        ${p.collaborationStyle},
        ${p.communicationStyle},
        ${p.currentWork},
        ${p.expertise},
        ${p.lookingFor},
        ${p.notLookingFor},
        ${p.recentProblems},
        ${p.recentWins},
        ${p.location},
        ${p.networkingGoal},
        ${embedding}::vector,
        NOW(),
        ${hash},
        ${preset.freshnessState}::"FreshnessState",
        ${lastSignificantUpdate}
      )
    `;

    created++;
    if (created % 10 === 0) console.log(`  ${created}/${personas.length}`);
  }

  console.log(`\nDone. Created: ${created}, skipped (existing): ${skipped}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
