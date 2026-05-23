import { z } from "zod";

export const CorporateConnectorPlatform = z.enum(["SLACK", "JIRA"]);
export type CorporateConnectorPlatform = z.infer<typeof CorporateConnectorPlatform>;

export const CorporateConnectorConfigSchema = z.record(z.string(), z.unknown()).default({});
export type CorporateConnectorConfig = z.infer<typeof CorporateConnectorConfigSchema>;

export const CorporateConnectorUpsertSchema = z.object({
  communityId: z.string().min(1),
  platform: CorporateConnectorPlatform,
  enabled: z.boolean().default(true),
  externalSpaceId: z.string().trim().min(1).max(300),
  token: z.string().min(1).max(20_000).optional(),
  webhookSecret: z.string().trim().min(1).max(20_000).optional(),
  config: CorporateConnectorConfigSchema.optional(),
});
export type CorporateConnectorUpsertInput = z.infer<typeof CorporateConnectorUpsertSchema>;

export const JiraIssueContextSchema = z.object({
  communityId: z.string().min(1).optional(),
  connectorId: z.string().min(1).optional(),
  cloudId: z.string().min(1).optional(),
  issueKey: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(20_000).optional(),
  requesterExternalUserId: z.string().trim().max(300).optional(),
  topK: z.number().int().min(1).max(10).optional(),
});
export type JiraIssueContextInput = z.infer<typeof JiraIssueContextSchema>;
