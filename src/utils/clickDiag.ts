/**
 * 点击诊断（仅 ?clickdiag=1 时启用）。
 *
 * 用途：「查看全部」在移动端偶发「第一下没反应」，肉眼无法区分
 * 是「点击没送达」「点击送达了但路由没跳」还是「跳了但没渲染」。
 * 这里把最近若干次事件记下来，页面上直接显示，截图即可判断。
 *
 * 不影响正式访客：不开参数时不注册任何监听、界面不渲染。
 */

const KEY = 'wedding:clickdiag'

export interface ClickEvent {
  /** 距页面打开的毫秒数 */
  t: number
  /** 命中的目标（类名或标签） */
  target: string
  /** 事件类型 */
  kind: string
  /** 路由 hash */
  hash: string
  /** 目标是否在视口内 */
  inView: boolean
}

const MAX = 12
let started = 0
let events: ClickEvent[] = []

export function diagEnabled(): boolean {
  return new URLSearchParams(location.search).has('clickdiag')
}

export function startDiag(): void {
  if (!diagEnabled() || started) return
  started = performance.now()
  const record = (e: Event) => {
    const el = e.target as HTMLElement | null
    const r = el?.getBoundingClientRect()
    events.unshift({
      t: Math.round(performance.now() - started),
      target: el ? el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') : '?',
      kind: e.type,
      hash: location.hash || '(空)',
      inView: r ? r.top >= 0 && r.bottom <= window.innerHeight : false,
    })
    events = events.slice(0, MAX)
    try {
      localStorage.setItem(KEY, JSON.stringify(events))
    } catch {
      /* 隐私模式写不进去不影响使用 */
    }
  }
  // 捕获阶段监听：即使被业务代码 stopPropagation 也能记到
  document.addEventListener('pointerup', record, true)
  document.addEventListener('click', record, true)
  document.addEventListener('hashchange', record, true)
}

export function readDiag(): ClickEvent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as ClickEvent[]
  } catch {
    return []
  }
}

export function clearDiag(): void {
  events = []
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 忽略 */
  }
}
