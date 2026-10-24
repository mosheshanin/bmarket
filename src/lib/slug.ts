const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** «Кофейня в Хайфе» → «kofeynya-v-hayfe». Не длиннее maxLen, режется по слову. */
export function slugify(input: string, maxLen = 60): string {
  const lower = input.toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (ch in MAP) out += MAP[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += '-';
  }
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (out.length > maxLen) {
    const cut = out.slice(0, maxLen);
    const i = cut.lastIndexOf('-');
    out = i > 20 ? cut.slice(0, i) : cut;
  }
  return out;
}

/** Адрес карточки: /business/1001-kofeynya-v-hayfe */
export function businessPath(lotNumber: number, slug: string): string {
  return `/business/${lotNumber}${slug ? '-' + slug : ''}`;
}

/** Номер лота из сегмента адреса «1001-kofeynya...» или «1001». */
export function parseLotSegment(seg: string): number | null {
  const m = /^(\d{3,9})(?:-|$)/.exec(seg);
  return m ? Number(m[1]) : null;
}
