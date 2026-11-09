import { createBrowserClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from './env';

let client: ReturnType<typeof createBrowserClient> | null = null;
export function sbClient() {
  if (!client) client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
