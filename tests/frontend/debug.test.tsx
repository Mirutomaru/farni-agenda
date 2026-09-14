// @jest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

describe('Debug Supabase Mock (SKIPPED - uses global.fetch which is not polyfilled in jsdom)', () => {
  it.skip('should mock Supabase insert chain correctly', async () => {
    const mod = await import('@/lib/supabase/client');
    console.log('=== Client methods ===');
    console.log('createClient exists:', typeof (mod as any).createClient);
    expect(mod).toBeDefined();
  });

  it.skip('should mock fetch for encrypt', async () => {
    // Requires happy-dom environment or node-fetch polyfill
  });

  it.skip('should render OsobaForm and submit', async () => {
    // See debug-submit.test.tsx for working version with proper mocks
  });
});
