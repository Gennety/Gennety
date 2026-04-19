-- Add initiator_agent_id so we can distinguish matches a user's agent sent
-- from ones sent to them. agent_a_id / agent_b_id are normalized by id order
-- for the unique constraint and don't reflect initiation.
ALTER TABLE "matches" ADD COLUMN "initiator_agent_id" TEXT;

-- Backfill from the earliest negotiation log with role='initiator'.
UPDATE "matches" m
SET "initiator_agent_id" = sub."agent_id"
FROM (
  SELECT DISTINCT ON ("match_id") "match_id", "agent_id"
  FROM "negotiation_logs"
  WHERE "role" = 'initiator'
  ORDER BY "match_id", "created_at" ASC
) sub
WHERE m."id" = sub."match_id";
