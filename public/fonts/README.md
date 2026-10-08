# 字体说明

## wedding-names-subset.woff2

- **来源**：站酷快乐体（ZCOOL KuaiLe Regular）
- **授权**：SIL Open Font License 1.1，**允许商用**
- **原始体积**：1.12 MB（来自 @fontsource/zcool-kuaile@5.0.0）
- **当前体积**：21 KB
- **字形数**：125（120 个字符）

### 为什么做子集化

完整中文字体 1.12MB，在微信内置浏览器里会明显拖慢首屏。
只保留姓名与婚庆场景高频字后体积压到 21KB，压缩 55 倍。

### 换名字或改文案时必须重新子集化

子集里没有的字会**静默回退到后备字体**（宋体），不会报错，
所以改文案后要自己确认一下效果。

踩过的坑：初版子集里写的是「我们结婚**啦**」，而刮卡实际用的是
「我们结婚**了**」——「了」字不在子集里，页面上却看不出异常，
只是那一个字悄悄变回了宋体。补齐全部实际用字后重做，
现在「我们结婚了 / 新郎 / 新娘 / 报名 / 出席 / 宾客」均已验证在子集内。

重新生成的方法：

```bash
pip3 install fonttools brotli
curl -L -o /tmp/kuaile.woff2 \
  https://cdn.jsdelivr.net/npm/@fontsource/zcool-kuaile@5.0.0/files/zcool-kuaile-chinese-simplified-400-normal.woff2

python3 - <<'PY'
from fontTools import subset
CHARS = "在这里列出需要保留的字"
chars = ''.join(sorted(set(CHARS)))
options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['*']
options.name_IDs = ['*']
font = subset.load_font('/tmp/kuaile.woff2', options)
s = subset.Subsetter(options=options)
s.populate(text=chars)
s.subset(font)
subset.save_font(font, 'public/fonts/wedding-names-subset.woff2', options)
PY
```

---

## countdown.woff2

- **来源**：Cormorant Garamond Italic（@fontsource/cormorant-garamond）
- **授权**：SIL Open Font License 1.1，**允许商用**
- **原始体积**：23 KB
- **当前体积**：3.8 KB（只保留 0-9 与冒号）

### 为什么不用 Marker Felt

Marker Felt 由 Dave Fleming 设计，属**商业字体**，随 macOS 授权分发。
把它打包进请柬等于分发给所有宾客，是字体授权问题。

而且即使只在 CSS 里写 `font-family: 'Marker Felt'`，也只有装了
该字体的 Mac 会显示，其他设备（Windows、安卓、微信 WebView）全部
回退到默认字体 —— 请柬主要就是在这些设备上打开的。

### 换过一次字体

最初用的是 Permanent Marker（马克笔体），但它偏活泼，
与请柬整体的古典感不搭。现在换成衬线斜体，更接近传统请帖的数字。

### 斜体的副作用

斜体视觉上偏窄，字号从 34px 提到 38px 才够醒目。
且字体没有 `tabular-nums`，数字宽度不一致 —— 已在
`CountdownTimer.vue` 里用 `min-width` + `text-align: center` 吸收抖动。

---

## invite-words.woff2

- **来源**：霞鹜文楷 LXGW WenKai Regular（GitHub lxgw/LxgwWenKai）
- **授权**：SIL Open Font License 1.1，**允许商用**
- **原始体积**：15.2 MB
- **当前体积**：13.4 KB（56 个字形）
- **用途**：邀请辞模块的标题与正文

### 为什么不直接用官方分片

霞鹜文楷官方 Web 版是 100+ 个分片（按 Unicode 区间切），
直接引用要下载几百 KB。这里从 GitHub 取完整 TTF 后自行子集化，
只保留邀请辞实际用到的 56 个字，15.2MB → 13.4KB。

**改文案时必须重新子集化**，缺字会静默回退到宋体。

## wedding-names-subset.woff2

- **来源**：站酷快乐体（ZCOOL KuaiLe Regular）
- **授权**：SIL Open Font License 1.1，**允许商用**
- **原始体积**：1.12 MB（来自 @fontsource/zcool-kuaile@5.0.0）
- **当前体积**：21 KB
- **字形数**：125（120 个字符）

### 为什么做子集化

完整中文字体 1.12MB，在微信内置浏览器里会明显拖慢首屏。
只保留姓名与婚庆场景高频字后体积压到 21KB，压缩 55 倍。

### 换名字或改文案时必须重新子集化

子集里没有的字会**静默回退到后备字体**（宋体），不会报错，
所以改文案后要自己确认一下效果。

踩过的坑：初版子集里写的是「我们结婚**啦**」，而刮卡实际用的是
「我们结婚**了**」——「了」字不在子集里，页面上却看不出异常，
只是那一个字悄悄变回了宋体。补齐全部实际用字后重做，
现在「我们结婚了 / 新郎 / 新娘 / 报名 / 出席 / 宾客」均已验证在子集内。

重新生成的方法：

```bash
pip3 install fonttools brotli
curl -L -o /tmp/kuaile.woff2 \
  https://cdn.jsdelivr.net/npm/@fontsource/zcool-kuaile@5.0.0/files/zcool-kuaile-chinese-simplified-400-normal.woff2

python3 - <<'PY'
from fontTools import subset
CHARS = "在这里列出需要保留的字"
chars = ''.join(sorted(set(CHARS)))
options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['*']
options.name_IDs = ['*']
font = subset.load_font('/tmp/kuaile.woff2', options)
s = subset.Subsetter(options=options)
s.populate(text=chars)
s.subset(font)
subset.save_font(font, 'public/fonts/wedding-names-subset.woff2', options)
PY
```

---

## countdown.woff2

- **来源**：Permanent Marker Regular（@fontsource/permanent-marker@5.0.0）
- **授权**：SIL Open Font License 1.1，**允许商用**
- **原始体积**：29 KB
- **当前体积**：2.9 KB
- **字形数**：12（数字 0-9 与冒号）

### 为什么不用 Marker Felt

Marker Felt 由 Dave Fleming 设计，属**商业字体**，随 macOS 授权分发。
把它打包进请柬等于 redistributed 给所有宾客，是字体授权问题。

而且即使只在 CSS 里写 `font-family: 'Marker Felt'`，也只有装了
该字体的 Mac 会显示，其他设备（Windows、安卓、微信 WebView）全部
回退到默认字体 —— 请柬在 iPhone 上打开就看不到手写效果了。

Permanent Marker 是同风格（马克笔手写）里最接近的免费商用替代。

### 为什么只有 12 个字形

倒计时只显示数字，最多加一个冒号。子集化后从 29KB 压到 2.9KB。

### 手写体的副作用

Permanent Marker 没有 `tabular-nums`（等宽数字）特性，数字宽度不一致，
秒数跳动时整行会左右晃。已在 `CountdownTimer.vue` 里用
`min-width: 52px` + `text-align: center` 吸收该抖动，
实测四块宽度恒为 52px，布局稳定。
