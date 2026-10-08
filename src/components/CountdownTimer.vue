<script setup lang="ts">
import { computed } from 'vue'
import { weddingDate } from '../config/wedding'

/** 倒计时展示：纯展示，婚期状态由组件自行推导，不新增必填 prop */
const props = defineProps<{
  parts: { day: number; hh: number; mm: number; ss: number }
}>()

const LABELS = ['天', '时', '分', '秒'] as const
const pad = (n: number) => String(n).padStart(2, '0')

const target = new Date(weddingDate.local).getTime()

/** 是否已过婚期：倒计时归零即等价于已过婚期，不需要额外时钟即可精确判断 */
const isPast = computed(
  () =>
    props.parts.day === 0 &&
    props.parts.hh === 0 &&
    props.parts.mm === 0 &&
    props.parts.ss === 0
)

/**
 * 是否就是婚礼当天。
 * 显式读一下 parts.ss 建立响应式依赖，借父级的 1s 心跳驱动重算，
 * 免得为了判断「今天」再单独起一个定时器。
 */
const isWeddingDay = computed(() => {
  void props.parts.ss
  return new Date(target).toDateString() === new Date().toDateString()
})

/** 已过婚期就不再显示无意义的 00:00:00 */
const showDigits = computed(() => !isPast.value)

const caption = computed(() => {
  if (isPast.value) return '婚礼已举行 · 感谢到场'
  if (isWeddingDay.value) return '就是今天 💍'
  return ''
})
</script>

<template>
  <div class="countdown">
    <p v-if="caption" class="cd-caption" :class="{ past: isPast }">{{ caption }}</p>

    <div v-if="showDigits" class="digits">
      <div class="cd-item">
        <span class="num">{{ parts.day }}</span>
        <span class="lab">{{ LABELS[0] }}</span>
      </div>
      <div class="cd-item">
        <span class="num">{{ pad(parts.hh) }}</span>
        <span class="lab">{{ LABELS[1] }}</span>
      </div>
      <div class="cd-item">
        <span class="num">{{ pad(parts.mm) }}</span>
        <span class="lab">{{ LABELS[2] }}</span>
      </div>
      <div class="cd-item">
        <span class="num">{{ pad(parts.ss) }}</span>
        <span class="lab">{{ LABELS[3] }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.countdown {
  margin: 18px 16px 4px;
}
.cd-caption {
  text-align: center;
  font-size: 14px;
  color: #e8c27a;
  letter-spacing: 1px;
  margin-bottom: 10px;
}
.cd-caption.past {
  color: #8b97a8;
}
.digits {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.cd-item {
  text-align: center;
  /* 固定宽度吸收手写体数字宽度差异，秒数跳动时整行不晃 */
  min-width: 52px;
}
.num {
  display: block;
  /* 衬线斜体（Cormorant Garamond Italic），接近传统请帖的数字 */
  font-family: var(--font-countdown);
  /* 斜体视觉上偏窄，比常规体要加一号才够醒目 */
  font-size: 38px;
  font-weight: 400;
  color: #39d98a;
  /*
   * 手写体没有 tabular-nums（等宽数字）特性，数字宽度不一致，
   * 秒数跳动时整行会左右晃。用固定宽度 + 居中把抖动吸收掉。
   */
  font-variant-numeric: normal;
  text-align: center;
  letter-spacing: 0;
  /*
   * 固定行高：line-height 默认 normal 会跟着实际字体的 ascent/descent 变，
   * 字体到位那一刻（Cormorant 的度量与后备字体不同）整块数字会向下顶一下。
   * 横向已被上面的固定宽度吸收，纵向就靠这一行钉死。
   */
  line-height: 1;
}
.lab {
  font-size: 11px;
  /* #6b7280 在毛玻璃底图上偏暗，提到 #9aa7b8 才读得清 */
  color: #9aa7b8;
  letter-spacing: 2px;
}
</style>
