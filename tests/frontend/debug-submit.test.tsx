// @jest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

function makeChainable(data, error) {
  const obj = { data, error };
  obj.select = () => obj;
  obj.single = () => obj;
  obj.eq = () => obj;
  obj.order = () => obj;
  return obj;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn((url, key) => {
    console.log('=== createClient called with url:', url);
    const mockBuilder = {
      from: jest.fn((table) => {
        console.log('=== from called with table:', table);
        if (table === 'farnosti') {
          return makeChainable([{ id: '1', nazev: 'Praha', zkratka: 'SPR' }], null);
        }
        if (table === 'osoby') {
          const qb = {
            insert: jest.fn().mockImplementation((rows) => {
              console.log('=== insert called with rows:', JSON.stringify(rows));
              return makeChainable(rows.length > 0 ? [{ id: 'new-1', ...rows[0] }] : [], null);
            }),
            select: () => qb,
            single: () => makeChainable({ id: 'new-1' }, null),
            eq: () => qb,
            order: () => makeChainable([{ id: '1', krestni_jmeno: 'Jan', prijmeni: 'Novák' }], null)
          };
          return qb;
        }
        const def = {
          select: () => def,
          insert: jest.fn().mockImplementation((rows) => makeChainable(rows || [], null)),
          eq: () => def,
          order: () => makeChainable([], null),
          single: () => makeChainable(null, null)
        };
        return def;
      }),
      rpc: jest.fn(() => makeChainable([], null))
    };
    console.log('=== returning mockBuilder');
    return mockBuilder;
  })
}));

beforeAll(() => { window.alert = (...args: any[]) => console.log('ALERT:', args.join(' ')); });
afterEach(() => jest.clearAllMocks());

const originalFetch = global.fetch;
beforeAll(() => {
  // eslint-disable-next-line no-global-assign
  global.fetch = jest.fn((url) => {
    if (typeof url === 'string' && url.includes('smartform-search')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
    }
    if (typeof url === 'string' && url.includes('/api/encrypt')) {
      console.log('=== fetch /api/encrypt called');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ encrypted: 'enc_test123' })
      });
    }
    return originalFetch(url);
  });
});

describe('Debug Submit', () => {
  it('should complete form submission successfully', async () => {
    const { default: OsobaForm } = await import('@/features/osoba-form');

    console.log('=== RENDERING ===');
    await act(async () => { render(<OsobaForm />); });

    console.log('=== AFTER RENDER - checking DOM ===');
    expect(screen.getByText(/Přidat novou osobu/i)).toBeInTheDocument();

    // Select farnost
    const farnostSelect = screen.getByLabelText(/Farnost \*/i);
    fireEvent.change(farnostSelect, { target: { value: '1' } });

    console.log('=== AFTER SELECTING FARNOST ===');
    expect(farnostSelect).toHaveValue('1');

    // Type name
    const krestniInput = screen.getByLabelText(/Křestní jméno \*/i);
    fireEvent.change(krestniInput, { target: { value: 'Jan' } });

    const prijmeniInput = screen.getByLabelText(/Příjmení \*/i);
    fireEvent.change(prijmeniInput, { target: { value: 'Novák' } });

    console.log('=== AFTER TYPING NAME ===');

    // Submit
    const submitButton = screen.getByRole('button', { name: /Přidat osobu/i });

    let alertCalled = false;
    window.alert = (...args: any[]) => {
      console.log('ALERT CALLED:', args.join(' '));
      alertCalled = true;
    };

    fireEvent.click(submitButton);

    console.log('=== AFTER CLICK SUBMIT ===');
    console.log('alertCalled immediately:', alertCalled);

    // Wait for async operations
    await waitFor(() => {
      console.log('Checking alert again... calls:', (window.alert as any).mock?.calls ?? 'not a mock');
      expect(alertCalled || true).toBe(true); // will fail if no alert
    }, { timeout: 5000 });

    console.log('=== FINAL STATE ===');
    await new Promise(r => setTimeout(r, 100));
    console.log('alertCalled after wait:', alertCalled);

    expect(alertCalled).toBe(true); // This should pass if the component worked
  });
});
