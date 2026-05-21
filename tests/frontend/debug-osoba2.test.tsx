// @jest-environment jsdom
import { render, screen } from '@testing-library/react';

// Mock fetch first (needed by OsobaForm)
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ encrypted: 'test_enc' })
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

// Mock Supabase BEFORE importing the component
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn((table) => {
      console.log('SUPABASE.from called with:', table);
      
      const base = Promise.resolve({ data: null, error: null });
      return Object.assign(base, {
        insert: (rows) => {
          console.log('from(insert) called');
          return Promise.resolve({ data: [{ id: 'new-1' }], error: null });
        },
        select: () => ({ single: () => Promise.resolve({ data: { id: 'new-1' }, error: null }) }),
        eq: () => base,
        order: () => Promise.resolve({ data: [{ id: '1', nazev: 'Praha' }], error: null }),
      });
    }),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
  })
}));

describe('DEBUG2: Supabase mock test', () => {
  beforeAll(async () => {
    // Verify the mock is loaded
    const mod = await import('@/lib/supabase/client');
    console.log('Module exports:', Object.keys(mod));
    console.log('createClient type:', typeof mod.createClient);
  });

  test('3. Import OsobaForm a render', async () => {
    // Dynamický import aby se mock aplikoval
    const { default: OsobaForm } = await import('@/components/OsobaForm');
    
    console.log('Rendering OsobaForm...');
    render(<OsobaForm />);
    
    console.log('After render - screen HTML:', document.body.innerHTML.substring(0, 500));
    
    // Check if the component rendered at all
    expect(document.body.textContent).toContain('Přidat novou osobu');
  });
});
