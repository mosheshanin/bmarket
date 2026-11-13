import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('astro:middleware', () => ({ defineMiddleware: (f: unknown) => f }));

const ORIG = { ...process.env };
afterEach(() => {
  process.env = { ...ORIG };
});

async function redirectFor(url: string, headers: Record<string, string> = {}, method = 'GET') {
  const { canonicalHostRedirect } = await import('../src/middleware');
  return canonicalHostRedirect(new Request(url, { method, headers }));
}

describe('canonicalHostRedirect', () => {
  it('в production уводит *.vercel.app на основной домен с тем же путём', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.SITE_URL = 'https://market.haifa.business';
    const r = await redirectFor('https://bmarket-abc.vercel.app/city/haifa?x=1', { host: 'bmarket-abc.vercel.app' });
    expect(r?.status).toBe(301);
    expect(r?.headers.get('location')).toBe('https://market.haifa.business/city/haifa?x=1');
  });
  it('не трогает основной домен, API, POST, preview и незнакомые хосты', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.SITE_URL = 'https://market.haifa.business';
    expect(await redirectFor('https://market.haifa.business/', { host: 'market.haifa.business' })).toBeNull();
    expect(await redirectFor('https://x.vercel.app/api/telegram/webhook', { host: 'x.vercel.app' })).toBeNull();
    expect(await redirectFor('https://x.vercel.app/', { host: 'x.vercel.app' }, 'POST')).toBeNull();
    expect(await redirectFor('http://localhost/', { host: 'localhost' })).toBeNull();
    process.env.VERCEL_ENV = 'preview';
    expect(await redirectFor('https://x.vercel.app/', { host: 'x.vercel.app' })).toBeNull();
  });
});
