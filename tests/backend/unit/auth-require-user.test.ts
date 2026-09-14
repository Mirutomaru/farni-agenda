// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO AUTH HELPER (requireUser)
// Mockuje server Supabase klienta a ověřuje chování 401/200 větví.

import { NextResponse } from 'next/server';

// Jest sandbox nemá globální Request/Response — next/server je mocknuto minimálním stubem
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { requireUser, unauthorizedResponse } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.Mock;

describe('unauthorizedResponse', () => {
  it('vrací 401 s JSON tělem', () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    return (res.json() as Promise<any>).then((body) => {
      expect(body.error).toBeTruthy();
    });
  });

  it('přijme vlastní zprávu', () => {
    const res = unauthorizedResponse('Přihlaste se prosím');
    return (res.json() as Promise<any>).then((body) => {
      expect(body.error).toBe('Přihlaste se prosím');
    });
  });
});

describe('requireUser', () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
  });

  it('platná session → ok: true + user', async () => {
    const fakeUser = { id: 'u-123', email: 'farar@farnost.cz' };
    mockCreateClient.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: fakeUser }, error: null }) },
    });

    const result = await requireUser();
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.user.id).toBe('u-123');
    }
  });

  it('chybějící session → ok: false + 401 response', async () => {
    mockCreateClient.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    const result = await requireUser();
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.response.status).toBe(401);
    }
  });

  it('chyba auth serveru → ok: false + 401 response', async () => {
    mockCreateClient.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: new Error('network') }) },
    });

    const result = await requireUser();
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.response.status).toBe(401);
    }
  });
});
