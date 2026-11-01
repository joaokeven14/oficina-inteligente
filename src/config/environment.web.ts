declare const __VITE_SUPABASE_URL__: string;
declare const __VITE_SUPABASE_ANON_KEY__: string;

export const supabaseEnvironment = {
  url: __VITE_SUPABASE_URL__.trim(),
  anonKey: __VITE_SUPABASE_ANON_KEY__.trim(),
};

export function isSupabaseConfigured(): boolean {
  return supabaseEnvironment.url.length > 0 && supabaseEnvironment.anonKey.length > 0;
}
