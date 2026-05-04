-- Match discovery source enum
CREATE TYPE "MatchDiscoverySource" AS ENUM ('UNKNOWN', 'SEARCH', 'BEACON');

-- Alter matches with exact analytics fields
ALTER TABLE "matches"
ADD COLUMN "match_similarity" DOUBLE PRECISION,
ADD COLUMN "discovery_source" "MatchDiscoverySource" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "source_beacon_id" TEXT,
ADD COLUMN "agent_a_accepted_at" TIMESTAMP(3),
ADD COLUMN "agent_b_accepted_at" TIMESTAMP(3);

-- Backfill accepted timestamps approximately from the first agreement/evaluation logs
UPDATE "matches" m
SET "agent_a_accepted_at" = sub.created_at
FROM (
  SELECT nl."match_id", MIN(nl."created_at") AS created_at
  FROM "negotiation_logs" nl
  JOIN "matches" m2 ON m2."id" = nl."match_id"
  WHERE nl."agent_id" = m2."agent_a_id"
    AND nl."type" IN ('evaluation', 'proposal', 'agreement')
  GROUP BY nl."match_id"
) AS sub
WHERE m."id" = sub."match_id"
  AND m."agent_a_accepted_at" IS NULL;

UPDATE "matches" m
SET "agent_b_accepted_at" = sub.created_at
FROM (
  SELECT nl."match_id", MIN(nl."created_at") AS created_at
  FROM "negotiation_logs" nl
  JOIN "matches" m2 ON m2."id" = nl."match_id"
  WHERE nl."agent_id" = m2."agent_b_id"
    AND nl."type" IN ('evaluation', 'proposal', 'agreement')
  GROUP BY nl."match_id"
) AS sub
WHERE m."id" = sub."match_id"
  AND m."agent_b_accepted_at" IS NULL;

-- Analytics event ledger
CREATE TABLE "analytics_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "owner_id" TEXT,
  "agent_id" TEXT,
  "match_id" TEXT,
  "beacon_id" TEXT,
  "chat_id" TEXT,
  "advice_session_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_events_type_created_at_idx" ON "analytics_events"("type", "created_at");
CREATE INDEX "analytics_events_owner_id_created_at_idx" ON "analytics_events"("owner_id", "created_at");
CREATE INDEX "analytics_events_agent_id_created_at_idx" ON "analytics_events"("agent_id", "created_at");
CREATE INDEX "analytics_events_match_id_created_at_idx" ON "analytics_events"("match_id", "created_at");
CREATE INDEX "analytics_events_beacon_id_created_at_idx" ON "analytics_events"("beacon_id", "created_at");
CREATE INDEX "analytics_events_chat_id_created_at_idx" ON "analytics_events"("chat_id", "created_at");
CREATE INDEX "analytics_events_advice_session_id_created_at_idx" ON "analytics_events"("advice_session_id", "created_at");

-- Compute usage ledger
CREATE TABLE "compute_usage" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "owner_id" TEXT,
  "agent_id" TEXT,
  "match_id" TEXT,
  "beacon_id" TEXT,
  "chat_id" TEXT,
  "advice_session_id" TEXT,
  "tokens_input" INTEGER NOT NULL DEFAULT 0,
  "tokens_output" INTEGER NOT NULL DEFAULT 0,
  "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "compute_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compute_usage_category_created_at_idx" ON "compute_usage"("category", "created_at");
CREATE INDEX "compute_usage_operation_created_at_idx" ON "compute_usage"("operation", "created_at");
CREATE INDEX "compute_usage_owner_id_created_at_idx" ON "compute_usage"("owner_id", "created_at");
CREATE INDEX "compute_usage_agent_id_created_at_idx" ON "compute_usage"("agent_id", "created_at");
CREATE INDEX "compute_usage_match_id_created_at_idx" ON "compute_usage"("match_id", "created_at");
CREATE INDEX "compute_usage_beacon_id_created_at_idx" ON "compute_usage"("beacon_id", "created_at");
CREATE INDEX "compute_usage_chat_id_created_at_idx" ON "compute_usage"("chat_id", "created_at");
CREATE INDEX "compute_usage_advice_session_id_created_at_idx" ON "compute_usage"("advice_session_id", "created_at");
