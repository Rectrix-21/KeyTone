import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseEnvError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Missing Supabase config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local and restart the dev server.";
  }
  return null;
}

export function createClient() {
  const envError = getSupabaseEnvError();
  if (envError) {
    throw new Error(envError);
  }

  return createBrowserClient(supabaseUrl!, supabaseAnonKey!);
}
