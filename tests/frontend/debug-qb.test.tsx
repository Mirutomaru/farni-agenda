// @jest-environment jsdom

const farnostiData = [{ id: '1', nazev: 'Praha', zkratka: 'SPR' }];

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._data = null;
    this._error = null;
  }

  select(cols = '*') {
    if (this.table === 'farnosti') {
      return Object.assign(
        new QueryBuilder('farnosti'),
        Promise.resolve({ data: farnostiData, error: null })
      );
    }

    if (this.table === 'osoby') {
      return Object.assign(
        new QueryBuilder('osoby'),
        Promise.resolve({ data: [], error: null }),
        {
          single() {
            return Promise.resolve({
              data: { id: 'new-1', krestni_jmeno: 'Jan', prijmeni: 'Novák' },
              error: null,
            });
          },
          eq(col, val) {
            return this;
          },
          order(col) {
            return this;
          },
        }
      );
    }

    if (this.table === 'krestni_zapis') {
      return Object.assign(
        new QueryBuilder('krestni_zapis'),
        Promise.resolve({ data: [], error: null }),
        {
          single() {
            return Promise.resolve({ data: { id: 'new-kr' }, error: null });
          },
        }
      );
    }

    return Object.assign(
      new QueryBuilder(),
      Promise.resolve({ data: [], error: null })
    );
  }

  eq(col, val) {
    if (this.table === 'osoby') {
      // .from('osoby').eq('status','aktivni').order('prijmeni')
      return Object.assign(
        new QueryBuilder('osoby'),
        Promise.resolve({ data: [], error: null }),
        { order(col) { return this; } }
      );
    }
    return this;
  }

  insert(rows) {
    if (this.table === 'osoby') {
      // .from('osoby').insert(data).select().single()
      const chain = Object.assign(
        new QueryBuilder('osoby'),
        Promise.resolve({ data: rows?.length ? [{ id: 'new-1', ...rows[0] }] : [], error: null }),
        {
          select(cols) {
            return Object.assign(
              new QueryBuilder('osoby'),
              Promise.resolve({ data: { id: 'new-1' }, error: null }),
              {
                single() {
                  console.log('[TEST DEBUG] single() called, returning:', JSON.stringify({
                    data: { id: 'new-1', krestni_jmeno: 'Jan', prijmeni: 'Novák' },
                    error: null
                  }));
                  return Promise.resolve({
                    data: { id: 'new-1', krestni_jmeno: 'Jan', prijmeni: 'Novák' },
                    error: null,
                  });
                },
              }
            );
          },
        }
      );
      console.log('[TEST DEBUG] insert() called with:', rows?.length, 'rows');
      return chain;
    }

    if (this.table === 'krestni_zapis') {
      const chain = Object.assign(
        new QueryBuilder('krestni_zapis'),
        Promise.resolve({ data: rows?.length ? [{ id: 'new-kr', ...rows[0] }] : [], error: null }),
        {
          select() {
            return Object.assign(
              new QueryBuilder('krestni_zapis'),
              Promise.resolve({ data: { id: 'new-kr' }, error: null }),
              { single() { return Promise.resolve({ data: { id: 'new-kr' }, error: null }); } }
            );
          },
        }
      );
      console.log('[TEST DEBUG] insert(kz) called with:', rows?.length, 'rows');
      return chain;
    }

    return Object.assign(
      new QueryBuilder(),
      Promise.resolve({ data: null, error: null })
    );
  }

  order(col) {
    if (this.table === 'farnosti') {
      return Object.assign(new QueryBuilder('farnosti'), Promise.resolve({ data: farnostiData, error: null }));
    }
    return this;
  }

  rpc(fn, params) {
    console.log('[TEST DEBUG] rpc() called with:', fn);
    return Promise.resolve({ data: [], error: null });
  }
}

// ==================== SUPABASE MOCK ====================
const supabaseMock = jest.fn().mockReturnValue({
  from: (table) => new QueryBuilder(table),
  rpc: (fn, params) => {
    console.log('[TEST DEBUG] RPC:', fn);
    return Promise.resolve({ data: null, error: null });
  },
});

jest.mock('@/lib/supabase/client', () => ({ createClient: supabaseMock }));

const mockAlert = jest.fn();
beforeEach(() => {
  jest.spyOn(window, 'alert').mockImplementation(mockAlert);
  jest.clearAllMocks();
  global.fetch = jest.fn((url) => {
    if (typeof url === 'string' && url.includes('/api/encrypt')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ encrypted: 'enc_test_value' }) });
    }
    if (typeof url === 'string' && url.includes('smartform-search')) {
      return Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve({ 
          success: true, 
          data: [
            { ulice: 'Národní', cislo_popisne: '12', obec: 'Praha 1', psc: '110 00' },
          ] 
        }) 
      });
    }
    return Promise.resolve({ ok: false, status: 500 });
  }).mockName('globalFetch');
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

describe('OsobaForm Debug', () => {

  test('Debug: Test Supabase chain manually', async () => {
    const qb = supabaseMock();
    
    // Simulate what component does for farnosti loading:
    console.log('[TEST DEBUG] Testing loadFarnosti chain...');
    const result1 = await qb.from('farnosti').select('*').order('nazev');
    console.log('[TEST DEBUG] loadFarnosti result:', JSON.stringify(result1));

    // Simulate what component does for insert:
    console.log('[TEST DEBUG] Testing insert chain...');
    const testInsert = { farnost_id: '1', krestni_jmeno: 'Jan' };
    const result2 = await qb.from('osoby').insert([testInsert]).select().single();
    console.log('[TEST DEBUG] insert single result:', JSON.stringify(result2));
    
    expect(result2.data).toEqual({ id: 'new-1', krestni_jmeno: 'Jan', prijmeni: 'Novák' });
  });

  test('Debug: Submit with filled form', async () => {
    const { default: OsobaForm } = await import('@/components/OsobaForm');
    
    render(<OsobaForm />);
    
    // Wait for farnosti to load
    await waitFor(() => {
      const options = screen.getByLabelText(/Farnost \*/i).querySelectorAll('option');
      console.log('[TEST DEBUG] Farnosti loaded:', options.length, 'options');
      expect(options.length).toBeGreaterThan(1);
    }, { timeout: 3000 });

    fireEvent.change(screen.getByLabelText(/Farnost \*/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Křestní jméno \*/i), { target: { value: 'Jan' } });
    fireEvent.change(screen.getByLabelText(/Příjmení \*/i), { target: { value: 'Novák' } });
    const dateInput = screen.getByLabelText(/Datum narození \*/i);
    fireEvent.change(dateInput, { target: { value: '1990-05-15' } });

    console.log('[TEST DEBUG] Clicking submit...');
    fireEvent.click(screen.getByRole('button', { name: /Přidat osobu/i }));

    await waitFor(() => {
      console.log('[TEST DEBUG] mockAlert calls:', mockAlert.mock.calls);
      expect(mockAlert).toHaveBeenCalledWith(/byla úspěšně přidána/i);
    }, { timeout: 5000 });
  });
});
