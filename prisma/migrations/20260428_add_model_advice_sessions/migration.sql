CREATE TYPE "AdviceSessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'DECLINED', 'FAILED');

CREATE TYPE "MessageKind" AS ENUM (
  'HUMAN',
  'AGENT_INTRO',
  'MODEL_ADVICE_REQUEST',
  'MODEL_ADVICE_STATUS',
  'MODEL_ADVICE_AGENT',
  'MODEL_ADVICE_RESULT'
);

CREATE TABLE "advice_sessions" (
  "id" TEXT NOT NULL,
  "chat_id" TEXT NOT NULL,
  "requested_by_owner_id" TEXT NOT NULL,
  "responder_owner_id" TEXT,
  "prompt_key" TEXT,
  "prompt_title" TEXT NOT NULL,
  "prompt_text" TEXT NOT NULL,
  "status" "AdviceSessionStatus" NOT NULL DEFAULT 'PENDING',
  "responded_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "summary" TEXT,
  "recommendation" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "advice_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "messages"
  ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN "advice_session_id" TEXT;

UPDATE "messages"
SET "kind" = 'AGENT_INTRO'
WHERE "from_owner" IN ('agent_a', 'agent_b');

CREATE INDEX "advice_sessions_chat_id_status_idx" ON "advice_sessions"("chat_id", "status");
CREATE INDEX "advice_sessions_requested_by_owner_id_status_idx" ON "advice_sessions"("requested_by_owner_id", "status");
CREATE UNIQUE INDEX "advice_sessions_one_live_per_chat_idx"
ON "advice_sessions"("chat_id")
WHERE "status" IN ('PENDING', 'ACTIVE');
CREATE INDEX "messages_chat_id_created_at_idx" ON "messages"("chat_id", "created_at");
CREATE INDEX "messages_advice_session_id_idx" ON "messages"("advice_session_id");

ALTER TABLE "advice_sessions"
  ADD CONSTRAINT "advice_sessions_chat_id_fkey"
  FOREIGN KEY ("chat_id") REFERENCES "chats"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_advice_session_id_fkey"
  FOREIGN KEY ("advice_session_id") REFERENCES "advice_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
