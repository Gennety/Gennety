import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_OWNER_EMAIL = "demo.chat.nora@gennety.dev";
const DEMO_AGENT_ID = "agent_demo_nora_chat_001";

function generateApiKey() {
  return `gny_demo_${crypto.randomBytes(16).toString("hex")}`;
}

function humanProfile(owner) {
  const ownerName = owner.name?.trim() || "Gleb";

  return {
    ownerName,
    ownerLocation: "Kyiv, Ukraine",
    ownerProfession: "Founder building an AI-native networking product",
    ownerDomain: "AI agents and product strategy",
    ownerExperience: "6+ years across product, growth, and shipping internet products",
    ownerGoals:
      "Turn Gennety into a believable, demo-ready product where agents create introductions that feel genuinely relevant",
    agentSpecialization:
      "Finding collaborators who can improve trust, onboarding, and chat UX in agent-mediated networking",
    agentDomains: [
      "AI agents",
      "product strategy",
      "trust design",
      "growth experiments",
    ],
    agentConstraints:
      "Prefer hands-on builders who can ship fast and improve user-facing polish",
    collaborationStyle:
      "Fast async iterations, short feedback loops, concrete prototypes over long planning cycles",
    communicationStyle:
      "Direct, practical, and detail-oriented; prefers examples over abstract discussion",
    currentWork:
      "Shipping Gennety, an AI networking product where agents negotiate introductions before the humans ever see a match",
    expertise: [
      "product strategy",
      "AI product design",
      "growth experiments",
      "founder-led development",
      "user research",
    ],
    lookingFor:
      "Product-minded engineers and designers who can sharpen onboarding, trust signals, and the chat experience in agent-mediated networking",
    notLookingFor:
      "Generic advisors without strong product taste or willingness to build",
    recentProblems:
      "Making the match-to-chat flow feel believable and trustworthy enough for a live demo without overbuilding the system",
    recentWins:
      "Built the first end-to-end mutual-match-to-chat loop and can now demo the core interaction cleanly",
    location: "Kyiv, Ukraine",
    networkingGoal: "collaboration",
  };
}

const demoProfile = {
  ownerName: "Nora Hart",
  ownerLocation: "Berlin, Germany",
  ownerProfession: "Product designer for AI trust and conversation systems",
  ownerDomain: "AI UX and trust design",
  ownerExperience:
    "8 years in product design, including conversational products and high-trust B2B workflows",
  ownerGoals:
    "Help AI-mediated products feel transparent, confident, and human without turning them into dashboards",
  agentSpecialization:
    "Finding founders building AI products that need sharper trust signals and more believable first-use experiences",
  agentDomains: [
    "AI UX",
    "trust design",
    "conversation design",
    "product systems",
  ],
  agentConstraints:
    "Wants founders who care about nuance and actual user trust, not just visual polish",
  collaborationStyle:
    "Works through concrete product critiques, annotated mockups, and focused working sessions",
  communicationStyle:
    "Warm, incisive, and very specific about why an interaction does or does not feel credible",
  currentWork:
    "Designing trust signals and conversational UX for AI-assisted professional introductions and warm-start chats",
  expertise: [
    "product design",
    "conversation UX",
    "trust systems",
    "Figma",
    "research synthesis",
  ],
  lookingFor:
    "Founders actively shipping AI-mediated networking or collaboration products who need help making first interactions feel trustworthy",
  notLookingFor:
    "Purely internal tooling or products where the human emotional layer does not matter",
  recentProblems:
    "Deciding how much agent reasoning to reveal before it starts feeling robotic instead of reassuring",
  recentWins:
    "Turned a brittle AI handoff flow into a confident first-message experience that doubled reply rates in a private beta",
  location: "Berlin, Germany",
  networkingGoal: "collaboration",
};

function initialMessages(ownerName) {
  return [
    {
      fromOwner: "agent_a",
      kind: "AGENT_INTRO",
      content:
        "Nora works on trust signals for AI-mediated introductions. Her lens is useful because Gennety already has a working match-to-chat loop and now needs the interaction to feel credible, calm, and specific.",
      hoursAgo: 20,
    },
    {
      fromOwner: "agent_b",
      kind: "AGENT_INTRO",
      content:
        `${ownerName} is actively shipping Gennety and focusing on the exact moment where an AI match turns into a human conversation. That is the product moment Nora obsesses over.`,
      hoursAgo: 19.9,
    },
    {
      fromOwner: "demo_owner",
      kind: "HUMAN",
      content:
        `Hey ${ownerName}. Your agent summary on Gennety was immediately clear to me. I spend most of my time on the moment where an AI system says "trust me, this intro makes sense" without sounding mechanical.`,
      hoursAgo: 4.5,
    },
    {
      fromOwner: "demo_owner",
      kind: "HUMAN",
      content:
        "The specific part I would love to compare notes on is how much reasoning to reveal before the first human message. Too little feels magical; too much feels like a debug log.",
      hoursAgo: 3.75,
    },
    {
      fromOwner: "demo_owner",
      kind: "HUMAN",
      content:
        "If useful, I can sketch a lightweight trust checklist for the profile -> match -> chat transition and we can see where the product currently feels strongest or weakest.",
      hoursAgo: 2.5,
    },
  ];
}

async function ensureDemoOwnerAndAgent() {
  const owner = await prisma.owner.upsert({
    where: { email: DEMO_OWNER_EMAIL },
    update: {
      name: "Nora Hart",
      networkingGoal: "collaboration",
      privacyConsent: true,
      researchConsent: true,
      onboarded: true,
      isDemo: true,
    },
    create: {
      email: DEMO_OWNER_EMAIL,
      name: "Nora Hart",
      networkingGoal: "collaboration",
      privacyConsent: true,
      researchConsent: true,
      onboarded: true,
      isDemo: true,
    },
  });

  let agent = await prisma.agent.findUnique({
    where: { ownerId: owner.id },
    include: { context: true },
  });

  if (!agent) {
    agent = await prisma.agent.create({
      data: {
        agentId: DEMO_AGENT_ID,
        ownerId: owner.id,
        apiKey: generateApiKey(),
        isActive: true,
        displayName: "Nora Hart",
        isDemo: true,
        demoPersona: {
          archetype: "AI trust designer",
          tone: "warm, sharp, specific",
          responseStyle: "practical product critique with concrete suggestions",
          interests: [
            "agent trust",
            "onboarding UX",
            "conversation design",
            "first-message clarity",
          ],
        },
      },
      include: { context: true },
    });
  } else if (!agent.isDemo || agent.displayName !== "Nora Hart") {
    agent = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        isDemo: true,
        displayName: "Nora Hart",
        demoPersona: {
          archetype: "AI trust designer",
          tone: "warm, sharp, specific",
          responseStyle: "practical product critique with concrete suggestions",
          interests: [
            "agent trust",
            "onboarding UX",
            "conversation design",
            "first-message clarity",
          ],
        },
      },
      include: { context: true },
    });
  }

  if (agent.context) {
    await prisma.agentContext.update({
      where: { agentId: agent.id },
      data: demoProfile,
    });
  } else {
    await prisma.agentContext.create({
      data: {
        agentId: agent.id,
        ...demoProfile,
      },
    });
  }

  return { owner, agent };
}

async function loadTargets(emails) {
  if (emails.length > 0) {
    return prisma.owner.findMany({
      where: { email: { in: emails }, onboarded: true },
      include: { agent: { include: { context: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  const likelyGlebAccounts = await prisma.owner.findMany({
    where: {
      onboarded: true,
      OR: [
        { email: { contains: "gleb", mode: "insensitive" } },
        { name: { contains: "глеб", mode: "insensitive" } },
        { name: { contains: "gleb", mode: "insensitive" } },
      ],
    },
    include: { agent: { include: { context: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (likelyGlebAccounts.length > 0) {
    return likelyGlebAccounts;
  }

  return prisma.owner.findMany({
    where: {
      onboarded: true,
      email: {
        notIn: ["arlan@example.com", "e2e_test_1774997875@gennety.dev"],
      },
    },
    include: { agent: { include: { context: true } } },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
}

async function ensureHumanContext(target) {
  if (!target.agent) {
    throw new Error(`Owner ${target.email} does not have an agent yet`);
  }

  const profile = humanProfile(target);

  await prisma.owner.update({
    where: { id: target.id },
    data: {
      networkingGoal: profile.networkingGoal,
    },
  });

  await prisma.agent.update({
    where: { id: target.agent.id },
    data: {
      displayName: target.agent.displayName ?? target.name ?? profile.ownerName,
    },
  });

  if (target.agent.context) {
    return { updated: false, profile };
  }

  await prisma.agentContext.create({
    data: {
      agentId: target.agent.id,
      ...profile,
    },
  });

  return { updated: true, profile };
}

async function recreateMatchAndChat({ target, demoAgent, demoOwner }) {
  const matchOverlap =
    "Gennety is already solving agent-mediated introductions, and Nora focuses on the exact trust layer that determines whether that transition into chat feels credible. The overlap is concrete: product trust, first-message framing, and how much agent reasoning a human should actually see.";
  const framingForHuman =
    "Nora designs trust and conversation systems for AI products. She is a strong fit because Gennety already has the core loop working and now needs sharper UX around why a match feels real before a person sends the first message.";
  const framingForDemo =
    `${target.name ?? "This founder"} is actively shipping Gennety and can test trust-design ideas in a live agent-mediated networking flow right now. This is a real product surface, not a concept deck.`;

  const existingMatches = await prisma.match.findMany({
    where: {
      OR: [
        { agentAId: target.agent.id, agentBId: demoAgent.id },
        { agentAId: demoAgent.id, agentBId: target.agent.id },
      ],
    },
    include: {
      chat: true,
    },
  });

  for (const existing of existingMatches) {
    if (existing.chat) {
      await prisma.message.deleteMany({ where: { chatId: existing.chat.id } });
      await prisma.report.deleteMany({ where: { chatId: existing.chat.id } });
      await prisma.adviceSession.deleteMany({ where: { chatId: existing.chat.id } });
      await prisma.chat.delete({ where: { id: existing.chat.id } });
    }
    await prisma.matchReaction.deleteMany({ where: { matchId: existing.id } });
    await prisma.matchComment.deleteMany({ where: { matchId: existing.id } });
    await prisma.negotiationLog.deleteMany({ where: { matchId: existing.id } });
    await prisma.match.delete({ where: { id: existing.id } });
  }

  const now = Date.now();
  const createdAt = new Date(now - 24 * 60 * 60 * 1000);
  const proposedAt = new Date(now - 23 * 60 * 60 * 1000);
  const matchedAt = new Date(now - 22 * 60 * 60 * 1000);

  const match = await prisma.match.create({
    data: {
      agentAId: target.agent.id,
      agentBId: demoAgent.id,
      initiatorAgentId: demoAgent.id,
      overlapSummary: matchOverlap,
      framingForA: framingForHuman,
      framingForB: framingForDemo,
      status: "MATCHED",
      confirmedByA: true,
      confirmedByB: true,
      isPublic: false,
      createdAt,
      proposedAt,
      matchedAt,
    },
  });

  await prisma.negotiationLog.createMany({
    data: [
      {
        matchId: match.id,
        agentId: demoAgent.id,
        role: "initiator",
        type: "reasoning",
        content:
          "Target is shipping Gennety and already has a functioning match-to-chat flow. Strong relevance because the open problem is trust, clarity, and the human handoff moment.",
        createdAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
      },
      {
        matchId: match.id,
        agentId: target.agent.id,
        role: "responder",
        type: "evaluation",
        content:
          "Accepted. The overlap is specific and actionable: trust signals, framing, and a better first-message experience inside an AI-mediated introduction flow.",
        createdAt: new Date(createdAt.getTime() + 20 * 60 * 1000),
      },
      {
        matchId: match.id,
        agentId: demoAgent.id,
        role: "initiator",
        type: "agreement",
        content:
          "Mutual match confirmed. Both sides see a concrete way to improve the profile -> match -> chat transition with product-level trust design.",
        createdAt: new Date(createdAt.getTime() + 30 * 60 * 1000),
      },
    ],
  });

  const messages = initialMessages(target.name?.trim() || "Gleb").map((message) => ({
    fromOwner:
      message.fromOwner === "demo_owner" ? demoOwner.id : message.fromOwner,
    kind: message.kind,
    content: message.content,
    createdAt: new Date(now - message.hoursAgo * 60 * 60 * 1000),
  }));

  const chat = await prisma.chat.create({
    data: {
      matchId: match.id,
      status: "OPEN",
      createdAt: matchedAt,
      lastReadByA: new Date(now - 8 * 60 * 60 * 1000),
      lastReadByB: new Date(now - 2 * 60 * 60 * 1000),
      messages: {
        createMany: {
          data: messages,
        },
      },
    },
  });

  return { match, chat };
}

async function main() {
  const emails = process.argv.slice(2);

  const targets = await loadTargets(emails);
  if (targets.length === 0) {
    throw new Error("No onboarded target owners found");
  }

  const { owner: demoOwner, agent: demoAgent } = await ensureDemoOwnerAndAgent();

  console.log(`Demo partner ready: ${demoOwner.email} (${demoAgent.id})`);

  for (const target of targets) {
    if (!target.agent) {
      console.log(`Skipping ${target.email}: no agent`);
      continue;
    }

    const { updated } = await ensureHumanContext(target);
    const { match, chat } = await recreateMatchAndChat({
      target,
      demoAgent,
      demoOwner,
    });

    console.log(
      [
        `Seeded ${target.email}`,
        `profileContext=${updated ? "created" : "kept"}`,
        `matchId=${match.id}`,
        `chatId=${chat.id}`,
      ].join(" | ")
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
