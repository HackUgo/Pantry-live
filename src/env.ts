// Bindings and variables the Worker receives. Plain vars come from
// wrangler.jsonc. The secret ones are set with `wrangler secret put`.

export interface Env {
  ASSETS: Fetcher;
  RATE_LIMITER?: RateLimit;

  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  READER_MODEL: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_SUBJECT: string;
  GMAIL_USER: string;
  STAFF_ALERT_EMAIL: string;
  SITE_URL: string;
  STAFF_PIN: string;
  TIME_ZONE: string;
  PLACE: string;
  PANTRY_HOURS: string;

  // Secrets
  ANTHROPIC_API_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VAPID_PRIVATE_KEY: string;
  GMAIL_APP_PASSWORD: string;
}

export type AppEnv = { Bindings: Env };
