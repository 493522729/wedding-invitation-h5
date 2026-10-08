import { onUnmounted, watch, type Ref } from 'vue'

/**
 * 弹层打开时锁住背景滚动。
 *
 * 为什么不能只写 body { overflow: hidden }：
 * 1. iOS（微信 WebView 同）在**输入框聚焦**时，系统会把聚焦的元素滚进
 *    视口 —— 这属于 viewport 级滚动，`overflow: hidden` 拦不住，
 *    真机表现就是「弹层打开了，底下的首页却跟着往上滑」。
 * 2. 弹层内容滚到底后继续拖，会把滚动传给背景（滚动链）。
 *
 * 做法是两处一起上：
 *   - body 用 position: fixed 锁死（viewport 不再能滚），并用 top 负偏移
 *     把当前滚动位置「顶住」，解锁后 scrollTo 回去 —— 直接用 fixed 会让
 *     页面跳回顶部，这是这类实现最常见的副作用。
 *   - 弹层自身加 overscroll-behavior: contain，断掉滚动链。
 *
 * 支持嵌套计数：两个弹层理论上不会同时开，但真出问题时
 * 提前解锁总比页面被锁死好。
 */
let lockCount = 0
let savedY = 0

function lock() {
  if (lockCount === 0) {
    savedY = window.scrollY
    const b = document.body.style
    // 逐项记录原值而不是清空：页面上可能已有别的样式设在这几项上
    b.position = 'fixed'
    b.top = `${-savedY}px`
    b.left = '0'
    b.right = '0'
    b.width = '100%'
    b.overflow = 'hidden'
  }
  lockCount++
}

function unlock() {
  if (lockCount === 0) return
  lockCount--
  if (lockCount > 0) return
  const b = document.body.style
  b.position = ''
  b.top = ''
  b.left = ''
  b.right = ''
  b.width = ''
  b.overflow = ''
  // 必须在清了 position: fixed 之后再滚回去，否则滚动位置会算错
  window.scrollTo(0, savedY)
}

export function useBodyScrollLock(open: Ref<boolean>) {
  watch(open, (v) => (v ? lock() : unlock()))
  // 组件被卸载时若还锁着必须解锁，否则整页永久无法滚动
  onUnmounted(unlock)
}
