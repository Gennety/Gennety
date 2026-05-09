-- Contextual Hubs: upgrade Communities into agent-readable SSOT hubs.

-- Enums
CREATE TYPE "CommunityHandshakeStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'APPROVED',
  'REJECTED',
  'NEEDS_HUMAN_REVIEW',
  'WAITING_OWNER_AGENT',
  'FAILED',
  'EXPIRED'
);

CREATE TYPE "CommunityKnowledgeSourceType" AS ENUM (
  'MANUAL',
  'GITHUB',
  'NOTION',
  'MEMBER_CONTEXT',
  'CHANNEL_SUMMARY',
  'STRATEGY_OUTPUT'
);

CREATE TYPE "CommunityKnowledgeSourceStatus" AS ENUM (
  'ACTIVE',
  'PAUSED',
  'DEGRADED',
  'DISABLED'
);

CREATE TYPE "CommunityKnowledgePrivacy" AS ENUM (
  'PUBLIC',
  'COMMUNITY',
  'ADMINS',
  'OWNER_ONLY'
);

CREATE TYPE "CommunityKnowledgeDocumentStatus" AS ENUM (
  'ACTIVE',
  'SUPERSEDED',
  'DELETED',
  'REJECTED'
);

CREATE TYPE "CommunityStrategySessionStatus" AS ENUM (
  'SCHEDULED',
  'RUNNING',
  'PARTIAL',
  'COMPLETED',
  'SKIPPED_BUDGET',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "CommunityStrategyTurnRole" AS ENUM (
  'PARTICIPANT',
  'JUDGE',
  'CONNECTOR',
  'SYSTEM'
);

CREATE TYPE "CommunityActionProposalType" AS ENUM (
  'ROLE_CHANGE',
  'WORKLOAD_REBALANCE',
  'PARTNERSHIP_OUTREACH',
  'KNOWLEDGE_GAP',
  'CONNECTOR_CHANGE'
);

CREATE TYPE "CommunityActionProposalStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'EXPIRED'
);

-- Community settings
ALTER TABLE "communities"
  ADD COLUMN "ssot_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "knowledge_summary" TEXT,
  ADD COLUMN "strategy_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "strategy_interval_hours" INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN "last_strategy_session_at" TIMESTAMP(3),
  ADD COLUMN "next_strategy_session_at" TIMESTAMP(3),
  ADD COLUMN "strategy_token_limit" INTEGER NOT NULL DEFAULT 80000,
  ADD COLUMN "monthly_token_limit" INTEGER,
  ADD COLUMN "judge_iteration_limit" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "strategy_lock_until" TIMESTAMP(3),
  ADD COLUMN "role_changes_require_approval" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "communities_strategy_enabled_next_strategy_session_at_idx"
  ON "communities"("strategy_enabled", "next_strategy_session_at");

-- Community member operational metadata and consent flags
ALTER TABLE "community_members"
  ADD COLUMN "hub_title" TEXT,
  ADD COLUMN "hub_specialization" TEXT,
  ADD COLUMN "skill_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "capacity_hours_per_week" INTEGER,
  ADD COLUMN "current_load_score" DOUBLE PRECISION,
  ADD COLUMN "agent_participation_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "share_context_with_community" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "share_workload_signals" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "last_role_mapped_at" TIMESTAMP(3),
  ADD COLUMN "role_mapping_confidence" DOUBLE PRECISION;

-- Gatekeeper handshakes
CREATE TABLE "community_invite_handshakes" (
  "id" TEXT NOT NULL,
  "invite_id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "invitee_owner_id" TEXT NOT NULL,
  "invitee_agent_id" TEXT,
  "owner_agent_id" TEXT,
  "status" "CommunityHandshakeStatus" NOT NULL DEFAULT 'PENDING',
  "recommended_role" "CommunityMemberRole",
  "recommended_title" TEXT,
  "recommended_specialization" TEXT,
  "recommended_skill_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidence" DOUBLE PRECISION,
  "candidate_summary" TEXT,
  "owner_agent_summary" TEXT,
  "judge_summary" TEXT,
  "failure_reason" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "community_invite_handshakes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_invite_handshakes_invite_id_key"
  ON "community_invite_handshakes"("invite_id");
CREATE INDEX "community_invite_handshakes_community_id_status_idx"
  ON "community_invite_handshakes"("community_id", "status");
CREATE INDEX "community_invite_handshakes_invitee_owner_id_status_idx"
  ON "community_invite_handshakes"("invitee_owner_id", "status");
CREATE INDEX "community_invite_handshakes_expires_at_idx"
  ON "community_invite_handshakes"("expires_at");

ALTER TABLE "community_invite_handshakes"
  ADD CONSTRAINT "community_invite_handshakes_invite_id_fkey"
  FOREIGN KEY ("invite_id") REFERENCES "community_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_invite_handshakes"
  ADD CONSTRAINT "community_invite_handshakes_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sub-contextual channels
CREATE TABLE "community_channels" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "knowledge_filter" JSONB,
  "semantic_query" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "community_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_channels_community_id_slug_key"
  ON "community_channels"("community_id", "slug");
CREATE INDEX "community_channels_community_id_idx"
  ON "community_channels"("community_id");

ALTER TABLE "community_channels"
  ADD CONSTRAINT "community_channels_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Knowledge sources, documents, chunks
CREATE TABLE "community_knowledge_sources" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "type" "CommunityKnowledgeSourceType" NOT NULL,
  "name" TEXT NOT NULL,
  "config" JSONB,
  "status" "CommunityKnowledgeSourceStatus" NOT NULL DEFAULT 'ACTIVE',
  "sync_cursor" TEXT,
  "last_synced_at" TIMESTAMP(3),
  "last_successful_sync_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_by_owner_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "community_knowledge_sources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_knowledge_sources_community_id_type_status_idx"
  ON "community_knowledge_sources"("community_id", "type", "status");

ALTER TABLE "community_knowledge_sources"
  ADD CONSTRAINT "community_knowledge_sources_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "community_knowledge_documents" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "external_id" TEXT,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "source_hash" TEXT NOT NULL,
  "distilled_hash" TEXT,
  "distilled_content" TEXT,
  "summary" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "privacy_level" "CommunityKnowledgePrivacy" NOT NULL DEFAULT 'COMMUNITY',
  "status" "CommunityKnowledgeDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "stale_after" TIMESTAMP(3),
  "superseded_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "community_knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_knowledge_documents_source_id_external_id_key"
  ON "community_knowledge_documents"("source_id", "external_id");
CREATE INDEX "community_knowledge_documents_community_id_status_privacy_level_idx"
  ON "community_knowledge_documents"("community_id", "status", "privacy_level");
CREATE INDEX "community_knowledge_documents_community_id_source_hash_idx"
  ON "community_knowledge_documents"("community_id", "source_hash");

ALTER TABLE "community_knowledge_documents"
  ADD CONSTRAINT "community_knowledge_documents_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_knowledge_documents"
  ADD CONSTRAINT "community_knowledge_documents_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "community_knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "community_knowledge_chunks" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1536),
  "token_count" INTEGER NOT NULL DEFAULT 0,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "privacy_level" "CommunityKnowledgePrivacy" NOT NULL DEFAULT 'COMMUNITY',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "community_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_knowledge_chunks_community_id_privacy_level_idx"
  ON "community_knowledge_chunks"("community_id", "privacy_level");
CREATE INDEX "community_knowledge_chunks_document_id_idx"
  ON "community_knowledge_chunks"("document_id");
CREATE INDEX "community_knowledge_chunks_embedding_hnsw_idx"
  ON "community_knowledge_chunks"
  USING hnsw ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;

ALTER TABLE "community_knowledge_chunks"
  ADD CONSTRAINT "community_knowledge_chunks_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_knowledge_chunks"
  ADD CONSTRAINT "community_knowledge_chunks_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "community_knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Strategic session engine
CREATE TABLE "community_strategy_sessions" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "status" "CommunityStrategySessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduled_for" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "max_rounds" INTEGER NOT NULL DEFAULT 2,
  "judge_iteration_limit" INTEGER NOT NULL DEFAULT 3,
  "token_limit" INTEGER NOT NULL,
  "tokens_used" INTEGER NOT NULL DEFAULT 0,
  "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "summary" TEXT,
  "judge_verdict" JSONB,
  "partnership_candidates" JSONB,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "community_strategy_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_strategy_sessions_community_id_status_scheduled_for_idx"
  ON "community_strategy_sessions"("community_id", "status", "scheduled_for");

ALTER TABLE "community_strategy_sessions"
  ADD CONSTRAINT "community_strategy_sessions_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "community_strategy_turns" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "member_id" TEXT,
  "role" "CommunityStrategyTurnRole" NOT NULL,
  "round" INTEGER NOT NULL,
  "input_hash" TEXT,
  "output" JSONB NOT NULL,
  "tokens_input" INTEGER NOT NULL DEFAULT 0,
  "tokens_output" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "community_strategy_turns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_strategy_turns_session_id_round_role_idx"
  ON "community_strategy_turns"("session_id", "round", "role");

ALTER TABLE "community_strategy_turns"
  ADD CONSTRAINT "community_strategy_turns_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "community_strategy_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_strategy_turns"
  ADD CONSTRAINT "community_strategy_turns_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "community_action_proposals" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "session_id" TEXT,
  "type" "CommunityActionProposalType" NOT NULL,
  "status" "CommunityActionProposalStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "payload" JSONB NOT NULL,
  "judge_confidence" DOUBLE PRECISION,
  "requires_role" "CommunityMemberRole" NOT NULL DEFAULT 'ADMIN',
  "decided_by_owner_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "community_action_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_action_proposals_community_id_status_type_idx"
  ON "community_action_proposals"("community_id", "status", "type");

ALTER TABLE "community_action_proposals"
  ADD CONSTRAINT "community_action_proposals_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_action_proposals"
  ADD CONSTRAINT "community_action_proposals_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "community_strategy_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Compute and analytics dimensions
ALTER TABLE "analytics_events"
  ADD COLUMN "community_id" TEXT,
  ADD COLUMN "strategy_session_id" TEXT,
  ADD COLUMN "knowledge_source_id" TEXT;

CREATE INDEX "analytics_events_community_id_created_at_idx"
  ON "analytics_events"("community_id", "created_at");
CREATE INDEX "analytics_events_strategy_session_id_created_at_idx"
  ON "analytics_events"("strategy_session_id", "created_at");
CREATE INDEX "analytics_events_knowledge_source_id_created_at_idx"
  ON "analytics_events"("knowledge_source_id", "created_at");

ALTER TABLE "compute_usage"
  ADD COLUMN "community_id" TEXT,
  ADD COLUMN "strategy_session_id" TEXT,
  ADD COLUMN "knowledge_source_id" TEXT;

CREATE INDEX "compute_usage_community_id_created_at_idx"
  ON "compute_usage"("community_id", "created_at");
CREATE INDEX "compute_usage_strategy_session_id_created_at_idx"
  ON "compute_usage"("strategy_session_id", "created_at");
CREATE INDEX "compute_usage_knowledge_source_id_created_at_idx"
  ON "compute_usage"("knowledge_source_id", "created_at");

