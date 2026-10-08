<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useScratch } from '../composables/useScratch'
import { photos, webpSupported } from '../config/wedding'

/**
 * 刮卡卡片。
 * 擦除逻辑（useScratch）完全收在组件内部，不再通过 props 传递 canvas ref。
 */
const props = defineProps<{
  /** 遮罩层整屏底图（不是卡片内容） */
  photo: string
  dateText: string
}>()

const emit = defineEmits<{
  (e: 'unlock'): void
  (e: 'skip'): void
  /** 退场动画播放完毕，父级此时才卸载本组件 */
  (e: 'left'): void
}>()

/**
 * 退场中：卡片收走、遮罩淡出，让底图照片真正露出来。
 *
 * 此前刮开即整层消失，底图（夕阳剪影那张）宾客一次都没看清过 ——
 * 它被卡片与「跳过」按钮夹在中间，从来只是个背景。
 * 现在抬手后留620ms 做收尾：卡片一边缩小淡出，整层一边淡出，
 * 底图顺势显形。
 *
 * 父级**不因这个动画而延迟跳转** —— 退场与详情页入场是并行的，
 * 宾客不用等动画播完才看到内容。
 */
const leaving = ref(false)
const LEAVE_MS = 620

function onUnlocked() {
  leaving.value = true
  emit('unlock')
  setTimeout(() => emit('left'), LEAVE_MS)
}

/**
 * 刮卡底图：走 CSS background-image，<picture> 对它无效，
 * 所以按特性直接选URL。这是**首屏第一张图**，字节数最值钱
 * （scratch 即 p14 那张，源图只有 500×750：jpg 24KB / webp 17KB，都很小）。
 */
const scratchBg = computed(() => (webpSupported ? photos.scratchWebp : props.photo))

const scratchCanvas = useTemplateRef<HTMLCanvasElement>('scratchCanvas')
// 必须把 scratchCanvas 传入：useTemplateRef 与 composable 内部 ref 是不同对象
const { init, handleEvent, handleEnd, revealAll, supported } = useScratch(
  onUnlocked,
  scratchCanvas
)

/** 刮卡是否可用。false 时直接放行，绝不让宾客卡在遮罩上 */
const ready = ref(false)

onMounted(() => {
  ready.value = init()
  if (!ready.value) {
    // 环境拿不到 2d 上下文：没有任何擦除的可能，立刻放行
    emit('skip')
  }
})

function skip() {
  revealAll()
  emit('skip')
  leaving.value = true
  setTimeout(() => emit('left'), LEAVE_MS)
}
</script>

<template>
  <div
    class="scratch-overlay"
    :class="{ leaving }"
    :style="{ '--scratch-bg': `url(${scratchBg})` }"
  >
    <div class="scratch-box">
      <div class="scratch-reveal">
        <div class="heart" aria-hidden="true">💗</div>
        <div class="big">我们<br />结婚了</div>
        <div class="sub">{{ props.dateText }}</div>
      </div>

      <!--
        canvas 始终挂载（不能 v-if，否则 init 拿不到 ref）；
        不可用时用 v-show 摘掉交互层。
        aria-hidden：刮卡只是装饰性交互，等价的键盘路径是下方「直接打开邀请」按钮
      -->
      <canvas
        v-show="supported"
        ref="scratchCanvas"
        class="scratch-canvas"
        aria-hidden="true"
        @pointerdown="handleEvent"
        @pointermove="handleEvent"
        @pointerup="handleEnd"
        @pointercancel="handleEnd"
        @pointerleave="handleEnd"
      ></canvas>

      <div v-if="ready" class="scratch-hint">用手指 <b>刮开</b> 这层惊喜 ✨</div>
    </div>

    <button v-if="ready" class="scratch-skip" type="button" @click="skip">
      直接打开邀请 →
    </button>
  </div>
</template>

<style scoped>
.scratch-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  /*
   * 把卡片整体下移，让底图里两人的脸和上半身完整露出，视觉重心才落在人物身上。
   * 用 min() 收敛：正常手机取 120px（卡片下移 60px），视口变矮时自动减小，
   * 否则「直接打开邀请」按钮会被顶出屏幕之外。
   * 注意全局 box-sizing: border-box，这段 padding 含在视口内。
   */
  padding-top: min(120px, 16vh);
  /*
   * 暗色压到 45%：p14 是亮调暖金色照片，压暗后卡片与「跳过」按钮更突出，
   * 同时盖住 500×750 源图全屏放大后的发软。
   *
   * 横向 50%：p14 两人脸部中心分别在原图 x≈30% / 67%，取中点≈48%，
   * 50% 即可让两人都落在画面里（cover 只横向裁掉约 15% 一侧）。
   */
  background: linear-gradient(rgba(6, 9, 13, 0.45), rgba(6, 9, 13, 0.45)),
    var(--scratch-bg) 50% 50% / cover no-repeat;
}
.scratch-box {
  width: 300px;
  height: 380px;
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(232, 195, 126, 0.25);
}

/**
 * 退场：卡片先收，整层后淡。
 *
 * 两者刻意不同步——卡片用带轻微回弹的缓动、整层用匀速，
 * 于是观感上卡片「被拿开」，底图随之显形，而不是整块一起变淡。
 *
 * for-wards 不可省：动画结束后元素必须停在 opacity:0，
 * 否则那 620ms 之后组件被卸载前会有一帧闪回。
 * 退场期间禁用指针事件，避免宾客点「跳过」时按钮已经失效。
 */
@keyframes boxOut {
  to {
    transform: scale(0.88) translateY(-10px);
    opacity: 0;
  }
}
@keyframes overlayOut {
  to {
    opacity: 0;
  }
}
.scratch-overlay.leaving {
  pointer-events: none;
  animation: overlayOut 0.62s ease-in forwards;
}
.scratch-overlay.leaving .scratch-box {
  animation: boxOut 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
/* 退场期间「跳过」按钮与提示跟着淡出即可，无需单独位移 */
.scratch-overlay.leaving .scratch-skip,
.scratch-overlay.leaving .scratch-hint {
  opacity: 0;
  transition: opacity 0.2s ease;
}
/**
 * 减少动态效果：直接退场，不播放收走动效。
 * 底图仍会正常显露（组件照常卸载），只是少了那 620ms 的过渡。
 */
@media (prefers-reduced-motion: reduce) {
  .scratch-overlay.leaving,
  .scratch-overlay.leaving .scratch-box {
    animation: none;
  }
}
.scratch-reveal {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #ff5c7a, #c81f4b);
  color: #fff;
  text-align: center;
  gap: 10px;
}
/**
 * 「我们结婚了」用站酷快乐体，与详情页姓名同一套字体，视觉统一。
 * 字重固定 400：该字体只有 Regular，合成粗体会让笔画糊成一团。
 * letter-spacing 从 2px 收到 1px —— 字体本身笔画宽，间距大就散架。
 */
.big {
  font-family: var(--font-name);
  font-size: 46px;
  font-weight: 400;
  letter-spacing: 1px;
  line-height: 1.35;
  text-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}
.sub {
  font-size: 14px;
  opacity: 0.92;
}
.heart {
  font-size: 30px;
  animation: beat 1s infinite;
}
@keyframes beat {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.18);
  }
}
.scratch-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: grab;
  /* 关键：阻止浏览器把手势解释成滚动，否则擦到一半页面开始滚 */
  touch-action: none;
}
.scratch-hint {
  position: absolute;
  bottom: 18px;
  left: 0;
  right: 0;
  text-align: center;
  color: #fff;
  font-size: 13px;
  opacity: 0.9;
  z-index: 2;
  pointer-events: none;
}
.scratch-hint b {
  color: #ffe08a;
}
.scratch-skip {
  appearance: none;
  border: 0;
  background: transparent;
  color: #e8c27a;
  font-size: 14px;
  font-family: inherit;
  padding: 10px 18px;
  border-radius: 999px;
  cursor: pointer;
}
/* 键盘可达：默认 outline 被按钮 reset 掉了，这里显式给出 */
.scratch-skip:focus-visible {
  outline: 2px solid #e8c27a;
  outline-offset: 3px;
}
</style>
