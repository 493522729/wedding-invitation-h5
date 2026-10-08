import { ref } from 'vue'
import { termScript, type TermLine } from '../config/wedding'

const TYPE_SPEED = 36
const LINE_GAP = 200
const END_GAP = 450

/**
 * 打字最长持续时间（ms）。
 * 完整打完约 5.7 秒，对看请柬的宾客来说太久；
 * 超时后直接把剩余内容一次补齐并结束，观感上像是「加载完了」。
 */
const MAX_DURATION = 2400

/**
 * 终端打字机：逐字符渲染脚本，全部打完触发 onDone。
 */
export function useTerminal(onDone: () => void) {
  const lines = ref<TermLine[]>([])
  const typing = ref(false)
  let lineIdx = 0
  let charIdx = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let startedAt = 0
  let finishing = false

  /** 一次性把剩余内容补齐，立刻收尾 */
  function finish() {
    if (finishing) return
    finishing = true
    if (timer) clearTimeout(timer)
    timer = null
    lines.value = termScript.map((l) => ({ ...l }))
    typing.value = false
    onDone()
  }

  function clear() {
    if (timer) clearTimeout(timer)
    timer = null
    lines.value = []
    lineIdx = 0
    charIdx = 0
    typing.value = false
    finishing = false
  }

  function step() {
    const cur = termScript[lineIdx]
    if (!cur) return

    if (Date.now() - startedAt >= MAX_DURATION) {
      finish()
      return
    }

    if (charIdx <= cur.s.length) {
      lines.value = [...lines.value.slice(0, lineIdx), { t: cur.t, s: cur.s.slice(0, charIdx) }]
      charIdx++
      timer = setTimeout(step, TYPE_SPEED)
    } else {
      lineIdx++
      charIdx = 0
      if (lineIdx < termScript.length) {
        timer = setTimeout(step, LINE_GAP)
      } else {
        timer = setTimeout(finish, END_GAP)
      }
    }
  }

  function start() {
    clear()
    startedAt = Date.now()
    typing.value = true
    step()
  }

  return { lines, typing, start, clear, finish }
}
