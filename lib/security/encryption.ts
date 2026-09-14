// FARNÍ AGENDA - ENCRYPTION UTILITA
// Šifrování citlivých dat (AES-256-CBC + PBKDF2)
// VSTUP: čistý text → výstup: šifrovaný string (hex_iv:base64_encrypted)

import crypto from 'crypto';
import { logger } from '@/lib/logging/logger';

const log = logger('ENCRYPTION');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const SALT = 'farni-agenda-salt';
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

// === DERIVACE KLÍČE ===
function deriveKey(password: string): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY není nastaven v environment proměnných');
  }
  
  return crypto.pbkdf2Sync(
    ENCRYPTION_KEY,
    SALT,
    ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

// === ŠIFROVÁNÍ ===
export function encrypt(value: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('Šifrovací klíč není nakonfigurován');
  }

  const key = deriveKey(ENCRYPTION_KEY);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Formát: hex_iv:base64_encrypted
  return `${iv.toString('hex')}:${encrypted}`;
}

// === DEŠIFROVÁNÍ ===
export function decrypt(value: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('Dešifrovací klíč není nastaven');
  }

  try {
    const parts = value.split(':');
    if (parts.length !== 2) {
      throw new Error('Neplatný formát šifrovaných dat');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const key = deriveKey(ENCRYPTION_KEY);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // Logování bez odhalení citlivých dat
    const msg = error instanceof Error ? error.message : 'Neznámá chyba při dešifrování';
    log.error('Dešifrování selhalo', { reason: msg });
    throw new Error('Dešifrování selhalo');
  }
}

// === VALIDACE FORMÁTU ŠIFROVANÝCH DAT ===
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 2 && 
         Buffer.from(parts[0], 'hex').length === 16 &&
         typeof parts[1] === 'string';
}
