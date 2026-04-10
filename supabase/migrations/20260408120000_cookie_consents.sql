-- Cookie consent audit log (append-only)
-- Stores every consent action for GDPR/ePrivacy compliance

CREATE TABLE IF NOT EXISTS public.cookie_consents (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  action           TEXT NOT NULL CHECK (action IN ('accepted', 'rejected', 'partial', 'withdrawn')),
  session_id       TEXT NOT NULL,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash          TEXT,
  user_agent       TEXT,
  country          CHAR(2),
  policy_version   TEXT NOT NULL,
  consents         JSONB NOT NULL DEFAULT '{}',
  banner_text_hash TEXT
);

-- Indexes for common queries
CREATE INDEX idx_cookie_consents_session_id      ON public.cookie_consents (session_id);
CREATE INDEX idx_cookie_consents_user_id         ON public.cookie_consents (user_id);
CREATE INDEX idx_cookie_consents_created_at      ON public.cookie_consents (created_at);
CREATE INDEX idx_cookie_consents_policy_version  ON public.cookie_consents (policy_version);

-- RLS: only service role can read/write (no public access)
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON public.cookie_consents
  USING (auth.role() = 'service_role');
