const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(key: ArrayBuffer | Uint8Array | string, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? enc.encode(key) : key;
  const k = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)));
}

/** Сравнение строк за постоянное время. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Короткая подпись для ссылок (выгрузка CSV, предпросмотр): payload.exp.sig */
export async function signToken(secret: string, payload: string, ttlSec: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = `${payload}.${exp}`;
  const sig = toHex(await hmacSha256(secret, body)).slice(0, 32);
  return `${body}.${sig}`;
}

export async function verifyToken(secret: string, token: string): Promise<string | null> {
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const j = body.lastIndexOf('.');
  if (j < 0) return null;
  const exp = Number(body.slice(j + 1));
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  const expected = toHex(await hmacSha256(secret, body)).slice(0, 32);
  return safeEqual(sig, expected) ? body.slice(0, j) : null;
}
