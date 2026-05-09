import assert from "node:assert";
import {
  COMMUNITY_SPECIALIZATIONS_BY_CATEGORY,
  CreateCommunitySchema,
  CommunityInviteSchema,
} from "../src/types/community";
import {
  AgentCommunityCreateSchema,
  createCommunityAgentCreateToken,
  generateCommunityAgentCreatePrompt,
  verifyCommunityAgentCreateToken,
} from "../src/lib/services/community-agent-create";

const publicCommunity = CreateCommunitySchema.parse({
  name: "AI Solo Founders",
  description: "A focused hub for solo builders working with AI.",
  visibility: "PUBLIC",
  category: "TECHNOLOGY",
  specialization: "AI_DEVELOPMENT",
});

assert.equal(publicCommunity.name, "AI Solo Founders");
assert.equal(publicCommunity.profileVisibility, "VISIBLE");

const missingCategory = CreateCommunitySchema.safeParse({
  name: "Hidden Lab",
  visibility: "PUBLIC",
  specialization: "AI_DEVELOPMENT",
});

assert.equal(missingCategory.success, false, "public community requires a category");

const mismatchedSpecialization = CreateCommunitySchema.safeParse({
  name: "Wrong bucket",
  visibility: "PUBLIC",
  category: "SCIENCE",
  specialization: "SOLO_FOUNDERS",
});

assert.equal(
  mismatchedSpecialization.success,
  false,
  "specialization must belong to selected category"
);

const privateCommunity = CreateCommunitySchema.parse({
  name: "Private angel circle",
  visibility: "PRIVATE",
});

assert.equal(privateCommunity.visibility, "PRIVATE");
assert.equal(privateCommunity.category, undefined);

const emailInvite = CommunityInviteSchema.safeParse({
  inviteeEmail: "person@example.com",
});

assert.equal(emailInvite.success, true, "email invite should be accepted");

const emptyInvite = CommunityInviteSchema.safeParse({});

assert.equal(emptyInvite.success, false, "invite must target owner id or email");
assert.deepEqual(COMMUNITY_SPECIALIZATIONS_BY_CATEGORY.TECHNOLOGY, [
  "AI_DEVELOPMENT",
  "SOLO_FOUNDERS",
]);

const agentCommunity = AgentCommunityCreateSchema.parse({
  name: "Agentic AI Builders",
  description: "A private hub for AI builders coordinating product strategy, shared context, and partner discovery.",
  visibility: "PRIVATE",
  ssotEnabled: true,
  strategyEnabled: true,
  channels: [
    {
      slug: "strategy",
      name: "Strategy",
      semanticQuery: "roadmap, blockers, partner needs",
    },
  ],
  initialKnowledge: [
    {
      title: "Hub thesis",
      rawContent: "The hub focuses on trusted AI interfaces and cross-network partnership discovery.",
      tags: ["strategy"],
    },
  ],
});

assert.equal(agentCommunity.visibility, "PRIVATE");
assert.equal(agentCommunity.ssotEnabled, true);
assert.equal(agentCommunity.channels[0].slug, "strategy");

const badAgentCommunity = AgentCommunityCreateSchema.safeParse({
  name: "Public without category",
  description: "This public community is missing category data and should fail validation.",
  visibility: "PUBLIC",
});

assert.equal(badAgentCommunity.success, false, "agent-created public communities require taxonomy");

const { token, expiresAt } = createCommunityAgentCreateToken("owner_agent_create_test", new Date("2026-05-09T00:00:00.000Z"));
const verified = verifyCommunityAgentCreateToken(token, new Date("2026-05-09T00:05:00.000Z"));
assert.equal(verified.ownerId, "owner_agent_create_test");
assert.throws(
  () => verifyCommunityAgentCreateToken(token, new Date(expiresAt.getTime() + 1000)),
  /expired/
);

const prompt = generateCommunityAgentCreatePrompt({
  ownerName: "Alex",
  endpointUrl: "http://localhost:3000/api/communities/agent-create",
  token,
  expiresAt,
});

assert.match(prompt, /Authorization: Bearer /);
assert.match(prompt, /Show the owner the complete JSON/);
assert.match(prompt, /AI_DEVELOPMENT/);

console.log("PASS: community validation rules");
