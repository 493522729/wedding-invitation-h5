# 婚礼请柬 H5 模板

一个可以在微信里打开的单页请柬：刮卡入场、终端打字机、照片墙、宾客祝福弹幕、
RSVP 报名与名单管理。

**在线预览**：<https://493522729.github.io/wedding-invitation-h5/>
（静态托管演示，RSVP / 祝福墙接口无后端，提交功能不可用；加 `?demo=1` 可反复体验刮卡）

**这是一个模板** —— 所有真实信息都抽在`src/config/wedding.ts` 一个文件里，
改成你自己的之后即可部署使用。仓库里的照片为示例素材，用 `build_gallery.py` 即可换成你自己的精修照。

```bash
# 1. 装依赖
npm install

# 2. 改信息：只需这一个文件
vim src/config/wedding.ts

# 3. 放照片（可选）
#    把精修照片放进一个目录，然后：
pip3 install Pillow
python3 scripts/build_gallery.py --src /你的/照片目录

# 4. 起服务
npm run dev        # 开发
npm run build      # 产出 dist/
```

部署 `dist/` 到任意静态托管即可，详见 [部署](#部署)。

---

## 特色

| | |
|---|---|
| 刮卡入场 | Canvas 涂层 + 双层擦除，进度按像素统计而非按笔画 |
| 终端叙事 | 打字机效果 + 逐行高亮，最后一行光标常驻 |
| 祝福弹幕 | 访客留言垂直无缝循环，点击可暂停、点开看全部 |
| 照片墙 | 瀑布流 + 灯箱；灯箱先铺中等档、翻到哪张才升到高清档 |
| RSVP 报名 | 只收姓名/人数/是否出席，不收手机号；名单密码保护 |
| 播放控制 | 观众点击后播放/暂停，可提前暂停 |

## 技术栈

- **Vue 3.5** + TypeScript + Vite，**零 UI 框架**
- 路由`vue-router`（hash 模式，静态托管无需任何 rewrite）
- 灯箱 `viewerjs`
- 后端：Node 原生 `http`，**零第三方依赖**
- 存储：JSON 文件（非数据库）
- 部署：Docker + nginx + GitHub Actions

为什么不用 Pinia / Express / 数据库，理由写在
[技术复盘](docs/ARCHITECTURE.md) 第二节。

## 配置

绝大多数改动只需要动 `src/config/wedding.ts`：

```ts
export const info = {
  groom: '新郎',
  bride: '新娘',
  date: '2026年10月25日（周日）',
  lunar: '农历九月十六',
  signIn: '11:30 签到入席',
  seat: '11:58 举办婚礼仪式',
  hotel: '示例大酒店',
  hall: '9号厅',
  address: '示例市示例区示例路 1 号',
  // ...
}
```

分享卡片的文案在 `index.html` 的 OG meta 里，也要一并改。

### 换成自己的照片

把照片放进一个目录，跑：

```bash
pip3 install Pillow
python3 scripts/build_gallery.py --src /你的/照片目录
```

会生成三档尺寸（缩略图 / 展示图 / 高清图）+ WebP 版本，
并自动更新 `src/config/photo-manifest.ts` 与 `photo-dimensions.ts`。

> **改完文案记得检查字体子集。** 若新用到的汉字不在字体子集内，
> 会**静默回退**到系统字体——不报错，只是那一个字变成宋体。
> 重新子集化的方法见 [`public/fonts/README.md`](public/fonts/README.md)。

## 报名后端

```bash
node server/rsvp-server.cjs   # 默认监听 9201
```

四个接口：`/stats`（公开统计）、`/submit`（提交）、
`/login` +`/list` + `/export`（管理，需口令）。

环境变量：

| 变量 | 说明 |
|---|---|
| `PORT` | 监听端口，默认 9201 |
| `DATA_FILE` | 名单文件路径 |
| `ADMIN_SALT` | 管理口令的盐 |
| `ADMIN_HASH` | scrypt 后的口令哈希（hex） |
| `TRUST_PROXY` | 经 nginx 反代时设为 `1` |

**部署到子路径时**，记得让前端能访问到 `/rsvp-api`：本地开发时
用 `RSVP_TARGET=http://127.0.0.1:9201 npm run dev` 把请求代理到本地后端，
生产环境则由 nginx 反代。

## 演示模式

录屏或演示时在网址后加 `?demo=1`：

- 每次进入都从刮卡开始（忽略已解锁标记）
- 报名永远是空白表单（忽略「已报名」锁定）

弹层里会显示一行提示，防止录完忘记关。注意此模式**照常写数据**。

##部署

产物是纯静态文件，`dist/` 丢到任意托管即可。

若部署在子路径（如 `example.com/wedding/`），改 `vite.config.ts` 的 `base`。
若用 nginx，配一条 `try_files`兜底即可：

```nginx
location /wedding/ {
    alias /var/www/wedding/;
    try_files $uri $uri/ /wedding/index.html;
    # 图片设长缓存
    location ~* \.(jpg|webp|woff2)$ { expires 30d; }
}
```

## 移动端适配

这个项目大部分技术债都在移动端浏览器上，以下都是实测踩出来的：

- 滚动惯性会取消 `click`，需要用 `@pointerup`
- 输入框字号 < 16px 时 iOS 聚焦会自动放大整页
- `touch-action: manipulation` **不**禁止 pinch-zoom，得用 `pan-x pan-y`
- 音频需在真实用户手势里 `load()` + `play()`，否则微信里永远没声音

完整清单见[技术复盘](docs/ARCHITECTURE.md) 第五节。

## 许可

代码 [MIT](LICENSE)。

字体均为 SIL OFL 1.1（允许商用与再分发）：Cormorant Garamond、
霞鹜文楷、站酷快乐体。

`public/photos/` 下是程序生成的占位图，可自由替换。
