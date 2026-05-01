import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input as RequestInfo, { ...init as RequestInit, cache: 'no-store' }),
    },
  }
);
