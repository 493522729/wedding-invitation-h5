<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { info, photos, dateLabel } from '../config/wedding'
import { useTerminal } from '../composables/useTerminal'
import { useCountdown } from '../composables/useCountdown'
import { useWxShare } from '../composables/useWxShare'
import { useUnlockState } from '../composables/useUnlockState'
import { useBackgroundMusic } from '../composables/useBackgroundMusic'
import ScratchCard from '../components/ScratchCard.vue'
import TerminalPanel from '../components/TerminalPanel.vue'
import CountdownTimer from '../components/CountdownTimer.vue'
import InviteWords from '../components/InviteWords.vue'
import InfoCard from '../components/InfoCard.vue'
import PhotoCarousel from '../components/PhotoCarousel.vue'
import ActionButtons from '../components/ActionButtons.vue'
import RsvpSheet from '../components/RsvpSheet.vue'
import ConfettiCanvas from '../components/ConfettiCanvas.vue'
import MusicToggle from '../components/MusicToggle.vue'
import { useMusicDock } from '../composables/useMusicDock'

/**
 * leaving：刮开后退场的 620ms。
 * 期间刮卡层仍挂载并播放收走动效，终端同时开始打字、
 * 详情页同时开始入场 —— 三者并行，宾客不需要等动画结束。
 */
type Stage = 'scratch' | 'leaving' | 'terminal' | 'done'

const router = useRouter()
const { hasUnlocked, markUnlocked } = useUnlockState()

/** 终端面板实例：用于提交祝福后让跑马灯重拉留言 */
const terminalRef = useTemplateRef('terminalRef')

function onRsvpSubmitted() {
  terminalRef.value?.refreshWishes()
}


/**
 * 从相册页返回时组件会重新挂载。若只存在组件内 ref 里，
 * 宾客会看到刮卡重来、终端动画重播一遍 —— 必须凭 sessionStorage 里的
 * 解锁状态直接进入「已展开」，且**跳过打字动画**（没必要让人再看一遍）。
 */
const stage = ref<Stage>(hasUnlocked.value ? 'done' : 'scratch')
const showTip = ref(false)
const showRsvp = ref(false)

/**
 * 报名按钮的即时反馈状态。
 *
 * 「第一次点没反应」是缺反馈导致的：弹层由 v-if 控制，渲染有一帧延迟，
 * 在这期间按钮毫无变化，宾客会以为没点到而再点一次 ——
 * 于是「要点两下」，第二次因为状态已开，看起来像是「第一次没生效」。
 * 给一个 200ms 的按下反馈即可消除这种误解，也顺带防止连点。
 */
const rsvpOpening = ref(false)
async function openRsvp() {
  if (rsvpOpening.value) return
  rsvpOpening.value = true
  showRsvp.value = true
  // 用 nextTick 而非固定延时：反馈只需覆盖「点击 → 弹层挂载」这一段。
  // 本地这段只要 4ms，但微信 WebView 上可能上百毫秒，写死 350ms 是在猜 ——
  // 猜短了会出现「反馈没了弹层还没来」，反而更让人以为没点到。
  await nextTick()
  rsvpOpening.value = false
}
let tipTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 报名按钮：pointerup 触发，click 只为键盘可达性而留。
 *
 * 为什么不能用 click：iOS（尤其微信 WebView）在滚动惯性未结束时
 * 会直接取消 click —— 表现就是「第一下没反应，得点两下」。
 * 首次进入详情页时打字动画、彩带、入场动画同时进行，视口高度一直在变，
 * 宾客滑到底顺手就点，几乎必然落在惯性里。
 * 这个坑项目里已踩过一次（PhotoCarousel 的滑块跳转同样改成了 pointerup）。
 *
 * pointerup 在手指抬起的瞬间触发，不等 click，也没有 300ms 延迟判定。
 * Enter/空格不会产生 pointerup，所以保留 click，用时间戳去重
 * 避免一次操作触发两次。
 */
let lastDockPointerUpAt = 0

function onDockPointerUp() {
  lastDockPointerUpAt = Date.now()
  openRsvp()
}

function onDockClick() {
  // 刚刚已由 pointerup 处理过，忽略这次 click
  if (Date.now() - lastDockPointerUpAt < 700) return
  openRsvp()
}

// 彩带组件自持 canvas 并暴露 launch()，父级只持有组件实例
const confettiRef = ref<InstanceType<typeof ConfettiCanvas> | null>(null)
const { lines, typing, start, finish } = useTerminal(() => (stage.value = 'done'))
const { playOnUnlock: playMusic } = useBackgroundMusic()

function onUnlock() {
  stage.value = 'leaving'
  markUnlocked()
  start()
  setTimeout(() => confettiRef.value?.launch(), 350)
  // 借刮卡这个真实用户手势启动背景音乐：微信内置浏览器禁止无手势自动播放，
  // 刮卡解锁正好满足条件，比额外弹一个「点我播放」遮罩自然得多。
  // 用 playOnUnlock 而非 play：它会先清掉「已关闭」记忆，
  // 否则之前点过暂停的宾客刮卡也永远无声（且看不出原因）。
  playMusic()
}

// 已解锁回来的场景：终端直接给完整内容，不重播动画
if (hasUnlocked.value) {
  lines.value = []
  finish()
}

const { parts } = useCountdown()
const { setup: setupWxShare } = useWxShare()
const { dockMode } = useMusicDock()

/**
 * 进入详情阶段后，音乐键从右下角悬浮挪进底部报名栏（见 rsvp-dock）。
 * 用 watch 而非在 onUnlock 里写死：已解锁返回的路径不会经过 onUnlock，
 * 但同样需要让位，否则悬浮键与报名栏里的键会同时出现。
 */
watch(stage, (s) => (dockMode.value = s === 'done'), { immediate: true })

function onShare() {
  showTip.value = true
  if (tipTimer) clearTimeout(tipTimer)
  tipTimer = setTimeout(() => (showTip.value = false), 3000)
}

onMounted(() => {
  setupWxShare()
})
onUnmounted(() => {
  if (tipTimer) clearTimeout(tipTimer)
  // 必须复位：否则从详情页进相册页后，悬浮音乐按钮会一直消失，
  // 相册页就失去了音乐开关。
  dockMode.value = false
})
</script>

<template>
  <div class="page">
    <ScratchCard
      v-if="stage === 'scratch' || stage === 'leaving'"
      :photo="photos.scratch"
      :date-text="dateLabel.spaced"
      @unlock="onUnlock"
      @skip="onUnlock"
      @left="stage = 'terminal'"
    />

    <ConfettiCanvas ref="confettiRef" />

    <TerminalPanel ref="terminalRef" :lines="lines" :typing="typing" />

    <section v-if="stage === 'done'" class="detail">
      <div class="headline">
        <div class="kicker">WE ARE GETTING MARRIED</div>
        <h1>{{ info.groom }} <span class="amp">❤</span> {{ info.bride }}</h1>
        <div class="en">
          <span>{{ info.date }}</span>
          <span class="sep" aria-hidden="true">|</span>
          <span>{{ info.lunar }}</span>
        </div>
      </div>

      <CountdownTimer :parts="parts" />

      <!--
        阅读顺序：倒计时 → 邀请辞 → 照片 → 时间地点 → 操作按钮。
        邀请辞是引子、照片是答案，先给情绪再给实用信息；
        把 InfoCard 挪到照片之后，是为了让宾客先被照片留住，
        再看到「几点在哪、怎么去、怎么导航」。
      -->
      <InviteWords />

      <!-- 详情页只放 5 张横滑轮播，完整浏览引导去相册页 -->
      <PhotoCarousel
        :hero="photos.hero"
        :gallery="photos.gallery"
        @open-album="router.push('/album')"
      />

      <InfoCard />

      <ActionButtons @share="onShare" />
      <RsvpSheet :open="showRsvp" @close="showRsvp = false" @submitted="onRsvpSubmitted" />
      <div v-if="showTip" class="tip">点右上角「···」分享给朋友 / 朋友圈</div>

      <div class="foot">
        期待与您共度这美好的一天<br />
        <span class="sig">— {{ info.groom }} & {{ info.bride }} —</span>
        <!--
        -->
      </div>

      <!--
        报名是请柬唯一的转化动作，原先排在按钮区末尾，
        要滚到页面最底部才看得见（实测在视口下方约 650px 处）。
        改为固定在底部通栏：随页面滚动始终可触达。
        只在详情页出现 —— 刮卡阶段是全屏遮罩，不该被这层压住。
      -->
    </section>

    <!--
      报名栏放在 .page 下而非 .detail 内：它是 fixed 定位，
      留在 .detail 里只是多一层嵌套，但会让「栏高测量 → 页脚留白」
      这套逻辑分散在两处，难以维护。

      音乐键收进同一栏：原先它是右下角悬浮元素，与页脚、「酒店」按钮
      在同一区域争位，宾客想点酒店很容易点歪。现在两个操作同属一条坞，
      物理上不可能重叠；右下角也让了出来，页脚文字不再被压住。
    -->
    <div v-if="stage === 'done'" class="rsvp-dock">
      <button
        class="rsvp-dock-btn"
        type="button"
        :class="{ pressed: rsvpOpening }"
        :disabled="rsvpOpening"
        @pointerup="onDockPointerUp"
        @click="onDockClick"
      >
        <span class="ic" aria-hidden="true">💌</span>
        <span class="tx">{{ rsvpOpening ? '正在打开…' : '我要送祝福' }}</span>
      </button>
      <!-- withAudio=false：音频元素全局只保留一份（App.vue 那份），此处只要按钮 -->
      <MusicToggle variant="dock" :with-audio="false" />
    </div>
  </div>
</template>

<style scoped>
.page {
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
  position: relative;
}
/*
 * 报名栏高度用 CSS 变量固定下来，页脚留白与栏高共用同一个值。
 *
 * 之前写死 84px 却在 iPhone 上仍遮住页脚 —— 漏了底部安全区；
 * 改成 JS 动态测量也不可靠（ResizeObserver 在解锁后才拿到元素，
 * 且首屏那次测量容易落空）。这里索性把结构定死：
 * 栏高 = 上下内边距 8+8 + 按钮 46 + 安全区，两处引用同一变量，
 * 永远不会对不上。按钮设固定高度，按钮文案在「我要报名 / 正在打开…」
 * 之间切换时也不会顶动整栏。
 */
.detail {
  padding-bottom: calc(var(--dock-h) + 16px);
}

/**
 * 详情页入场：错峰淡入 + 轻微上移。
 *
 * 之前六个区块（标题/倒计时/信息卡/轮播/按钮/页脚）在终端结束的
 * 同一帧全部出现，视觉上就是「刷」进来。问题不在于缺动画，而在于
 * 没有节奏 —— 所以刻意做得很克制：
 *   - 只动 opacity 与 translateY，不加缩放、旋转、弹跳
 *   - 单块 420ms，间隔 70ms，全部结束约 700ms，不拖沓
 *   - 缓动用出场型cubic-bezier，收得干脆
 * 彩带在 350ms 绽放，正好落在按钮入场之后，两者互不抢戏。
 *
 * animation-fill-mode: both 很关键 —— 延迟期间元素保持 opacity:0，
 * 否则第一帧会先闪一下全内容再消失。
 * 用 opacity 而非 visibility/display，元素始终占位，布局不跳动，
 * 也随时可点。
 */
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.detail > * {
  animation: rise 0.42s cubic-bezier(0.22, 0.8, 0.3, 1) both;
}
/*
 * 依次错开。当前顺序：
 *   1 headline 姓名（用户要求不动）
 *   2 countdown 倒计时
 *   3 words    邀请辞
 *   4 carousel 照片
 *   5 card     时间地点
 *   6 btns     操作按钮
 *   7 foot     页脚
 * RsvpSheet 是 Teleport（渲染到 body）、.tip 要用户点击才出现，
 * 两者都不占序号，所以页脚落在第 7 位。
 * 今后若插入新区块，记得顺延后面的延迟。
 */
.detail > *:nth-child(1) { animation-delay: 0.02s; }
.detail > *:nth-child(2) { animation-delay: 0.09s; }
.detail > *:nth-child(3) { animation-delay: 0.16s; }
.detail > *:nth-child(4) { animation-delay: 0.23s; }
.detail > *:nth-child(5) { animation-delay: 0.3s; }
.detail > *:nth-child(6) { animation-delay: 0.37s; }
.detail > *:nth-child(7) { animation-delay: 0.44s; }

/**
 * 减少动态效果偏好下全部取消。
 * 入场动画纯属装饰，去掉后内容依然完整可读，
 * 绝不能因为关闭动画而让内容不可见。
 */
@media (prefers-reduced-motion: reduce) {
  .detail > * {
    animation: none;
  }
}
.rsvp-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* 略低于音乐按钮(35)，层级上音乐按钮在前 */
  z-index: 34;
  padding: 8px 14px calc(8px + env(safe-area-inset-bottom, 0px));
  /* 上边缘渐隐，避免硬边割裂内容 */
  background: linear-gradient(to top, rgba(8, 11, 16, 0.96) 62%, rgba(8, 11, 16, 0));
  /* 音乐键与报名按钮同属一条坞。align-items: stretch 让两者等高，
     不必给音乐键单独写高度，它跟着报名按钮走。 */
  display: flex;
  align-items: stretch;
  gap: 10px;
}
.rsvp-dock-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  /* 与音乐键共处一行，按钮自身撑开剩余宽度 */
  flex: 1 1 auto;
  width: auto;
  /* 固定高度：文案切换不改变整栏高度，留白计算才准。
     高度由 --dock-h 反推得出：8(上内边距) + 50 + 8(下内边距) = 66px */
  height: 50px;
  box-sizing: border-box;
  appearance: none;
  border: 0;
  background: linear-gradient(135deg, #e8c27a, #d9a441);
  color: #1a1206;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  border-radius: 13px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(217, 164, 65, 0.28);
}
.rsvp-dock-btn:active,
.rsvp-dock-btn.pressed {
  transform: scale(0.985);
  /* 按下态给足反馈：没有它宾客会以为没点到而连点 */
  filter: brightness(0.92);
}
.rsvp-dock-btn:disabled {
  cursor: default;
}
.rsvp-dock-btn .ic {
  font-size: 19px;
  display: inline-block;
  /*
   * 心跳节奏（lub-dub）而不是匀速呼吸：报名是「人来了」的意思，
   * 心跳比机械缩放更有生命力，也更贴合这份请柬的语境。
   * 关键帧比例参照真实心跳——第一次搏动强、第二次略弱，
   * 避免了匀速缩放那种机械感。
   */
  animation: heartbeat 2.4s ease-in-out infinite;
  transform-origin: center;
}

/**
 * 减少动态效果偏好下停掉动画。
 * 呼吸/心跳属于装饰性动效，不承载信息；
 * 但也不能让图标消失或错位，所以只停动画、保留静态图形。
 */
@media (prefers-reduced-motion: reduce) {
  .rsvp-dock-btn .ic {
    animation: none;
  }
}

@keyframes heartbeat {
  0%,
  100% {
    transform: scale(1);
  }
  /* 第一次搏动：强、快 */
  12% {
    transform: scale(1.22);
  }
  24% {
    transform: scale(1);
  }
  /* 第二次搏动：略弱，是舒张期的回落 */
  36% {
    transform: scale(1.12);
  }
  50% {
    transform: scale(1);
  }
}
.headline { text-align: center; margin: 26px 16px 6px; }
.kicker {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 3px;
  color: #e8c27a;
  text-transform: uppercase;
}
/**
 * 姓名改用站酷快乐体（SIL OFL，可商用）。
 * 字重只有 400，浏览器合成粗体会让笔画糊成一团，所以固定 400。
 * letter-spacing 收到 2px：这种字体本身笔画宽，间距再大就散架了。
 */
.headline h1 {
  font-family: var(--font-name);
  font-size: 38px;
  font-weight: 400;
  letter-spacing: 2px;
  margin-top: 8px;
  background: linear-gradient(90deg, #fff, #ffd9e2);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
/**
 * 日期行原先是 12px 的深灰（#6b7280），在近黑底上对比度不足 3:1，
 * 宾客在手机户外光线下几乎看不清，而这行是确认婚期最关键的信息。
 * 改为 14px 淡金，提高对比同时不抢姓名的视觉重心。
 */
.en {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: #d8c39a;
  margin-top: 12px;
  padding: 5px 14px;
  border: 1px solid rgba(216, 195, 154, 0.28);
  border-radius: 999px;
  letter-spacing: 1.5px;
  line-height: 1.5;
}
/* 竖线分隔公历与农历 */
.en .sep {
  color: rgba(216, 195, 154, 0.5);
}
.amp {
  /* ❤ 不在子集字形内，强制回退到系统字体，否则会显示豆腐块 */
  font-family: var(--font-sans);
  font-size: 0.72em;
  vertical-align: 0.06em;
  color: #d94f4f;
}
.tip {
  text-align: center;
  color: #e8c27a;
  font-size: 13px;
  margin-top: 14px;
}
.foot {
  text-align: center;
  color: #9aa7b8;
  font-size: 11px;
  margin: 22px 16px 0;
  line-height: 1.7;
}
.sig {
  font-family: var(--font-mono);
  color: #e8c27a;
  font-size: 12px;
  margin-top: 6px;
}
</style>
