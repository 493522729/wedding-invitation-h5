import { ref, computed, onMounted, onUnmounted } from 'vue'
import { weddingDate } from '../config/wedding'

/**
 * 婚礼倒计时，自带 1s 心跳。
 * 心跳只更新一个时间戳，切后台被节流后回来也会立刻校正。
 */
export function useCountdown() {
  const now = ref(Date.now())
  const target = new Date(weddingDate.local).getTime()
  let timer: ReturnType<typeof setInterval> | null = null

  const parts = computed(() => {
    let d = Math.max(0, target - now.value)
    const day = Math.floor(d / 86400000)
    d -= day * 86400000
    const hh = Math.floor(d / 3600000)
    d -= hh * 3600000
    const mm = Math.floor(d / 60000)
    d -= mm * 60000
    const ss = Math.floor(d / 1000)
    return { day, hh, mm, ss }
  })

  onMounted(() => {
    timer = setInterval(() => (now.value = Date.now()), 1000)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { parts }
}
