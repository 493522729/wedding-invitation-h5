import { onUnmounted, ref, type Ref } from 'vue'

/**
 * 擦除面积占比达到该值即解锁。
 *
 * 换算依据（卡片 300×380，擦除直径 48）：
 * 一条满宽竖线 = 48 × 380 = 18240 px² ≈ 整卡 16%。
 *   0.4 → 需2.5 条直线，来回三趟才达标，偏重；
 *   0.3 → 需 1.9 条直线，一趟半即可，仍保留「要真的动手刮」的仪式感。
 * 选0.3 也刻意避开 0.32：来回正好两趟 = 32%，卡在临界点会让人以为还差一点。
 * 一划就开（约 16%）仍不可达，否则失去刮卡意义。
 */
const UNLOCK_RATIO = 0.3

/** 擦除半径（CSS px） */
const ERASE_R = 24

/**
 * 进度检测用的离屏 mask 缩放比（线性）。
 *
 * 视觉画布按 devicePixelRatio 放大，iPhone 上约 900×1140 ≈ 100 万像素。
 * 若每次 touchmove 都对整块画布 getImageData，单次就会分配 4MB，
 * 60fps 下是 ~245MB/s 的 TypedArray 分配，低内存安卓机会直接掉帧。
 *
 * 进度判定不需要那么高的精度，降到 1/4 线性尺寸后单次仅约 28KB。
 */
const MASK_SCALE = 0.25

/**
 * 刮卡逻辑：涂层绘制、双层擦除、进度判定。
 * 纯逻辑，不含任何 UI 结构。
 *
 * @param onUnlock 解锁回调
 * @param canvasEl canvas 元素引用（由组件通过 useTemplateRef 提供）。
 *        必须显式传入——useTemplateRef 与函数内部的 ref 是两个不同对象，
 *        不传则永远拿不到 canvas，涂层画不出来、刮卡完全失效。
 */
/**
 * 四角回纹角饰。
 *
 * 直角边框的四个尖角在红色底上显得很扎，尤其是上下两个角
 * 正好落在视线扫过的路径上。加一圈简化的中式回纹：
 * 外层 L 形加粗做主装饰，内层错开一小段形成「回」字，
 * 既呼应婚庆的中式调性，又不会像繁复的传统纹样那样抢戏。
 *
 * 四个角共用一份绘制代码：dx / dy 表示朝卡片内侧延伸的方向
 *（+1 向右/向下，-1 反向），镜像组合即可，不必各写一遍。
 */
function drawCorners(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const m = 8 // 与 border 的 strokeRect 同一条线
  const OUT = 13 // 角饰边长
  const IN = 4 // 角饰相对边框的内缩
  const GAP = 5 // 内层回纹相对外层的错开量

  ctx.save()
  ctx.strokeStyle = 'rgba(240, 206, 140, 0.9)'
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'

  const corner = (x: number, y: number, dx: number, dy: number) => {
    const bx = x + IN * dx
    const by = y + IN * dy

    // 外层：加粗的 L 形，是角饰的主体
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.moveTo(bx, by + OUT * dy)
    ctx.lineTo(bx, by)
    ctx.lineTo(bx + OUT * dx, by)
    ctx.stroke()

    // 内层：细线回纹，往内错开形成「回」字
    ctx.lineWidth = 1.3
    ctx.strokeStyle = 'rgba(240, 206, 140, 0.6)'
    const ix = x + (IN + GAP) * dx
    const iy = y + (IN + GAP) * dy
    const seg = OUT - GAP * 2
    ctx.beginPath()
    ctx.moveTo(ix, iy + seg * dy)
    ctx.lineTo(ix, iy)
    ctx.lineTo(ix + seg * dx, iy)
    ctx.stroke()
  }

  corner(m, m, 1, 1)
  corner(w - m, m, -1, 1)
  corner(w - m, h - m, -1, -1)
  corner(m, h - m, 1, -1)

  ctx.restore()
}

export function useScratch(
  onUnlock: () => void,
  canvasEl: Ref<HTMLCanvasElement | null>
) {
  const canvasRef = canvasEl
  const scratched = ref(false)
  /** 环境是否支持刮卡（拿不到 2d 上下文时为 false，调用方需走兜底） */
  const supported = ref(true)

  /** 视觉层：只做 destination-out 填充，不读像素 */
  let ctx: CanvasRenderingContext2D | null = null
  /** 进度层：低分辨率离屏画布，全项目唯一的像素读取来源 */
  let maskCtx: CanvasRenderingContext2D | null = null
  let maskW = 0
  let maskH = 0

  /** rAF 节流：一次滑动事件流里最多检测一次 */
  let checkScheduled = false
  /** 滑动过程中已达标，等手指抬起再结算跳转 */
  const reachRatio = ref(false)
  let rafId = 0
  /** 上一个擦除点，用于补画连续轨迹 */
  let lastPt: { x: number; y: number } | null = null

  /**
   * 绘制初始红金涂层。
   * @returns 是否具备刮卡能力，false 时调用方应直接放行
   */
  function init(): boolean {
    const c = canvasRef.value
    if (!c) return false

    const rect = c.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false

    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)

    ctx = c.getContext('2d')
    if (!ctx) {
      supported.value = false
      return false
    }
    ctx.scale(dpr, dpr)

    // 红金渐变涂层
    const g = ctx.createLinearGradient(0, 0, rect.width, rect.height)
    g.addColorStop(0, '#b3122b')
    g.addColorStop(1, '#8c0d20')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, rect.width, rect.height)

    // 金色细边
    ctx.strokeStyle = 'rgba(232,195,126,.55)'
    ctx.lineWidth = 2
    ctx.strokeRect(8, 8, rect.width - 16, rect.height - 16)

    drawCorners(ctx, rect.width, rect.height)

    // 中央提示
    ctx.fillStyle = 'rgba(255,224,138,.95)'
    ctx.font = '600 19px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('刮开惊喜 ✨', rect.width / 2, rect.height / 2)

    // 低分辨率进度 mask：不透明 = 涂层仍完整
    const mask = document.createElement('canvas')
    maskW = Math.max(1, Math.round(rect.width * MASK_SCALE))
    maskH = Math.max(1, Math.round(rect.height * MASK_SCALE))
    mask.width = maskW
    mask.height = maskH
    maskCtx = mask.getContext('2d', { willReadFrequently: true })
    if (!maskCtx) {
      supported.value = false
      return false
    }
    maskCtx.fillStyle = '#fff'
    maskCtx.fillRect(0, 0, maskW, maskH)

    return true
  }

  /** mask 中已擦除（alpha = 0）的像素占比 */
  function erasedRatio(): number {
    if (!maskCtx) return 0
    const { data } = maskCtx.getImageData(0, 0, maskW, maskH)
    let clear = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) clear++
    }
    return clear / (data.length / 4)
  }

  /**
   * 把像素读取合并到动画帧，避免高频 touchmove 反复读全图。
   *
   * 达标后**只记标记、不在这里跳转**：
   *   1. rAF 回调运行时手指还压着，此时跳转让页面在指下突然抽走，观感突兀；
   *   2. 更关键 —— rAF 回调不在用户手势的调用栈内，微信内置浏览器会判定为
   *      自动播放并拒绝 audio.play()，背景音乐永远响不起来。
   * 真正的跳转统一交给 handleEnd（pointerup），那里仍在手势栈内。
   */
  function scheduleCheck() {
    if (checkScheduled || scratched.value) return
    checkScheduled = true
    rafId = requestAnimationFrame(() => {
      checkScheduled = false
      if (scratched.value) return
      if (erasedRatio() >= UNLOCK_RATIO) reachRatio.value = true
    })
  }

  /**
   * 挖圆 + 补画与上一点的连线。
   * pointermove 是离散事件，快速划动时相邻两点间距可能大于擦除半径，
   * 只挖圆会留下漏擦的缝隙，导致「明明划完了却差一点解锁」。
   *
   * @param scale 目标画布相对 CSS 尺寸的缩放比（进度 mask 为 MASK_SCALE）。
   *              r 与线宽都必须按它换算，否则在 mask 上会抹得比视觉层宽 1/scale 倍，
   *              进度虚高导致「刮一下就解锁」。
   */
  function punchTrail(
    target: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    scale = 1
  ) {
    target.globalCompositeOperation = 'destination-out'
    const rr = r * scale
    if (lastPt) {
      target.lineWidth = rr * 2
      target.lineCap = 'round'
      target.lineJoin = 'round'
      target.strokeStyle = '#000'
      target.beginPath()
      target.moveTo(lastPt.x * scale, lastPt.y * scale)
      target.lineTo(x * scale, y * scale)
      target.stroke()
    }
    target.beginPath()
    target.arc(x * scale, y * scale, rr, 0, Math.PI * 2)
    target.fill()
  }

  function handleEvent(e: PointerEvent) {
    if (scratched.value || !ctx || !canvasRef.value) return
    e.preventDefault()

    // 捕获指针：手指划出卡片范围后仍能继续擦，松开才停止
    if (e.type === 'pointerdown') {
      canvasRef.value.setPointerCapture?.(e.pointerId)
      lastPt = null
    }

    const rect = canvasRef.value.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // 划到卡片外不擦，否则按住不放一路滑到底就能直接解锁
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      lastPt = null
      return
    }

    punchTrail(ctx, x, y, ERASE_R)
    if (maskCtx) punchTrail(maskCtx, x, y, ERASE_R, MASK_SCALE)
    lastPt = { x, y }
    scheduleCheck()
  }

  /**
   * 抬手时结算：擦到临界值（或滑动中已达标）才真正跳转。
   * 这是唯一触发 onUnlock 的入口，保证它始终发生在用户手势的同步调用栈内。
   */
  function handleEnd() {
    if (scratched.value || !ctx) return
    lastPt = null
    if (reachRatio.value || erasedRatio() >= UNLOCK_RATIO) {
      scratched.value = true
      reachRatio.value = false
      if (rafId) cancelAnimationFrame(rafId)
      onUnlock()
    }
  }

  /** 用户放弃刮卡：一次性擦掉涂层露出底图，不再做进度判定 */
  function revealAll() {
    if (!ctx || !canvasRef.value) return
    scratched.value = true
    reachRatio.value = false
    if (rafId) cancelAnimationFrame(rafId)
    checkScheduled = false
    const rect = canvasRef.value.getBoundingClientRect()
    ctx.globalCompositeOperation = 'destination-out'
    // ctx 已按 dpr 缩放过，这里用 CSS px 坐标
    ctx.fillRect(0, 0, rect.width, rect.height)
  }

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId)
  })

  return { scratched, supported, init, handleEvent, handleEnd, revealAll }
}
