import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { handleDeleteAccount } from './handler.ts'

// These credentials exist only in the Edge Function environment, never in VITE_ variables.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

Deno.serve((request: Request) => handleDeleteAccount(request, admin.auth))
