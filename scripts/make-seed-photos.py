"""Генерирует фото-заглушки для тестовых лотов (только локально/staging)."""
import math, random, sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else 'seed/photos'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
LOTS = {
    1001: [((205, 140, 90), (90, 55, 40), 'Зал кофейни'), ((120, 160, 110), (40, 70, 50), 'Терраса'), ((230, 200, 160), (140, 100, 70), 'Барная стойка')],
    1002: [((70, 80, 100), (25, 25, 35), 'Зал барбершопа'), ((150, 120, 90), (60, 45, 35), 'Рабочие места')],
    1003: [((110, 150, 210), (40, 60, 120), 'Склад'), ((200, 210, 230), (90, 100, 140), 'Упаковка заказов')],
    1004: [((180, 180, 180), (80, 80, 80), 'Магазин')],
    1005: [((220, 180, 200), (120, 70, 100), 'Салон')],
}

def render(c1, c2, label, w, h, seed):
    random.seed(seed)
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)))
    for _ in range(14):
        x, y, r = random.randint(0, w), random.randint(0, h), random.randint(w // 20, w // 6)
        col = tuple(min(255, c + random.randint(-30, 40)) for c in c1)
        d.ellipse([x - r, y - r, x + r, y + r], outline=col, width=max(2, w // 300))
    f = ImageFont.truetype(FONT, max(18, w // 18))
    tw = d.textlength(label, font=f)
    d.rounded_rectangle([w / 2 - tw / 2 - w * 0.03, h * 0.42, w / 2 + tw / 2 + w * 0.03, h * 0.58], radius=w // 60, fill=(0, 0, 0))
    d.text((w / 2, h / 2), label, font=f, fill=(255, 255, 255), anchor='mm')
    return img

for lot, items in LOTS.items():
    for i, (c1, c2, label) in enumerate(items):
        for size, (w, h) in (('1600', (1600, 1200)), ('600', (600, 450))):
            render(c1, c2, label, w, h, lot * 10 + i).save(f'{OUT}/{lot}-{i}-{size}.webp', 'WEBP', quality=72)
print('ok')
