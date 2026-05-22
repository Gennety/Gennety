-- Personal Context Hub Connectors: owner-scoped connector credentials,
-- connector event ledger, and additive profile patch audit history.

CREATE TABLE "personal_connectors" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "encrypted_token" TEXT,
  "token_iv" TEXT,
  "config" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "personal_connectors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "personal_connector_events" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "raw_payload" JSONB NOT NULL,
  "distilled" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "personal_connector_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "profile_audit_logs" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "field_path" TEXT NOT NULL,
  "old_value" TEXT,
  "new_value" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "profile_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personal_connectors_owner_id_type_key"
  ON "personal_connectors"("owner_id", "type");

CREATE INDEX "personal_connectors_type_enabled_idx"
  ON "personal_connectors"("type", "enabled");

CREATE UNIQUE INDEX "personal_connector_events_connector_id_external_id_key"
  ON "personal_connector_events"("connector_id", "external_id");

CREATE INDEX "personal_connector_events_connector_id_status_created_at_idx"
  ON "personal_connector_events"("connector_id", "status", "created_at");

CREATE INDEX "profile_audit_logs_owner_id_idx"
  ON "profile_audit_logs"("owner_id");

ALTER TABLE "personal_connectors"
  ADD CONSTRAINT "personal_connectors_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personal_connector_events"
  ADD CONSTRAINT "personal_connector_events_connector_id_fkey"
  FOREIGN KEY ("connector_id") REFERENCES "personal_connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "profile_audit_logs"
  ADD CONSTRAINT "profile_audit_logs_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
