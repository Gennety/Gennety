import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import crypto from "crypto";

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function generateApiKey(): string {
  return `gny_${crypto.randomBytes(32).toString("hex")}`;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

function contextToText(c: (typeof agents)[number]["context"]): string {
  return [
    `Current work: ${c.currentWork}`,
    `Expertise: ${c.expertise.join(", ")}`,
    `Looking for: ${c.lookingFor}`,
    `Networking goal: ${c.networkingGoal}`,
    c.notLookingFor ? `Not looking for: ${c.notLookingFor}` : "",
    c.recentProblems ? `Recent problems: ${c.recentProblems}` : "",
  ]
    .filter(Boolean)
    .join(". ");
}

// Reputation/freshness presets for varied test data
type FreshnessPreset = "ACTIVE" | "AGING" | "STALE" | "INACTIVE";
interface ReputationPreset {
  reputationScore: number;
  reputationAcceptanceRate: number;
  reputationNegotiationRate: number;
  reputationCompletedMatches: number;
  totalProposedMatches: number;
  totalInitiatedNegotiations: number;
  totalAcceptedByOwner: number;
  totalNegotiationsAgreed: number;
  interactionCount: number;
  freshnessState: FreshnessPreset;
  daysSinceUpdate: number; // how many days ago was the last significant update
}

// Varied presets to make seed data realistic
const reputationPresets: Record<string, ReputationPreset> = {
  high_active: {
    reputationScore: 82, reputationAcceptanceRate: 0.85, reputationNegotiationRate: 0.75,
    reputationCompletedMatches: 12, totalProposedMatches: 20, totalInitiatedNegotiations: 16,
    totalAcceptedByOwner: 17, totalNegotiationsAgreed: 12, interactionCount: 35,
    freshnessState: "ACTIVE", daysSinceUpdate: 3,
  },
  medium_active: {
    reputationScore: 58, reputationAcceptanceRate: 0.6, reputationNegotiationRate: 0.5,
    reputationCompletedMatches: 4, totalProposedMatches: 10, totalInitiatedNegotiations: 8,
    totalAcceptedByOwner: 6, totalNegotiationsAgreed: 4, interactionCount: 15,
    freshnessState: "ACTIVE", daysSinceUpdate: 10,
  },
  new_agent: {
    reputationScore: 40, reputationAcceptanceRate: 0, reputationNegotiationRate: 0,
    reputationCompletedMatches: 0, totalProposedMatches: 0, totalInitiatedNegotiations: 0,
    totalAcceptedByOwner: 0, totalNegotiationsAgreed: 0, interactionCount: 0,
    freshnessState: "ACTIVE", daysSinceUpdate: 0,
  },
  aging_medium: {
    reputationScore: 52, reputationAcceptanceRate: 0.5, reputationNegotiationRate: 0.4,
    reputationCompletedMatches: 3, totalProposedMatches: 8, totalInitiatedNegotiations: 5,
    totalAcceptedByOwner: 4, totalNegotiationsAgreed: 2, interactionCount: 10,
    freshnessState: "AGING", daysSinceUpdate: 40,
  },
  stale_low: {
    reputationScore: 28, reputationAcceptanceRate: 0.3, reputationNegotiationRate: 0.2,
    reputationCompletedMatches: 1, totalProposedMatches: 6, totalInitiatedNegotiations: 5,
    totalAcceptedByOwner: 2, totalNegotiationsAgreed: 1, interactionCount: 8,
    freshnessState: "STALE", daysSinceUpdate: 70,
  },
  inactive: {
    reputationScore: 15, reputationAcceptanceRate: 0.2, reputationNegotiationRate: 0.1,
    reputationCompletedMatches: 0, totalProposedMatches: 3, totalInitiatedNegotiations: 2,
    totalAcceptedByOwner: 1, totalNegotiationsAgreed: 0, interactionCount: 4,
    freshnessState: "INACTIVE", daysSinceUpdate: 100,
  },
};

// Assign presets to agents in a rotating/varied pattern
const agentPresetAssignments: string[] = [
  "high_active", "medium_active", "new_agent", "medium_active", "high_active",    // 1-5
  "aging_medium", "new_agent", "high_active", "medium_active", "stale_low",        // 6-10
  "high_active", "new_agent", "medium_active", "aging_medium", "high_active",      // 11-15
  "medium_active", "new_agent", "high_active", "aging_medium", "medium_active",    // 16-20
  "high_active", "medium_active", "new_agent", "stale_low", "medium_active",       // 21-25
  "aging_medium", "high_active", "inactive", "new_agent", "high_active",           // 26-30
];

const agents = [
  // ── AI / ML ──────────────────────────────────────────
  {
    name: "Arlan Kim",
    email: "arlan@example.com",
    agentId: "agent_arlan_001",
    goal: "collaboration" as const,
    context: {
      currentWork: "Building an open-source framework for fine-tuning LLMs on domain-specific data with RLHF",
      expertise: ["machine learning", "NLP", "PyTorch", "distributed training"],
      lookingFor: "Someone with production ML infrastructure experience to help scale training pipelines",
      notLookingFor: "Researchers focused purely on theory without engineering experience",
      recentProblems: "Gradient checkpointing causing OOM errors on multi-GPU setups",
      location: "San Francisco",
      networkingGoal: "collaboration" as const,
    },
  },
  {
    name: "Mei Chen",
    email: "mei@example.com",
    agentId: "agent_mei_002",
    goal: "partnership" as const,
    context: {
      currentWork: "Developing a computer vision pipeline for autonomous drone inspection of solar farms",
      expertise: ["computer vision", "drone systems", "edge computing", "Python"],
      lookingFor: "A business partner with solar energy industry connections to bring the product to market",
      notLookingFor: "Pure software people with no hardware understanding",
      recentProblems: "Real-time inference latency on edge devices exceeds 200ms target",
      location: "Austin, TX",
      networkingGoal: "partnership" as const,
    },
  },
  {
    name: "Dmitri Volkov",
    email: "dmitri@example.com",
    agentId: "agent_dmitri_003",
    goal: "mentor" as const,
    context: {
      currentWork: "Training a speech-to-text model for low-resource languages (Kazakh, Uzbek, Kyrgyz)",
      expertise: ["speech recognition", "language models", "data collection", "Central Asian languages"],
      lookingFor: "A mentor who has shipped production ASR systems and navigated data scarcity",
      notLookingFor: "Generic AI consultants",
      recentProblems: "Insufficient training data — exploring synthetic data augmentation",
      location: "Almaty, Kazakhstan",
      networkingGoal: "mentor" as const,
    },
  },

  // ── Developer Tools ──────────────────────────────────
  {
    name: "Sofia Reyes",
    email: "sofia@example.com",
    agentId: "agent_sofia_004",
    goal: "collaboration" as const,
    context: {
      currentWork: "Building a CLI tool that generates type-safe API clients from OpenAPI specs",
      expertise: ["TypeScript", "code generation", "API design", "developer experience"],
      lookingFor: "A developer who understands multiple language ecosystems (Go, Rust, Python) to expand codegen targets",
      notLookingFor: "Frontend-only developers",
      recentProblems: "Handling circular references in OpenAPI schemas during code generation",
      location: "Berlin",
      networkingGoal: "collaboration" as const,
    },
  },
  {
    name: "James Okafor",
    email: "james@example.com",
    agentId: "agent_james_005",
    goal: "peer" as const,
    context: {
      currentWork: "Creating an observability platform specifically for serverless functions",
      expertise: ["AWS Lambda", "distributed tracing", "Go", "Prometheus"],
      lookingFor: "Peers building in the observability or serverless space to exchange ideas",
      notLookingFor: "Enterprise salespeople",
      recentProblems: "Cold start latency measurement is inconsistent across AWS regions",
      location: "Lagos, Nigeria",
      networkingGoal: "peer" as const,
    },
  },
  {
    name: "Lena Johansson",
    email: "lena@example.com",
    agentId: "agent_lena_006",
    goal: "partnership" as const,
    context: {
      currentWork: "Building a no-code platform for deploying ML models as REST APIs",
      expertise: ["MLOps", "Kubernetes", "React", "product management"],
      lookingFor: "A technical co-founder with deep ML expertise to complement product/infra skills",
      notLookingFor: "Another generalist — need deep ML specialization",
      recentProblems: "Model versioning and rollback strategy for production deployments",
      location: "Stockholm",
      networkingGoal: "partnership" as const,
    },
  },

  // ── Fintech ──────────────────────────────────────────
  {
    name: "Priya Sharma",
    email: "priya@example.com",
    agentId: "agent_priya_007",
    goal: "collaboration" as const,
    context: {
      currentWork: "Building a real-time fraud detection system using graph neural networks",
      expertise: ["graph ML", "fintech", "Python", "Neo4j"],
      lookingFor: "Someone with banking compliance experience to ensure the system meets regulatory requirements",
      notLookingFor: "Crypto-focused projects",
      recentProblems: "High false positive rate on legitimate international transactions",
      location: "Mumbai",
      networkingGoal: "collaboration" as const,
    },
  },
  {
    name: "Marcus Thompson",
    email: "marcus@example.com",
    agentId: "agent_marcus_008",
    goal: "partnership" as const,
    context: {
      currentWork: "Developing an API for embedded lending — letting any SaaS add loan products",
      expertise: ["fintech APIs", "lending", "compliance", "Node.js"],
      lookingFor: "A partner with distribution — someone who runs a SaaS with SMB customers who need lending",
      notLookingFor: "Consumer fintech people",
      recentProblems: "Multi-state lending license complexity is slowing go-to-market",
      location: "New York",
      networkingGoal: "partnership" as const,
    },
  },

  // ── Climate / Sustainability ─────────────────────────
  {
    name: "Aisha Bello",
    email: "aisha@example.com",
    agentId: "agent_aisha_009",
    goal: "collaboration" as const,
    context: {
      currentWork: "Building carbon footprint tracking for supply chains using IoT sensor data",
      expertise: ["IoT", "supply chain", "sustainability metrics", "Python"],
      lookingFor: "Someone experienced with LCA (life cycle assessment) methodology to validate our calculations",
      notLookingFor: "Carbon offset marketplaces",
      recentProblems: "Inconsistent emissions factors across different regional databases",
      location: "Nairobi",
      networkingGoal: "collaboration" as const,
    },
  },
  {
    name: "Erik Lindgren",
    email: "erik@example.com",
    agentId: "agent_erik_010",
    goal: "peer" as const,
    context: {
      currentWork: "Optimizing energy grid balancing with reinforcement learning for wind farm integration",
      expertise: ["energy systems", "reinforcement learning", "MATLAB", "Python"],
      lookingFor: "Peers working on renewable energy optimization or grid-scale energy storage",
      notLookingFor: "Fossil fuel companies",
      recentProblems: "Reward function design for multi-objective optimization (cost vs stability vs carbon)",
      location: "Copenhagen",
      networkingGoal: "peer" as const,
    },
  },

  // ── Healthcare / Biotech ─────────────────────────────
  {
    name: "Dr. Yuki Tanaka",
    email: "yuki@example.com",
    agentId: "agent_yuki_011",
    goal: "collaboration" as const,
    context: {
      currentWork: "Developing an AI-powered diagnostic tool for rare genetic disorders from whole genome sequencing",
      expertise: ["genomics", "bioinformatics", "clinical genetics", "Python"],
      lookingFor: "An ML engineer experienced with transformer architectures applied to biological sequences",
      notLookingFor: "General practitioners without genetics background",
      recentProblems: "Variant classification confidence scoring — too many VUS (variants of uncertain significance)",
      location: "Tokyo",
      networkingGoal: "collaboration" as const,
    },
  },
  {
    name: "Carlos Mendez",
    email: "carlos@example.com",
    agentId: "agent_carlos_012",
    goal: "mentor" as const,
    context: {
      currentWork: "Building a telemedicine platform for rural communities in Latin America",
      expertise: ["healthcare IT", "mobile development", "React Native", "FHIR"],
      lookingFor: "A mentor who has scaled healthtech in emerging markets and navigated regulatory hurdles",
      notLookingFor: "US-only healthcare focus",
      recentProblems: "Offline-first architecture for areas with unreliable internet",
      location: "Mexico City",
      networkingGoal: "mentor" as const,
    },
  },

  // ── Education ────────────────────────────────────────
  {
    name: "Hannah Park",
    email: "hannah@example.com",
    agentId: "agent_hannah_013",
    goal: "partnership" as const,
    context: {
      currentWork: "Creating an adaptive learning platform that personalizes curriculum using knowledge graphs",
      expertise: ["edtech", "knowledge graphs", "learning science", "TypeScript"],
      lookingFor: "A partner with access to K-12 school networks for pilot programs",
      notLookingFor: "Corporate training market (B2B enterprise learning)",
      recentProblems: "Knowledge graph construction from unstructured curriculum content",
      location: "Seoul",
      networkingGoal: "partnership" as const,
    },
  },
  {
    name: "Tom Williams",
    email: "tom@example.com",
    agentId: "agent_tom_014",
    goal: "peer" as const,
    context: {
      currentWork: "Building a platform for peer-to-peer coding mentorship with AI-assisted code review",
      expertise: ["code review", "mentorship platforms", "React", "LLM integration"],
      lookingFor: "Other edtech founders exploring AI tutoring and how to keep human mentors relevant",
      notLookingFor: "Pure AI replacement of teachers",
      recentProblems: "Balancing AI suggestions with human mentor authority in code reviews",
      location: "London",
      networkingGoal: "peer" as const,
    },
  },

  // ── Infrastructure / DevOps ──────────────────────────
  {
    name: "Nina Kowalski",
    email: "nina@example.com",
    agentId: "agent_nina_015",
    goal: "collaboration" as const,
    context: {
      currentWork: "Building a multi-cloud infrastructure orchestration tool that unifies Terraform, Pulumi, and CDK",
      expertise: ["infrastructure as code", "multi-cloud", "Go", "Kubernetes"],
      lookingFor: "Someone building developer tools who understands the IaC pain points from the practitioner side",
      notLookingFor: "Cloud vendor advocates pushing single-cloud solutions",
      recentProblems: "State management across different IaC tools without data loss on migration",
      location: "Warsaw",
      networkingGoal: "collaboration" as const,
    },
  },
  {
    name: "Alex Rivera",
    email: "alex@example.com",
    agentId: "agent_alex_016",
    goal: "peer" as const,
    context: {
      currentWork: "Creating a GitOps-native deployment platform with built-in canary analysis",
      expertise: ["GitOps", "Argo CD", "Kubernetes", "SRE"],
      lookingFor: "SRE and platform engineering peers sharing lessons on progressive delivery",
      notLookingFor: "Traditional ops folks resistant to GitOps",
      recentProblems: "Automated canary metric analysis giving false positives during low-traffic periods",
      location: "Vancouver",
      networkingGoal: "peer" as const,
    },
  },

  // ── Security ─────────────────────────────────────────
  {
    name: "Fatima Al-Hassan",
    email: "fatima@example.com",
    agentId: "agent_fatima_017",
    goal: "collaboration" as const,
    context: {
      currentWork: "Building an automated vulnerability scanner that uses LLMs to understand code semantics",
      expertise: ["application security", "static analysis", "LLMs", "Rust"],
      lookingFor: "Someone with deep compiler/AST expertise to improve code understanding accuracy",
      notLookingFor: "Compliance-checkbox security tools",
      recentProblems: "False positive rate when LLM misinterprets business logic as a vulnerability",
      location: "Dubai",
      networkingGoal: "collaboration" as const,
    },
  },
  {
    name: "Ryan Chen",
    email: "ryan@example.com",
    agentId: "agent_ryan_018",
    goal: "partnership" as const,
    context: {
      currentWork: "Developing a zero-trust network access platform for remote-first companies",
      expertise: ["network security", "zero trust", "WireGuard", "Go"],
      lookingFor: "A partner with enterprise sales experience in cybersecurity to build go-to-market",
      notLookingFor: "VPN companies that relabel existing products",
      recentProblems: "Balancing security policy granularity with user experience simplicity",
      location: "Toronto",
      networkingGoal: "partnership" as const,
    },
  },

  // ── E-commerce / Marketplaces ────────────────────────
  {
    name: "Zara Osei",
    email: "zara@example.com",
    agentId: "agent_zara_019",
    goal: "partnership" as const,
    context: {
      currentWork: "Building a B2B marketplace connecting African artisans directly to international retailers",
      expertise: ["marketplace dynamics", "supply chain", "payments", "Next.js"],
      lookingFor: "A partner with logistics and customs expertise for cross-border e-commerce from Africa",
      notLookingFor: "Dropshipping platforms",
      recentProblems: "Payment reconciliation across multiple African mobile money providers",
      location: "Accra, Ghana",
      networkingGoal: "partnership" as const,
    },
  },
  {
    name: "David Kim",
    email: "david@example.com",
    agentId: "agent_david_020",
    goal: "collaboration" as const,
    context: {
      currentWork: "Creating an AI-powered product recommendation engine that understands style and aesthetics",
      expertise: ["recommendation systems", "computer vision", "fashion tech", "Python"],
      lookingFor: "Someone with fashion industry expertise to refine the style taxonomy and validate recommendations",
      notLookingFor: "Generic collaborative filtering approaches",
      recentProblems: "Cross-cultural style preferences making a universal model difficult",
      location: "Seoul",
      networkingGoal: "collaboration" as const,
    },
  },

  // ── Data / Analytics ─────────────────────────────────
  {
    name: "Maria Santos",
    email: "maria@example.com",
    agentId: "agent_maria_021",
    goal: "peer" as const,
    context: {
      currentWork: "Building a real-time analytics pipeline that processes 10M events/sec for a gaming company",
      expertise: ["data engineering", "Apache Kafka", "ClickHouse", "Rust"],
      lookingFor: "Peers working on high-throughput real-time data systems to share architecture patterns",
      notLookingFor: "Batch processing consultants",
      recentProblems: "Late-arriving events causing incorrect window aggregations",
      location: "São Paulo",
      networkingGoal: "peer" as const,
    },
  },
  {
    name: "Oliver Wright",
    email: "oliver@example.com",
    agentId: "agent_oliver_022",
    goal: "collaboration" as const,
    context: {
      currentWork: "Developing a semantic layer for business intelligence that lets non-technical users query data in natural language",
      expertise: ["semantic layer", "SQL", "LLMs", "data modeling"],
      lookingFor: "An engineer experienced with text-to-SQL who can improve query accuracy for complex joins",
      notLookingFor: "Dashboard builders (Looker/Tableau clones)",
      recentProblems: "LLM generates correct SQL syntax but wrong business logic for multi-table queries",
      location: "Chicago",
      networkingGoal: "collaboration" as const,
    },
  },

  // ── Web3 / Decentralized ─────────────────────────────
  {
    name: "Leo Nakamura",
    email: "leo@example.com",
    agentId: "agent_leo_023",
    goal: "collaboration" as const,
    context: {
      currentWork: "Building decentralized identity (DID) infrastructure for verified professional credentials",
      expertise: ["decentralized identity", "verifiable credentials", "Solidity", "TypeScript"],
      lookingFor: "Someone with enterprise HR and credential verification experience to design the trust framework",
      notLookingFor: "NFT/speculative crypto projects",
      recentProblems: "Credential revocation propagation across decentralized nodes",
      location: "Singapore",
      networkingGoal: "collaboration" as const,
    },
  },

  // ── Robotics / Hardware ──────────────────────────────
  {
    name: "Anna Petrova",
    email: "anna@example.com",
    agentId: "agent_anna_024",
    goal: "partnership" as const,
    context: {
      currentWork: "Developing a modular robotic arm for small manufacturing workshops",
      expertise: ["robotics", "ROS2", "mechanical engineering", "embedded systems"],
      lookingFor: "A partner with manufacturing distribution channels and knowledge of workshop workflows",
      notLookingFor: "Industrial robot companies (ABB, Fanuc) — we're targeting a different market",
      recentProblems: "Achieving sub-millimeter precision at an affordable price point",
      location: "Munich",
      networkingGoal: "partnership" as const,
    },
  },

  // ── Content / Media ──────────────────────────────────
  {
    name: "Kai Andersen",
    email: "kai@example.com",
    agentId: "agent_kai_025",
    goal: "peer" as const,
    context: {
      currentWork: "Building a collaborative video editing platform with AI-assisted scene detection and tagging",
      expertise: ["video processing", "FFmpeg", "React", "computer vision"],
      lookingFor: "Peers building creative tools who are navigating the AI-assisted vs AI-generated line",
      notLookingFor: "Fully automated AI video generators",
      recentProblems: "Real-time collaborative editing state synchronization with CRDT approach",
      location: "Oslo",
      networkingGoal: "peer" as const,
    },
  },

  // ── Legal / Compliance ───────────────────────────────
  {
    name: "Sarah Mitchell",
    email: "sarah@example.com",
    agentId: "agent_sarah_026",
    goal: "collaboration" as const,
    context: {
      currentWork: "Developing an AI contract review tool that identifies risky clauses across jurisdictions",
      expertise: ["legal tech", "NLP", "contract analysis", "Python"],
      lookingFor: "A lawyer-turned-developer who understands both legal reasoning and ML model behavior",
      notLookingFor: "Generic document automation",
      recentProblems: "Cross-jurisdictional clause interpretation — same language different legal meaning",
      location: "London",
      networkingGoal: "collaboration" as const,
    },
  },

  // ── Agriculture ──────────────────────────────────────
  {
    name: "Emmanuel Adeyemi",
    email: "emmanuel@example.com",
    agentId: "agent_emmanuel_027",
    goal: "partnership" as const,
    context: {
      currentWork: "Building precision agriculture platform using satellite imagery and ML for crop health monitoring",
      expertise: ["remote sensing", "agriculture", "GIS", "Python"],
      lookingFor: "A partner with agri-business network to deploy in Nigerian farming cooperatives",
      notLookingFor: "US-focused precision ag (different market dynamics)",
      recentProblems: "Cloud cover in satellite imagery during rainy season reduces model accuracy",
      location: "Lagos, Nigeria",
      networkingGoal: "partnership" as const,
    },
  },

  // ── Gaming ───────────────────────────────────────────
  {
    name: "Mika Sato",
    email: "mika@example.com",
    agentId: "agent_mika_028",
    goal: "collaboration" as const,
    context: {
      currentWork: "Creating procedural narrative generation for games using LLMs that maintain coherent world state",
      expertise: ["game design", "procedural generation", "LLMs", "Unity"],
      lookingFor: "A narrative designer who understands branching story structures and can evaluate AI-generated content quality",
      notLookingFor: "Mobile casual game developers",
      recentProblems: "LLM-generated dialogue losing character voice consistency over long play sessions",
      location: "Tokyo",
      networkingGoal: "collaboration" as const,
    },
  },

  // ── Real Estate / PropTech ───────────────────────────
  {
    name: "Rachel Green",
    email: "rachel@example.com",
    agentId: "agent_rachel_029",
    goal: "partnership" as const,
    context: {
      currentWork: "Building a property valuation model that factors in neighborhood-level data like walkability, noise, and green space",
      expertise: ["real estate analytics", "geospatial data", "Python", "ML"],
      lookingFor: "A partner with real estate brokerage connections to validate and distribute the valuation tool",
      notLookingFor: "Traditional appraisers resistant to data-driven approaches",
      recentProblems: "Inconsistent municipal data formats across different cities",
      location: "Denver",
      networkingGoal: "partnership" as const,
    },
  },

  // ── Productivity / Agents ────────────────────────────
  {
    name: "Jordan Blake",
    email: "jordan@example.com",
    agentId: "agent_jordan_030",
    goal: "peer" as const,
    context: {
      currentWork: "Building an AI agent orchestration framework where specialized agents collaborate on complex tasks",
      expertise: ["agent architectures", "LLM orchestration", "TypeScript", "distributed systems"],
      lookingFor: "Peers exploring multi-agent systems and agent-to-agent communication protocols",
      notLookingFor: "Simple chatbot builders",
      recentProblems: "Agent delegation loops — agents keep passing tasks back and forth without resolution",
      location: "Portland, OR",
      networkingGoal: "peer" as const,
    },
  },
];

async function seed() {
  console.log("🌱 Seeding Gennety with 30 test agents...\n");

  // Enable pgvector extension
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;");
  console.log("✅ pgvector extension enabled\n");

  // Clear existing data
  await prisma.message.deleteMany();
  await prisma.report.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.negotiationLog.deleteMany();
  await prisma.match.deleteMany();
  await prisma.beacon.deleteMany();
  await prisma.$executeRawUnsafe("DELETE FROM agent_contexts;");
  await prisma.agent.deleteMany();
  await prisma.owner.deleteMany();
  console.log("🗑️  Cleared existing data\n");

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    console.log(`[${i + 1}/30] Creating ${a.name} (${a.agentId})...`);

    // Create owner
    const owner = await prisma.owner.create({
      data: {
        email: a.email,
        name: a.name,
        networkingGoal: a.goal,
        privacyConsent: true,
      },
    });

    // Get reputation preset for this agent
    const preset = reputationPresets[agentPresetAssignments[i] ?? "new_agent"];

    // Create agent with reputation data
    const agent = await prisma.agent.create({
      data: {
        agentId: a.agentId,
        ownerId: owner.id,
        apiKey: generateApiKey(),
        isActive: preset.freshnessState !== "INACTIVE", // inactive agents are deactivated
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

    // Generate embedding
    const embeddingText = contextToText(a.context);
    const embedding = await generateEmbedding(embeddingText);
    const hash = crypto.createHash("sha256").update(JSON.stringify(a.context)).digest("hex");

    // Compute the lastSignificantUpdateAt based on preset
    const lastSignificantUpdate = new Date(Date.now() - preset.daysSinceUpdate * 24 * 60 * 60 * 1000);

    // Insert context with embedding using raw SQL (including freshness fields)
    await prisma.$executeRaw`
      INSERT INTO agent_contexts (id, agent_id, current_work, expertise, looking_for, not_looking_for, recent_problems, location, networking_goal, embedding, updated_at, previous_hash, freshness_state, last_significant_update_at)
      VALUES (
        ${`ctx_${agent.id}`},
        ${agent.id},
        ${a.context.currentWork},
        ${a.context.expertise},
        ${a.context.lookingFor},
        ${a.context.notLookingFor ?? null},
        ${a.context.recentProblems ?? null},
        ${a.context.location ?? null},
        ${a.context.networkingGoal},
        ${embedding}::vector,
        NOW(),
        ${hash},
        ${preset.freshnessState}::"FreshnessState",
        ${lastSignificantUpdate}
      )
    `;

    console.log(`   ✅ Created with embedding (${embedding.length} dims) | rep=${preset.reputationScore} fresh=${preset.freshnessState}`);
  }

  console.log("\n🎉 Seeding complete! 30 agents created with semantic embeddings.");

  // Quick test: find matches for agent_arlan_001
  console.log("\n📊 Quick similarity test for agent_arlan_001:");
  const arlan = await prisma.agent.findUnique({
    where: { agentId: "agent_arlan_001" },
  });

  if (arlan) {
    const topMatches = await prisma.$queryRaw<
      Array<{ agent_id: string; current_work: string; similarity: number }>
    >`
      SELECT
        a.agent_id,
        ac.current_work,
        (1 - (ac.embedding <=> (SELECT embedding FROM agent_contexts WHERE agent_id = ${arlan.id}))) as similarity
      FROM agent_contexts ac
      JOIN agents a ON a.id = ac.agent_id
      WHERE ac.agent_id != ${arlan.id}
        AND ac.embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 5
    `;

    topMatches.forEach((m, idx) => {
      console.log(`   ${idx + 1}. ${m.agent_id} (${Number(m.similarity).toFixed(3)}): ${m.current_work.slice(0, 80)}...`);
    });
  }
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
