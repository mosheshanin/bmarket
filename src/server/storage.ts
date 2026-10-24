/**
 * Хранилище фото. Основной вариант — Workers KV (PHOTOS_KV): бесплатно и без привязки карты.
 * Если в аккаунте включат R2 и добавят привязку PHOTOS — используется R2 (как в ТЗ), код менять не нужно.
 *
 * Лимиты KV Free: 1 ГБ, 1000 записей и 100 000 чтений в день, значение до 25 МБ.
 * Одно фото = 2 записи (1600 и 600 px), поэтому за день можно загрузить до ~500 фото.
 */
type PhotoEnv = Pick<Env, 'PHOTOS_KV'> & { PHOTOS?: R2Bucket };

export interface StoredPhoto {
  body: ReadableStream | ArrayBuffer;
  contentType: string;
  etag?: string;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

export async function putPhoto(env: PhotoEnv, key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  if (env.PHOTOS) {
    await env.PHOTOS.put(key, data, { httpMetadata: { contentType, cacheControl: IMMUTABLE } });
    return;
  }
  await env.PHOTOS_KV.put(key, data, { metadata: { contentType } });
}

export async function getPhoto(env: PhotoEnv, key: string): Promise<StoredPhoto | null> {
  if (env.PHOTOS) {
    const obj = await env.PHOTOS.get(key);
    if (!obj) return null;
    return { body: obj.body, contentType: obj.httpMetadata?.contentType ?? 'image/webp', etag: obj.httpEtag };
  }
  const { value, metadata } = await env.PHOTOS_KV.getWithMetadata<{ contentType?: string }>(key, { type: 'stream', cacheTtl: 86_400 });
  if (!value) return null;
  return { body: value, contentType: metadata?.contentType ?? 'image/webp' };
}

/** Копия фото (дублирование лота). */
export async function copyPhoto(env: PhotoEnv, from: string, to: string): Promise<void> {
  if (env.PHOTOS) {
    const obj = await env.PHOTOS.get(from);
    if (obj) await env.PHOTOS.put(to, obj.body, { httpMetadata: obj.httpMetadata });
    return;
  }
  const { value, metadata } = await env.PHOTOS_KV.getWithMetadata<{ contentType?: string }>(from, { type: 'arrayBuffer' });
  if (value) await env.PHOTOS_KV.put(to, value, { metadata: metadata ?? { contentType: 'image/webp' } });
}

export async function deletePhotos(env: PhotoEnv, keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (env.PHOTOS) {
    await env.PHOTOS.delete(keys);
    return;
  }
  for (const k of keys) await env.PHOTOS_KV.delete(k);
}

export const PHOTO_CACHE_CONTROL = IMMUTABLE;
