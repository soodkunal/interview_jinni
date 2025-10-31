import { createClient } from '@supabase/supabase-js'

// This client is for SERVER-SIDE use ONLY, with admin privileges.
// It bypasses all Row Level Security (RLS).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)