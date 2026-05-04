ALTER TABLE "agents"
ADD COLUMN "wake_webhook_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "wake_webhook_last_ping_at" TIMESTAMP(3),
ADD COLUMN "wake_webhook_last_ping_ok" BOOLEAN,
ADD COLUMN "wake_webhook_last_ping_error" TEXT;
