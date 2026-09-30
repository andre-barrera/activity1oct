import "server-only";

const TOKEN_WINDOW_SECONDS = 5 * 60;
const MAX_FUTURE_SECONDS = TOKEN_WINDOW_SECONDS * 2;

function signingSecret() {
  const secret = process.env.PHOTO_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PHOTO_SIGNING_SECRET debe tener al menos 32 caracteres.");
  }
  return secret;
}

function base64Url(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

async function signatureFor(path: string, expiresAt: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `${path}\n${expiresAt}`;
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/**
 * Creates a short-lived, same-origin URL. The Supabase bucket remains private;
 * the browser never receives the service-role key or a permanent object URL.
 */
export async function photoUrlFor(path: string | null | undefined) {
  if (!path) return null;

  const now = Math.floor(Date.now() / 1000);
  // Keep the same URL for the current five-minute window, while giving it
  // almost ten minutes of lifetime so it cannot expire at a window boundary.
  const expiresAt = (Math.floor(now / TOKEN_WINDOW_SECONDS) + 2) * TOKEN_WINDOW_SECONDS;
  const signature = await signatureFor(path, expiresAt);
  return `/api/photo?path=${encodeURIComponent(path)}&expires=${expiresAt}&sig=${encodeURIComponent(signature)}`;
}

export async function verifyPhotoToken(path: string, expiresAt: number, providedSignature: string) {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + MAX_FUTURE_SECONDS) return false;

  const expected = await signatureFor(path, expiresAt);
  const actualBytes = fromBase64Url(providedSignature);
  const expectedBytes = fromBase64Url(expected);
  if (actualBytes.length !== expectedBytes.length) return false;

  let different = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) different |= actualBytes[index] ^ expectedBytes[index];
  return different === 0;
}

export const PHOTO_CACHE_SECONDS = TOKEN_WINDOW_SECONDS;
