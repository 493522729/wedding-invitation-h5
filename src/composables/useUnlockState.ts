import { ref, readonly } from 'vue'
import { demoMode } from '../config/demo'

/**
 * 邀请函「已解锁」状态的持久化。
 *
 * 背景：详情页从相册页返回时组件会重新挂载，若解锁状态只存在组件内 ref 里，
 * 宾客会看到刮卡重新出现、终端动画重放一遍 —— 极差体验。
 * 这里把状态写进 sessionStorage：
 *  - 同一标签页内来回切换保持已解锁
 *  - **刷新页面也保留**（sessionStorage 的语义如此，只有关闭标签页才清除）
 *
 * 副作用：已解锁后若刷新，onUnlock 不会再触发，背景音乐不会自动响。
 * 这是微信自动播放策略的必然结果 —— 刷新没有任何用户手势，
 * 浏览器必然拒绝自动播放。宾客可用右上角的音乐按钮手动开启。
 */
const KEY = 'wedding:unlocked'

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    // 隐私模式下 sessionStorage 可能不可用（如 Safari 无痕），降级为未解锁
    return false
  }
}

/*
 * demo 模式恒为「未解锁」，每次进入都要重新刮卡 —— 录屏需要。
 * 不写入标记也没关系：下次仍是 demo 模式，依然按未解锁处理；
 * 而录完删掉参数后，之前正常写入的标记仍在，不会影响真实用户。
 */
const unlocked = ref(demoMode ? false : read())

export function useUnlockState() {
  function markUnlocked() {
    unlocked.value = true
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* 存储不可用时仅影响本次会话内保持，功能本身仍可用 */
    }
  }

  /** 供新会话复用：返回时无需重播终端动画 */
  const hasUnlocked = readonly(unlocked)

  return { hasUnlocked, markUnlocked }
}
