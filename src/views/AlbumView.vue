<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import Viewer from 'viewerjs'
import { info, photos, HERO_PHOTO_ID, webpSupported, type Photo } from '../config/wedding'
import { PHOTO_DIMENSIONS } from '../config/photo-dimensions'

/**
 * 相册页：完整浏览所有照片，点击进灯箱按 2.5K 原画质放大。
 *
 * 三档图片尺寸（见 build_gallery.py）：
 *   thumbs  480px  滚动占位
 *   display 1600px 瀑布流实际显示（2~3x 屏够用）
 *   large   2560px 灯箱全屏放大（q88，接近原生观感）
 *
 * 灯箱为什么直接用 viewerjs 而非 v-viewer：v-viewer 3.x 的组件在 Vue3 下
 * 依赖编译期 slot 解析，实测点击后完全不初始化且控制台零报错。
 *
 * 分页加载：首屏 12 张，滚到底再加载 —— 低端安卓全量 DOM 会卡，
 * 且婚礼当天宾客网络不可控。
 */
const router = useRouter()

/** 完整照片列表：主纱在首位，gallery 顺序跟随（瀑布流与灯箱共用同一份） */
const all = computed<Photo[]>(() => [
  {
    id: HERO_PHOTO_ID,
    thumb: photos.heroThumb,
    display: photos.hero,
    full: photos.heroLarge,
    thumbWebp: photos.heroThumbWebp,
    displayWebp: photos.heroWebp,
    fullWebp: photos.heroLargeWebp,
  },
  ...photos.gallery,
])

/**
 * 一次性渲染全部照片，不再分批追加。
 *
 * 之前是「哨兵进入视口就追加下一批」，浏览器每次都重新分栏，
 * **已渲染照片的视觉位置会随之改变**（实测第 6 张的 top 从 98 变成 1238）：
 * 宾客滑回顶部时，原本摆着草地牵手的那个位置换成了另一张照片，
 * 看起来像「照片变了」。改为一次渲染后布局只计算一次，位置永久稳定。
 *
 * 图片加载仍只由浏览器原生 loading="lazy" 负责：视口外的图不会下载，
 * 而 width/height 属性已让它预留好空间，所以既不浪费流量，
 * 也不会因图片到位而二次重排。
 */

/**
 * 两列分配 —— 真瀑布流。
 *
 * 为什么不用 CSS 的 column-count：它的 balance 只能**顺序切分**
 * （前 k 张进第一列、其余进第二列），无法自由组合。为了让两列等高，
 * 它会算出「第一列 28 张、第二列 20 张」这种分配 —— 而照片本身
 * 横竖混排，28 张里大半是横版，这导致左列提前收尾，
 * 视觉上就是「右边空出一大块」（真机实测底部错落约 55px，
 * 且左列在 #28 就结束、后面 20 张全在右列，一眼能看出割裂）。
 *
 * 真瀑布流的定义是「每张放进当前较矮的那列」，两列始终贴底。
 * 这里在数据层直接分配（而不是依赖浏览器），好处有三点：
 *   1. 贴底对齐，底部错落可压到个位数 px；
 *   2. 不受各浏览器 balance 实现差异影响（iOS 与 Chromium 结果不同）；
 *   3. 分配只依赖照片比例，与视口宽度无关，旋转屏幕不会重排。
 *
 * 分配用 0-1 背包（子集和 DP）求**全局最优**，不用贪心：
 * 贪心（每张塞较矮列）实测底部仍差 140px，从它出发的爬山微调也卡在
 * 局部最优 —— 单张移动都改善不了，必须同时动两张才行。
 *
 * 关键是**用比例单位而不是像素**做 DP：权重 = 高/宽 + 间距折算，
 * 48 张总和只有约 56，取 1000 倍精度后数组仅 56KB，
 * 48 × 5.6万 ≈ 270 万次循环，耗时在微秒级，不会拖慢首屏。
 * 若改用像素（总高 8000+）做 DP，数组要 800 万，开销大两个数量级。
 * 精度损失 ≤ 0.0005 权重单位 × 168px ≈ 0.08px/张，完全够用。
 *
 * 保留的约定：**阅读顺序仍是「读完左列再读右列」**。
 * 所以 viewerjs 用的列表是重排后的 [左列..., 右列...]，
 * 翻页顺序与视觉顺序一致（否则翻一张却跳到另一列顶部）。
 */
const columns = computed(() => {
  const list = all.value
  const n = list.length
  /**
   * 统一的参考列宽，仅用于让 gap 与图片高度同量纲。
   * 取 375px 视口下的实际列宽并写死：这样分配结果与真机列宽解耦，
   * 换设备 / 旋转屏幕都得到同一套布局。
   */
  const REF_COL_W = 168
  const GAP = 8
  /** DP 精度：权重放大 1000 倍取整 */
  const SCALE = 1000

  /** 每张占位权重 = 高/宽 + gap 折算（与真实列宽无关，只用于比较两列高低） */
  const units = list.map((p) => {
    const [w, h] = sizeOf(p.id)
    return Math.round((h / w + GAP / REF_COL_W) * SCALE)
  })

  const total = units.reduce((a, b) => a + b, 0)
  const half = Math.floor(total / 2)

  /*
   * 0-1 背包：dp[s] 表示「能否从已处理照片里凑出权重和 s」。
   * 只算到 half —— 超过 half 的组合与「另一半」对称，无需重复。
   *
   * from[s] 记录让 s 首次可达的那张照片的下标，用于倒推回子集。
   * 倒序遍历是必须的：这样处理第 i 张时dp[s-u] 仍是「处理完 i-1」的状态，
   * 倒推时才能正确接上；正序会取到被本轮污染的值，路径就断了。
   */
  const dp = new Uint8Array(half + 1)
  const from = new Int16Array(half + 1).fill(-1)
  dp[0] = 1
  for (let i = 0; i < n; i++) {
    const u = units[i]
    if (u > half) continue
    for (let s = half; s >= u; s--) {
      if (dp[s - u] && !dp[s]) {
        dp[s] = 1
        from[s] = i
      }
    }
  }

  // 从 half 往下找第一个可达值 —— 它就是最接近均分的切分点
  let cut = half
  while (cut > 0 && !dp[cut]) cut--

  // 沿 from 倒推出「进左列」的照片集合
  const inLeft = new Array<boolean>(n).fill(false)
  for (let s = cut; s > 0; ) {
    const i = from[s]
    if (i < 0) break
    inLeft[i] = true
    s -= units[i]
  }

  const left: Photo[] = []
  const right: Photo[] = []
  for (let i = 0; i < n; i++) (inLeft[i] ? left : right).push(list[i])
  return { left, right }
})

/**
 * 灯箱与瀑布流共用的顺序：先读完左列，再读右列。
 * 视觉顺序与翻页顺序必须一致，否则翻一张会跳到另一列的顶部。
 */
const ordered = computed<Photo[]>(() => [...columns.value.left, ...columns.value.right])

/** 左列张数：右列的灯箱索引要在此基础上偏移 */
const leftCount = computed(() => columns.value.left.length)

/* ---------- 灯箱 ---------- */
const viewerHostEl = ref<HTMLElement | null>(null)
/**
 * 取照片尺寸，供 <img> 的 width/height 使用。
 * 带上这两个属性，浏览器会在图片加载前按宽高比预留空间，
 * 瀑布流就不会因图片陆续到位而整页重排（表现为「一帧一帧蹦出来」）。
 * 清单里查不到时回退 3:2，至少能保住占位。
 */
const FALLBACK_SIZE: readonly [number, number] = [3, 2]
function sizeOf(id: string): readonly [number, number] {
  return PHOTO_DIMENSIONS[id] ?? FALLBACK_SIZE
}

let viewer: Viewer | null = null

function destroyViewer() {
  viewer?.destroy()
  viewer = null
}

/**
 * 在创建 Viewer 之前把宿主 <img> 的 src 换成 large。
 *
 * viewerjs 1.15 从 DOM 收集图片，判定是否更新时比较的是
 * image.src !== img.src（内部 image.src 初始就等于宿主 img.src），
 * 所以只挂 data-original-url 不会被它采纳 —— 实测灯箱一直显示
 * 480px 的 thumb。直接在实例化前改写 src，是唯一可靠的做法。
 *
 * 延后到 openAt 才执行：宿主容器虽然铺满视口但 opacity:0，
 * 浏览器仍会为其中的 <img> 发请求，所以 src 必须在模板里写 thumb，
 * 靠 openAt 之前保持不可进来避免首屏预拉 19MB 大图。
 */
function hydrateViewerHost(el: HTMLElement) {
  el.querySelectorAll<HTMLImageElement>('img[data-original-url]').forEach((img) => {
    const target = webpSupported ? img.dataset.originalUrl : img.dataset.originalUrlJpeg
    if (target) img.src = target
  })
}



/**
 * 把某张图的 src 提升为 large。
 *
 * 不在openAt 里一次性改写全部48 张：viewerjs 实例化后不会再收新的地址，
 * 全量改写等于首屏点开就直接拉 19MB，在弱网下要等很久，
 * 而且用户可能只看其中几张。改为「打开时用display（1600px），
 * 翻到某张再升large」——display 单张约 130KB，48 张也只 6MB，
 * large 单张 387KB，仅为真正在看的那几张付代价。
 */
function upgradeToLarge(el: HTMLElement, index: number) {
  const img = el.querySelectorAll<HTMLImageElement>('img')[index]
  if (!img) return
  const full = img.dataset.originalUrl
  const jpeg = img.dataset.originalUrlJpeg
  const target = webpSupported ? full : jpeg
  if (target && !img.src.endsWith(target)) img.src = target
}

async function openAt(index: number) {
  const el = viewerHostEl.value
  if (!el) return

  // viewerjs 的类型定义不含事件 API，因此不依赖 closed 事件：
  // 打开前先销毁上一个实例，页面卸载时兜底销毁。
  destroyViewer()
  // 先用 display 档铺满，让 viewerjs 能立即构建列表
  el.querySelectorAll<HTMLImageElement>('img[data-original-url]').forEach((img, i) => {
    const photo = ordered.value[i]
    // 同样按特性选 WebP：这一段是灯箱的首帧，48 张一起换，
    // 比只改 upgradeToLarge 收益大得多（漏掉它实测仍在下 JPEG）
    if (photo) img.src = webpSupported ? photo.displayWebp : photo.display
  })
  await nextTick()

  viewer = new Viewer(el, {
    initialViewIndex: index,
    navbar: true,
    // 开启左右箭头：viewerjs 1.15 的翻页拖拽阈值是内部写死的比例，
    // 没有可配置项，图片越大就得甩得越远，手机上极其费力。
    // 给出可点的箭头后，切换不再依赖手势，是最有效的改善。
    navigation: {
      prev: { show: true, size: 'large' },
      next: { show: true, size: 'large' },
    },
    // 大图下把拖拽判定放宽：viewerjs 用固定像素阈值，
    // 2560px 宽的图在手机上会被判成「还在拖动」而非「翻页」。
    movable: true,
    zoomable: true,
    scalable: false,
    toolbar: { zoomIn: 1, zoomOut: 1, oneToOne: 1, reset: 1 },
  })
  viewer.view()

  // 当前这张立即升到 large（它正在被看）；
  // 之后每翻到一张就升一张，避免一次性拉 19MB。
  upgradeToLarge(el, index)
  //翻页时再升级：viewerjs 类型定义不含事件 API，用宽松类型访问
  const v = viewer as unknown as {
    addEventListener(t: string, cb: (e: { index: number }) => void): void
  }
  v.addEventListener('switch', (e) => upgradeToLarge(el, e.index))
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  // 页面卸载必须销毁，否则 viewerjs 的全局 overlay 会残留
  destroyViewer()
  window.removeEventListener('keydown', onKey)
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') destroyViewer()
}

/** 返回：优先用浏览器历史，无历史则回首页（避免分享直接进相册页时返回无门） */
function back() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}
</script>

<template>
  <div class="album">
    <header class="bar">
      <button class="back" type="button" aria-label="返回" @click="back">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="titles">
        <h1>我们的照片</h1>
        <span class="cnt">{{ all.length }} 张</span>
      </div>
      <span class="spacer"></span>
    </header>

    <p class="lead">点击任意照片可放大查看</p>

    <!--
      瀑布流用 display 档（1600px），足够 2~3x 屏清晰。
      两个独立列容器，照片的归属由 columns 计算（见其注释），
      这样两列才能真正贴底对齐；CSS 的 column-count 做不到。
    -->
    <div class="masonry">
      <div class="col">
        <button
          v-for="(p, i) in columns.left"
          :key="p.id"
          class="cell"
          type="button"
          @click="openAt(i)"
        >
          <!--
            用 picture 做渐进增强：支持 WebP 的浏览器拿 webp（省 34%），
            其余自动回退到 JPEG。老浏览器不会因为不认识 webp 而白屏。
          -->
          <picture>
            <source type="image/webp" :srcset="p.thumbWebp" />
            <!--
              用 thumb（400px）而不是 display（1600px）：
              列表在手机上实际只显示约 175px 宽，2x 屏也只需 350px，
              400px 已有余量。Photo 类型的注释本就写明 thumb 是
              「照片墙/瀑布流用的小图」，这里之前误用了 display。
              点开放大仍走 full，不受影响。
            -->
            <img
              :src="p.thumb"
              :alt="`${info.groom} & ${info.bride} 照片 ${i + 1}`"
              :width="sizeOf(p.id)[0]"
              :height="sizeOf(p.id)[1]"
              loading="lazy"
              decoding="async"
            />
          </picture>
        </button>
      </div>

      <div class="col">
        <button
          v-for="(p, i) in columns.right"
          :key="p.id"
          class="cell"
          type="button"
          @click="openAt(leftCount + i)"
        >
          <picture>
            <source type="image/webp" :srcset="p.thumbWebp" />
            <img
              :src="p.thumb"
              :alt="`${info.groom} & ${info.bride} 照片 ${leftCount + i + 1}`"
              :width="sizeOf(p.id)[0]"
              :height="sizeOf(p.id)[1]"
              loading="lazy"
              decoding="async"
            />
          </picture>
        </button>
      </div>
    </div>

    <p class="loading done">— 全部 {{ all.length }} 张 —</p>

    <!--
      灯箱宿主：地址先写在 data-src，点开时由 hydrateViewerHost 同步为 src。
      这样首屏不会预拉 18MB 大图，点开又能完整左右翻 48 张。
      容器移出视口但保留布局尺寸 —— display:none 会让宽高变 0 导致缩放算不出来。
    -->
    <div ref="viewerHostEl" class="viewer-host" aria-hidden="true">
      <!--
        viewerjs 1.15 只认 data-original-url（内部是dataset.originalUrl
        再经 hyphenate 转成 data-original-url），不认 data-source ——
        用错属性名会让灯箱一直显示 thumb，表现为「点开还是糊」。

        **故意不写 src**：这 48 个 img 各自会发起一次请求，与瀑布流的
        48 张 thumb 重复。走缓存虽不产生流量，但会占满并发槽，把带宽挤给
        真正需要的图。改为不预加载，等 openAt 铺 display 时才设 src。
        原始图指向 WebP（比 JPEG 省 56%），不支持的浏览器由 hydrate 换回 JPEG。
      -->
      <img
        v-for="p in ordered"
        :key="p.id"
        :data-original-url="p.fullWebp"
        :data-original-url-jpeg="p.full"
        :data-thumb="p.thumb"
        :alt="`照片 ${p.id}`"
      />
    </div>
  </div>
</template>

<style scoped>
.album {
  min-height: 100vh;
  /*
   * 必须用 dvh（动态视口高度），不能用 vh。
   * vh 在移动端指的是「地址栏完全展开时」的视口，比用户实际看到的
   * 区域高出一截（iPhone 上约 100px），于是页面「超高」而能上下滚动 ——
   * 内容只有终端那一点、本该刚好一屏，却出现了滚动条。
   * dvh 会把地址栏占位算进去，等于真实可见高度。
   * 前一行 100vh 是旧内核回退（不支持 dvh 时至少不塌陷）。
   */
  min-height: 100dvh;
  padding-bottom: 40px;
}
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  background: rgba(10, 14, 20, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 0.5px solid #1c2530;
}
.back {
  appearance: none;
  border: 0;
  background: transparent;
  color: #e6edf3;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.back:active {
  background: #1a212c;
}
.titles {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.titles h1 {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  margin: 0;
}
.cnt {
  font-family: var(--font-mono);
  /* 与 .lead 同档可读性：弱于标题但要能看清，原 11px / #6b7280 在深底上几乎糊成一片 */
  font-size: 12px;
  color: #98a5b6;
}
.spacer {
  width: 36px;
  flex-shrink: 0;
}
/*
 * 引导文案：这行是「照片可以点开」的唯一说明，字太小太暗就等于没有。
 * 用淡金（--主金 的低饱和版，和日期胶囊同一档）提出来，但保留小字号的
 * 克制感——它是操作提示，不是标题。
 */
.lead {
  text-align: center;
  color: #d8c39a;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.6px;
  margin: 16px 0 12px;
}
/* CSS columns 瀑布流：竖构图婚纱照保留原始比例，不像 grid 会强行拉伸 */
/*
 * 两个独立列容器，各自高度由内容决定。
 *
 * 不用 column-count：它的 balance 只能**顺序切分**（前 k 张 / 后 n-k 张），
 * 无法自由组合。照片横竖混排时它会算出「第一列 28 张、第二列 20 张」
 * 这种分配 —— 28 张里大半是横版，于是左列提前收尾，视觉上就是
 * 「右边空出一大块」（真机实测底部错落约 55px，且左列在 #28 就结束、
 * 后面 20 张全在右列，一眼能看出割裂）。
 *
 * align-items: flex-start 是必要的：默认的 stretch 会把两列拉齐到同高，
 * 那样短的一列下方会留出空白，等于什么都没改。
 * 列间距由 .cell 的 margin-bottom 提供，不靠父容器。
 */
.masonry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 0 16px;
}
.col {
  /*
   * flex: 1 1 0 + min-width: 0 —— 等分宽度并允许内容收缩。
   * 缺 min-width: 0 时子元素的固有宽度（图片的 width 属性值）
   * 会把列撑宽，导致两列不等宽。
   */
  flex: 1 1 0;
  min-width: 0;
}
.cell {
  display: block;
  width: 100%;
  padding: 0;
  margin: 0 0 8px;
  border: 0;
  background: none;
  cursor: zoom-in;
  break-inside: avoid;
  border-radius: 10px;
  overflow: hidden;
}
/*
 * picture 必须显式设为块级。
 *
 * 上面用 <picture> 做 WebP 渐进增强时忘了给 picture 定 display ——
 * 它默认是 inline。后果是分栏布局崩掉：多列靠内容高度分配每一列，
 * 而 inline 的 picture 行盒高度算不准，列高就错了
 * （实测 7 张的 left 全是 16px 全挤在第一列，相邻两张甚至重叠）。
 *
 * <picture> 本身没有 width/height 属性可写，尺寸信息在里面的 <img> 上：
 * img 的 width:100% + height:auto 会按原始比例算出高度，
 * 所以外层给足宽度即可。
 */
.cell picture {
  display: block;
  width: 100%;
}
.cell img {
  width: 100%;
  height: auto;
  display: block;
  /* 图片未到位时铺一层深色底，避免整屏白块闪烁 */
  background: #14181f;
  transition: transform 0.25s ease;
}
.cell:active img {
  transform: scale(0.96);
}
.loading {
  text-align: center;
  /* 与 .cnt 同档：末尾标记不需要显眼，但「— 全部 48 张 —」要能读到 */
  color: #98a5b6;
  font-size: 12.5px;
  margin: 18px 0 0;
}
.loading.done {
  margin: 24px 0 0;
}
/* 灯箱宿主：移出视口但保留布局尺寸。
   注意不能用 display:none —— viewerjs 依赖 <img> 真实宽高计算缩放，
   宽高为 0 时算不出缩放，表现为「点了没反应」。 */
.viewer-host {
  position: fixed;
  inset: 0;
  /* 铺满视口而不是 1x1：viewerjs 要读图片真实宽高来算缩略图尺寸，
     容器过小会读到 0 并在计算时抛 nextSibling 错误，灯箱直接打不开。
     z-index 置到最底层 + opacity 0 保证不可见、不挡交互、不影响布局。 */
  z-index: -1;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}
</style>
