<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useBackgroundMusic } from '../composables/useBackgroundMusic'
import { useMusicDock } from '../composables/useMusicDock'
import { music } from '../config/wedding'

/**
 * 音乐按钮。可渲染成两种形态，也可以只当音频宿主：
 *
 *   floating（默认）右下角悬浮圆角胶囊
 *   dock底部报名栏内的方形图标键
 *   withAudio: false  只渲染按钮，不渲染 <audio>
 *
 * 素材缺失时（available=false）整个按钮不渲染，页面不留摆设。
 */
const props = withDefaults(
  defineProps<{
    variant?: 'floating' | 'dock'
    /**
     * 是否由本实例持有 <audio> 元素。
     * 必须全局只有一份：attachAudio 会把模块级的 audio 指针指向本实例，
     * 第二个实例一旦挂载就会抢走指针，正在播放的那份失去控制、停不下来。
     * 所以报名栏里的按钮一律 withAudio=false，音频仍由 App.vue 那份持有。
     */
    withAudio?: boolean
  }>(),
  { variant: 'floating', withAudio: true }
)

const {
  available,
  playing,
  toggle,
  probeAvailability,
  preload,
  attachAudio,
  debugSnapshot,
  forcePlay,
} = useBackgroundMusic()

const { dockMode } = useMusicDock()

/**
 * 悬浮按钮在详情阶段（dockMode）让位给报名栏里的那个，
 * 否则同一个功能会出现两个入口。dock 实例自己永远显示。
 */
const showButton = computed(
  () => available.value && (props.variant === 'dock' || !dockMode.value)
)

/**
 * 音频元素写进模板而非用 new Audio() 动态创建。
 * 微信安卓的 X5 内核不对动态创建的媒体元素发起请求，
 * 音频永远加载不出来，play() 必然被拒。
 */
const audioEl = useTemplateRef<HTMLAudioElement>('audioEl')

/**
 * 诊断开关：URL 追加 ?music=debug 即可看到音频的真实状态。
 * 微信里「没声音」可能有多种原因（未挂载到 DOM、X5 内核未就绪、
 * 被当作自动播放拒绝……），而这些都不在页面上留下任何痕迹。
 */
const debug = new URLSearchParams(location.search).has('music')
const snap = ref('')
const forceMsg = ref('')

/** 在真机上直接验证 X5 是否允许 load()+play()，这是判断能否修复的唯一依据 */
function runForce(): string {
  forceMsg.value = forcePlay()
  setTimeout(() => (snap.value = debugSnapshot()), 600)
  setTimeout(() => (snap.value = debugSnapshot()), 2000)
  return snap.value
}
const refreshing = computed(() => debug && playing.value)

onMounted(() => {
  // 只有持有音频的那份实例才接管元素与预加载；纯按钮实例跳过，
  // 否则会重复 probe（多打一次 HEAD 请求）并把 audio 指针抢走。
  if (props.withAudio) {
    attachAudio(audioEl.value)
    // 探测素材是否存在：按钮默认不渲染，确认可用后才出现，避免留个点了没声音的摆设
    probeAvailability()
    // 只预加载，不自动播放。
    // 预加载是必须的：721KB 需要几百毫秒，若等到刮开卡片才创建 audio，
    // play() 必然赶不上加载完成而被拒（表现为「刮开了但没声音」）。
    preload()
  }
  if (debug) {
    const tick = () => (snap.value = debugSnapshot())
    tick()
    setTimeout(tick, 800)
    setTimeout(tick, 2500)
    setTimeout(tick, 5000)
  }
})
</script>

<template>
  <!--
    零尺寸 + 透明 + 沉底，而不是 display:none：
    iOS Safari 与微信实测在 display:none 下会让play() 静默失效。
    浏览器在解析 HTML 时就开始下载，刮卡那一刻音频已就绪。
  -->
  <audio
    v-if="withAudio"
    ref="audioEl"
    :src="music.src"
    preload="auto"
    loop
    playsinline
    aria-hidden="true"
    class="music-audio"
  ></audio>

  <button
    v-if="showButton"
    class="music"
    :class="[variant, { on: playing }]"
    type="button"
    :aria-label="playing ? '暂停背景音乐' : '播放背景音乐'"
    :aria-pressed="playing"
    @click="toggle"
  >
    <span class="bars" aria-hidden="true">
      <i></i><i></i><i></i>
    </span>
  </button>

  <!-- 仅在 ?music=debug 下出现：截图这一块就能定位「为什么没声音」 -->
  <div v-if="debug" class="music-debug" aria-live="polite">
    <button class="dbg-btn" type="button" @click="snap = runForce()">强制 load+play</button>
    <button class="dbg-btn" type="button" @click="snap = debugSnapshot()">刷新状态</button>
    <span v-if="forceMsg" class="dbg-msg">{{ forceMsg }}</span>
    <pre class="dbg-pre">{{ snap }}</pre>
  </div>
</template>

<style scoped>
.music-audio {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}
.dbg-btn {
  appearance: none;
  border: 1px solid #3a4a5e;
  background: #16202c;
  color: #7cfc9b;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  margin-right: 6px;
  margin-bottom: 6px;
}
.dbg-msg { color: #ffd479; font-size: 10px; }
.dbg-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.music-debug {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 999;
  padding: 10px;
  background: rgba(0, 0, 0, 0.88);
  color: #7CFC9B;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  border: 1px solid #2a3648;
  border-radius: 10px;
  max-height: 45vh;
  overflow: auto;
}
.music {
  /*
   * 统一外观：50×50 方形图标键，页面里三处（刮卡阶段、终端阶段、
   * 底部报名栏）长得完全一样，只有定位不同。
   *
   * 原先 floating 是带「音乐 / 暂停」文字的胶囊，dock 是纯图标方块。
   * 同一个功能在页面里呈现两种形态不说，文字还让宽度随状态变化 ——
   * 宾客按下后按钮从「音乐」撑成「暂停」，位置跟着跳。
   * 状态改由音波柱（停/动）与颜色（灰/金）表达，形状始终不变。
   */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 13px;
  /* 半透明毛玻璃：浮在内容之上但不遮挡视线 */
  background: rgba(14, 20, 29, 0.72);
  backdrop-filter: blur(8px);
  color: #e8c27a;
  font-family: inherit;
  cursor: pointer;
  /* 刚刮开时若正好点在这里，避免误触到下方按钮 */
  transition: transform 0.18s ease, opacity 0.25s ease;
}
/*
 * floating：右下角悬浮，避开 iPhone 底部安全区与 home 指示条。
 * 还要避开底部固定报名栏（约 66px 高），否则会被压在栏下点不到。
 */
.music.floating {
  position: fixed;
  right: 14px;
  bottom: calc(74px + env(safe-area-inset-bottom, 0px));
  z-index: 35;
}
/*
 * dock：收进底部报名栏，交给 flex 排布即可。
 * 目的是让右下角不再有悬浮元素 —— 之前它浮在页脚与「酒店」按钮之间，
 * 宾客想点酒店很容易点歪。现在两个操作同属一条坞，物理上不可能重叠。
 */
.music.dock {
  position: static;
}
.music:active {
  transform: scale(0.94);
}
.music:focus-visible {
  outline: 2px solid #e8c27a;
  outline-offset: 3px;
}

/* 播放中：金色；暂停：灰色，一眼能看出当前状态 */
.music.on {
  color: #ffe08a;
  border-color: rgba(232, 195, 126, 0.75);
}

/* ---- 三根跳动的音波柱 ---- */
.bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 13px;
}
.bars i {
  width: 2.5px;
  height: 4px;
  border-radius: 1px;
  background: currentColor;
  opacity: 0.55;
}
.music.on .bars i {
  opacity: 1;
  animation: bounce 0.9s ease-in-out infinite;
}
/*
 * 错开延迟做波浪式律动。
 *
 * 选择器必须带上 .music.on —— 上一条 animation 是**简写**，
 * 会把 animation-delay 重置为 0s；而它的特异性（.music.on .bars i，
 * 三个 class）高于原先的 .bars i:nth-child(1)（两个 class），
 * 于是延迟被整条压掉，三根柱子齐头并进（实测 computed
 * animation-delay 全是 0s）。加上 .music.on 后特异性反超，延迟才生效。
 *
 * 另一种改法是把简写拆成 animation-name/duration 等 longhand，
 * 但那样要写6 条属性，可读性反而更差。
 */
.music.on .bars i:nth-child(1) {
  animation-delay: 0s;
}
.music.on .bars i:nth-child(2) {
  animation-delay: 0.16s;
}
.music.on .bars i:nth-child(3) {
  animation-delay: 0.32s;
}
@keyframes bounce {
  0%,
  100% {
    height: 4px;
  }
  50% {
    height: 13px;
  }
}
/* 暂停时停在低处，不再有动画，但保留柱体形状 */
.music:not(.on) .bars i {
  animation: none;
  height: 4px;
}
</style>
