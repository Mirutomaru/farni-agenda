// @jest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

describe('Debug Supabase Mock', () => {
  it('should mock Supabase insert chain correctly', async () => {
    // Import the module to check how it's mocked
    const mod = await import('@/lib/supabase/client');
    const client = (mod as any).createClient();
    
    console.log('=== Client methods ===');
    console.log('from:', typeof client.from);
    
    const fromResult = client.from('osoby');
    console.log('from result:', Object.keys(fromResult));
    
    const insertResult = fromResult.insert([{ test: 'data' }]);
    console.log('insert result keys:', Object.keys(insertResult as any));
    console.log('insert data:', (insertResult as any).data);
    console.log('insert error:', (insertResult as any).error);
    
    const selectSingle = insertResult.select().single();
    console.log('select().single() data:', (selectSingle as any).data);
    console.log('select().single() error:', (selectSingle as any).error);
    
    expect(client.from).toHaveBeenCalled();
  });

  it('should mock fetch for encrypt', async () => {
    const response = await global.fetch('/api/encrypt');
    const json = await response.json();
    console.log('fetch /api/encrypt result:', json);
    expect(json.encrypted).toBeTruthy();
  });

  it('should render OsobaForm and submit', async () => {
    const mockAlert = jest.fn();
    (window as any).alert = mockAlert;
    
    await act(async () => {
      // Dynamic import to ensure mocks are applied
      const { default: OsobaForm } = await import('@/components/OsobaForm');
      render(<OsobaForm />);
    });

    console.log('=== After render ===');
    expect(screen.getByText(/Přidat novou osobu/i)).toBeInTheDocument();

    // Select farnost
    const farnostSelect = screen.getByLabelText(/Farnost \*/i);
    fireEvent.change(farnostSelect, { target: { value: '1' } });
    
    console.log('=== After selecting farnost ===');
    expect(farnostSelect).toHaveValue('1');

    // Type name
    const krestniInput = screen.getByLabelText(/Křestní jméno \*/i);
    fireEvent.change(krestniInput, { target: { value: 'Jan' } });
    
    const prijmeniInput = screen.getByLabelText(/Příjmení \*/i);
    fireEvent.change(prijmeniInput, { target: { value: 'Novák' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Přidat osobu/i }));

    console.log('=== After submit ===');
    
    await waitFor(() => {
      console.log('Alert calls:', mockAlert.mock.calls);
      expect(mockAlert).toHaveBeenCalled();
    }, { timeout: 5000 });
  });
});
