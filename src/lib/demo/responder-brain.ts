import OpenAI from "openai";
import { demoConfig, estimateCostUsd } from "@/lib/config/demo";

/**
 * Responder brain — converts a demo agent's context and an incoming event into
 * a concrete action. Driven by a small OpenAI model (gpt-4o-mini by default).
 *
 * Every function returns a structured decision plus usage metrics so the
 * caller can log them to DemoResponderLog.
 */

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: demoConfig.llm.apiKey });
  }
  return _client;
}

export interface LlmUsage {
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  latencyMs: number;
  prompt: string;
  response: string;
}

export interface AgentPersona {
  agentId: string;
  ownerName: string;
  niche?: string;
  personalityTraits?: string[];
  responseTempo?: "fast" | "medium" | "slow";
  agreementBias?: number;
  communicationStyle?: string | null;
  collaborationStyle?: string | null;
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  notLookingFor?: string | null;
  networkingGoal: string;
  ownerProfession?: string | null;
  ownerDomain?: string | null;
  agentSpecialization?: string | null;
}

function personaHeader(p: AgentPersona): string {
  return [
    `You are the agent representing ${p.ownerName} on Gennety.`,
    p.ownerProfession ? `Owner is: ${p.ownerProfession}.` : "",
    p.ownerDomain ? `Domain: ${p.ownerDomain}.` : "",
    `Currently working on: ${p.currentWork}`,
    `Expertise: ${p.expertise.join(", ")}`,
    `Looking for: ${p.lookingFor}`,
    p.notLookingFor ? `Not looking for: ${p.notLookingFor}` : "",
    `Networking goal: ${p.networkingGoal}`,
    p.collaborationStyle ? `Collaboration style: ${p.collaborationStyle}` : "",
    p.communicationStyle ? `Communication style: ${p.communicationStyle}` : "",
    p.personalityTraits?.length
      ? `Personality: ${p.personalityTraits.join(", ")}`
      : "",
    `Agreement tendency: ${p.agreementBias ?? 0.6} (0=picky, 1=agreeable).`,
    "",
    "Never break character. Never mention that you are an AI or that this is a simulation.",
    "Keep replies concise — a single short paragraph unless asked for detail.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function callLlm(
  system: string,
  user: string,
  opts: { json?: boolean; maxTokens?: number } = {}
): Promise<LlmUsage> {
  const start = Date.now();
  const response = await client().chat.completions.create({
    model: demoConfig.llm.model,
    temperature: demoConfig.llm.temperature,
    max_tokens: opts.maxTokens ?? demoConfig.llm.maxOutputTokens,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const tokensInput = response.usage?.prompt_tokens ?? 0;
  const tokensOutput = response.usage?.completion_tokens ?? 0;
  const content = response.choices[0]?.message?.content ?? "";
  return {
    tokensInput,
    tokensOutput,
    costUsd: estimateCostUsd(tokensInput, tokensOutput),
    latencyMs: Date.now() - start,
    prompt: `${system}\n\n---\n\n${user}`,
    response: content,
  };
}

export interface NegotiationEvaluation {
  decision: "accept" | "decline";
  evaluation: string;
  overlap_summary: string;
  framing_for_owner: string;
}

export async function evaluateIncomingNegotiation(args: {
  self: AgentPersona;
  initiator: AgentPersona;
  initiatorReasoning: string;
}): Promise<{ decision: NegotiationEvaluation; usage: LlmUsage }> {
  const system = personaHeader(args.self) +
    "\n\nYou are evaluating whether to accept an incoming negotiation from another agent. " +
    "Accept only if there is a specific, concrete intersection you can name in one sentence. " +
    "Decline if the overlap is generic (e.g. 'both work in AI') or if the match contradicts your notLookingFor.";

  const user = `Another agent initiated a negotiation. Their reasoning:
"""
${args.initiatorReasoning}
"""

Their context:
- Owner: ${args.initiator.ownerName} (${args.initiator.ownerProfession ?? "—"})
- Currently: ${args.initiator.currentWork}
- Expertise: ${args.initiator.expertise.join(", ")}
- Looking for: ${args.initiator.lookingFor}
- Networking goal: ${args.initiator.networkingGoal}

Decide whether this is a genuine specific-overlap match for your owner.
Respect your agreementBias (${args.self.agreementBias ?? 0.6}) — higher means more likely to accept borderline cases.

Return JSON:
{
  "decision": "accept" | "decline",
  "evaluation": "2-3 sentences explaining your reasoning, in the voice of an agent advising its owner",
  "overlap_summary": "one sentence naming the specific intersection (empty string if declining)",
  "framing_for_owner": "one sentence telling YOUR owner why they should meet the other person (empty string if declining)"
}`;

  const usage = await callLlm(system, user, { json: true, maxTokens: 500 });
  const parsed = JSON.parse(usage.response) as NegotiationEvaluation;
  return { decision: parsed, usage };
}

export interface InitiationPlan {
  shouldInitiate: boolean;
  targetAgentId: string | null;
  reasoning: string;
}

export async function pickInitiationTarget(args: {
  self: AgentPersona;
  candidates: Array<{
    agentId: string;
    ownerName: string;
    ownerProfession?: string | null;
    currentWork: string;
    expertise: string[];
    lookingFor: string;
    networkingGoal: string;
    similarity: number;
  }>;
}): Promise<{ plan: InitiationPlan; usage: LlmUsage }> {
  const system = personaHeader(args.self) +
    "\n\nYou scan candidates and decide whether to initiate a negotiation with exactly one of them. " +
    "Only initiate if you can name a specific intersection. If no candidate is a clear fit, do not initiate.";

  const candidatesText = args.candidates
    .map(
      (c, i) =>
        `${i + 1}. agent_id=${c.agentId} | ${c.ownerName} (${c.ownerProfession ?? "—"}) | sim=${c.similarity.toFixed(2)} | currently: ${c.currentWork} | looking for: ${c.lookingFor} | goal: ${c.networkingGoal}`
    )
    .join("\n");

  const user = `Candidates the platform returned:
${candidatesText}

Return JSON:
{
  "shouldInitiate": boolean,
  "targetAgentId": "agent_xxx" or null,
  "reasoning": "2-3 sentences in the voice of an agent — the specific intersection you see (or why nothing here fits)"
}`;

  const usage = await callLlm(system, user, { json: true, maxTokens: 400 });
  const parsed = JSON.parse(usage.response) as InitiationPlan;
  return { plan: parsed, usage };
}

export interface ProposalDecision {
  decision: "confirm" | "not_now";
  reasoning: string;
}

export async function decideMatchProposal(args: {
  self: AgentPersona;
  overlapSummary: string;
  framingForMe: string;
  otherOwnerName: string;
  otherCurrentWork: string;
}): Promise<{ decision: ProposalDecision; usage: LlmUsage }> {
  const system = personaHeader(args.self) +
    "\n\nAn agent-to-agent negotiation has concluded and a match is proposed to YOUR owner. " +
    "Decide whether your owner would confirm (meet) or mark as not_now. Use agreementBias as your tendency.";

  const user = `Match proposal:
Overlap: ${args.overlapSummary}
Framing for your owner: ${args.framingForMe}
Other person: ${args.otherOwnerName} — currently: ${args.otherCurrentWork}

Return JSON:
{
  "decision": "confirm" | "not_now",
  "reasoning": "one sentence explaining"
}`;

  const usage = await callLlm(system, user, { json: true, maxTokens: 200 });
  const parsed = JSON.parse(usage.response) as ProposalDecision;
  return { decision: parsed, usage };
}

const MODERATION_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bi\s*am\s*(an?\s*)?(ai|language model|assistant|chatbot|agent)\b/i, label: "ai_self_reference" },
  { re: /\bas an (ai|assistant|language model)\b/i, label: "ai_self_reference" },
  { re: /\b(kill|suicide|self[- ]harm|hate\s+you|die)\b/i, label: "harm" },
  { re: /\bhttps?:\/\/\S+/i, label: "link" },
  { re: /\b\+?\d[\d\s().-]{7,}\b/, label: "phone_number" },
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, label: "email" },
];

export function moderateChatReply(reply: string): { ok: boolean; reason?: string } {
  const trimmed = reply.trim();
  if (trimmed.length < 2) return { ok: false, reason: "empty" };
  if (trimmed.length > 1200) return { ok: false, reason: "too_long" };
  for (const { re, label } of MODERATION_PATTERNS) {
    if (re.test(trimmed)) return { ok: false, reason: label };
  }
  return { ok: true };
}

export async function generateChatReply(args: {
  self: AgentPersona;
  otherOwnerName: string;
  overlapSummary: string;
  history: Array<{ from: "me" | "them" | "opener_me" | "opener_them"; content: string }>;
}): Promise<{ reply: string; usage: LlmUsage; moderation?: string }> {
  const system = personaHeader(args.self) +
    `\n\nYou are chatting with ${args.otherOwnerName}, introduced because: ${args.overlapSummary}. ` +
    "Write a natural chat reply in the first person as the owner (not the agent). Match your communicationStyle. " +
    "Do not reference that you are an agent. Keep it to 1-3 short sentences, sometimes a question.";

  const transcript = args.history
    .map((m) => {
      const label =
        m.from === "me" || m.from === "opener_me" ? args.self.ownerName : args.otherOwnerName;
      return `${label}: ${m.content}`;
    })
    .join("\n");

  const user = `Conversation so far:
${transcript}

Write the next message from ${args.self.ownerName}. Plain text, no formatting, no quotes.`;

  const usage = await callLlm(system, user, { json: false, maxTokens: 220 });
  const reply = usage.response.trim();
  const mod = moderateChatReply(reply);
  if (!mod.ok) {
    return { reply: "", usage, moderation: mod.reason };
  }
  return { reply, usage };
}
