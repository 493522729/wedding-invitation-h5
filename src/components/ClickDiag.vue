<script setup lang="ts">
/**
 * 点击诊断面板。仅在 URL 带 ?clickdiag=1 时出现。
 *
 * 之前「查看全部」偶发第一下没反应，靠猜已经试错了三轮
 * （预取 chunk、touch-action、加按压反馈），都没解决。
 * 这个面板把「点了什么、命中没、有没有跳」摊开，
 * 下次截图就能定位，不用再猜。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { diagEnabled, startDiag, readDiag, clearDiag, type ClickEvent } from '../utils/clickDiag'

const events = ref<ClickEvent[]>([])
const enabled = diagEnabled()
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!enabled) return
  startDiag()
  events.value = readDiag()
  // 每 700ms 同步一次：诊断记录存在 localStorage，
  // 不轮询的话宾客点完看到的仍是点击前的空面板，等于没用
  timer = setInterval(() => (events.value = readDiag()), 700)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function refresh() {
  events.value = readDiag()
}

function reset() {
  clearDiag()
  events.value = []
}
</script>

<template>
  <div v-if="enabled" class="diag">
    <div class="bar">
      <b>点击诊断</b>
      <button type="button" @click="refresh">刷新</button>
      <button type="button" @click="reset">清空</button>
    </div>
    <p v-if="events.length === 0" class="empty">
      还没有记录。点几下「查看全部」再回来刷新。
    </p>
    <ul v-else class="list">
      <li v-for="(e, i) in events" :key="i">
        <span class="t">{{ e.t }}ms</span>
        <span class="k">{{ e.kind }}</span>
        <span class="g">{{ e.target }}</span>
        <span class="h" :class="{ bad: e.hash.includes('album') ? '' : 'pending' }">{{ e.hash }}</span>
        <span v-if="!e.inView" class="warn">不在视口</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.diag {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: 96px;
  z-index: 999;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #2a3648;
  border-radius: 10px;
  color: #7cfc9b;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px;
  line-height: 1.55;
  max-height: 46vh;
  overflow: auto;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.bar button {
  appearance: none;
  border: 1px solid #3a4a5e;
  background: #16202c;
  color: #7cfc9b;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 5px;
  cursor: pointer;
}
.empty {
  margin: 0;
  color: #6b8a7a;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.t {
  color: #6b8a7a;
  margin-right: 6px;
}
.k {
  color: #ffd479;
  margin-right: 6px;
}
.g {
  margin-right: 6px;
}
.h {
  color: #7cfc9b;
}
.h.pending {
  color: #e88a8a;
}
.warn {
  color: #ff9f6b;
  margin-left: 6px;
}
</style>
