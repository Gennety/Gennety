-- Corporate workspace connectors for Slack, Jira, and Confluence-adjacent config.
ALTER TYPE "CommunityKnowledgeSourceType" ADD VALUE IF NOT EXISTS 'CONFLUENCE';

CREATE TABLE "corporate_connectors" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "encrypted_token" TEXT NOT NULL,
  "token_iv" TEXT NOT NULL,
  "webhook_secret" TEXT,
  "external_space_id" TEXT NOT NULL,
  "config" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "corporate_connectors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "corporate_connectors_community_id_platform_key"
  ON "corporate_connectors"("community_id", "platform");

CREATE INDEX "corporate_connectors_platform_enabled_idx"
  ON "corporate_connectors"("platform", "enabled");

CREATE INDEX "corporate_connectors_external_space_id_idx"
  ON "corporate_connectors"("external_space_id");

ALTER TABLE "corporate_connectors"
  ADD CONSTRAINT "corporate_connectors_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
