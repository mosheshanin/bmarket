import { verifyToken } from '../lib/crypto';
import { businessPath, parseLotSegment } from '../lib/slug';
import type { DB } from '../db/client';
import { getPublicBusinessByLot, listPublished, type PublicBusiness, type PublicListing } from './public';

export type CardResult =
  | { kind: 'ok'; b: PublicBusiness; preview: boolean }
  | { kind: 'redirect'; to: string }
  | { kind: 'gone'; b: PublicBusiness; others: PublicListing[] }
  | { kind: 'notfound' };

export function previewSecret(env: Env): string {
  return `preview:${env.TELEGRAM_BOT_TOKEN}`;
}

/**
 * Разбор адреса /business/<lot>-<slug>[/suffix]:
 * — неверный slug → 301 на канонический адрес (номер лота в адресе не меняется);
 * — draft → 404, hidden → 410 со ссылками на другие лоты города;
 * — ?preview=<подпись админки> показывает черновик или снятый лот без кеша.
 */
export async function loadCard(env: Env, db: DB, segment: string, url: URL, suffix = ''): Promise<CardResult> {
  const lot = parseLotSegment(segment);
  if (!lot) return { kind: 'notfound' };
  const b = await getPublicBusinessByLot(db, lot);
  if (!b) return { kind: 'notfound' };

  const token = url.searchParams.get('preview');
  if (token) {
    const payload = await verifyToken(previewSecret(env), token);
    if (payload === `lot:${b.id}`) return { kind: 'ok', b, preview: true };
  }

  if (b.status === 'draft' || b.status === 'deleted') return { kind: 'notfound' };
  const canonical = businessPath(b.lotNumber, b.slug) + suffix;
  if (`/business/${segment}${suffix}` !== canonical) return { kind: 'redirect', to: canonical };
  if (b.status === 'hidden') {
    const others = b.cityId ? await listPublished(db, { cityId: b.cityId, excludeId: b.id, limit: 6 }) : [];
    return { kind: 'gone', b, others: others.length ? others : await listPublished(db, { limit: 6 }) };
  }
  return { kind: 'ok', b, preview: false };
}

/** Ссылка YouTube → id ролика. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}
