-- Cookie consent audit log (append-only).
-- This migration lives under Prisma because production deploy runs
-- `prisma migrate deploy` from the Docker entrypoint.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.cookie_consents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  action           TEXT NOT NULL CHECK (action IN ('accepted', 'rejected', 'partial', 'withdrawn')),
  policy_version   TEXT NOT NULL,
  consents         JSONB NOT NULL DEFAULT '{}',
  ip_hash          TEXT,
  user_agent       TEXT,
  owner_id         TEXT REFERENCES public.owners(id) ON DELETE SET NULL,
  session_id       TEXT,
  source           TEXT NOT NULL DEFAULT 'website',
  site_host        TEXT,
  page_url         TEXT,
  country          CHAR(2),
  banner_text_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_cookie_consents_created_at
  ON public.cookie_consents (created_at);

CREATE INDEX IF NOT EXISTS idx_cookie_consents_policy_version
  ON public.cookie_consents (policy_version);

CREATE INDEX IF NOT EXISTS idx_cookie_consents_owner_id
  ON public.cookie_consents (owner_id);

CREATE INDEX IF NOT EXISTS idx_cookie_consents_session_id
  ON public.cookie_consents (session_id);

CREATE INDEX IF NOT EXISTS idx_cookie_consents_source
  ON public.cookie_consents (source);

ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prevent_cookie_consents_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'cookie_consents is append-only';
END;
$$;

DROP TRIGGER IF EXISTS cookie_consents_no_update ON public.cookie_consents;
CREATE TRIGGER cookie_consents_no_update
  BEFORE UPDATE ON public.cookie_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cookie_consents_mutation();

DROP TRIGGER IF EXISTS cookie_consents_no_delete ON public.cookie_consents;
CREATE TRIGGER cookie_consents_no_delete
  BEFORE DELETE ON public.cookie_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cookie_consents_mutation();
