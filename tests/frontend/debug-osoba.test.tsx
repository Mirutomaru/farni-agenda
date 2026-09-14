// @jest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Nejprve mockneme fetch (potřebný pro encrypt)
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ encrypted: 'test_encrypted_value' })
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('DEBUG: Supabase mock', () => {

  test('1. Zkontrolujeme, jestli @/lib/supabase/client exists', async () => {
    // Podíváme se co vrací import
    const mod = await import('@/lib/supabase/client');
    console.log('Supabase module exports:', Object.keys(mod));

    expect(mod).toBeDefined();
  });

});
