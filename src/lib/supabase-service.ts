import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated with the service role key.
 * Use ONLY on the server side — never import in client code.
 */
export const supabaseService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
