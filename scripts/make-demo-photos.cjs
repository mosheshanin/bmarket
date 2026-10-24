// Иллюстрации для демо-объявлений (фасад + интерьер), 1600×1200 и 600×450 WebP → public/demo/lots/.
// Запуск: NODE_PATH=$(npm root -g) node scripts/make-demo-photos.cjs   (нужны Playwright и python3 с Pillow)
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'public', 'demo', 'lots');
const TMP = path.join(require('node:os').tmpdir(), 'bm-demo');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

// lot, вывеска, цвет стены, цвет навеса, акцент, тип интерьера
const LOTS = [
  [1001, 'CAFÉ', '#E9D6BE', '#B5523B', '#F5B83D', 'cafe'],
  [1002, 'BARBER', '#2E3440', '#1F6FEB', '#E8E8E8', 'barber'],
  [1003, 'HOME SHOP', '#DCE7F2', '#3A7BD5', '#FF7A45', 'shelves'],
  [1004, 'MARKET', '#F1E6CF', '#2E8B57', '#F5B83D', 'shelves'],
  [1005, 'PILATES', '#EFE9F4', '#8C6BB1', '#8FD3FF', 'studio'],
  [1006, 'CAR WASH', '#D7E9F3', '#0B7FAB', '#F5B83D', 'carwash'],
  [1007, 'BAKERY', '#F4E3CC', '#C0763A', '#7A4A2E', 'cafe'],
  [1008, 'KIDS', '#FFF1D6', '#FF7A45', '#8FD3FF', 'studio'],
  [1009, 'NAILS', '#F8E4EA', '#C2557A', '#F5B83D', 'barber'],
  [1010, 'DELIVERY', '#E3E6EA', '#0B1630', '#F5B83D', 'shelves'],
];

const base = `html,body{margin:0}*{box-sizing:border-box}.s{width:1600px;height:1200px;position:relative;overflow:hidden;font-family:'DejaVu Sans',sans-serif}`;

function facade([lot, sign, wall, awning, accent]) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
  .sky{position:absolute;inset:0;background:linear-gradient(#bfe0ff,#eef7ff 60%)}
  .wall{position:absolute;left:140px;right:140px;top:170px;bottom:170px;background:${wall};border-radius:10px;box-shadow:0 30px 80px rgba(0,0,0,.15)}
  .cornice{position:absolute;left:110px;right:110px;top:150px;height:50px;background:rgba(0,0,0,.18);border-radius:8px}
  .sign{position:absolute;left:50%;top:230px;transform:translateX(-50%);white-space:nowrap;padding:26px 60px;background:#0B1630;color:${accent};font-weight:700;font-size:92px;letter-spacing:8px;border-radius:14px}
  .awning{position:absolute;left:200px;right:200px;top:420px;height:120px;background:repeating-linear-gradient(90deg,${awning} 0 90px,#fff 90px 180px);border-radius:0 0 30px 30px;box-shadow:0 18px 30px rgba(0,0,0,.18)}
  .win{position:absolute;top:560px;height:420px;width:520px;background:linear-gradient(160deg,#fff6dc,#ffd98a);border:16px solid #2b2f36;border-radius:8px;overflow:hidden}
  .win i{position:absolute;bottom:40px;border-radius:50%;background:${awning};opacity:.55}
  .door{position:absolute;left:50%;transform:translateX(-50%);top:600px;width:220px;height:430px;background:#2b2f36;border-radius:10px 10px 0 0}
  .door:after{content:'';position:absolute;inset:24px 24px 120px;background:linear-gradient(160deg,#fff6dc,#ffcf6a);border-radius:6px}
  .walk{position:absolute;left:0;right:0;bottom:0;height:190px;background:#cfd3d8}
  .walk:before{content:'';position:absolute;left:0;right:0;top:0;height:24px;background:#b7bcc3}
  .pot{position:absolute;bottom:170px;width:120px;height:110px;background:#7a4a2e;border-radius:10px 10px 30px 30px}
  .pot:before{content:'';position:absolute;left:-30px;right:-30px;bottom:90px;height:170px;background:radial-gradient(circle at 50% 70%,#3f8f4f 0 55%,transparent 56%),radial-gradient(circle at 25% 40%,#56a865 0 35%,transparent 36%),radial-gradient(circle at 75% 35%,#4c9c5b 0 35%,transparent 36%)}
  .num{position:absolute;right:170px;top:200px;padding:6px 14px;background:#fff;border-radius:8px;font-size:30px;color:#0B1630}
  </style></head><body><div class="s"><div class="sky"></div><div class="cornice"></div><div class="wall"></div>
  <div class="sign">${sign}</div><div class="awning"></div>
  <div class="win" style="left:220px"><i style="left:60px;width:140px;height:140px"></i><i style="left:240px;width:90px;height:90px"></i><i style="left:360px;width:120px;height:120px"></i></div>
  <div class="win" style="right:220px"><i style="left:70px;width:110px;height:110px"></i><i style="left:220px;width:160px;height:160px"></i><i style="left:400px;width:80px;height:80px"></i></div>
  <div class="door"></div><div class="walk"></div>
  <div class="pot" style="left:150px"></div><div class="pot" style="right:150px"></div>
  </div></body></html>`;
}

function interior([lot, sign, wall, awning, accent, kind]) {
  const lamps = [300, 800, 1300].map((x) => `<div class="lamp" style="left:${x}px"></div>`).join('');
  let items = '';
  if (kind === 'cafe') {
    items = [220, 640, 1060].map((x) => `<div class="table" style="left:${x}px"></div><div class="chair" style="left:${x - 40}px"></div><div class="chair" style="left:${x + 250}px"></div>`).join('') +
      `<div class="counter"></div>`;
  } else if (kind === 'barber') {
    items = [180, 600, 1020].map((x) => `<div class="mirror" style="left:${x}px"></div><div class="seat" style="left:${x + 60}px"></div>`).join('');
  } else if (kind === 'studio') {
    items = [160, 560, 960].map((x) => `<div class="mat" style="left:${x}px"></div>`).join('') + `<div class="windowbig"></div><div class="ball" style="left:1300px"></div><div class="ball" style="left:1180px;background:${awning}"></div>`;
  } else if (kind === 'carwash') {
    items = `<div class="car"></div><div class="arch"></div><div class="bubbles"></div>`;
  } else {
    items = [120, 560, 1000].map((x) => `<div class="shelf" style="left:${x}px">${Array.from({ length: 12 }, (_, i) => `<b style="background:${i % 3 ? awning : accent};opacity:${0.55 + (i % 4) * 0.1}"></b>`).join('')}</div>`).join('');
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
  .wall{position:absolute;inset:0 0 340px;background:${wall}}
  .floor{position:absolute;left:0;right:0;bottom:0;height:340px;background:repeating-linear-gradient(90deg,#c9a77f 0 160px,#bf9c73 160px 320px)}
  .lamp{position:absolute;top:0;width:8px;height:180px;background:#2b2f36}
  .lamp:after{content:'';position:absolute;left:-60px;top:170px;width:128px;height:70px;background:${awning};border-radius:70px 70px 10px 10px;box-shadow:0 60px 120px 30px rgba(255,220,140,.55)}
  .table{position:absolute;bottom:250px;width:240px;height:24px;background:#5b3a26;border-radius:6px}
  .table:after{content:'';position:absolute;left:108px;top:24px;width:24px;height:150px;background:#3d271a}
  .chair{position:absolute;bottom:170px;width:70px;height:200px;border:12px solid #2b2f36;border-bottom:none;border-radius:12px 12px 0 0}
  .counter{position:absolute;right:0;bottom:340px;width:120px;height:0}
  .mirror{position:absolute;top:240px;width:300px;height:400px;background:linear-gradient(160deg,#ffffff,#cfe3f5);border:14px solid ${accent};border-radius:150px 150px 20px 20px}
  .seat{position:absolute;bottom:200px;width:180px;height:200px;background:${awning};border-radius:30px 30px 10px 10px}
  .seat:after{content:'';position:absolute;left:70px;top:200px;width:40px;height:140px;background:#2b2f36}
  .mat{position:absolute;bottom:120px;width:340px;height:90px;background:${awning};border-radius:16px;transform:skewX(-20deg);opacity:.85}
  .windowbig{position:absolute;left:200px;right:200px;top:120px;height:460px;background:linear-gradient(#bfe0ff,#eef7ff);border:18px solid #fff;border-radius:16px}
  .ball{position:absolute;bottom:200px;width:180px;height:180px;border-radius:50%;background:${accent}}
  .car{position:absolute;left:420px;bottom:180px;width:760px;height:220px;background:${awning};border-radius:110px 140px 40px 40px}
  .car:before,.car:after{content:'';position:absolute;bottom:-60px;width:150px;height:150px;border-radius:50%;background:#2b2f36;border:26px solid #9aa3ad}
  .car:before{left:90px}.car:after{right:90px}
  .arch{position:absolute;left:300px;right:300px;top:120px;height:700px;border:40px solid ${accent};border-bottom:none;border-radius:40px 40px 0 0}
  .bubbles{position:absolute;inset:200px 360px 500px;background:radial-gradient(circle,#fff 0 18px,transparent 19px) 0 0/90px 90px;opacity:.8}
  .shelf{position:absolute;top:160px;width:400px;height:640px;background:#8a6a4f;border-radius:8px;padding:30px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;align-content:space-between}
  .shelf b{display:block;height:110px;border-radius:8px}
  </style></head><body><div class="s"><div class="wall"></div><div class="floor"></div>${lamps}${items}</div></body></html>`;
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  for (const lot of LOTS) {
    for (const [i, html] of [[0, facade(lot)], [1, interior(lot)]]) {
      await p.setContent(html);
      const png = path.join(TMP, `${lot[0]}-${i}.png`);
      await p.screenshot({ path: png });
      execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(png)}).convert('RGB')
im.save(${JSON.stringify(path.join(OUT, `${lot[0]}-${i}-1600.webp`))}, 'WEBP', quality=78)
im.resize((600, 450), Image.LANCZOS).save(${JSON.stringify(path.join(OUT, `${lot[0]}-${i}-600.webp`))}, 'WEBP', quality=78)
`]);
    }
    console.log('lot', lot[0]);
  }
  await b.close();
})();
