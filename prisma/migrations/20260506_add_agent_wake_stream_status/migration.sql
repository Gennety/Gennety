ALTER TABLE "agents"
ADD COLUMN "wake_stream_last_connected_at" TIMESTAMP(3),
ADD COLUMN "wake_stream_last_seen_at" TIMESTAMP(3),
ADD COLUMN "wake_stream_last_disconnected_at" TIMESTAMP(3),
ADD COLUMN "wake_stream_last_error" TEXT;
