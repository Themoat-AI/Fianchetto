import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const chatConfigured = Boolean(url && anonKey);
export const supabase: SupabaseClient | null = chatConfigured ? createClient(url!, anonKey!) : null;

export async function ensureChatSession() {
  if (!supabase) throw new Error('Chat is not set up yet. Add your Supabase URL and anon key.');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error('Could not start a private chat session. Enable Anonymous sign-ins in Supabase Auth.');
  return data.user.id;
}
