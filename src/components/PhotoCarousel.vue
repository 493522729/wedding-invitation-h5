<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { HERO_PHOTO_ID, webpSupported, type Photo } from '../config/wedding'
import { PHOTO_DIMENSIONS } from '../config/photo-dimensions'

/**
 * 卡片是 3:4 竖版，横版照片（3:2）用 object-fit: cover 会被裁掉左右各约
 * 25%，人像常常正好卡在被裁掉的位置 —— 表现为「新郎只剩半张脸」。
 *
 * 解决方式：横版照片改用 contain 完整显示，上下留白处用同一张图的
 * 模糊放大版铺满（业界标准的letterbox blur，Spotify/Apple Music 同款）。
 * 竖版照片维持 cover 不变，避免出现无谓的留白。
 *
 * 尺寸表是构建时生成的，不依赖图片加载完成即可判断。
 */
const CARD_RATIO = 3 / 4

/** 该照片是否明显比卡片宽（需要完整显示而不是裁切） */
function isWide(id: string): boolean {
  const dim = PHOTO_DIMENSIONS[id]
  if (!dim) return false
  return dim[0] / dim[1] > CARD_RATIO * 1.15
}

/**
 * 详情页照片轮播：横滑 + scroll-snap。
 *
 * 为什么不用 Swiper：scroll-snap 是原生滚动，零依赖、60fps，
 * 且微信 WebView 内手感与系统相册一致（Swiper 在低配安卓上常掉帧）。
 *
 * 为什么详情页只放 5 张：详情页的核心任务是转化（让人来），
 * 47 张会把页面拉得极长，反而冲淡信息。只给「想看更多」的入口。
 */
const props = defineProps<{
  hero: string
  /** 主纱的 WebP 变体（可选）：缺失时回退 hero */
  heroWebp?: string
  gallery: Photo[]
}>()

const emit = defineEmits<{ (e: 'open-album'): void }>()

/**
 * 点击后立刻置为跳转中：既给宾客即时反馈（按钮变灰），
 * 也防止连点触发多次导航。
 */
const navigating = ref(false)

/**
 * 用 pointerup 而不是 click 响应跳转。
 *
 * 宾客多半是「滚动到这里→ 立刻点」，而移动端（尤其 iOS）在滚动惯性
 * 未结束时派发的 click 会被直接取消 —— 表现就是「第一下没反应」。
 * pointerup 在手指抬起的瞬间触发，不等click，也没有 300ms 延迟判定。
 *
 * 键盘可达性不能丢：Enter/空格不会产生 pointerup，所以仍保留 click，
 * 用时间戳去重，避免一次操作触发两次。
 */
let lastPointerUpAt = 0

function openAlbum() {
  if (navigating.value) return
  navigating.value = true
  emit('open-album')
}

function onPointerUp() {
  lastPointerUpAt = Date.now()
  openAlbum()
}

function onClick() {
  // 刚刚已由 pointerup 处理过，忽略这次 click
  if (Date.now() - lastPointerUpAt < 700) return
  openAlbum()
}

/**
 * 首页轮播除主纱外的 4 张，按需要挑选。
 *
 * 显式列id 而不是 slice 前 N 张：清单是脚本生成的，顺序随拍摄批次变化，
 * 用 slice 会出现「第三张悄悄换成了别的照片」而没人察觉。
 * 清单里若少了某个 id，会自动跳过而不是留空位。
 */
const SLIDE_IDS = ['p01', 'p04', 'p08', 'p12'] as const

const slides = computed(() => {
  const byId = new Map(props.gallery.map((p) => [p.id, p]))
  const picked = SLIDE_IDS.map((id) => byId.get(id)).filter((p) => p !== undefined)
  // 轮播走 CSS background-image（见模板里的 --blur-src），<picture> 对它无效，
  // 所以在这里按特性直接选好URL，而不是交给浏览器回退。
  // WebP 变体缺失时（未生成）自动回退 JPEG，不会出现空 src
  const pick = (jpeg: string, webp?: string) => (webpSupported && webp ? webp : jpeg)
  return [
    { id: HERO_PHOTO_ID, src: pick(props.hero, props.heroWebp) },
    ...picked.map((p) => ({ id: p.id, src: pick(p.display, p.displayWebp) })),
  ]
})

const total = computed(() => props.gallery.length + 1) // 含主纱

const trackRef = ref<HTMLElement | null>(null)
const current = ref(0)

/** 滚动位置 → 当前索引。用容器宽度做整除，避免逐像素抖动。 */
function onScroll() {
  const el = trackRef.value
  if (!el) return
  const i = Math.round(el.scrollLeft / el.clientWidth)
  if (i !== current.value) current.value = i
}

let io: IntersectionObserver | null = null
onMounted(() => {
  const el = trackRef.value
  if (!el) return
  io = new IntersectionObserver(
    (entries) => {
      // 滚出视口的整图自动释放 src，显著降低首屏内存与并发请求
      for (const e of entries) {
        const img = e.target as HTMLImageElement
        if (!e.isIntersecting) {
          img.dataset.src = img.src
          img.removeAttribute('src')
        } else if (!img.src && img.dataset.src) {
          img.src = img.dataset.src
        }
      }
    },
    { root: el, threshold: 0.1 }
  )
  el.querySelectorAll('img').forEach((n) => io!.observe(n))
})
onBeforeUnmount(() => {
  io?.disconnect()
  io = null
})
</script>

<template>
  <section class="carousel">
    <div ref="trackRef" class="track" @scroll.passive="onScroll">
      <!-- 横版照片挂 .wide：完整显示 + 模糊背景填充留白，否则 3:4 竖卡会裁掉人物   :class="{ wide: isWide(s.id) }" 这里暂时不用别改-->
      <figure
        v-for="(s, i) in slides"
        :key="s.id"
        class="slide"
        :style="isWide(s.id) ? { '--blur-src': `url(${s.src})` } : undefined"
      >
        <img :src="s.src" :alt="`${i + 1}`" loading="lazy" decoding="async" draggable="false" />
      </figure>
    </div>

    <div class="bar">
      <span class="counter">{{ current + 1 }} / {{ total }}</span>
      <div class="dots" role="tablist" aria-label="照片轮播">
        <i v-for="(s, i) in slides" :key="s.id" :class="{ on: i === current }"></i>
      </div>
    </div>

    <button
      class="more"
      type="button"
      :class="{ busy: navigating }"
      :disabled="navigating"
      @pointerup="onPointerUp"
      @click="onClick"
    >
      {{ navigating ? '正在打开…' : `查看全部 ${total} 张照片` }}
    </button>
    <p class="tip">左右滑动查看 · 点击「查看全部」可放大</p>
  </section>
</template>

<style scoped>
.carousel {
  margin: 18px 0 4px;
}
.track {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  /* 两侧留白用 padding 实现，滚动条隐藏但不影响滚动 */
  padding: 0 16px;
  scrollbar-width: none;
}
.track::-webkit-scrollbar {
  display: none;
}
.slide {
  position: relative;
  flex: 0 0 auto;
  width: 78%;
  margin: 0;
  scroll-snap-align: center;
  scroll-snap-stop: always;
}
.slide img {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
  user-select: none;
  -webkit-user-drag: none;
}

/**
 * 横版照片：完整显示，模糊背景填充留白处。
 *
 * 伪元素必须挂在 figure 上而非 img —— img 是替换元素，
 * 浏览器会忽略它上面的 ::before/::after，写了也不生效。
 *
 * 视觉上呈现为「照片向两侧延伸出去」，而不是生硬的黑边。
 */
.slide.wide {
  overflow: hidden;
  border-radius: 14px;
}
.slide.wide::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: var(--blur-src);
  background-size: cover;
  background-position: center;
  /* 模糊会让边缘衰减透明，额外放大避免露出白边 */
  transform: scale(1.3);
  filter: blur(20px) saturate(1.35) brightness(0.6);
}
.slide.wide img {
  position: relative;
  object-fit: contain;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
}
.counter {
  font-family: var(--font-mono);
  font-size: 12px;
  color: #8b8f98;
  font-variant-numeric: tabular-nums;
}
.dots {
  display: flex;
  gap: 5px;
}
.dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #3a4150;
  transition: width 0.25s ease, background 0.25s ease;
}
.dots i.on {
  width: 14px;
  border-radius: 3px;
  background: #e8c27a;
}
.more {
  display: block;
  width: calc(100% - 32px);
  margin: 14px 16px 0;
  padding: 12px 0;
  /* 同其他面板：半透明兜底 + backdrop-filter，底图能透上来 */
  border: 1px solid rgba(255, 255, 255, 0.09);
  /* 同终端：色相与模糊强度对齐，否则比终端显「实」 */
  background: rgba(17, 22, 31, 0.6);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
  color: #e8c27a;
  border-radius: 11px;
  font-size: 13.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.more:active {
  transform: scale(0.98);
}
/* 跳转中的即时反馈：没有它，宾客会以为没点到而连点 */
.more.busy {
  color: #6b7280;
  border-color: #2a3648;
  cursor: progress;
}
.tip {
  text-align: center;
  /* 提到与相册页引导文案同一档可读性，原 11px 在深底上偏小偏糊 */
  color: #b3bfcd;
  font-size: 12.5px;
  line-height: 1.5;
  margin: 10px 24px 0;
}
</style>
