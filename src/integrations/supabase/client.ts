import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Real Supabase client, wired up per spec §2/§4. No live project is configured
 * for this environment yet — until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * are set, the app runs against the local mock backend in
 * src/integrations/backend instead (see src/integrations/backend/README.md).
 */
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const isSupabaseConfigured = Boolean(supabase);
