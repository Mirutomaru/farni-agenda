/**
 * CONFIG MANAGER — Soucastky Library Pattern for TypeScript/Next.js
 * 
 * Priority order: ENV vars → Defaults → Type-safe schemas
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema Definitions — zod validation per environment
// ---------------------------------------------------------------------------

export const EnvSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  
  // Site/URL config
  NEXT_PUBLIC_SITE_URL: z.string().url().optional().default('http://localhost:3000'),
  
  // Encryption
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be ≥32 chars'),
  
  // Email providers (one required)
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  
  // External APIs
  SMARTFORM_API_KEY: z.string().optional(),
  FIREBASE_CERTIFICATE_FUNCTION_URL: z.string().url().optional(),
  FIREBASE_FUNCTION_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

export function validateEnv(): { success: true; config: EnvConfig } | { 
  success: false; 
  missing: string[]; 
} {
  const envVars = process.env as Record<string, string | undefined>;
  
  const requiredKeys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
  ];
  
  const missing: string[] = [];
  for (const key of requiredKeys) {
    if (!envVars[key]) missing.push(key);
  }
  
  if (missing.length > 0) return { success: false, missing };
  
  try { new URL(envVars.NEXT_PUBLIC_SUPABASE_URL!); } catch {
    return { success: false, missing: ['NEXT_PUBLIC_SUPABASE_URL (invalid URL)'] };
  }
  
  const hasResend = !!envVars.RESEND_API_KEY;
  const hasSendgrid = !!envVars.SENDGRID_API_KEY;
  if (!hasResend && !hasSendgrid) {
    console.warn('[CONFIG] No email provider configured (RESEND_API_KEY or SENDGRID_API_KEY)');
  }
  
  return { success: true, config: envVars as unknown as EnvConfig };
}

// ---------------------------------------------------------------------------
// Singleton Config Instance
// ---------------------------------------------------------------------------

let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (_config) return _config;
  
  const result = validateEnv();
  if (result.success === true) {
    _config = result.config;
    return _config;
  }
  throw new MissingEnvError(result.missing);
}

export function getConfigSilent(): EnvConfig | null {
  if (_config) return _config;
  
  const result = validateEnv();
  if (!result.success) return null;
  
  _config = result.config;
  return _config;
}

// ---------------------------------------------------------------------------
// Convenience Accessors
// ---------------------------------------------------------------------------

export function getEnv<T extends keyof EnvConfig>(key: T, fallback?: EnvConfig[T]): EnvConfig[T] | undefined {
  const config = getConfigSilent();
  if (!config) return fallback;
  return (config[key] ?? fallback) as EnvConfig[T] | undefined;
}

export function hasEnv(key: keyof typeof process.env): boolean {
  return !!process.env[key];
}

export function getSupabaseConfig() {
  const config = getConfig();
  return {
    url: config.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getEmailConfig() {
  const config = getConfigSilent();
  
  if (config?.RESEND_API_KEY) return { provider: 'resend' as const, key: config.RESEND_API_KEY };
  if (config?.SENDGRID_API_KEY) return { provider: 'sendgrid' as const, key: config.SENDGRID_API_KEY };
  
  throw new EmailProviderError('No email provider configured');
}

export function getEncryptionKey(): string {
  const config = getConfig();
  return config.ENCRYPTION_KEY;
}

// ---------------------------------------------------------------------------
// Error Classes — Soucastky error hierarchy
// ---------------------------------------------------------------------------

export class ConfigError extends Error {
  public readonly code: string;
  
  constructor(code: string, message: string) {
    super(`[CONFIG][${code}] ${message}`);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export class MissingEnvError extends ConfigError {
  public readonly missingVars: string[];
  
  constructor(missingVars: string[]) {
    super('MISSING_ENV', `Missing required env vars: ${missingVars.join(', ')}`);
    this.name = 'MissingEnvError';
    this.missingVars = missingVars;
  }
}

export class EmailProviderError extends ConfigError {
  constructor(message: string) {
    super('EMAIL_PROVIDER', message);
    this.name = 'EmailProviderError';
  }
}

// ---------------------------------------------------------------------------
// Dev Mode — generate .env.example from schema
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'development' && process.argv.includes('--generate-env-example')) {
  const requiredKeys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE_KEY', 'ENCRYPTION_KEY', 'SMARTFORM_API_KEY'];
  
  console.log('\n=== .env.example ===\n');
  for (const key of requiredKeys) {
    console.log(`${key}=your_${key.toLowerCase()}_here`);
  }
}
