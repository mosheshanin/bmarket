import { useCallback, useEffect, useRef, useState } from 'react';

export interface GalleryPhoto {
  src: string;
  srcSmall: string;
  width: number;
  height: number;
  alt: string;
}

/** Галерея: свайп, счётчик «3 / 12», полноэкранный просмотр по нажатию. */
export default function Gallery({ photos, title }: { photos: GalleryPhoto[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const fullStrip = useRef<HTMLDivElement>(null);

  const onScroll = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.max(0, Math.min(photos.length - 1, i)));
  }, [photos.length]);

  const go = (el: HTMLDivElement | null, i: number) => {
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!full) return;
    const el = fullStrip.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') go(fullStrip.current, Math.min(photos.length - 1, index + 1));
      if (e.key === 'ArrowLeft') go(fullStrip.current, Math.max(0, index - 1));
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
      go(strip.current, index);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  if (!photos.length) return <div className="card flex aspect-[4/3] items-center justify-center text-hint">Нет фото</div>;

  return (
    <div className="relative -mx-4 sm:mx-0">
      <div
        ref={strip}
        onScroll={(e) => onScroll(e.currentTarget)}
        className="no-scrollbar flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto bg-black/5 sm:rounded-card"
        aria-roledescription="галерея"
      >
        {photos.map((p, i) => (
          <button
            key={i}
            type="button"
            className="relative h-full w-full shrink-0 snap-center"
            onClick={() => { setIndex(i); setFull(true); }}
            aria-label={`Открыть фото ${i + 1} из ${photos.length} на весь экран`}
          >
            <img
              src={p.src}
              srcSet={`${p.srcSmall} 600w, ${p.src} 1600w`}
              sizes="(min-width: 1024px) 760px, 100vw"
              alt={p.alt || title}
              width={p.width}
              height={p.height}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'auto'}
              decoding="async"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-sm font-semibold text-white">
            {index + 1} / {photos.length}
          </span>
          <button type="button" aria-label="Предыдущее фото" onClick={() => go(strip.current, Math.max(0, index - 1))}
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-2xl text-white sm:flex">‹</button>
          <button type="button" aria-label="Следующее фото" onClick={() => go(strip.current, Math.min(photos.length - 1, index + 1))}
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-2xl text-white sm:flex">›</button>
        </>
      )}

      {full && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Просмотр фото">
          <div className="flex items-center justify-between p-3 text-white">
            <span className="font-semibold">{index + 1} / {photos.length}</span>
            <button type="button" onClick={() => setFull(false)} className="h-11 w-11 rounded-full bg-white/15 text-2xl" aria-label="Закрыть">×</button>
          </div>
          <div ref={fullStrip} onScroll={(e) => onScroll(e.currentTarget)} className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto">
            {photos.map((p, i) => (
              <div key={i} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
                <img src={p.src} alt={p.alt || title} className="max-h-full max-w-full object-contain" loading="lazy" decoding="async" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
