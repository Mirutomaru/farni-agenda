// FARNÍ AGENDA - NEXT.JS API ROUTE
// Šifrování citlivých dat před uložením do databáze
// Klíč nikdy neputuje na client, žádný default key

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error('⚠️  CHYBA: ENCRYPTION_KEY není nastaven v environment proměnných');
}

// Sdílená funkce pro derivaci šifrovacího klíče z hlavního hesla
// PBKDF2 s SHA-256, 100k iterací, 32-byte výstup
function deriveKey(password: string): Buffer {
  if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY není nastaven');
  
  return crypto.pbkdf2Sync(
    password,
    'farni-agenda-salt',
    100_000,
    32,
    'sha256'
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { value } = body;

    if (!value || typeof value !== 'string') {
      return NextResponse.json(
        { error: 'Hodnota k šifrování je povinná' },
        { status: 400 }
      );
    }

    if (!ENCRYPTION_KEY) {
      return NextResponse.json(
        { error: 'Šifrovací klíč není nakonfigurován na serveru' },
        { status: 500 }
      );
    }

    // AES-256-CBC s PBKDF2 derivací klíče (stejná jako v birthday-watcher)
    const key = deriveKey(ENCRYPTION_KEY);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(value, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Formát: hex_iv:base64_encrypted
    const result = {
      encrypted: iv.toString('hex') + ':' + encrypted,
      algorithm: 'aes-256-cbc-pbkdf2',
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Chyba při šifrování:', error instanceof Error ? error.message : 'Neznámá chyba');
    
    return NextResponse.json(
      { 
        error: 'Šifrování selhalo',
        details: error instanceof Error ? error.message : 'Neznámá chyba'
      },
      { status: 500 }
    );
  }
}

// Helper pro dešifrování (pouze na serveru!)
export async function decrypt(value: string): Promise<string> {
  if (!ENCRYPTION_KEY) {
    throw new Error('Šifrovací klíč není nastaven');
  }

  try {
    const parts = value.split(':');
    if (parts.length !== 2) throw new Error('Neplatný formát šifrovaných dat');

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const key = deriveKey(ENCRYPTION_KEY);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Chyba při dešifrování:', error instanceof Error ? error.message : 'Neznámá chyba');
    throw new Error('Dešifrování selhalo');
  }
}
