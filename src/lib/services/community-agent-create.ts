import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_SPECIALIZATIONS_BY_CATEGORY,
  COMMUNITY_SPECIALIZATION_LABELS,
  CommunityCategory,
  CommunityProfileVisibility,
  CommunitySpecialization,
  CommunityVisibility,
  CreateCommunitySchema,
} from "@/types/community";
import { CommunityChannelSchema } from "@/types/community-knowledge";
import { createCommunity, getCommunityBySlug } from "@/lib/services/community";
import {
  createCommunityChannel,
  createCommunityKnowledgeSource,
  ingestCommunityKnowledgeDocument,
} from "@/lib/services/community-knowledge";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const TOKEN_PURPOSE = "community_agent_create";

const AgentKnowledgeDocumentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  rawContent: z.string().trim().min(1).max(12_000),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  privacyLevel: z.enum(["PUBLIC", "COMMUNITY", "ADMINS", "OWNER_ONLY"]).default("COMMUNITY"),
});

export const AgentCommunityCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().min(20).max(1000),
    visibility: CommunityVisibility.default("PRIVATE"),
    profileVisibility: CommunityProfileVisibility.default("VISIBLE"),
    category: CommunityCategory.nullish(),
    specialization: CommunitySpecialization.nullish(),
    ssotEnabled: z.boolean().default(true),
    strategyEnabled: z.boolean().default(false),
    strategyIntervalHours: z.number().int().min(1).max(720).default(72),
    strategyTokenLimit: z.number().int().min(1000).max(2_000_000).default(80_000),
    monthlyTokenLimit: z.number().int().min(1000).max(50_000_000).nullable().optional(),
    judgeIterationLimit: z.number().int().min(1).max(10).default(3),
    channels: z.array(CommunityChannelSchema).max(8).default([]),
    initialKnowledge: z.array(AgentKnowledgeDocumentSchema).max(10).default([]),
  })
  .refine((data) => data.visibility !== "PUBLIC" || !!data.category, {
    message: "Public communities require a category",
    path: ["category"],
  })
  .refine((data) => data.visibility !== "PUBLIC" || !!data.specialization, {
    message: "Public communities require a specialization",
    path: ["specialization"],
  })
  .refine((data) => {
    if (!data.category || !data.specialization) return true;
    return COMMUNITY_SPECIALIZATIONS_BY_CATEGORY[data.category].includes(data.specialization);
  }, {
    message: "Specialization does not belong to the selected category",
    path: ["specialization"],
  });

export type AgentCommunityCreateInput = z.infer<typeof AgentCommunityCreateSchema>;

interface AgentCreateTokenPayload {
  purpose: typeof TOKEN_PURPOSE;
  ownerId: string;
  iat: number;
  exp: number;
  nonce: string;
}

export class CommunityAgentCreateError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

function getSigningSecret() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required for agent community creation tokens");
  }
  return secret || "gennety-local-agent-community-create-secret";
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("base64url");
}

export function createCommunityAgentCreateToken(ownerId: string, now = new Date()) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
  const payload: AgentCreateTokenPayload = {
    purpose: TOKEN_PURPOSE,
    ownerId,
    iat: issuedAt,
    exp: Math.floor(expiresAt.getTime() / 1000),
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = encodeJson(payload);
  return {
    token: `${encodedPayload}.${sign(encodedPayload)}`,
    expiresAt,
  };
}

export function verifyCommunityAgentCreateToken(token: string, now = new Date()) {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    throw new CommunityAgentCreateError("Invalid agent community token", 401);
  }

  const expected = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new CommunityAgentCreateError("Invalid agent community token", 401);
  }

  let payload: AgentCreateTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new CommunityAgentCreateError("Invalid agent community token", 401);
  }

  if (payload.purpose !== TOKEN_PURPOSE || !payload.ownerId || !payload.exp) {
    throw new CommunityAgentCreateError("Invalid agent community token", 401);
  }
  if (payload.exp * 1000 < now.getTime()) {
    throw new CommunityAgentCreateError("Agent community token expired", 401);
  }

  return payload;
}

export function generateCommunityAgentCreatePrompt(args: {
  ownerName?: string | null;
  endpointUrl: string;
  token: string;
  expiresAt: Date;
}) {
  const categories = Object.entries(COMMUNITY_CATEGORY_LABELS)
    .map(([category, label]) => {
      const specializations = COMMUNITY_SPECIALIZATIONS_BY_CATEGORY[category as keyof typeof COMMUNITY_SPECIALIZATIONS_BY_CATEGORY]
        .map((specialization) => `${specialization} (${COMMUNITY_SPECIALIZATION_LABELS[specialization]})`)
        .join(", ");
      return `- ${category} (${label}): ${specializations}`;
    })
    .join("\n");

  return `You are helping ${args.ownerName ?? "your owner"} create a Gennety Contextual Hub.

Goal: interview the owner, clarify the hub strategy, then create the community by calling the Gennety API exactly once after the owner approves the final JSON.

API endpoint:
POST ${args.endpointUrl}

Authorization header:
Authorization: Bearer ${args.token}

Token expires at: ${args.expiresAt.toISOString()}

Ask the owner concise follow-up questions until you can fill the hub clearly. Do not invent facts. Prefer a private hub if the owner is unsure.

Required interview topics:
- Hub name and who belongs in it.
- The concrete outcome the hub should create.
- Public vs private visibility.
- Category and specialization from the allowed list.
- What knowledge should become the hub SSOT.
- Suggested channels/sub-contexts.
- Whether 72-hour strategy sessions should be enabled.
- Token budget preferences.
- Privacy boundaries: never include raw MEMORY.md, secrets, health, finances, personal relationships, or psychological topics unless the owner explicitly says the sanitized business-level fact is safe to share.

Allowed categories and specializations:
${categories}

Request body JSON schema:
\`\`\`json
{
  "name": "2-80 chars",
  "description": "20-1000 chars; precise purpose, members, operating mode",
  "visibility": "PUBLIC | PRIVATE",
  "profileVisibility": "VISIBLE | HIDDEN",
  "category": "INVESTMENTS | SCIENCE | TECHNOLOGY | null",
  "specialization": "one specialization matching category, or null for private custom hub",
  "ssotEnabled": true,
  "strategyEnabled": false,
  "strategyIntervalHours": 72,
  "strategyTokenLimit": 80000,
  "monthlyTokenLimit": null,
  "judgeIterationLimit": 3,
  "channels": [
    {
      "slug": "url-safe-slug",
      "name": "Channel name",
      "description": "What this channel is for",
      "semanticQuery": "Retrieval focus for this sub-context"
    }
  ],
  "initialKnowledge": [
    {
      "title": "Distilled source title",
      "rawContent": "Sanitized durable context, decisions, open questions, project needs. No raw MEMORY.md.",
      "tags": ["strategy", "roadmap"],
      "privacyLevel": "COMMUNITY"
    }
  ]
}
\`\`\`

Before calling the API:
1. Show the owner the complete JSON you plan to send.
2. Ask for explicit approval.
3. Only after approval, send the POST request.

If the API succeeds, show the returned community URL or slug to the owner. If it fails, show the error and ask what to adjust.`;
}

export async function createCommunityFromAgent(ownerId: string, rawInput: unknown) {
  const input = AgentCommunityCreateSchema.parse(rawInput);
  const created = await createCommunity(ownerId, CreateCommunitySchema.parse({
    name: input.name,
    description: input.description,
    visibility: input.visibility,
    profileVisibility: input.profileVisibility,
    category: input.category,
    specialization: input.specialization,
  }));

  const communityId = created.id;
  const updated = await prisma.community.update({
    where: { id: communityId },
    data: {
      ssotEnabled: input.ssotEnabled,
      strategyEnabled: input.strategyEnabled,
      strategyIntervalHours: input.strategyIntervalHours,
      strategyTokenLimit: input.strategyTokenLimit,
      monthlyTokenLimit: input.monthlyTokenLimit ?? null,
      judgeIterationLimit: input.judgeIterationLimit,
      nextStrategySessionAt: input.strategyEnabled ? new Date() : null,
    },
    select: { slug: true },
  });

  for (const channel of input.channels) {
    await createCommunityChannel(communityId, channel);
  }

  if (input.initialKnowledge.length > 0) {
    const source = await createCommunityKnowledgeSource(
      communityId,
      {
        type: "MANUAL",
        name: "Agent-assisted setup",
        config: { created_by: "openclaw_agent_prompt" },
      },
      ownerId
    );

    for (const document of input.initialKnowledge) {
      await ingestCommunityKnowledgeDocument(
        communityId,
        {
          sourceId: source.id,
          title: document.title,
          rawContent: document.rawContent,
          tags: document.tags,
          privacyLevel: document.privacyLevel,
          metadata: { created_by: "openclaw_agent_prompt" },
        },
        { embed: !!process.env.OPENAI_API_KEY }
      );
    }
  }

  return getCommunityBySlug(updated.slug, ownerId);
}
