"""扫描 public/photos/display/ 生成 src/config/photo-dimensions.ts。

为什么需要：瀑布流的 img 若不带 width/height，加载前高度为 0，
Masonry 算不出位置，图片到位后整页重排，表现为「一帧一帧蹦出来」。
浏览器规范的做法是让 HTML 带上 width/height，浏览器据此在加载前
按宽高比预留空间。

横竖比例混排（竖幅 480x320、横幅 320x480 两种），无法用一个统一的
aspect-ratio 糊弄，只能按每张图的真实尺寸分别告知。

依赖：pip3 install Pillow
改完照片要重跑：python3 scripts/gen-photo-dimensions.py
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'public', 'photos', 'display')
OUT = os.path.join(ROOT, 'src', 'config', 'photo-dimensions.ts')

if not os.path.isdir(SRC_DIR):
    raise SystemExit('找不到 %s（请先跑 build_gallery.py）' % SRC_DIR)

rows = []
for name in sorted(os.listdir(SRC_DIR)):
    if not name.lower().endswith('.jpg'):
        continue
    pid = os.path.splitext(name)[0]
    with Image.open(os.path.join(SRC_DIR, name)) as im:
        rows.append((pid, im.width, im.height))

body = '\n'.join('  %s: [%d, %d],' % (pid, w, h) for pid, w, h in rows)
content = '''/**
 * 照片尺寸清单 —— 自动生成，请勿手改。
 * 由 scripts/gen-photo-dimensions.py 扫描 public/photos/display 生成。
 *
 * 用途：让 <img> 能带上 width/height，浏览器在图片加载前就按宽高比
 * 占位，瀑布流不会因图片陆续到位而整页重排。
 */

export const PHOTO_DIMENSIONS: Record<string, readonly [number, number]> = {
%s
}
''' % body

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    f.write(content)

print('已生成 %d 条尺寸 -> %s' % (len(rows), os.path.relpath(OUT, ROOT)))
