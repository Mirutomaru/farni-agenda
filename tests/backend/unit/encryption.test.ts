// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO ENCRYPTION (AES-256-CBC + PBKDF2)
// Reálný crypto modul (unmock), klíč nastaven PŘED načtením modulu.

jest.unmock('crypto');

process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing-only-not-production';

// require() místo import — běží až po nastavení ENCRYPTION_KEY (import by se hoistnul)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encrypt, decrypt, isEncrypted } = require('@/lib/security/encryption') as typeof import('@/lib/security/encryption');

describe('encrypt', () => {
  it('vrací formát hex_iv:base64 (32 hex znaků + dvojtečka)', () => {
    const result = encrypt('tajné heslo');
    const [iv, encrypted] = result.split(':');
    expect(iv).toMatch(/^[0-9a-f]{32}$/); // 16 bajtů IV v hexu
    expect(encrypted.length).toBeGreaterThan(0);
  });

  it('stejné heslo → různý ciphertext (náhodné IV)', () => {
    const a = encrypt('stejny text');
    const b = encrypt('stejny text');
    expect(a).not.toBe(b); // jiný IV → jiný výstup
  });

  it('zvládne unicode text', () => {
    const text = 'Příliš žluťoučký kůň úpěl ďábelské ódy — česky ✓';
    expect(decrypt(encrypt(text))).toBe(text);
  });
});

describe('decrypt (round-trip)', () => {
  it('decrypt(encrypt(x)) === x', () => {
    const text = 'jan.novak@farnost.cz';
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it('prázdný string → round-trip', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });
});

describe('isEncrypted', () => {
  it('rozpozná zašifrovanou hodnotu', () => {
    expect(isEncrypted(encrypt('test'))).toBe(true);
  });

  it('odmítne čistý text bez dvojtečky', () => {
    expect(isEncrypted('plain-text')).toBe(false);
  });

  it('odmítne hodnotu s neplatným IV (není 16 bajtů hex)', () => {
    expect(isEncrypted('abc:def')).toBe(false);
  });
});

describe('decrypt — chybové větve', () => {
  it('neplatný formát (bez dvojtečky) → hodí "Dešifrování selhalo"', () => {
    expect(() => decrypt('bez-dvojtecky')).toThrow(/Dešifrování selhalo/);
  });

  it('jiný klíč než při šifrování → hodí "Dešifrování selhalo"', () => {
    const encrypted = encrypt('tajné');
    jest.isolateModules(() => {
      jest.unmock('crypto');
      process.env.ENCRYPTION_KEY = 'another-encryption-key-for-testing-only-32ch';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@/lib/security/encryption') as typeof import('@/lib/security/encryption');
      expect(() => mod.decrypt(encrypted)).toThrow(/Dešifrování selhalo/);
    });
  });

  it('chybějící ENCRYPTION_KEY → encrypt hodí výjimku', () => {
    jest.isolateModules(() => {
      jest.unmock('crypto');
      delete process.env.ENCRYPTION_KEY;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@/lib/security/encryption') as typeof import('@/lib/security/encryption');
      expect(() => mod.encrypt('x')).toThrow(/klíč není nakonfigurován/i);
    });
  });
});
