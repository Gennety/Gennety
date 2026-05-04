/**
 * Demo persona generator.
 *
 * Uses OpenAI to produce diverse personas spread across narrow professional
 * niches. Output is written to test-data/demo-personas.json and later
 * consumed by seed-demo-network.ts.
 *
 * Regenerate at any time — the output file is committed-friendly and
 * deterministic per run only in aggregate (LLM temperature is non-zero).
 *
 *   OPENAI_API_KEY_DEMO=... npx tsx scripts/generate-demo-personas.ts
 *
 * Optional:
 *   DEMO_PERSONA_MODEL=gpt-4o-mini         # default
 *   DEMO_PERSONA_OUT=test-data/demo-personas.json
 */

import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

const model = process.env.DEMO_PERSONA_MODEL ?? "gpt-4o-mini";
const apiKey = process.env.OPENAI_API_KEY_DEMO ?? process.env.OPENAI_API_KEY;
const outPath = path.resolve(
  process.env.DEMO_PERSONA_OUT ?? "test-data/demo-personas.json"
);

if (!apiKey) {
  console.error("Missing OPENAI_API_KEY_DEMO or OPENAI_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

// Niches grouped so each batch request stays focused. LLM produces more
// varied personas when it's anchored on a theme.
const niches: Array<{ id: string; label: string; count: number; hints: string }> = [
  { id: "ai_ml_infra", label: "AI / ML infrastructure & tooling", count: 8,
    hints: "distributed training, MLOps, inference optimization, fine-tuning frameworks, evaluation harnesses" },
  { id: "ai_application", label: "Applied AI in specific industries", count: 10,
    hints: "legal AI, medical imaging, education tutoring, agriculture sensing, construction estimation" },
  { id: "fintech", label: "Fintech and crypto", count: 8,
    hints: "embedded lending, fraud detection, DeFi, onchain identity, small-business cash flow tools" },
  { id: "creator_economy", label: "Creator economy and media tech", count: 8,
    hints: "newsletter ops, podcast production tooling, short-form video AI, creator monetization" },
  { id: "biotech", label: "Biotech, longevity, health", count: 8,
    hints: "CRISPR tooling, longevity biomarkers, neuroimaging, drug discovery, clinical trial platforms" },
  { id: "indie_saas", label: "Indie SaaS and micro-apps", count: 10,
    hints: "solo founders, niche B2B tools, no-code, bootstrapped, profitable side projects" },
  { id: "devtools", label: "Developer tools", count: 8,
    hints: "build systems, IDE integrations, API gateways, observability, database tooling, CLI products" },
  { id: "robotics_hw", label: "Robotics and hardware", count: 6,
    hints: "industrial automation, consumer robotics, chip design, IoT, drone systems" },
  { id: "research", label: "Academic and frontier research", count: 6,
    hints: "mechanistic interpretability, low-resource NLP, formal verification, quantum algorithms" },
  { id: "climate", label: "Climate, agri, energy", count: 6,
    hints: "carbon accounting, precision agriculture, grid optimization, battery analytics, reforestation" },
  { id: "creative", label: "Creative industries tech", count: 6,
    hints: "music production AI, film post-production, fashion-tech, game audio, digital art platforms" },
  { id: "ops_community", label: "Ops, community, growth", count: 6,
    hints: "founder-led community builders, growth engineers, revenue ops, DevRel, marketplace ops" },
  { id: "niche_verticals", label: "Niche verticals", count: 10,
    hints: "marine logistics, veterinary tech, dental practice management, legaltech in EE, hunting/outdoor tech" },
  { id: "mentors", label: "Senior mentors (15+ years experience)", count: 10,
    hints: "ex-founders who exited, principal engineers, VPs of product, research leads, investors-turned-operators" },
];

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
  // USER.md
  ownerName: string;
  ownerProfession: string;
  ownerDomain: string;
  ownerExperience: string;
  ownerGoals: string;
  ownerLocation: string;
  // AGENTS.md
  agentSpecialization: string;
  agentDomains: string[];
  agentConstraints: string;
  // SOUL.md
  collaborationStyle: string;
  communicationStyle: string;
  // MEMORY.md
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  notLookingFor: string;
  recentProblems: string;
  recentWins: string;
  location: string;
  networkingGoal: "partnership" | "collaboration" | "mentor" | "peer";
  // Responder control
  personalityTraits: string[];
  responseTempo: "fast" | "medium" | "slow";
  agreementBias: number; // 0.3–0.9
};

const systemPrompt = `You generate diverse fictional professional personas for a networking platform's test dataset.

Each persona is a single individual with specific technical work they are doing right now. Be concrete, never generic.

Rules:
- Use realistic but fictional names from varied cultures (Central Asia, Eastern Europe, Latin America, South Asia, East Asia, Western Europe, Africa, US).
- Cities must be real and varied. Do not cluster all personas in SF or NYC.
- Professional details must be specific to the niche and sub-specialty. Not "AI engineer" but "evaluation-harness engineer working on multi-turn tool-use benchmarks."
- Experience levels must vary: junior/mid/senior/principal. Mentors must be 15+ years.
- currentWork is one specific thing they are building right now (1–2 sentences).
- lookingFor is one specific kind of person with a specific reason (1 sentence).
- Expertise is 3–5 concrete skills, not "programming" but "Rust async runtimes" or "PyTorch distributed training."
- Emails use the pattern firstname.lastname<number>@demo.gennety.com where number is 2-digit.
- agentId is "agent_demo_<slug>_<nnn>" where slug is lowercased firstname and nnn is a sequential index.
- personalityTraits: 2–4 adjectives used later to condition the auto-responder.
- responseTempo: fast = replies in minutes, slow = hours.
- agreementBias: 0.3 = picky, 0.9 = agreeable. Pick based on personality.
- networkingGoal must match the "goal" field and be one of: partnership, collaboration, mentor, peer.
- presetKey distribution target per batch: 30% high_active, 30% medium_active, 20% new_agent, 10% aging_medium, 5% stale_low, 5% inactive.
- Vary writing style between personas. No two "currentWork" descriptions should sound like they came from the same person.

Return a JSON object matching the schema.`;

async function generateForNiche(
  niche: typeof niches[number],
  startIndex: number
): Promise<Persona[]> {
  const userPrompt = `Generate exactly ${niche.count} personas for niche: "${niche.label}".

Sub-specialties to explore (pick different ones for each persona): ${niche.hints}.

Start numbering agentIds at demo_${niche.id}_${String(startIndex).padStart(3, "0")}.

Return JSON matching this TypeScript type:
{
  "personas": Array<{
    "name": string,
    "email": string,
    "agentId": string,
    "niche": "${niche.id}",
    "goal": "partnership" | "collaboration" | "mentor" | "peer",
    "presetKey": "high_active" | "medium_active" | "new_agent" | "aging_medium" | "stale_low" | "inactive",
    "ownerName": string,
    "ownerProfession": string,
    "ownerDomain": string,
    "ownerExperience": string,
    "ownerGoals": string,
    "ownerLocation": string,
    "agentSpecialization": string,
    "agentDomains": string[],
    "agentConstraints": string,
    "collaborationStyle": string,
    "communicationStyle": string,
    "currentWork": string,
    "expertise": string[],
    "lookingFor": string,
    "notLookingFor": string,
    "recentProblems": string,
    "recentWins": string,
    "location": string,
    "networkingGoal": "partnership" | "collaboration" | "mentor" | "peer",
    "personalityTraits": string[],
    "responseTempo": "fast" | "medium" | "slow",
    "agreementBias": number
  }>
}`;

  const response = await openai.chat.completions.create({
    model,
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error(`No content for niche ${niche.id}`);
  const parsed = JSON.parse(raw) as { personas: Persona[] };
  if (!Array.isArray(parsed.personas)) {
    throw new Error(`Malformed response for niche ${niche.id}`);
  }
  return parsed.personas;
}

async function main() {
  console.log(`Generating personas with ${model}...`);
  const all: Persona[] = [];
  let running = 0;

  for (const niche of niches) {
    console.log(`→ ${niche.label} (${niche.count})`);
    try {
      const batch = await generateForNiche(niche, running);
      console.log(`  got ${batch.length}`);
      all.push(...batch);
      running += batch.length;
    } catch (err) {
      console.error(`  failed:`, err);
    }
  }

  // Dedupe on email and agentId — LLM occasionally collides
  const seenEmail = new Set<string>();
  const seenAgent = new Set<string>();
  const deduped = all.filter((p) => {
    if (seenEmail.has(p.email) || seenAgent.has(p.agentId)) return false;
    seenEmail.add(p.email);
    seenAgent.add(p.agentId);
    return true;
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), model, personas: deduped }, null, 2)
  );
  console.log(`\nWrote ${deduped.length} personas → ${outPath}`);
}

main().catch((e) => {
  console.error("Generator failed:", e);
  process.exit(1);
});
