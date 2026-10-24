import { useState } from 'react';
import { api } from './api';
import { useMeta } from './App';
import { Section, confirmDialog, useToast } from './ui';
import type { Category, City } from './types';

type Kind = 'city' | 'category';
type Row = (City | Category) & { namePrepositional?: string };

function DictList({ kind, rows }: { kind: Kind; rows: Row[] }) {
  const { reloadMeta } = useMeta();
  const toast = useToast();
  const base = kind === 'city' ? 'cities' : 'categories';
  const [edit, setEdit] = useState<{ id: number | null; name: string; prep: string } | null>(null);

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      await reloadMeta();
      toast(msg);
      setEdit(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => api(`${base}/order`, { method: 'PUT', body: { ids } }), 'Порядок сохранён');
  };

  const save = () => {
    if (!edit) return;
    const body = kind === 'city' ? { name: edit.name, namePrepositional: edit.prep } : { name: edit.name };
    if (edit.id) run(() => api(`${base}/${edit.id}`, { method: 'PUT', body }), 'Сохранено');
    else run(() => api(base, { body }), 'Добавлено');
  };

  return (
    <Section title={kind === 'city' ? 'Города' : 'Отрасли'}>
      {edit && (
        <div className="flex flex-col gap-2 rounded-lg bg-bg p-3">
          <input className="field" placeholder="Название" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
          {kind === 'city' && (
            <input className="field" placeholder="В каком городе? (Хайфе)" value={edit.prep} onChange={(e) => setEdit({ ...edit, prep: e.target.value })} />
          )}
          {kind === 'city' && <p className="text-xs text-hint">Второе поле — для заголовков: «Бизнесы на продажу в <b>{edit.prep || 'Хайфе'}</b>».</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={save}>Сохранить</button>
            <button className="btn btn-secondary" onClick={() => setEdit(null)}>Отмена</button>
          </div>
        </div>
      )}
      {!edit && <button className="btn btn-secondary self-start" onClick={() => setEdit({ id: null, name: '', prep: '' })}>+ Добавить</button>}
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-1 py-1.5">
            {kind === 'city' && (
              <input type="checkbox" className="mr-1 h-5 w-5 shrink-0" checked={(r as City).isActive} aria-label="Город доступен в каталоге"
                title="Доступен в каталоге, формах и опросе"
                onChange={(e) => run(() => api(`${base}/${r.id}`, { method: 'PUT', body: { isActive: e.target.checked } }), e.target.checked ? 'Город включён' : 'Город выключен («скоро»)')} />
            )}
            <div className={`min-w-0 flex-1 ${kind === 'city' && !(r as City).isActive ? 'opacity-50' : ''}`}>
              <p className="truncate font-medium">{r.name}</p>
              <p className="text-xs text-hint">/{kind === 'city' ? 'city/' : ''}{r.slug} · лотов: {r.lots}</p>
            </div>
            <button className="h-10 w-10 rounded-full text-hint" aria-label="Выше" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button className="h-10 w-10 rounded-full text-hint" aria-label="Ниже" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</button>
            <button className="h-10 w-10 rounded-full" aria-label="Переименовать" onClick={() => setEdit({ id: r.id, name: r.name, prep: r.namePrepositional ?? '' })}>✎</button>
            <button className="h-10 w-10 rounded-full text-danger disabled:opacity-30" aria-label="Удалить" disabled={r.lots > 0}
              title={r.lots > 0 ? 'К записи привязаны объявления' : undefined}
              onClick={async () => (await confirmDialog(`Удалить «${r.name}»?`)) && run(() => api(`${base}/${r.id}`, { method: 'DELETE' }), 'Удалено')}>🗑</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function Dicts() {
  const { meta } = useMeta();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-extrabold">Справочники</h1>
      <p className="text-sm text-hint">Город или отрасль с объявлениями удалить нельзя — только переименовать. Галочка у города — доступен в каталоге, формах и опросе; выключенные города ждут запуска («Скоро! +весь Израиль»).</p>
      <DictList kind="city" rows={meta.cities} />
      <DictList kind="category" rows={meta.categories} />
    </div>
  );
}
