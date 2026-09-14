// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO RETRY HELPER (exponenciální backoff + jitter)
// retryWithBackoff() je čistá funkce — testujeme ji přímo.

import { retryWithBackoff, fetchWithRetry } from '@/lib/utils/retry';

describe('retryWithBackoff', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // service loguje každý retry přes console.warn — počítáme ho jako indikátor
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => { warnSpy.mockRestore(); });

  it('vrátí výsledek při prvním pokusu (bez retry)', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, { maxAttempts: 3 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled(); // žádný retry → žádné varování
  });

  it('retryuje do úspěchu (2. pokus)', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 503'), { status: 503 }))
      .mockResolvedValueOnce('recovered');

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1); // přesně jeden retry
  });

  it('retryuje do úspěchu (poslední povolený pokus)', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('e1'), { status: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('e2'), { status: 500 }))
      .mockResolvedValueOnce('finally');

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 });

    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('hodí originální chybu po vyčerpání pokusů', async () => {
    const original = Object.assign(new Error('always fails'), { status: 500 });
    const fn = jest.fn().mockRejectedValue(original);

    await expect(retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 1 }))
      .rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retryuje chyby s retryable status (429/5xx)', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce('ok');

    await expect(retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retryuje chyby s retryable code (ECONNRESET)', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce('ok');

    await expect(retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('fail-fast: nretryovatelná chyba na posledním pokusu → bez varování', async () => {
    // Chyba bez code/status není v retryableErrors; na posledním pokusu se hodí okamžitě
    const fn = jest.fn().mockRejectedValue(new Error('permanent failure'));

    await expect(retryWithBackoff(fn, { maxAttempts: 1, baseDelayMs: 1 }))
      .rejects.toThrow('permanent failure');
    expect(fn).toHaveBeenCalledTimes(1);
    // fail-fast větev hází PŘED console.warn → žádné varování
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('respektuje maxAttempts (přesně N pokusů)', async () => {
    const fn = jest.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 502 }));

    await expect(retryWithBackoff(fn, { maxAttempts: 4, baseDelayMs: 1 }))
      .rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(4);
    // Retryable chyba → warn po KAŽDÉM neúspěšném pokusu (i posledním)
    expect(warnSpy).toHaveBeenCalledTimes(4);
  });

  it('vrátí hodnotu z async funkce (generic T)', async () => {
    const fn = jest.fn().mockResolvedValue({ a: 1, b: [2, 3] });
    const result = await retryWithBackoff(fn, {});
    expect(result).toEqual({ a: 1, b: [2, 3] });
  });
});

describe('fetchWithRetry', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    (globalThis as any).fetch = mockFetch;
  });

  afterEach(() => { delete (globalThis as any).fetch; });

  function fakeResponse(status: number, body = '') {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => JSON.parse(body || '{}'),
    };
  }

  it('vrátí response při úspěchu (200)', async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, '{"data":1}'));

    const res = await fetchWithRetry({ url: 'http://x/api' });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retryuje 429 a vrátí úspěch po obnovení', async () => {
    mockFetch
      .mockResolvedValueOnce(fakeResponse(429, 'slow down'))
      .mockResolvedValueOnce(fakeResponse(200, '{"ok":true}'));

    const res = await fetchWithRetry({ url: 'http://x/api', maxAttempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('hodí chybu s HTTP status po vyčerpání pokusů (500)', async () => {
    mockFetch.mockResolvedValue(fakeResponse(500, 'boom'));

    await expect(fetchWithRetry({ url: 'http://x/api', maxAttempts: 2, baseDelayMs: 1 }))
      .rejects.toThrow(/HTTP 500/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('předá init (method/headers) do fetch', async () => {
    mockFetch.mockResolvedValue(fakeResponse(200, '{}'));

    await fetchWithRetry({
      url: 'http://x/api',
      init: { method: 'POST', headers: { 'X-Test': '1' } },
    });

    expect(mockFetch).toHaveBeenCalledWith('http://x/api', {
      method: 'POST',
      headers: { 'X-Test': '1' },
    });
  });
});
