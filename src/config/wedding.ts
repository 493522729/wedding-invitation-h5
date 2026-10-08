/**
 * 婚礼配置 —— **所有需要改的内容都集中在这个文件**
 *
 * 改完这一处，整个请柬就是你的了：姓名、日期、酒店、地址、终端脚本、
 * 分享文案、地图链接都会跟着变，部署时无需改任何代码。
 *
 * 字体子集化提醒：改过姓名或正文里的汉字后，若新字不在字体子集内，
 * 会**静默回退**到系统字体（不报错，只是那一字变成宋体）。
 * 重新子集化的方法见 public/fonts/README.md。
 */

const BASE = import.meta.env.BASE_URL

/* ---------- 宾客信息 ---------- */
export const info = {
  groom: '新郎',
  bride: '新娘',
  date: '2026年10月25日（周日）',  // ← 改成你的日期
  lunar: '农历九月十六',  // ← 改成你的农历
  signIn: '11:30 签到入席', // ← 占位：填真实签到时间
  seat: '11:58 举办婚礼仪式', // ← 占位：填真实入席时间
  hotel: '示例大酒店',  // ← 改成你的酒店
  hall: '9号厅',  // ← 改成你的厅名
  address: '示例市示例区示例路 1 号',  // ← 改成你的地址
  bestManTel: '138xxxx0001', // ← 占位：伴郎电话
  maidTel: '139xxxx0002', // ← 占位：伴娘电话
  parking: '酒店地面停车场免费', // ← 占位
}

/* ---------- 婚期（倒计时 / ICS 用） ---------- */
export const weddingDate = {
  /** 本地时间：2026-10-25 12:00 入席 */
  local: '2026-10-25T12:00:00',  // ← 改成你的婚期
  /** UTC：04:00Z 即北京时间 12:00，供 ICS 使用 */
  utcStart: '20261025T040000Z',
  /** UTC：09:00Z 即北京时间 17:00 */
  utcEnd: '20261025T090000Z',
  uid: 'wedding@example.com',
}

/* ---------- 日期展示：统一从 weddingDate.local 派生，避免各处硬编码 ---------- */
const d = new Date(weddingDate.local)
const pad2 = (n: number) => String(n).padStart(2, '0')
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export const dateLabel = {
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
  weekday: WEEKDAY_CN[d.getDay()],
  /** 2026.10.25 —— 终端脚本、分享文案用 */
  slash: `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`,
  /** 2026 · 10 · 25 —— 刮卡卡片用 */
  spaced: `${d.getFullYear()} · ${pad2(d.getMonth() + 1)} · ${pad2(d.getDate())}`,
}

/* ---------- 默认祝福文案 ---------- */
/**
 * 宾客没留言时替他们写一句。
 *
 * 为什么要兜底：请柬顶部的祝福跑马灯靠留言驱动，空着提交会让
 * 跑马灯少一条内容，循环出现断档。实测 12 条报名里有 2 条没留言，
 * 比例不低。
 *
 * 前端生成而非后端：这样存进名单里的是**具体文案**，
 * 导出 CSV 时你看到的就是宾客实际展示的那句话，便于日后核对。
 *
 * 风格对齐宾客自己写的那些（「新婚快乐」「白首齐眉鸳鸯比翼，
 * 青阳启瑞桃李同心」），所以混在跑马灯里看不出是代写的。
 */
export const DEFAULT_WISHES: readonly string[] = [
  '新婚快乐，永结同心',
  '百年好合，白头偕老',
  '愿此生长乐无极，岁岁欢愉',
  '两姓联姻，一堂缔约',
  '执子之手，与子偕老',
  '愿你们的爱情，如星辰般璀璨',
  '喜结连理，共赴良辰',
  '愿你们的生活，如诗般浪漫',
  '良辰吉日，幸福绵长',
  '愿君多喜乐，长安共此时',
]

/* ---------- 图片资源 ---------- */
/**
 * 照片清单由 build_gallery.py 自动生成（47 张精修 × 3 档尺寸）。
 *
 * 三个刻意的设计：
 * 1. 不使用 import.meta.glob 扫 public/ —— glob 一旦 eager，Vite 会把所有图
 *    当模块打进 bundle，首屏直达 20MB+。照片是静态资源，<img src> 请求即可。
 * 2. 文件名全部是纯 ASCII（p01.jpg / hero.jpg）—— 摄影机构原名含中文与 `(),`，
 *    在 URL 里需百分号编码，不同服务器解码处理不一致，容易「本地正常、线上 404」。
 * 3. 分三档尺寸而非一档 —— 原图 5472×3648，压到 1600px 在 3x 屏上会明显发糊。
 */
import { PHOTO_IDS } from './photo-manifest'

export interface Photo {
  id: string
  /** 照片墙 / 瀑布流用的小图（约 12KB，懒加载） */
  thumb: string
  /** 详情页轮播用（约 124KB） */
  display: string
  /** 灯箱全屏放大用（约 0.4~0.8MB，仅点开时请求） */
  full: string
  /**
   * WebP 变体：实测比 JPEG 省 34~56%，视觉无差异。
   * 用 <picture> 渐进增强，不支持 WebP 的浏览器自动回退到上面三个 JPEG。
   */
  thumbWebp: string
  displayWebp: string
  fullWebp: string
}

/**
 * 浏览器是否支持 WebP。
 *
 * 图片有两种用法，只有其中一种能用 <picture> 渐进增强：
 *  - <img>（相册瀑布流）：可以用 <picture>，不支持的自动回退；
 *  - CSS background（轮播、刮卡底图都走 background-image）：
 *    <picture> 对它无效，必须自己按特性选URL。
 * 所以统一在这里检测一次，两边共用。
 *
 * 判定方式：画 1×1 的 webp 再 toDataURL 看前缀。特性检测比读 UA 可靠 ——
 * UA 能被伪装、版本号也常被裁剪。
 */
export const webpSupported = (() => {
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    return c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
})()

const url = (dir: 'thumbs' | 'display' | 'large', id: string, ext: 'jpg' | 'webp' = 'jpg') =>
  `${BASE}photos/${dir}/${id}.${ext}`

/** 详情页主纱大图在灯箱中的 id（gallery 内不含它，避免重复） */
export const HERO_PHOTO_ID = 'hero'

export const gallery: Photo[] = PHOTO_IDS.map((id) => ({
  id,
  thumb: url('thumbs', id),
  display: url('display', id),
  full: url('large', id),
  thumbWebp: url('thumbs', id, 'webp'),
  displayWebp: url('display', id, 'webp'),
  fullWebp: url('large', id, 'webp'),
}))

export const photos = {
  /** 刮卡遮罩层的整屏底图（夕阳剪影，暗色压着轮廓最好看） */
  scratch: `${BASE}photos/scratch.jpg`,
  /** 刮卡底图的 WebP：这是**首屏**第一张图，省下的字节最值钱 */
  scratchWebp: `${BASE}photos/scratch.webp`,
  /** 详情页主纱大图（轮播用，1600px 足够） */
  hero: url('display', HERO_PHOTO_ID),
  heroWebp: url('display', HERO_PHOTO_ID, 'webp'),
  /** 主纱高清版（灯箱用） */
  heroLarge: url('large', HERO_PHOTO_ID),
  heroLargeWebp: url('large', HERO_PHOTO_ID, 'webp'),
  /** 主纱缩略图（与 gallery 视觉对齐用） */
  heroThumb: url('thumbs', HERO_PHOTO_ID),
  heroThumbWebp: url('thumbs', HERO_PHOTO_ID, 'webp'),
  /** 照片墙全部照片 */
  gallery,
  /** 微信分享缩略图 300×300 */
  cover: `${BASE}share-cover.jpg`,
}

/* ---------- 背景音乐 ---------- */
/**
 * 素材投放说明见 public/music/README.md。
 * 把 mp3 放成 public/music/ 下即可，不需要改这里。
 * 文件名保持 ASCII 无空格，避免部分 WebView 对编码路径解析异常。
 * 文件不存在时组件会隐藏播放按钮，不会留下点了没声音的摆设。
 */
export const music = {
  /**
   * 文件名保持纯 ASCII 无空格：微信安卓的 X5 内核对含空格的路径
   * 解析有坑，改成连字符最稳妥。
   */
  src: `${BASE}music/wedding-bgm.m4a`,
  /** 初始音量。0.45 是「能听清但不吵」的位置，宾客仍可用系统音量键调节 */
  volume: 0.45,
  /** 淡入淡出时长（ms）：突然出声容易吓到人，也显得廉价 */
  fadeMs: 600,
  /** 循环播放 */
  loop: true,
}

/* ---------- 终端打字脚本 ---------- */
export type TermLineType = 'cmd' | 'ok' | 'run'
export interface TermLine {
  t: TermLineType
  s: string
}

export const termScript: TermLine[] = [
  { t: 'cmd', s: '$ npm install love@forever' },
  { t: 'ok', s: `✓ 已锁定 ${info.groom} ❤ ${info.bride}` },
  { t: 'ok', s: '✓ build 成功 · 0 errors, 0 warnings' },
  { t: 'cmd', s: `$ yarn start wedding --date ${dateLabel.slash}` },
  { t: 'run', s: '▶ 婚礼服务已启动，等待贵宾入席...' },
]

/* ---------- 微信分享 ---------- */
export const share = {
  title: `${info.groom} ❤ ${info.bride} 邀请您见证我们的婚礼`,
  desc: `${dateLabel.slash} ${dateLabel.weekday} · ${info.hotel} · ${info.address}`,
  /** 朋友圈卡片标题有长度上限，单独给一句短的 */
  timelineTitle: `${info.groom} ❤ ${info.bride} 婚礼邀请`,
}

/* ---------- 导航 ---------- */
export const navUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(
  info.hotel
)}&city=示例市&src=wedding`

/* ---------- 占位数据自检 ---------- */
/**
 * 请柬上印着 138xxxx0001 这样的假号码，比不印电话更糟。
 * 开发期直接吵出来，避免带着占位符部署。
 */
if (import.meta.env.DEV) {
  const placeholders: string[] = []
  if (/x{3,}/i.test(info.bestManTel)) placeholders.push('info.bestManTel')
  if (/x{3,}/i.test(info.maidTel)) placeholders.push('info.maidTel')
  if (placeholders.length > 0) {
    console.warn(`[wedding] 以下字段仍是占位符，部署前必须替换：${placeholders.join('、')}`)
  }
  if (!info.date.includes(String(dateLabel.year))) {
    console.warn('[wedding] info.date 的年份与 weddingDate.local 不一致')
  }
}
