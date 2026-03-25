import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function generateApiKey(): string {
  return `gny_${crypto.randomBytes(32).toString("hex")}`;
}

// Generate a random unit vector of given dimension
function randomUnitVector(dim: number, seed: number): number[] {
  // Simple seeded PRNG for reproducibility
  let s = seed;
  function next() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  }
  const v: number[] = [];
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    // Box-Muller for normal distribution
    const u1 = next() || 0.0001;
    const u2 = next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    v.push(z);
    norm += z * z;
  }
  norm = Math.sqrt(norm);
  return v.map((x) => x / norm);
}

// Create a similar vector (high cosine similarity) by adding small noise
function similarVector(base: number[], noise: number): number[] {
  const v = base.map((x) => x + (Math.random() - 0.5) * noise);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

const testUsers = [
  {
    name: "Alex Chen",
    email: "alex.chen.test@gennety.com",
    password: "TestPass123!",
    agentId: "agent_alex_chen_test",
    goal: "partnership" as const,
    context: {
      currentWork:
        "Building an AI-powered networking platform (Gennety) where personal agents find the right people through context-driven mutual matching",
      expertise: [
        "machine learning",
        "NLP",
        "Python",
        "system architecture",
        "AI agents",
        "LLM fine-tuning",
      ],
      lookingFor:
        "A technical co-founder with full-stack product design experience who can build beautiful, intuitive interfaces for complex AI-driven products",
      notLookingFor:
        "Backend-only engineers or people not interested in 0-to-1 product building",
      recentProblems:
        "Designing an intuitive UX for agent-to-agent negotiation results that feels human and trustworthy, not robotic",
      location: "San Francisco",
      networkingGoal: "partnership" as const,
    },
  },
  {
    name: "Maya Rodriguez",
    email: "maya.rodriguez.test@gennety.com",
    password: "TestPass123!",
    agentId: "agent_maya_rodriguez_test",
    goal: "partnership" as const,
    context: {
      currentWork:
        "Designing human-centered AI interfaces — focused on making complex AI systems feel approachable and trustworthy for everyday users",
      expertise: [
        "product design",
        "UX research",
        "design systems",
        "React",
        "TypeScript",
        "full-stack development",
        "AI/ML product design",
      ],
      lookingFor:
        "An AI/ML engineer building something ambitious in the agent or social intelligence space who needs a design-minded co-founder to shape the product experience",
      notLookingFor:
        "Enterprise SaaS or purely B2B infrastructure — I want to build products that real people interact with directly",
      recentProblems:
        "Figuring out how to visualize trust and transparency in AI-mediated human connections without overwhelming the user with technical details",
      location: "San Francisco",
      networkingGoal: "partnership" as const,
    },
  },
];

async function main() {
  console.log("Creating test pair for matching...\n");

  // Generate similar embeddings (1536 dims like ada-002)
  const baseEmbedding = randomUnitVector(1536, 42);
  const embeddings = [
    baseEmbedding,
    similarVector(baseEmbedding, 0.15), // ~0.92 cosine similarity
  ];

  const agents: Array<{ id: string; agentId: string }> = [];

  for (let i = 0; i < testUsers.length; i++) {
    const user = testUsers[i];
    const embedding = embeddings[i];

    const passwordHash = await bcrypt.hash(user.password, 12);

    // Upsert owner
    const owner = await prisma.owner.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        networkingGoal: user.goal,
        privacyConsent: true,
        researchConsent: true,
        onboarded: true,
      },
      create: {
        email: user.email,
        name: user.name,
        passwordHash,
        networkingGoal: user.goal,
        privacyConsent: true,
        researchConsent: true,
        onboarded: true,
      },
    });

    console.log(`  Owner: ${owner.name} (${owner.id})`);

    // Create consent logs (ignore duplicates)
    try {
      await prisma.consentLog.createMany({
        data: [
          { ownerId: owner.id, purpose: "A" },
          { ownerId: owner.id, purpose: "B" },
        ],
      });
    } catch {
      // already exists
    }

    // Upsert agent
    let agent = await prisma.agent.findUnique({ where: { ownerId: owner.id } });
    if (!agent) {
      agent = await prisma.agent.create({
        data: {
          agentId: user.agentId,
          ownerId: owner.id,
          apiKey: generateApiKey(),
          isActive: true,
          displayName: user.name,
        },
      });
    }

    agents.push({ id: agent.id, agentId: agent.agentId });
    console.log(`  Agent: ${agent.agentId} (${agent.id})`);

    // Upsert context with embedding via raw SQL
    const existingContext = await prisma.agentContext.findUnique({
      where: { agentId: agent.id },
    });

    const embStr = `[${embedding.join(",")}]`;

    if (existingContext) {
      await prisma.$executeRawUnsafe(
        `UPDATE agent_contexts SET
          current_work = $1, expertise = $2, looking_for = $3,
          not_looking_for = $4, recent_problems = $5, location = $6,
          networking_goal = $7, embedding = $8::vector, updated_at = NOW()
        WHERE agent_id = $9`,
        user.context.currentWork,
        user.context.expertise,
        user.context.lookingFor,
        user.context.notLookingFor ?? null,
        user.context.recentProblems ?? null,
        user.context.location ?? null,
        user.context.networkingGoal,
        embStr,
        agent.id
      );
    } else {
      const ctxId = `ctx_${crypto.randomBytes(12).toString("hex")}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO agent_contexts (id, agent_id, current_work, expertise, looking_for, not_looking_for, recent_problems, location, networking_goal, embedding, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, NOW())`,
        ctxId,
        agent.id,
        user.context.currentWork,
        user.context.expertise,
        user.context.lookingFor,
        user.context.notLookingFor ?? null,
        user.context.recentProblems ?? null,
        user.context.location ?? null,
        user.context.networkingGoal,
        embStr
      );
    }

    console.log(`  Context published with embedding (1536 dims)`);
    console.log(`  API Key: ${agent.apiKey}\n`);
  }

  // Create a PROPOSED match between the two agents
  if (agents.length === 2) {
    const existingMatch = await prisma.match.findFirst({
      where: {
        OR: [
          { agentAId: agents[0].id, agentBId: agents[1].id },
          { agentAId: agents[1].id, agentBId: agents[0].id },
        ],
      },
    });

    if (!existingMatch) {
      const match = await prisma.match.create({
        data: {
          agentAId: agents[0].id,
          agentBId: agents[1].id,
          overlapSummary:
            "Alex is building an AI networking platform and needs a design-minded co-founder. Maya specializes in human-centered AI interfaces and is looking for an ML engineer building in the social intelligence space. Both are in San Francisco, both want a co-founder, and their skills are perfectly complementary — Alex brings the AI/ML engine, Maya brings the product design experience.",
          framingForA:
            "Maya is a full-stack product designer specializing in human-centered AI interfaces. She's looking for an AI/ML engineer building something ambitious in social intelligence — exactly what you're doing with Gennety. She could help you solve the UX challenge of making agent negotiations feel trustworthy.",
          framingForB:
            "Alex is building Gennety, an AI-powered networking platform where agents find the right people through context matching. He needs a design co-founder to shape the product experience — your exact expertise in making complex AI systems approachable for everyday users.",
          status: "PROPOSED",
          proposedAt: new Date(),
        },
      });
      console.log(`  Match created: ${match.id} (PROPOSED)`);
    } else {
      console.log(`  Match already exists: ${existingMatch.id} (${existingMatch.status})`);
    }
  }

  console.log("\nDone! Both test users are ready.");
  console.log("  Alex: alex.chen.test@gennety.com / TestPass123!");
  console.log("  Maya: maya.rodriguez.test@gennety.com / TestPass123!");

  await prisma.$disconnect();
}

main().catch(console.error);
