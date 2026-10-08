"""生成微信分享缩略图（public/share-cover.jpg）。

为什么需要脚本而不是直接放一张图：个人主体公众号无法通过微信认证，
拿不到 jsapi_ticket，只能走「透明分享」—— 卡片内容完全由 OG meta 决定，
这张图就是宾客在分享卡片里看到的第一眼，值得单独做。

依赖：pip3 install Pillow
源图：public/photos/scratch.jpg（2560x1706，裁 1:1 足够出 900px）
"""

from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import math, os

SRC = 'public/photos/scratch.jpg'
OUT = 'public/share-cover.jpg'
SIZE = 900

im = Image.open(SRC).convert('RGB')
w, h = im.size
side = min(w, h)
left = (w - side) // 2
top = int((h - side) * 0.42)
im = im.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)

im = ImageEnhance.Brightness(im).enhance(1.22)
im = ImageEnhance.Contrast(im).enhance(1.10)
im = ImageEnhance.Color(im).enhance(1.06)

overlay = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
for y in range(int(SIZE * 0.50), SIZE):
    t = (y - SIZE * 0.50) / (SIZE * 0.50)
    od.line([(0, y), (SIZE, y)], fill=(12, 8, 10, int(200 * t ** 1.4)))
im = Image.alpha_composite(im.convert('RGBA'), overlay)
draw = ImageDraw.Draw(im)

FONT = '/System/Library/Fonts/Supplemental/Songti.ttc'
_c = {}
def font(size):
    if size not in _c:
        for idx in range(8):
            try:
                _c[size] = ImageFont.truetype(FONT, size, index=idx); break
            except Exception:
                continue
        else:
            _c[size] = ImageFont.load_default()
    return _c[size]

def text_w(t, f):
    b = draw.textbbox((0, 0), t, font=f)
    return b[2] - b[0]

def heart(cx, cy, size, color):
    """参数方程绘心形：字体缺 U+2764 时比换字体可靠"""
    pts = []
    for i in range(0, 361, 3):
        tt = math.radians(i)
        x = 16 * math.sin(tt) ** 3
        y = 13 * math.cos(tt) - 5 * math.cos(2*tt) - 2 * math.cos(3*tt) - math.cos(4*tt)
        pts.append((cx + x * size / 34.0, cy - y * size / 34.0))
    draw.polygon(pts, fill=color)

# 主标题：新郎 ❤ 新娘 —— 心形单独绘制
f2 = font(72)
gap = 34
w1, w2 = text_w('新郎', f2), text_w('新娘', f2)
heart_w = 62
total = w1 + gap + heart_w + gap + w2
x0 = (SIZE - total) / 2
y2 = SIZE * 0.655
draw.text((x0, y2), '新郎', font=f2, fill=(255, 255, 255, 255))
heart(x0 + w1 + gap + heart_w / 2, y2 + 44, heart_w, (255, 138, 138, 255))
draw.text((x0 + w1 + gap + heart_w + gap, y2), '新娘', font=f2, fill=(255, 255, 255, 255))

def center(t, f, y, fill):
    draw.text(((SIZE - text_w(t, f)) / 2, y), t, font=f, fill=fill)

center('2026 · 10 · 25', font(34), SIZE * 0.585, (255, 224, 138, 255))
center('诚邀您见证我们的婚礼', font(30), SIZE * 0.825, (242, 228, 228, 245))

# 必须用基线 JPEG（progressive=False）：微信的图文消息图片解析器
# 对渐进式 JPEG 支持很差，抓不到 og:image 会退化成「标题+域名」的纯链接样式
im.convert('RGB').save(OUT, 'JPEG', quality=88, optimize=True, progressive=False)
print('已生成 %dx%d  %.0f KB' % (SIZE, SIZE, os.path.getsize(OUT) / 1024))
