/**
 * Сжатие фото в браузере перед загрузкой (раздел 8.2): 1600 px по длинной стороне + копия 600 px,
 * формат WebP. Safari на iOS не умеет кодировать WebP в canvas — тогда JPEG (сервер принимает оба).
 */
export interface Compressed {
  large: Blob;
  small: Blob;
  width: number;
  height: number;
  type: 'image/webp' | 'image/jpeg';
}

const MAX_BYTES = 2 * 1024 * 1024;

async function load(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* HEIC и пр. — пробуем через <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, type, q));
}

async function encode(src: CanvasImageSource, w: number, h: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, cw, ch);
  for (const q of [0.82, 0.72, 0.6, 0.5]) {
    let blob = await toBlob(canvas, 'image/webp', q);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q + 0.03);
    if (blob && blob.size <= MAX_BYTES) return { blob, width: cw, height: ch };
  }
  throw new Error('Не удалось сжать фото до 2 МБ');
}

export async function compressImage(file: File): Promise<Compressed> {
  const img = await load(file);
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (!w || !h) throw new Error('Не удалось прочитать фото');
  const large = await encode(img, w, h, 1600);
  const small = await encode(img, w, h, 600);
  if ('close' in img) img.close();
  // Оба файла одного формата (сервер это проверяет).
  let smallBlob = small.blob;
  if (small.blob.type !== large.blob.type) {
    const c = document.createElement('canvas');
    c.width = small.width;
    c.height = small.height;
    c.getContext('2d')!.drawImage(await createImageBitmap(small.blob), 0, 0);
    smallBlob = (await toBlob(c, large.blob.type, 0.8)) ?? small.blob;
  }
  return { large: large.blob, small: smallBlob, width: large.width, height: large.height, type: large.blob.type as Compressed['type'] };
}
