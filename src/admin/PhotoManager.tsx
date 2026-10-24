import { useRef, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, upload } from './api';
import { compressImage } from './image';
import { useToast } from './ui';
import type { BusinessDetail, Photo } from './types';

const MAX = 15;

interface Props {
  photos: Photo[];
  ensureId: () => Promise<number | null>;
  onDetail: (d: BusinessDetail) => void;
  /** Базовый адрес API: админка — /api/admin/, продавец — /api/seller/ (те же пути). */
  apiBase?: string;
  /** Подпись для SEO — только в админке. */
  allowAlt?: boolean;
}

interface Pending { key: string; name: string; progress: number; stage: 'compress' | 'upload' | 'error'; error?: string }

function Tile({ photo, index, onDelete, onAlt }: { photo: Photo; index: number; onDelete: () => void; onAlt?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`relative aspect-[4/3] touch-none overflow-hidden rounded-lg bg-line ${isDragging ? 'opacity-80 ring-2 ring-accent' : ''}`}
      {...attributes}
      {...listeners}
    >
      <img src={photo.urlSmall} alt={photo.alt ?? ''} className="h-full w-full object-cover" draggable={false} />
      {index === 0 && <span className="badge absolute left-1 top-1 bg-accent text-accent-text">Обложка</span>}
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onDelete} aria-label="Удалить фото"
        className="absolute right-1 top-1 h-9 w-9 rounded-full bg-black/60 text-lg text-white">×</button>
      {onAlt && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onAlt}
          className="absolute inset-x-1 bottom-1 truncate rounded bg-black/55 px-1.5 py-1 text-left text-[11px] text-white">
          {photo.alt ? `✎ ${photo.alt}` : '✎ подпись для SEO'}
        </button>
      )}
    </li>
  );
}

export default function PhotoManager({ photos, ensureId, onDetail, apiBase = '/api/admin/', allowAlt = true }: Props) {
  const [pending, setPending] = useState<Pending[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const free = MAX - photos.length - pending.filter((p) => p.stage !== 'error').length;
    const list = [...files].slice(0, Math.max(0, free));
    if (files.length > list.length) toast(`Можно не больше ${MAX} фото`, 'error');
    if (!list.length) return;
    const id = await ensureId();
    if (!id) return;
    const items = list.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, progress: 0, stage: 'compress' as const }));
    setPending((p) => [...p, ...items]);
    const update = (key: string, patch: Partial<Pending>) => setPending((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    // По одному: экономит память телефона и не упирается в лимиты.
    for (let i = 0; i < list.length; i++) {
      const it = items[i];
      try {
        const c = await compressImage(list[i]);
        update(it.key, { stage: 'upload' });
        const ext = c.type === 'image/webp' ? 'webp' : 'jpg';
        const form = new FormData();
        form.set('large', new File([c.large], `large.${ext}`, { type: c.type }));
        form.set('small', new File([c.small], `small.${ext}`, { type: c.type }));
        form.set('width', String(c.width));
        form.set('height', String(c.height));
        await upload(`businesses/${id}/photos`, form, (progress) => update(it.key, { progress }), apiBase);
        setPending((p) => p.filter((x) => x.key !== it.key));
        onDetail(await api<BusinessDetail>(`businesses/${id}`, { base: apiBase }));
      } catch (e) {
        update(it.key, { stage: 'error', error: (e as Error).message });
      }
    }
    if (input.current) input.current.value = '';
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = photos.findIndex((p) => p.id === active.id);
    const to = photos.findIndex((p) => p.id === over.id);
    const next = arrayMove(photos, from, to);
    const id = await ensureId();
    if (!id) return;
    try {
      onDetail(await api<BusinessDetail>(`businesses/${id}/photos/order`, { method: 'PUT', body: { ids: next.map((p) => p.id) }, base: apiBase }));
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  async function del(p: Photo) {
    try {
      onDetail(await api<BusinessDetail>(`photos/${p.id}`, { method: 'PATCH', body: { delete: true }, base: apiBase }));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  // window.prompt работает не во всех клиентах Telegram — своё окно.
  const [altEdit, setAltEdit] = useState<{ photo: Photo; value: string } | null>(null);
  const alt = (p: Photo) => setAltEdit({ photo: p, value: p.alt ?? '' });
  async function saveAlt() {
    if (!altEdit) return;
    try {
      onDetail(await api<BusinessDetail>(`photos/${altEdit.photo.id}`, { method: 'PATCH', body: { alt: altEdit.value }, base: apiBase }));
      setAltEdit(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div>
      {altEdit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="card w-full max-w-md p-4">
            <p className="label">Подпись к фото (для поисковиков)</p>
            <input className="field" autoFocus maxLength={200} value={altEdit.value} onChange={(e) => setAltEdit({ ...altEdit, value: e.target.value })} placeholder="Например: зал кофейни с террасой" />
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary flex-1" onClick={saveAlt}>Сохранить</button>
              <button type="button" className="btn btn-secondary" onClick={() => setAltEdit(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => (
              <Tile key={p.id} photo={p} index={i} onDelete={() => del(p)} onAlt={allowAlt ? () => alt(p) : undefined} />
            ))}
            {pending.map((p) => (
              <li key={p.key} className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg bg-line p-2 text-center text-xs">
                {p.stage === 'error' ? (
                  <>
                    <span className="text-danger">{p.error}</span>
                    <button className="underline" onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}>Скрыть</button>
                  </>
                ) : (
                  <>
                    <span>{p.stage === 'compress' ? 'Сжимаем…' : `Загрузка ${Math.round(p.progress * 100)}%`}</span>
                    <span className="h-1.5 w-full overflow-hidden rounded bg-card">
                      <span className="block h-full bg-accent transition-all" style={{ width: `${p.stage === 'compress' ? 5 : Math.round(p.progress * 100)}%` }} />
                    </span>
                  </>
                )}
              </li>
            ))}
            {photos.length + pending.length < MAX && (
              <li>
                <button type="button" onClick={() => input.current?.click()}
                  className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-line text-hint">
                  <span className="text-2xl">＋</span>
                  <span className="text-xs">Добавить фото</span>
                </button>
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      <p className="mt-2 text-xs text-hint">До {MAX} фото. Первое — обложка; порядок меняется перетаскиванием (на телефоне — удерживайте фото). Фото сжимаются на телефоне перед загрузкой.</p>
    </div>
  );
}
