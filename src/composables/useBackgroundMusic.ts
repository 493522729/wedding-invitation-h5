import { readonly, ref } from 'vue'
import { music } from '../config/wedding'

/**
 * 宾客主动关闭音乐的状态记在 localStorage。
 * 用 '1'/'0' 而不是 'true'/'false'，避免其他代码误读。
 */
const STORAGE_KEY = 'wedding-music-off'

/**
 * 背景音乐。
 *
 * 微信内置浏览器的硬约束：禁止无用户手势的音频自动播放。
 * `autoplay` 属性在 iOS 微信上直接失效，AudioContext 也被限制。
 * 唯一可靠做法是把 play() 放在真实用户手势的调用栈里 ——
 * 本项目借「刮开卡片」这个手势触发（见 App.vue 的 onUnlock）。
 *
 * 模块级单例：路由切换（邀请页 ↔ 相册页）时音乐不中断。
 */
let audio: HTMLAudioElement | null = null
/** 首次触摸监听是否已挂上 */
let firstTouchArmed = false
/** 首次触摸是否已被消费（touchstart 与 pointerdown 会成对触发） */
let touchConsumed = false
/** 是否因切到后台而暂停（用于区分「暂停」与「暂停后需恢复」） */
let suspendedByVisibility = false
/** visibilitychange 是否已监听 */
let visibilityArmed = false
let fadeTimer: ReturnType<typeof setInterval> | null = null

/** 音频文件是否可用。加载失败时置 false，按钮随之隐藏 */
const available = ref(true)
/** 是否正在播放（目标状态） */
const playing = ref(false)
/** 宾客是否主动关掉了音乐（记忆其选择） */
const turnOffByUser = ref(readStored())
/**
 * 最近一次播放失败的原因，供诊断展示。
 * 之前 catch 里是空函数，失败被完全吞掉：既无法自查，也无法向开发者反馈。
 * 微信对音频的限制没有明确报错文案，只有浏览器抛出的异常名能区分原因。
 */
const lastError = ref('')

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // 隐私模式下 localStorage 可能抛异常
    return false
  }
}

function persistOff(off: boolean) {
  turnOffByUser.value = off
  try {
    localStorage.setItem(STORAGE_KEY, off ? '1' : '0')
  } catch {
    /* 存不了就算了，不影响本次播放 */
  }
}

/**
 * 探测素材是否真的存在且是音频。
 *
 * 不能只靠 audio 元素的 error 事件判断：静态服务器常把找不到的文件
 * 回退到 index.html 并返回 200 text/html，浏览器不一定触发 error，
 * 按钮就会留下一个「点了没声音」的摆设。这里显式检查状态码与
 * Content-Type，判定更可靠。
 */
async function probeAvailability() {
  try {
    const res = await fetch(music.src, { method: 'HEAD' })
    const type = (res.headers.get('content-type') || '').toLowerCase()
    available.value = res.ok && (type.includes('audio') || type.includes('mpeg'))
    if (!available.value) {
      console.info('[wedding] 未找到背景音乐素材，音乐按钮已隐藏')
    }
  } catch {
    available.value = false
  }
}

/**
 * 接管模板里声明的 <audio> 元素。
 *
 * 不能再用 new Audio() 动态创建：微信安卓的 X5 内核不会对动态创建的媒体
 * 元素发起网络请求，networkState 恒为 0 (NETWORK_EMPTY)，
 * 音频永远停在 HAVE_NOTHING，play() 只会被拒（实测报 NotAllowedError）。
 * 写进模板后由浏览器在解析 HTML 时接管，加载行为不再依赖 JS。
 */
function attachAudio(el: HTMLAudioElement | null): void {
  if (!el) return
  audio = el
  // 模板已写 preload="auto"，这里兜底保证就绪
  if (el.preload !== 'auto') el.preload = 'auto'
  el.loop = music.loop
  el.setAttribute('playsinline', '')
  el.addEventListener('error', () => {
    stopFade()
    playing.value = false
  })
}

/** 模板元素尚未就位时的兜底路径（非微信环境可用） */
function ensureAudio(): HTMLAudioElement | null {
  if (audio) return audio
  if (typeof Audio === 'undefined') return null

  const el = new Audio()
  el.src = music.src
  el.loop = music.loop
  el.preload = 'auto'
  // 音量先归零，播放时再淡入；否则第一帧就是全音量，会「啪」一声
  el.volume = 0
  // 播放期间出错（如网络中断）就隐藏按钮，避免状态显示与实际不符
  el.addEventListener('error', () => {
    stopFade()
    playing.value = false
  })

  audio = el
  // 挂进 DOM：部分移动端浏览器要求音频元素存在于文档中才能播。
  // 但绝不能用 display:none —— iOS Safari 与微信实测会因此让play()
  // 静默失效（点了按钮毫无反应，也没有报错）。改为零尺寸 + 透明 + 沉底。
  // playsinline 必须在插入 DOM 前设好：iOS Safari 会在解析时决定
  // 媒体是否走系统全屏播放层，后置设置无效。
  // 用 setAttribute 而非 el.playsInline：TS 的 HTMLAudioElement 上
  // 没有该属性的声明（它实际来自 HTMLMediaElement），直接赋值会报错。
  el.setAttribute('playsinline', '')
  if (typeof document !== 'undefined') {
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText =
      'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1'
    document.body.appendChild(el)
  }

  return audio
}

/** 音频是否已就绪（可播）。iOS/微信在未就绪时调用 play() 会直接拒绝 */
const ready = ref(false)

function recordError(e: unknown) {
  const name = e instanceof Error ? e.name : String(e)
  lastError.value = name
  console.warn('[wedding] 背景音乐播放失败：' + name, e)
}

/**
 * 静音起播 → 取消静音 → 渐变到目标音量。
 *
 * 为什么必须静音起播：muted 状态下的 play() 不受自动播放策略约束，
 * 相当于用零成本换取一个合法的播放上下文，之后再恢复正常音量。
 *
 * 为什么不依赖 play() 的 promise：实测在 iOS 微信里，若数据尚未就绪，
 * 这个 promise 会一直处于 pending，.then() 永远不执行 —— 结果就是
 * muted 一直关不掉（画面上「在播放」但一点声音都没有）。
 * 因此额外监听 canplay 作为兜底：只要数据到位就恢复音量。
 */
/**
 * 静音起播 → 取消静音 → 渐变到目标音量。
 *
 * 为什么必须静音起播：muted 状态下的 play() 不受自动播放策略约束，
 * 相当于用零成本换取一个合法的播放上下文，之后再恢复正常音量。
 *
 * 为什么不依赖 play() 的 promise：实测在 iOS 微信里，若数据尚未就绪，
 * 这个 promise 会一直处于 pending，.then() 永远不执行 —— 结果就是
 * muted 一直关不掉（画面上「在播放」但一点声音都没有）。
 * 因此额外监听 canplay 作为兜底：只要数据到位就恢复音量。
 */
function startMutedPlayback(el: HTMLAudioElement) {
  // 状态被打成 NO_SOURCE（无手势时的请求被拒）时，play() 不会再拉数据，
  // 必须显式 load() 重新发起。
  if (el.networkState === el.NETWORK_NO_SOURCE /* 3 */) el.load()

  const unmute = () => {
    el.muted = false
    lastError.value = ''
    playing.value = true
    ready.value = true
    fadeTo(music.volume)
  }

  el.muted = true
  el.volume = 0
  el.addEventListener('canplay', unmute, { once: true })

  el.play().then(unmute).catch((e: unknown) => {
    // promise 被拒不代表无望：canplay 兜底仍会尝试恢复音量
    recordError(e)
  })
}

/**
 * 真正的播放入口。
 *
 * 实测踩坑记录（微信安卓 X5 内核）：
 *   load() 与 play() 都在手势栈内、且元素写在模板里，仍会报
 *   NotAllowedError。原因是音频有 704KB，手势栈在几十毫秒内就结束，
 *   而数据尚未下载到位 —— 浏览器认为此时没有「有效的用户激活」。
 *
 * 解决办法是业界通用的静音解锁：
 *   1. muted 状态下play() 不受自动播放策略约束（不会reject），
 *      等于拿到一个合法的播放上下文；
 *   2. 上下文建立后取消静音并渐变到目标音量，声音即可持续输出。
 * 这个技巧对微信/iOS 的自动播放限制同样有效。
 */
/**
 * 真正的播放入口。
 *
 * 实测踩坑记录（微信安卓 X5 内核）：
 *   load() 与 play() 都在手势栈内、且元素写在模板里，仍会报
 *   NotAllowedError。原因是音频有 704KB，手势栈在几十毫秒内就结束，
 *   而数据尚未下载到位 —— 浏览器认为此时没有「有效的用户激活」。
 *
 * 解决办法是业界通用的静音解锁：
 *   1. muted 状态下play() 不受自动播放策略约束（不会reject），
 *      等于拿到一个合法的播放上下文；
 *   2. 上下文建立后取消静音并渐变到目标音量，声音即可持续输出。
 * 这个技巧对微信/iOS 的自动播放限制同样有效。
 */
function playWhenReady(el: HTMLAudioElement) {
  // 数据未就绪时开始下载。此刻处在用户手势的同步调用栈内，
  // 不会再被 iOS 拒绝
  if (el.readyState < 3 /* HAVE_FUTURE_DATA */) el.load()
  startMutedPlayback(el)
}

/**
 * 切后台时暂停、切回来恢复。
 * 婚礼现场的宾客常会锁屏看消息，不暂停的话会在旁边一直响。
 * 恢复属「用户主动交互的延续」，多数内核允许直接续播；
 * 若被拒则退化为保持暂停，由宾客点音乐按钮手动恢复。
 */
/**
 * 切后台时暂停、切回来恢复。
 * 婚礼现场的宾客常会锁屏看消息，不暂停的话会在旁边一直响。
 * 恢复属「用户主动交互的延续」，多数内核允许直接续播；
 * 若被拒则退化为保持暂停，由宾客点音乐按钮手动恢复。
 */
function handleVisibilityChange() {
  const el = audio
  if (!el || !available.value) return
  if (document.hidden) {
    if (!el.paused) {
      el.pause()
      suspendedByVisibility = true
    }
  } else if (suspendedByVisibility && !turnOffByUser.value) {
    suspendedByVisibility = false
    el.play().catch((e: unknown) => {
      suspendedByVisibility = false
      recordError(e)
    })
  }
}

/**
 * 真正的启动入口（模块级，供全局触摸监听与组件共用）。
 * 首次触摸即视为「宾客想听音乐」，清掉关闭记忆后开始播放。
 */
/**
 * 真正的启动入口（模块级，供全局触摸监听与组件共用）。
 * 首次触摸即视为「宾客想听音乐」，清掉关闭记忆后开始播放。
 */
function startPlayback() {
  turnOffByUser.value = false
  try {
    localStorage.setItem(STORAGE_KEY, '0')
  } catch {
    /* 隐私模式下写不进去也不影响本次播放 */
  }
  const el = ensureAudio()
  if (el) playWhenReady(el)
}

/**
 * 提前加载音频。必须在页面挂载时就调用，而不是等到刮卡那一刻。
 *
 * 原因：ensureAudio() 会新建 audio 并设 src，浏览器随即开始异步下载。
 * 若等到用户刮开卡片才第一次创建，play() 必然赶不上加载完成，
 * iOS 与微信都会直接 reject，表现为「刮开了但没声音」。
 *
 * 预加载后音频在用户手势到来前就已就绪，play() 才能同步成功 ——
 * 这里绝不能改成 await 等 canplay，那会脱离用户手势的调用栈，更播不出。
 */
function preload() {
  const el = ensureAudio()
  if (!el) return
  if (el.readyState >= 3 /* HAVE_FUTURE_DATA */) {
    ready.value = true
  } else {
    el.addEventListener('canplay', () => (ready.value = true), { once: true })
  }
  el.addEventListener('error', () => (ready.value = false), { once: true })

  // 关键：**这里绝不能调 el.load()**。
  // 页面加载阶段没有用户手势，iOS 微信会直接拒绝媒体请求，
  // 并把 networkState 打成 3 (NETWORK_NO_SOURCE)。
  // 此后即使在手势里再 play()，也拉不到任何数据 —— 实测正是如此：
  // paused=false（播放被接受）但 readyState恒为 0、永远没有声音。
  //
  // 改为：只在这里挂上「第一次用户触摸」的监听，等触摸真的发生
  // 再开始下载与播放（见 armFirstTouch）。
  armFirstTouch()
  armVisibilityWatch()
}

/** 页面切后台时暂停音乐，回来后恢复 */
function armVisibilityWatch(): void {
  if (typeof document === 'undefined' || visibilityArmed) return
  visibilityArmed = true
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

/**
 * 监听页面全局第一次触摸，在那一刻开始加载并播放。
 *
 * 依据微信内置浏览器的实际行为：
 *  - iOS（WKWebView）强制要求一次真实用户手势，没有任何 JSAPI 能绕过；
 *  - 安卓在用户第一次划屏幕的瞬间启动音乐，体感上「像一进来就有背景音」。
 * 所以触发点不选「刮完卡」（那时还要先跑一遍 getImageData 统计像素，
 * 耗时可能让用户激活失效），而选触摸发生的第一瞬间。
 */
function armFirstTouch(): void {
  if (typeof document === 'undefined') return
  if (firstTouchArmed) return
  firstTouchArmed = true

  const onFirstTouch = (e: Event) => {
    // touchstart 与 mousedown/pointerdown 会成对触发，用 once 之外的
    // 标志位保证只启动一次
    if (touchConsumed) return
    touchConsumed = true
    detachFirstTouch()
    void e
    startPlayback()
  }


  const detachFirstTouch = () => {
    document.removeEventListener('touchstart', onFirstTouch, true)
    document.removeEventListener('mousedown', onFirstTouch, true)
    document.removeEventListener('pointerdown', onFirstTouch, true)
  }

  // 用捕获阶段，确保比组件内的处理器更早拿到这次手势
  document.addEventListener('touchstart', onFirstTouch, true)
  document.addEventListener('mousedown', onFirstTouch, true)
  document.addEventListener('pointerdown', onFirstTouch, true)
}

/** 线性渐变音量。不用 Web Audio 的 GainNode：移动端兼容坑多，收益为零 */
function fadeTo(target: number, done?: () => void) {
  const el = audio
  if (!el) {
    done?.()
    return
  }
  stopFade()
  const from = el.volume
  const steps = Math.max(1, Math.round(music.fadeMs / 40))
  let n = 0
  fadeTimer = setInterval(() => {
    n++
    el.volume = from + ((target - from) * n) / steps
    if (n >= steps) {
      stopFade()
      done?.()
    }
  }, music.fadeMs / steps)
}

function stopFade() {
  if (fadeTimer) {
    clearInterval(fadeTimer)
    fadeTimer = null
  }
}

export function useBackgroundMusic() {

  /**
   * 播放并在成功后淡入。三条路径（原生 autoplay、微信事件、手势）
   * 共用同一套成功/失败处理，避免逻辑分叉。
   */
  /**
   * 微信安卓用的 X5 内核会拦下 play()，并在其内部桥接就绪后才放行。
   * 监听 WeixinJSBridgeReady 并重试，是这类环境下唯一可靠的做法。
   */






  function inWeChat(): boolean {
    return /micromessenger/i.test(navigator.userAgent)
  }

  /**
   * 刮开卡片时调用。
   *
   * 这里必须先重置「已关闭」：宾客之前点过暂停就会把该状态永久写进
   * localStorage，而 play() 第一行if (turnOffByUser.value) return 是
   * 静默拦截 —— 于是刮卡永远无声，页面上也看不出任何原因，
   * 宾客自己都无法恢复。重新刮卡这个动作本身就代表「想听音乐」。
   *
   * 只在真正的刮卡动作里重置：从相册页返回时组件会重挂载，
   * 但那条路径走 hasUnlocked 分支、不会调playOnUnlock，
   * 所以宾客在此刻点的暂停依然有效。
   */
  function playOnUnlock() {
    persistOff(false)
    startPlayback()
  }



  /**
   * 在用户手势的调用栈里播放。刮卡解锁、点击按钮都走这里。
   */
  function play() {
    if (turnOffByUser.value) return
    const el = ensureAudio()
    if (!el) return

    // 音频尚未就绪时直接 play() 会被 reject，表现又是「点了没反应」。
    // 这里保留播放意图，等 canplay 补上。preload() 让这个窗口很短。
    if (el.readyState < 3 /* HAVE_FUTURE_DATA */) {
      el.addEventListener(
        'canplay',
        () => {
          if (!turnOffByUser.value) playWhenReady(el)
        },
        { once: true }
      )
    }
    playWhenReady(el)
  }

  /** 淡出后暂停 */
  function pause() {
    const el = audio
    if (!el) return
    fadeTo(0, () => {
      el.pause()
      playing.value = false
    })
  }

  function toggle() {
    if (playing.value) {
      persistOff(true)
      pause()
    } else {
      persistOff(false)
      play()
    }
  }

  /** 路由切换等场景：暂停但不改宾客的偏好 */
  function detach() {
    const el = audio
    if (!el) return
    stopFade()
    el.pause()
    playing.value = false
  }

  /**
   * 调试快照：把音频元素与相关状态摊平成可读文本。
   *
   * 微信对音频的限制没有明确报错文案，只能靠浏览器抛出的异常名区分，
   * 而此前所有失败都被空catch 吞掉 —— 导致「没声音」完全无法自查。
   * 配合 URL 参数 ?music=debug 展示，让真机问题能靠截图定位。
   */
  function debugSnapshot(): string {
    if (!audio) return 'audio: 未创建'
    const codes: Record<number, string> = {
      1: 'MEDIA_ERR_ABORTED',
      2: 'MEDIA_ERR_NETWORK',
      3: 'MEDIA_ERR_DECODE',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
    }
    const err = audio.error
    return [
      'src      ' + music.src.split('/').pop(),
      'inDOM    ' + document.body.contains(audio),
      'muted    ' + audio.muted + ' (解锁用，正常应false)',
      'paused   ' + audio.paused,
      'readyFlag' + ready.value + ' (就绪标记)',
      'target  ' + playing.value + ' (目标播放状态)',
      'volume   ' + audio.volume.toFixed(2),
      'time     ' + audio.currentTime.toFixed(2),
      'readySt  ' + audio.readyState + ' (>=3 才算就绪)',
      'networkSt' + audio.networkState + ' (0=完全没请求)',
      'buffered ' + (audio.buffered.length ? audio.buffered.end(0).toFixed(1) + 's/' + audio.duration.toFixed(0) + 's' : '无'),
      'errCode  ' + (err ? err.code + ' ' + (codes[err.code] || '') : '无'),
      'lastErr  ' + (lastError.value || '无'),
      'wechat   ' + inWeChat(),
    ].join('\n')
  }

  /**
   * 诊断专用：把「load + play」完全暴露给页面。
   * 微信X5 对媒体的处理与标准浏览器差异极大，需要在真机上直接
   * 观察 load() 是否触发请求、play() 是否被拒，才能判断能否修复。
   */
  function forcePlay(): string {
    if (!audio) return 'audio 未创建'
    try {
      audio.load()
    } catch (e) {
      return 'load() 抛错：' + String(e)
    }
    audio.play().catch((e: unknown) => {
      lastError.value = e instanceof Error ? e.name : String(e)
    })
    return '已触发 load() + play()'
  }

  return {
    attachAudio,
    forcePlay,
    probeAvailability,
    preload,
    playOnUnlock,
    debugSnapshot,
    lastError: readonly(lastError),
    ready: readonly(ready),
    available: readonly(available),
    playing: readonly(playing),
    turnOffByUser: readonly(turnOffByUser),
    play,
    pause,
    toggle,
    detach,
  }
}
