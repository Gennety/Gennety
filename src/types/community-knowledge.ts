import { z } from "zod";

export const CommunityKnowledgeSourceType = z.enum([
  "MANUAL",
  "GITHUB",
  "NOTION",
  "MEMBER_CONTEXT",
  "CHANNEL_SUMMARY",
  "STRATEGY_OUTPUT",
]);
export type CommunityKnowledgeSourceType = z.infer<typeof CommunityKnowledgeSourceType>;

export const CommunityKnowledgeSourceStatus = z.enum([
  "ACTIVE",
  "PAUSED",
  "DEGRADED",
  "DISABLED",
]);
export type CommunityKnowledgeSourceStatus = z.infer<typeof CommunityKnowledgeSourceStatus>;

export const CommunityKnowledgePrivacy = z.enum([
  "PUBLIC",
  "COMMUNITY",
  "ADMINS",
  "OWNER_ONLY",
]);
export type CommunityKnowledgePrivacy = z.infer<typeof CommunityKnowledgePrivacy>;

export const CommunityKnowledgeDocumentStatus = z.enum([
  "ACTIVE",
  "SUPERSEDED",
  "DELETED",
  "REJECTED",
]);
export type CommunityKnowledgeDocumentStatus = z.infer<typeof CommunityKnowledgeDocumentStatus>;

export const CommunityChannelSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe channel slug"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional(),
  semanticQuery: z.string().trim().max(2000).optional(),
  knowledgeFilter: z.record(z.string(), z.unknown()).optional(),
});
export type CommunityChannelInput = z.infer<typeof CommunityChannelSchema>;

export const CommunityKnowledgeSourceSchema = z.object({
  type: CommunityKnowledgeSourceType,
  name: z.string().trim().min(2).max(120),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type CommunityKnowledgeSourceInput = z.infer<typeof CommunityKnowledgeSourceSchema>;

export const CommunityKnowledgeDocumentSchema = z.object({
  sourceId: z.string().min(1),
  externalId: z.string().trim().max(300).optional(),
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().url().max(1000).optional(),
  rawContent: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1).max(60)).default([]),
  privacyLevel: CommunityKnowledgePrivacy.default("COMMUNITY"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CommunityKnowledgeDocumentInput = z.infer<typeof CommunityKnowledgeDocumentSchema>;

