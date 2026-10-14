import { createClient } from '@supabase/supabase-js';
import { createPortalTransport } from './portalTransport.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required Supabase admin configuration.');
}

try {
  const configuredUrl = new URL(supabaseUrl);
  const localDevelopment = ['localhost', '127.0.0.1'].includes(configuredUrl.hostname);
  if (configuredUrl.protocol !== 'https:' && !localDevelopment) {
    throw new Error('Supabase must use HTTPS outside local development.');
  }
} catch (error) {
  if (error instanceof Error && error.message.includes('Supabase must use HTTPS')) throw error;
  throw new Error('VITE_SUPABASE_URL is not a valid URL.');
}

let recoveryStorage;
try { recoveryStorage = window.sessionStorage; } catch { /* Storage can be disabled. */ }
export const portalTransport = createPortalTransport({ fetch: (...args) => fetch(...args), storage: recoveryStorage });
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: portalTransport.fetch },
});
