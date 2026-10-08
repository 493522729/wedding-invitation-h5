import { info } from '../config/wedding'

/**
 * 宾客侧的小工具。
 *
 * 这里原本只有「下载 .ics 加日历」，实测在手机上基本不可用：
 *  - iOS Safari：下载后要点进「文件」App 再点开才能导入，跳三步
 *  - 微信内置浏览器：直接拦截下载，且无权访问系统日历
 * 而请柬恰恰主要在微信里被打开，等于给了一个摆设按钮。已改为
 * 「复制日程」—— 复制出的文本可以粘到备忘录、粘给家人，
 * 或手动粘进系统日历，路径短且不会失败。
 */

/** 唤起高德地图导航 */
export function openNavigation(url: string) {
  location.href = url
}

/** 组装可读性好的日程文本，粘贴到备忘录/日历里也不会显得乱 */
function buildScheduleText(): string {
  return [
    `${info.groom} ❤ ${info.bride} 婚礼邀请`,
    `${info.date} ${info.lunar}`,
    `${info.signIn} · ${info.seat}`,
    `${info.hotel} ${info.hall}`,
    info.address,
  ].join('\n')
}

/** 降级路径：选中文本并用 execCommand 复制，覆盖不支持 Clipboard API 的旧 WebView */
function copyBySelection(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  // 移到视口外但仍可聚焦，iOS 上 display:none 的元素无法选中复制
  ta.style.cssText =
    'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none'
  document.body.appendChild(ta)
  let ok = false
  try {
    ta.select()
    ta.setSelectionRange(0, text.length)
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}

/**
 * 复制婚礼日程到剪贴板。
 *
 * 返回是否成功，调用方据此给出反馈 —— 静默失败会让宾客以为按钮坏了。
 */
export async function copySchedule(): Promise<boolean> {
  const text = buildScheduleText()
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 微信里可能被拒绝，走下面的降级路径
  }
  return copyBySelection(text)
}
