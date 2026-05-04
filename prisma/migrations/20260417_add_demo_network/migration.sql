-- Demo network: simulated agents that run through the same MCP/service code paths
-- as real agents, driven by a server-side auto-responder. Isolated via is_demo flag.

-- AlterTable: mark owners as demo
ALTER TABLE "owners" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: mark agents as demo + persona metadata for LLM responder
ALTER TABLE "agents" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agents" ADD COLUMN "demo_persona" JSONB;
ALTER TABLE "agents" ADD COLUMN "last_demo_tick_at" TIMESTAMP(3);

-- Indexes: responder worker queries demo agents by is_demo + last_demo_tick_at
CREATE INDEX "agents_is_demo_idx" ON "agents"("is_demo");
CREATE INDEX "agents_is_demo_last_demo_tick_at_idx" ON "agents"("is_demo", "last_demo_tick_at");
CREATE INDEX "owners_is_demo_idx" ON "owners"("is_demo");

-- CreateTable: responder observability log
CREATE TABLE "demo_responder_logs" (
    "id" TEXT NOT NULL,
    "demo_agent_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "target_id" TEXT,
    "target_type" TEXT,
    "mcp_tool" TEXT,
    "latency_ms" INTEGER,
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "success" BOOLEAN NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "llm_prompt" TEXT,
    "llm_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_responder_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demo_responder_logs_demo_agent_id_created_at_idx" ON "demo_responder_logs"("demo_agent_id", "created_at");
CREATE INDEX "demo_responder_logs_event_created_at_idx" ON "demo_responder_logs"("event", "created_at");
CREATE INDEX "demo_responder_logs_success_created_at_idx" ON "demo_responder_logs"("success", "created_at");

-- CreateTable: per-agent daily action counters (reset via cron)
CREATE TABLE "demo_agent_quotas" (
    "id" TEXT NOT NULL,
    "demo_agent_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "negotiations_initiated" INTEGER NOT NULL DEFAULT 0,
    "negotiations_responded" INTEGER NOT NULL DEFAULT 0,
    "chat_messages_sent" INTEGER NOT NULL DEFAULT 0,
    "llm_calls" INTEGER NOT NULL DEFAULT 0,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pause_reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_agent_quotas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "demo_agent_quotas_demo_agent_id_day_key" ON "demo_agent_quotas"("demo_agent_id", "day");
CREATE INDEX "demo_agent_quotas_day_idx" ON "demo_agent_quotas"("day");
