"""
批量生成请柬照片资源（缩略图 + 展示图 + 高清大图 + 分享封面 + TS 清单）。

产出：
  public/photos/thumbs/pNN.jpg   —— 照片墙用，长边 480，约 20KB，懒加载
  public/photos/display/pNN.jpg  —— 瀑布流 + 详情轮播，长边 1600，约 300KB
  public/photos/large/pNN.jpg    —— 灯箱全屏放大，长边 2560 / q88，约 1MB
  public/photos/scratch.jpg     —— 刮卡遮罩底图（夕阳剪影）
  public/share-cover.jpg        —— 300×300 微信分享缩略图
  src/config/photo-manifest.ts  —— 文件名清单（自动生成，勿手改）

**为什么单独出一档 large 给灯箱：**
摄影机构原图是 5472×3648、7~16MB。压到 1600px 后在手机上全屏看会明显发糊
（把 5472px 压到 1600px，等于丢掉 2/3 细节）。灯箱是宾客唯一会「认真看照片」
的场景，必须给足像素：2560px 接近 3x 屏原生观感，且点开一张才请求一张。

**为什么重命名为 pNN.jpg：**
摄影机构给的原文件名含中文和 `(),`，在 URL 里需要百分号编码。
不同服务器（nginx / CDN / 对象存储）对编码解码的处理不一致，
容易出现「本地能跑、线上 404」的玄学问题。统一改成纯 ASCII 最省心。

用法：python3 build_gallery.py
"""
from PIL import Image
import os
import json

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("WEDDING_PHOTO_SRC", "/path/to/your/photos")
DST = os.path.join(BASE, "public", "photos")
PUBLIC = os.path.join(BASE, "public")
OUT_MANIFEST = os.path.join(BASE, "src", "config", "photo-manifest.ts")

THUMB_LONG, THUMB_Q = 480, 78
DISPLAY_LONG, DISPLAY_Q = 1600, 82
# 灯箱档：2.5K 覆盖 3x 屏，q88 保住纱幔/皮肤细节
LARGE_LONG, LARGE_Q = 2560, 88

# 刮卡遮罩底图 / 详情页主纱大图：从素材源目录里直接挑好的两张
SCRATCH_SRC = "scratch.jpg"
HERO_SRC = "hero.jpg"


def fit(src_name: str, out_path: str, long: int, q: int) -> tuple[int, int]:
    im = Image.open(os.path.join(SRC, src_name)).convert("RGB")
    w, h = im.size
    scale = long / max(w, h)
    # 只缩小、不放大：素材本身偏小（部分仅 500px 宽），放大只会更糊
    if 0 < scale < 1:
        im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    im.save(out_path, "JPEG", quality=q, optimize=True)
    return im


def main() -> None:
    for sub in ("thumbs", "display", "large"):
        os.makedirs(os.path.join(DST, sub), exist_ok=True)
        d = os.path.join(DST, sub)
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))

    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpg", ".jpeg")))

    # 关键图（主纱 / 遮罩底图）先摘出，剩余照片连续编号 p01..pNN
    special = [f for f in (HERO_SRC, SCRATCH_SRC) if f in files]
    rest = [f for f in files if f not in special]

    mapping: dict[str, str] = {}
    if HERO_SRC in files:
        mapping[HERO_SRC] = "hero"
    if SCRATCH_SRC in files:
        mapping[SCRATCH_SRC] = "scratch"
    for i, f in enumerate(rest, start=1):
        mapping[f] = f"p{i:02d}"

    ok = 0
    for f in files:
        short = mapping[f]
        try:
            im = fit(f, os.path.join(DST, "thumbs", f"{short}.jpg"), THUMB_LONG, THUMB_Q)
            im.save(os.path.join(DST, "thumbs", f"{short}.webp"), "WEBP", quality=THUMB_Q, method=4)
            im = fit(f, os.path.join(DST, "display", f"{short}.jpg"), DISPLAY_LONG, DISPLAY_Q)
            im.save(os.path.join(DST, "display", f"{short}.webp"), "WEBP", quality=DISPLAY_Q, method=4)
            im = fit(f, os.path.join(DST, "large", f"{short}.jpg"), LARGE_LONG, LARGE_Q)
            im.save(os.path.join(DST, "large", f"{short}.webp"), "WEBP", quality=LARGE_Q, method=4)
            ok += 1
        except Exception as e:
            print(f"! 跳过 {f}: {e}")

    # 刮卡底图（不放进 photos 子目录列表）
    im = fit(SCRATCH_SRC, os.path.join(DST, "scratch.jpg"), LARGE_LONG, LARGE_Q)
    im.save(os.path.join(DST, "scratch.webp"), "WEBP", quality=LARGE_Q, method=4)

    # 分享封面
    im = Image.open(os.path.join(SRC, SCRATCH_SRC)).convert("RGB")
    w, h = im.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    im.crop((left, top, left + side, top + side)).resize((300, 300), Image.LANCZOS).save(
        os.path.join(PUBLIC, "share-cover.jpg"), "JPEG", quality=85
    )

    # TS 清单
    shorts = [mapping[f] for f in files if mapping[f] not in ("hero", "scratch")]
    manifest = (
        "/**\n"
        " * 自动生成，请勿手改。\n"
        " * 改照片：编辑 build_gallery.py 后重跑 python3 build_gallery.py\n"
        " *\n"
        f" * 照片墙共 {len(shorts)} 张（不含 hero/scratch，这两个在 gallery 外单独引用）。\n"
        " */\n"
        f"export const PHOTO_IDS: string[] = {json.dumps(shorts)}\n"
    )
    with open(OUT_MANIFEST, "w", encoding="utf-8") as f:
        f.write(manifest)

    print(f"DONE {ok}/{len(files)} 张")
    for sub in ("thumbs", "display", "large"):
        d = os.path.join(DST, sub)
        size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
        print(f"  {sub:8} {len(os.listdir(d)):3} 张  {size / 1024 / 1024:.1f} MB")
    print("  manifest ids:", len(shorts))

    # 同步生成 photo-dimensions.ts（读 display 真实尺寸），保证瀑布流两列分配准确
    dim_path = os.path.join(BASE, "src", "config", "photo-dimensions.ts")
    dim_lines = ["export const PHOTO_DIMENSIONS: Record<string, [number, number]> = {"]
    for pid in ["hero", *shorts]:
        try:
            im = Image.open(os.path.join(DST, "display", f"{pid}.jpg"))
            w, h = im.size
            dim_lines.append(f"  {pid}: [{w}, {h}],")
        except Exception as e:
            print(f"! dimensions 跳过 {pid}: {e}")
    dim_lines.append("}")
    with open(dim_path, "w", encoding="utf-8") as f:
        f.write("\n".join(dim_lines) + "\n")
    print("  photo-dimensions.ts 已更新")


if __name__ == "__main__":
    main()
