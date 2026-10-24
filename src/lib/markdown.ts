import { Marked, type Tokens } from 'marked';
import { escapeHtml } from './format';

/**
 * Безопасный Markdown: любой сырой HTML экранируется, ссылки — только http(s)/mailto/tel,
 * картинки выводятся как ссылки. Заголовки сдвигаются вниз (# → h3), т. к. h1/h2 заняты страницей.
 */
const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;

const md = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    link(token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      if (!SAFE_URL.test(token.href)) return text;
      return `<a href="${escapeHtml(token.href)}" rel="nofollow noopener" target="_blank">${text}</a>`;
    },
    image(token: Tokens.Image) {
      if (!SAFE_URL.test(token.href)) return escapeHtml(token.text);
      return `<a href="${escapeHtml(token.href)}" rel="nofollow noopener" target="_blank">${escapeHtml(token.text || token.href)}</a>`;
    },
    heading(token: Tokens.Heading) {
      const level = Math.min(6, token.depth + 2);
      return `<h${level}>${this.parser.parseInline(token.tokens)}</h${level}>\n`;
    },
  },
});

export function renderMarkdown(src: string): string {
  return md.parse(src ?? '') as string;
}

/** Текст без разметки — для мета-описаний и подписей. */
export function stripMarkdown(src: string): string {
  return (src ?? '')
    .replace(/[#*_`>~\-]+/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
