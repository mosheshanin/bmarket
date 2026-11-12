/**
 * Хранилище фото — Supabase Storage (закрытый бакет PHOTOS_BUCKET, по умолчанию photos).
 * Фото раздаёт /img/<ключ> (src/pages/img/[...key].ts), CDN Vercel кеширует ответ на год:
 * ключи неизменяемые. Ключи те же, что были в Workers KV: lots/<лот>/<id>-1600.webp и -600.webp.
 *
 * Без SUPABASE_URL (локальная разработка и тесты) фото лежат в папке PHOTOS_DIR (по умолчанию .data/photos).
 */
type PhotoEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY' | 'SUPABASE_SERVICE_ROLE_KEY' | 'PHOTOS_BUCKET'>;

export interface StoredPhoto {
  body: ReadableStream | ArrayBuffer;
  contentType: string;
  etag?: string;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
export const PHOTO_CACHE_CONTROL = IMMUTABLE;

interface Backend {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredPhoto | null>;
  copy(from: string, to: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

function backend(env: PhotoEnv): Backend {
  return env.SUPABASE_URL ? supabase(env) : localDir();
}

export const putPhoto = (env: PhotoEnv, key: string, data: ArrayBuffer, contentType: string) => backend(env).put(key, data, contentType);
export const getPhoto = (env: PhotoEnv, key: string) => backend(env).get(key);
/** Копия фото (дублирование лота). */
export const copyPhoto = (env: PhotoEnv, from: string, to: string) => backend(env).copy(from, to);
export async function deletePhotos(env: PhotoEnv, keys: string[]): Promise<void> {
  if (keys.length) await backend(env).remove(keys);
}

// ---------- Supabase Storage (REST API, без supabase-js) ----------

function supabase(env: PhotoEnv): Backend {
  const base = `${env.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1`;
  const bucket = env.PHOTOS_BUCKET || 'photos';
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  const auth: Record<string, string> = { apikey: key };
  // Старый ключ service_role — JWT, его нужно передать и в Authorization; новый sb_secret_… — только в apikey.
  if (key.startsWith('eyJ')) auth.authorization = `Bearer ${key}`;
  const objectUrl = (k: string) => `${base}/object/${bucket}/${k.split('/').map(encodeURIComponent).join('/')}`;

  async function check(r: Response, what: string) {
    if (!r.ok) throw new Error(`Supabase Storage: ${what} — ${r.status} ${(await r.text()).slice(0, 200)}`);
  }

  return {
    async put(k, data, contentType) {
      const r = await fetch(objectUrl(k), {
        method: 'POST',
        headers: { ...auth, 'content-type': contentType, 'cache-control': '31536000', 'x-upsert': 'true' },
        body: data,
      });
      await check(r, `загрузка ${k}`);
    },
    async get(k) {
      const r = await fetch(objectUrl(k), { headers: auth });
      if (r.status === 400 || r.status === 404) return null;
      await check(r, `чтение ${k}`);
      return { body: r.body ?? (await r.arrayBuffer()), contentType: r.headers.get('content-type') || 'image/webp', etag: r.headers.get('etag') ?? undefined };
    },
    async copy(from, to) {
      const r = await fetch(`${base}/object/copy`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ bucketId: bucket, sourceKey: from, destinationKey: to }),
      });
      // Исходного фото нет — как раньше с KV, копию молча пропускаем.
      if (r.status === 400 || r.status === 404) return;
      await check(r, `копия ${from}`);
    },
    async remove(keys) {
      for (let i = 0; i < keys.length; i += 100) {
        const r = await fetch(`${base}/object/${bucket}`, {
          method: 'DELETE',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ prefixes: keys.slice(i, i + 100) }),
        });
        await check(r, 'удаление');
      }
    },
  };
}

// ---------- Локальная папка (разработка и сквозные тесты) ----------

function localDir(): Backend {
  const dir = process.env.PHOTOS_DIR || '.data/photos';
  const fs = () => import('node:fs/promises');
  const path = (k: string) => `${dir}/${k}`;
  const typeOf = (k: string) => (k.endsWith('.jpg') ? 'image/jpeg' : 'image/webp');
  return {
    async put(k, data) {
      const f = await fs();
      await f.mkdir(path(k).replace(/\/[^/]+$/, ''), { recursive: true });
      await f.writeFile(path(k), new Uint8Array(data));
    },
    async get(k) {
      try {
        const buf = await (await fs()).readFile(path(k));
        return { body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType: typeOf(k) };
      } catch {
        return null;
      }
    },
    async copy(from, to) {
      const p = await this.get(from);
      if (p) await this.put(to, p.body as ArrayBuffer, p.contentType);
    },
    async remove(keys) {
      const f = await fs();
      for (const k of keys) await f.rm(path(k), { force: true });
    },
  };
}
