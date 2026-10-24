import { getWebApp } from '../scripts/tg';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

let initDataCache = '';
export async function adminInitData(): Promise<string> {
  if (initDataCache) return initDataCache;
  const wa = await getWebApp();
  initDataCache = wa?.initData ?? '';
  return initDataCache;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; base?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { authorization: `tma ${await adminInitData()}` };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const r = await fetch(`${opts.base ?? '/api/admin/'}${path}`, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string }).error ?? `Ошибка ${r.status}`, data as Record<string, unknown>);
  return data as T;
}

/** Загрузка с прогрессом (XMLHttpRequest — у fetch нет прогресса отправки). */
export async function upload<T>(path: string, form: FormData, onProgress: (p: number) => void, base = '/api/admin/'): Promise<T> {
  const auth = `tma ${await adminInitData()}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}${path}`);
    xhr.setRequestHeader('authorization', auth);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* пусто */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, (data.error as string) ?? `Ошибка ${xhr.status}`, data));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Нет связи с сервером'));
    xhr.send(form);
  });
}
