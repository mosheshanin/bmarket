import { useMemo, useRef, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';

/** Простой редактор Markdown: жирный, список, заголовок + предпросмотр. */
export default function MarkdownEditor({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const html = useMemo(() => (preview ? renderMarkdown(value) : ''), [preview, value]);

  function wrap(before: string, after = before, placeholder = 'текст') {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }

  function linePrefix(prefix: string) {
    const ta = ref.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const start = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(start, e) || '';
    const replaced = (block || 'пункт').split('\n').map((l) => (l.startsWith(prefix) ? l : prefix + l)).join('\n');
    onChange(value.slice(0, start) + replaced + value.slice(e));
    requestAnimationFrame(() => ta.focus());
  }

  const btn = 'h-10 min-w-10 rounded-lg px-2.5 text-sm font-bold hover:bg-line';
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <div className="flex items-center gap-1 border-b border-line bg-bg px-1 py-1">
        <button type="button" className={btn} onClick={() => wrap('**')} aria-label="Жирный">Ж</button>
        <button type="button" className={btn} onClick={() => linePrefix('- ')} aria-label="Список">• Список</button>
        <button type="button" className={btn} onClick={() => linePrefix('## ')} aria-label="Заголовок">Заголовок</button>
        <span className="flex-1" />
        <button type="button" className={`${btn} ${preview ? 'bg-accent text-accent-text' : ''}`} onClick={() => setPreview((p) => !p)}>
          {preview ? 'Редактировать' : 'Предпросмотр'}
        </button>
      </div>
      {preview ? (
        <div className="prose-md min-h-48 bg-card p-3" dangerouslySetInnerHTML={{ __html: html || '<p style="opacity:.6">Пусто</p>' }} />
      ) : (
        <textarea ref={ref} id={id} className="block min-h-48 w-full resize-y bg-card p-3 text-[16px] outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
