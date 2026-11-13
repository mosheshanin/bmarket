// Старый адрес bmarket.moshemadwords.workers.dev → https://market.haifa.business (13.11.2026).
// Резервная копия сайта на workers.dev была второй индексируемой копией каталога со своим canonical.
// 301 с тем же путём и параметрами; откат — Cloudflare → Workers → bmarket → Deployments → прежняя версия → Rollback.
const TARGET = 'https://market.haifa.business';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    return new Response(null, {
      status: 301,
      headers: { location: TARGET + url.pathname + url.search, 'cache-control': 'public, max-age=86400' },
    });
  },
};
