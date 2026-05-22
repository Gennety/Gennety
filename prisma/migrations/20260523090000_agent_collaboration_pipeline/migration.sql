-- Agent Collaboration Pipeline: durable team activity log and task state machine.

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM (
  'PROPOSED',
  'ASSIGNED',
  'RUNNING',
  'APPROVAL_REQUIRED',
  'COMPLETED',
  'REJECTED'
);

-- CreateEnum
CREATE TYPE "TaskRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH'
);

-- CreateTable
CREATE TABLE "team_activity_logs" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "team_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tasks" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "AgentTaskStatus" NOT NULL DEFAULT 'PROPOSED',
  "risk_level" "TaskRiskLevel" NOT NULL DEFAULT 'LOW',
  "creator_id" TEXT NOT NULL,
  "assignee_id" TEXT,
  "requires_hitl" BOOLEAN NOT NULL DEFAULT false,
  "approval_requested" BOOLEAN NOT NULL DEFAULT false,
  "approved_by_owner_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_activity_logs_community_id_idx" ON "team_activity_logs"("community_id");

-- CreateIndex
CREATE INDEX "team_activity_logs_created_at_idx" ON "team_activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "agent_tasks_community_id_idx" ON "agent_tasks"("community_id");

-- CreateIndex
CREATE INDEX "agent_tasks_status_idx" ON "agent_tasks"("status");

-- AddForeignKey
ALTER TABLE "team_activity_logs"
  ADD CONSTRAINT "team_activity_logs_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks"
  ADD CONSTRAINT "agent_tasks_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks"
  ADD CONSTRAINT "agent_tasks_approved_by_owner_id_fkey"
  FOREIGN KEY ("approved_by_owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
