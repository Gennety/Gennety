-- Team Framework: dynamic instructions, autonomy role config, and agent self-assessment.

CREATE TABLE "agent_role_configs" (
  "id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "autonomy_phase" INTEGER NOT NULL DEFAULT 1,
  "custom_soul" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_role_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_role_configs_autonomy_phase_check" CHECK ("autonomy_phase" >= 1 AND "autonomy_phase" <= 3)
);

CREATE UNIQUE INDEX "agent_role_configs_member_id_key"
  ON "agent_role_configs"("member_id");

ALTER TABLE "agent_role_configs"
  ADD CONSTRAINT "agent_role_configs_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "community_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agent_instructions" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "soul" TEXT NOT NULL,
  "current_goals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recent_activity" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "open_blockers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "delegation_rights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_instructions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_instructions_agent_id_community_id_key"
  ON "agent_instructions"("agent_id", "community_id");

CREATE INDEX "agent_instructions_community_id_generated_at_idx"
  ON "agent_instructions"("community_id", "generated_at");

ALTER TABLE "agent_instructions"
  ADD CONSTRAINT "agent_instructions_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_instructions"
  ADD CONSTRAINT "agent_instructions_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agent_self_assessments" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "tasks_completed" INTEGER NOT NULL,
  "tasks_auto_delegated" INTEGER NOT NULL,
  "approvals_requested" INTEGER NOT NULL,
  "blockers_raised" INTEGER NOT NULL,
  "response_time_p50" DOUBLE PRECISION NOT NULL,
  "auto_delegated_ratio" DOUBLE PRECISION NOT NULL,
  "gaps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "suggestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_self_assessments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_self_assessments_agent_id_community_id_period_key"
  ON "agent_self_assessments"("agent_id", "community_id", "period");

CREATE INDEX "agent_self_assessments_community_id_period_idx"
  ON "agent_self_assessments"("community_id", "period");

ALTER TABLE "agent_self_assessments"
  ADD CONSTRAINT "agent_self_assessments_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_self_assessments"
  ADD CONSTRAINT "agent_self_assessments_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
