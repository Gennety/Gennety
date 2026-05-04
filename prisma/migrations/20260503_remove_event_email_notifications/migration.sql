ALTER TABLE "owners"
DROP COLUMN "notify_all_emails",
DROP COLUMN "notify_match_proposals",
DROP COLUMN "notify_new_messages",
DROP COLUMN "notify_freshness";

ALTER TABLE "inbox_events"
DROP COLUMN "email_fallback_sent_at";

DROP TABLE IF EXISTS "email_notifications";
