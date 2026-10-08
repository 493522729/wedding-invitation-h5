<script setup lang="ts">
import { ref } from 'vue'
import { navUrl } from '../config/wedding'
import { copySchedule, openNavigation } from '../utils/calendar'

/**
 * 操作按钮区：复制日程 / 导航 / 转发 / 酒店。提示显隐由父级控制。
 * 报名不在这里 —— 它已改为底部固定通栏，见 InviteView 的 rsvp-dock。
 */
const emit = defineEmits<{ (e: 'share'): void }>()

/**
 * 复制结果反馈。
 *
 * 必须给反馈：剪贴板写入在部分WebView 里会静默失败，
 * 宾客按了看不到任何变化，只会以为按钮坏了。
 */
type CopyState = 'idle' | 'ok' | 'fail'
const copyState = ref<CopyState>('idle')
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function onCopy() {
  const ok = await copySchedule()
  copyState.value = ok ? 'ok' : 'fail'
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copyState.value = 'idle'), 2000)
}

/**
 * 统一用 pointerup 响应，click 只留给键盘。
 *
 * 原因与InviteView 的报名按钮相同：iOS 在滚动惯性未结束时派发的 click
 * 会被直接取消，宾客滑到底顺手一点就「第一下没反应」。
 * 这四个按钮都在页面中段，正是滚动后顺手点的位置。
 */
let lastPointerUpAt = 0

function onPointerUp(action: () => void) {
  lastPointerUpAt = Date.now()
  action()
}

function onClick(action: () => void) {
  // 刚刚已由 pointerup 处理过，忽略这次 click
  if (Date.now() - lastPointerUpAt < 700) return
  action()
}

function onShare() {
  emit('share')
}
</script>

<template>
  <div class="btns">
    <button
      class="btn primary"
      :class="{ done: copyState === 'ok', warn: copyState === 'fail' }"
      type="button"
      @pointerup="onPointerUp(onCopy)"
      @click="onClick(onCopy)"
    >
      {{ copyState === 'ok' ? '✅ 已复制' : copyState === 'fail' ? '复制失败' : '📋 复制日程' }}
    </button>
    <button
      class="btn"
      type="button"
      @pointerup="onPointerUp(() => openNavigation(navUrl))"
      @click="onClick(() => openNavigation(navUrl))"
    >
      🧭 导航
    </button>
    <button class="btn" type="button" @pointerup="onPointerUp(onShare)" @click="onClick(onShare)">
      ↗ 转发
    </button>
    <button
      class="btn"
      type="button"
      @pointerup="onPointerUp(() => openNavigation(navUrl))"
      @click="onClick(() => openNavigation(navUrl))"
    >
      🍽️ 酒店
    </button>
  </div>
</template>

<style scoped>
.btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 16px 16px 0;
}
.btn {
  border: 1px solid rgba(255, 255, 255, 0.09);
  /* 与终端、信息卡同一套参数：同色相 + 同模糊强度。
     此前这里用 rgba(14,20,29,.6) + blur(12px)，底色更暗、模糊更弱，
     看上去比终端「实」，通透感对不上。 */
  background: rgba(17, 22, 31, 0.6);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
  color: #e8e3d8;
  border-radius: 11px;
  padding: 13px 0;
  font-size: 13.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
/*
 * 四个按钮统一为毛玻璃，不给「复制日程」单独的绿色。
 * 之前它是唯一的高饱和绿，在整屏照片背景上过于跳脱，
 * 且与底部金色报名栏形成两个互相抢戏的主按钮。
 * 主操作已经由底部固定的报名栏承担，这里四个是平级功能键。
 */
.btn.primary {
  color: #e8c27a;
}
/* 复制成功：不再用整块绿底，改用亮边框 + 提亮文字传达，
   避免与默认态产生「整块换色」的突兀跳变 */
.btn.primary.done {
  color: #7fe0a8;
  border-color: rgba(127, 224, 168, 0.5);
  background: rgba(20, 42, 32, 0.66);
}
/* 复制失败：橙色仅用于描边与文字，不整块填充 */
.btn.primary.warn {
  color: #e8a76a;
  border-color: rgba(232, 167, 106, 0.5);
  background: rgba(46, 30, 16, 0.66);
}
.btn:active { transform: scale(0.97); }
</style>
