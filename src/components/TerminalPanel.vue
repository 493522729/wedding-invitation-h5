<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import WishTicker from './WishTicker.vue'
import type { TermLine } from '../config/wedding'

/**
 * 终端面板：纯展示，脚本与节奏由父级通过 useTerminal 控制。
 *
 * 光标的显示条件是「有没有内容」而不是「是否在打字」：
 * 最后一行是「婚礼服务已启动，等待贵宾入席」，语义上进程仍在待命，
 * 光标应当继续闪。若跟着 typing 走，打字一结束光标就消失，
 * 整块终端会显得像死掉了。
 */
const props = defineProps<{
  lines: TermLine[]
  typing: boolean
}>()

/** 已开始输出就显示光标 */
const showCursor = computed(() => props.lines.length > 0)

const tickerRef = useTemplateRef<InstanceType<typeof WishTicker>>('ticker')

/** 转发给外部：宾客提交祝福后重拉留言，让新的一句立刻出现在跑马灯 */
function refreshWishes() {
  tickerRef.value?.refresh()
}

defineExpose({ refreshWishes })

/**
 * 打字结束后由祝福跑马灯接管这块空间。
 *
 * **不是打字一结束就切**：打完立刻淡出，宾客还没来得及看最后两行
 * （通常是「已锁定 新郎 ❤ 新娘」和「婚礼服务已启动」）就被盖掉了，
 * 整段终端叙事等于没看全。所以留 2 秒阅读时间再切 ——
 * 刚好够读完最后两行。
 *
 * 跑马灯组件是**始终挂载**的（只是被 slot 遮住），这样 fetchWishes
 * 在面板挂载时就开始跑，而不是等切换过去才发请求 ——
 * 否则切换瞬间会先看到一片空白，隔几百毫秒内容才冒出来。
 *
 * 未解锁时不显示：刮卡阶段就露出「已有 N 位宾客留下祝福」，
 * 社交证明会提前泄底，少了「先刮开才有惊喜」的节奏。
 */
const tickerReady = ref(false)
let holdTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 留言少于此数时不切跑马灯：WishTicker 在零留言时整个不渲染，
 * 而终端代码又已被切走 —— 那块空间就成了空窗（实测反馈）。
 * 少就继续展示终端代码，宁可复古，不要空白。
 */
const MIN_WISHES = 4

function scheduleTicker() {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = setTimeout(() => {
    if ((tickerRef.value?.count ?? 0) >= MIN_WISHES) tickerReady.value = true
  }, 2000)
}

// 留言数变化时补一次判断：首次 fetch 迟于打字结束、或宾客提交祝福
// 让数量跨过门槛时，都能把跑马灯接上；始终不达标就永远展示终端代码
watch(
  () => tickerRef.value?.count,
  (n) => {
    if (!tickerReady.value && (n ?? 0) >= MIN_WISHES) scheduleTicker()
  }
)

watch(
  () => props.typing,
  (t, was) => {
    if (was && !t) scheduleTicker()
  }
)

// 已解锁返回的路径：打字一开始就是结束态，watch 观察不到变化，这里补一次
onMounted(() => {
  if (!props.typing && props.lines.length > 0) scheduleTicker()
})

onBeforeUnmount(() => {
  if (holdTimer) clearTimeout(holdTimer)
})

/**
 * 终端可以折叠成一条标题栏。
 *
 * **只保留手动点击，不做滚动自动收起** —— 这不是偷懒，是iOS 上做不到：
 * 折叠必然要改文档流高度（不省出空间就不叫折叠），而高度一改，
 * 下方所有内容的屏幕位置都会变。Chromium 有 scroll anchoring 会自动
 * 补偿（实测位移 0），但 iOS Safari 与微信内置浏览器都不支持，
 * 宾客看到的就是实测反馈里的「内容往上弹」。
 * 换过几版方案都绕不开：改成滚动停稳后再收起，只是把跳动从
 * 「滚动的过程中」挪到「滚动结束的瞬间」，突兀感没消，还会顺带
 * 引发抖动链路（文档变短 → scrollY 被截断 → 误判成向上滚 → 展开）。
 *
 * 手动点击就没有这个问题：手指已经抬起、页面静止、用户自己知道
 * 会发生什么，位移是明确操作的结果而非意外。
 *
 * 标题栏带 role=button 与 aria-expanded，键盘也可操作。
 */
const collapsed = ref(false)

function toggleCollapse() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <section class="terminal" :class="{ collapsed }">
    <div
      class="term-bar"
      role="button"
      tabindex="0"
      :aria-expanded="!collapsed"
      aria-label="展开或收起终端输出"
      :title="collapsed ? '点击展开终端输出' : '点击收起终端输出'"
      @click="toggleCollapse"
      @keydown.enter.prevent="toggleCollapse"
      @keydown.space.prevent="toggleCollapse"
    >
      <i class="r"></i><i class="y"></i><i class="g"></i>
      <!-- 标题也跟着内容切换：跑马灯接管后，标题栏写「祝福」比仍写 bash 更贴切 -->
      <span class="term-title">{{ tickerReady ? 'guestbook — live' : 'wedding — bash — 78×24' }}</span>
      <!-- 收起时给一个方向提示，否则宾客会以为页面卡住了 -->
      <span class="fold" aria-hidden="true">{{ collapsed ? '▾' : '▴' }}</span>
    </div>
    <div class="term-body">
      <!--
        终端输出与祝福跑马灯占用同一块空间，互相淡入淡出。
        两者都用绝对定位叠在一起，高度才恒等于 term-body —— 用 v-if 切换
        会让高度在打字结束的瞬间从内容高度变回 min-height，产生一次跳动。
      -->
      <div class="term-slot" :class="{ hidden: tickerReady }">
        <!-- 打字内容对读屏器可见，否则辅助技术完全读不到邀请信息 -->
        <div aria-live="polite">
          <!--
            光标渲染在最后一行内部（而非 .term-body 下的独立元素）：
            作为块级元素它会自己占一行，白白多出约 1.9 行高。
            放进最后一行后紧跟文字，既符合「终端光标停在行尾」的直觉，
            也省下这部分高度。
          -->
          <div v-for="(l, i) in lines" :key="i" :class="['ln', l.t]">
            <span v-if="l.t === 'cmd'" class="prompt">$</span>{{ l.s
            }}<span v-if="i === lines.length - 1 && showCursor" class="cursor" aria-hidden="true"
              >▋</span
            >
          </div>
        </div>
      </div>

      <div class="term-slot ticker-slot" :class="{ hidden: !tickerReady }">
        <!-- 始终挂载：数据在面板挂载时就开始加载，切换时不会先闪一片空白 -->
        <WishTicker ref="ticker" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.terminal {
  /*
   * 毛玻璃：半透明底 + backdrop-filter。
   * rgba 底色是必需的兜底 —— iOS 微信之外的旧内核不支持
   * backdrop-filter，若只写模糊会退化成完全透明、字全糊在照片上。
   * 不透明度留 0.66，保证终端文字（13.5px 小字）仍可读。
   */
  background: rgba(17, 22, 31, 0.66);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
  /* 玻璃边缘的高光比原来的暗边更像磨砂面 */
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  margin: 22px 16px 0;
  /* 阴影减淡：毛玻璃叠重阴影会显脏 */
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
/*
 * 收起态：只留标题栏，总高 28px。
 * 28 是这么来的 —— 上下内边距 8×2 + 圆点 11 + 标题栏下边框 1 = 28。
 * 展开态标题栏用 11px 内边距（33px 高），收起时缩到 8px，两者都要过渡，
 * 否则收起瞬间标题栏会「跳」一下。
 */
.term-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 13px;
  background: #0b0f16;
  border-bottom: 1px solid #1e2634;
  /* 收起后仅剩这一条，点击展开/收起 —— 与系统窗口标题栏的直觉一致 */
  cursor: pointer;
  transition: height 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}
/*
 * 收起态精确锁定 28px：terminal 自身上下边框 2 +标题栏下边框 1
 * 已经是 3px，所以内容区只能留 25px。
 *
 * 之前靠调padding（8px）只能收到 33px —— .term-title 的 line-height
 * 默认 normal，12px 字体的行盒约 14px，比 11px 的圆点还高，
 * 反而成了标题栏的实际高度来源，padding 调多小都压不下去。
 * 这里改用固定 height 并让文字行高归一，两个问题一起解决。
 */
.terminal.collapsed .term-bar {
  height: 25px;
  padding-top: 0;
  padding-bottom: 0;
}
.term-bar:focus-visible {
  outline: 2px solid #e8c27a;
  outline-offset: -2px;
}
/* 收起指示：默认藏在标题栏右侧，只在收起态出现 */
.fold {
  margin-left: auto;
  color: #6b7280;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.18s ease;
}
.terminal.collapsed .fold {
  opacity: 1;
}
.term-bar i {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.term-bar i.r { background: #ff5f57; }
.term-bar i.y { background: #febc2e; }
.term-bar i.g { background: #28c840; }
.term-title {
  margin-left: 8px;
  font-size: 12px;
  color: #6b7280;
  font-family: var(--font-mono);
  /* 行高归一：默认 normal 在12px 下约 14px，会把标题栏撑到比圆点还高，
     连带让收起态压不到 28px */
  line-height: 1;
}
.term-body {
  padding: 16px 15px 18px;
  font-family: var(--font-mono);
  font-size: 13.5px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-all;
  color: #d6d2c8;
  /*
   * 最小高度由200px 降到 180px：终端实际内容 6 行约 154px，
   * 原来的 200px 是凭空多留的 46px 空白，把姓名和婚期又往下推了一段。
   * 收起的实现靠 max-height 过渡（min-height 也能过渡，但两者要一起归零，
   * 否则收起后会残留 min-height 的高度）。
   */
  min-height: 180px;
  /* 上限要大于实际内容高度（约 154+34=188px），否则展开态会裁掉最后一行 */
  max-height: 340px;
  overflow: hidden;
  /*
   * 0.26s 偏慢：收起时是一大片内容压成一条线，慢镜头会把「坍缩」
   * 看得清清楚楚，正是反馈里「突兀」的另一半来源。
   * 0.18s + 起步稍快的中性缓动，收得干净但不生硬。
   */
  transition:
    min-height 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    max-height 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.14s ease,
    padding 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.terminal.collapsed .term-body {
  min-height: 0;
  max-height: 0;
  opacity: 0;
  /* 上下内边距也必须归零，否则收起后仍留 34px 空白 */
  padding-top: 0;
  padding-bottom: 0;
}
/*
 * 终端输出与跑马灯的叠放容器。
 *
 * 必须绝对定位：两者要占**同一块**空间，高度才恒等于 term-body。
 * 若靠 v-if 切换，打字结束的瞬间高度会从「内容实际高度」缩回
 * min-height，页面跟着跳一下 —— 这正是前面踩过的「内容往上弹」。
 *
 * inset 写具体数值而不是 0：绝对定位的包含块是**padding box**，
 * inset:0 会从 padding 内侧算起，于是盖掉 term-body 的 15px 左右
 * 内边距，文字直接贴上边框。这里退回内容区，两个 slot（终端文案与
 * 跑马灯）共用同一份内边距，左边自然对齐。
 * 数值与 .term-body 的 padding 保持一致，改动时两处要同步。
 */
.term-slot {
  position: absolute;
  top: 6px;
  left: 15px;
  right: 15px;
  bottom: 18px;
  transition: opacity 0.42s ease;
}
.term-slot.hidden {
  opacity: 0;
  /* 让读屏器别再念已经看不见的终端内容 */
  visibility: hidden;
}
.term-body {
  position: relative;
}
.ln.cmd { color: #e8c27a; }
.ln.ok { color: #62d08a; }
.ln.run { color: #7fb5ff; }
.prompt {
  margin-right: 6px;
  color: #39d98a;
}
.cursor {
  color: #39d98a;
  /* 紧贴文字会显得粘连，留一点呼吸空间 */
  margin-left: 2px;
  animation: blink 1s step-end infinite;
}
/**
 * 关键帧必须显式写全 0% 与 100%。
 * 原先只写 50% { opacity: 0 }，未定义的两个端点会退回元素当前值；
 * 一旦「减少动态效果」把动画压成 0.01ms 一次，动画会停在不可见的帧上，
 * 光标彻底消失（实测 opacity: 0）。
 * 写全端点后，极端情况下至少稳定停在「可见」。
 */
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
/**
 * 光标是「进程仍在运行」的状态指示，不是装饰动画。
 * 用户要求减少动态效果时退化成静止的可见方块即可，不该消失。
 */
@media (prefers-reduced-motion: reduce) {
  /* 必须带 !important：全局降级规则（style.css）用的也是 !important，
     且选择器为 *，特异性低于带作用域属性的 .cursor，
     但同为 !important 时仍按特异性决胜，所以这里要主动加。 */
  .cursor {
    animation: none !important;
    opacity: 1 !important;
  }
  /*
   * 收起/展开本身是功能（高度变化才能把姓名提上来），不能取消，
   * 但 0.26s 的过渡属于装饰性动效，去掉后瞬时切换，不影响任何人使用。
   */
  .term-bar,
  .term-body,
  .fold {
    transition: none !important;
  }
}
</style>
