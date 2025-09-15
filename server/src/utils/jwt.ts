export const FALLBACK_SECRETS = [
  'your-super-secret-jwt-key-change-this-in-production',
  'your-super-secret-jwt-key-change-this-in-production-make-it-long-and-random',
  'your-default-secret',
];

// Used by routes/middleware. Returns a secret string (may be a fallback in dev)
export function getJwtSecretUnsafe(): string {
  return process.env.JWT_SECRET || FALLBACK_SECRETS[0];
}

// Call at startup to ensure production doesn’t run with weak/missing secret
export function validateJwtSecretOrExit(): void {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  const secret = process.env.JWT_SECRET || '';
  if (env !== 'production') return; // Only enforce in production

  const isMissing = !secret || secret.trim().length < 24; // minimal length sanity check
  const isFallback = FALLBACK_SECRETS.includes(secret);
  if (isMissing || isFallback) {
    // Log a clear error and exit to prevent insecure boot
    // eslint-disable-next-line no-console
    console.error('FATAL: Invalid JWT_SECRET in production. Set a strong, random value.');
    process.exit(1);
  }
}

