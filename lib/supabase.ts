import { createClient } from '@supabase/supabase-js';

// Setup clients for verifying credentials.
// Prefer import.meta.env in the browser (process is not defined there).
const nodeEnv =
  typeof process !== 'undefined' && process.env ? process.env : ({} as NodeJS.ProcessEnv);
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || nodeEnv.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || nodeEnv.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey =
  typeof window === 'undefined' ? nodeEnv.SUPABASE_SERVICE_ROLE_KEY || '' : '';

// Client for Frontend usage (Respects RLS)
export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // Required for Supabase Passkeys (WebAuthn) beta APIs
          experimental: { passkey: true },
        },
      })
    : null;

// Admin Client for Backend API usage (Bypasses RLS - use carefully!)
export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null;
