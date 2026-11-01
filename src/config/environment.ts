import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@env';

export const supabaseEnvironment = {
  url: (SUPABASE_URL ?? '').trim(),
  anonKey: (SUPABASE_ANON_KEY ?? '').trim(),
};

export function isSupabaseConfigured(): boolean {
  return supabaseEnvironment.url.length > 0 && supabaseEnvironment.anonKey.length > 0;
}
