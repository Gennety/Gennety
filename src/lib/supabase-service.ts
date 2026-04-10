import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated with the service role key.
 * Use ONLY on the server side — never import in client code.
 * Lazily initialised so the module can be imported even when env vars are missing (e.g. CI build).
 */
let _client: SupabaseClient | null = null;

export function getSupabaseService(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}
