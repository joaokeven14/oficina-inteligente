import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseEnvironment } from '../config/environment';
import { supabaseSessionStorage } from './sessionStorage';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase ainda não foi configurado para este ambiente.');
  }

  if (!client) {
    client = createClient(supabaseEnvironment.url, supabaseEnvironment.anonKey, {
      auth: {
        storage: supabaseSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
