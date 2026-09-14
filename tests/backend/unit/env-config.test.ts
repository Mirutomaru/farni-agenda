// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO ENV CONFIG (Zod validace + validateEnv)
// validateEnv() čte z process.env — nastavujeme env PŘED voláním.

import { validateEnv, EnvSchema } from '@/lib/config/env_config';

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-123',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-456',
  ENCRYPTION_KEY: 'a'.repeat(64), // min 32 znaků
};

describe('validateEnv — validní konfigurace', () => {
  const saved = process.env;

  beforeEach(() => {
    process.env = { ...saved, ...VALID_ENV };
  });

  afterEach(() => {
    process.env = saved;
  });

  it('přijme kompletní platnou konfiguraci (success=true)', () => {
    const result = validateEnv();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.config.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co');
      expect(result.config.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-456');
    }
  });

  it('přijme konfiguraci s email providerem (RESEND_API_KEY)', () => {
    process.env.RESEND_API_KEY = 're_123';
    const result = validateEnv();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.config.RESEND_API_KEY).toBe('re_123');
    }
  });
});

describe('validateEnv — chybná konfigurace', () => {
  const saved = process.env;

  beforeEach(() => {
    // Čisté prostředí bez Supabase proměnných
    process.env = {};
  });

  afterEach(() => {
    process.env = saved;
  });

  it('zamítne prázdné prostředí (success=false + missing pole)', () => {
    const result = validateEnv();

    expect(result.success).toBe(false);
    if (!result.success) {
      // Všechna 4 povinná pole chybí
      expect(result.missing.length).toBe(4);
      expect(result.missing).toContain('NEXT_PUBLIC_SUPABASE_URL');
      expect(result.missing).toContain('ENCRYPTION_KEY');
    }
  });

  it('zamítne chybějící SUPABASE_URL', () => {
    process.env = { ...VALID_ENV };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const result = validateEnv();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.missing).toContain('NEXT_PUBLIC_SUPABASE_URL');
    }
  });

  it('zamítne chybějící ENCRYPTION_KEY (povinné pole)', () => {
    process.env = { ...VALID_ENV };
    delete process.env.ENCRYPTION_KEY;

    const result = validateEnv();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.missing).toContain('ENCRYPTION_KEY');
    }
  });

  it('zamítne neplatnou URL (invalid URL)', () => {
    process.env = { ...VALID_ENV, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' };

    const result = validateEnv();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.missing.some((m) => m.includes('invalid URL'))).toBe(true);
    }
  });

  it('přijme http:// URL (localhost dev)', () => {
    process.env = { ...VALID_ENV, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' };

    const result = validateEnv();
    expect(result.success).toBe(true);
  });
});

describe('EnvSchema — Zod schéma', () => {
  it('validuje kompletní platnou konfiguraci', () => {
    const valid = EnvSchema.safeParse(VALID_ENV);
    expect(valid.success).toBe(true);
  });

  it('přidá default pro NEXT_PUBLIC_SITE_URL (localhost:3000)', () => {
    const result = EnvSchema.safeParse(VALID_ENV);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000');
    } else {
      fail(`Neočekávaný failure: ${JSON.stringify(result.error.issues)}`);
    }
  });

  it('zamítne prázdný string u povinných polí', () => {
    const result = EnvSchema.safeParse({ ...VALID_ENV, NEXT_PUBLIC_SUPABASE_URL: '' });
    expect(result.success).toBe(false);
  });

  it('zamítne ne-URL hodnotu u URL pole', () => {
    const result = EnvSchema.safeParse({ ...VALID_ENV, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('zamítne ENCRYPTION_KEY kratší než 32 znaků', () => {
    const result = EnvSchema.safeParse({ ...VALID_ENV, ENCRYPTION_KEY: 'short-key' });
    expect(result.success).toBe(false);
  });

  it('přijme volitelná pole (SMARTFORM_API_KEY) i bez nich', () => {
    const withOptional = EnvSchema.safeParse({ ...VALID_ENV, SMARTFORM_API_KEY: 'sf_123' });
    expect(withOptional.success).toBe(true);

    const withoutOptional = EnvSchema.safeParse(VALID_ENV);
    expect(withoutOptional.success).toBe(true);
  });
});
