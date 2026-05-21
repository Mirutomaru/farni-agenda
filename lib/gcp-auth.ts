// FARNÍ AGENDA - SDÍLENÁ GCP OAUTH UTILITY
// Sdíleá implementace pro získání Google access tokenu přes OAuth2 Service Account (RS256)
// Používáno v: weekly-backup, certificates-generator

export async function getGoogleAccessToken(
  serviceAccountKey: Record<string, string>
): Promise<string> {
  const { private_key, client_email } = serviceAccountKey;
  
  if (!private_key || !client_email) {
    throw new Error('GCP service account key musí obsahovat private_key a client_email');
  }

  // Parse PEM private key (odstranění newlineů a hlavičky/závěrky)
  const pem = private_key
    .replace(/[REDACTED PRIVATE KEY]/g, '')
    .replace(/\n/g, '');

  // Convert PEM to DER format
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  // Import RSA private key for signing
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Create JWT for OAuth2 service account flow
  const now = Date.now() / 1000;
  
  const headerB64 = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const payload = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: Math.floor(now) + 3600,
    iat: Math.floor(now),
  };

  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  // Sign JWT
  const jwtHeader = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(jwtHeader)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${jwtHeader}.${sigB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`GCP OAuth error (${tokenResponse.status}): ${errText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}
