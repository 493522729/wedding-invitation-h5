import type { Ref } from 'vue'

const COLORS = ['#b3122b', '#e8c27a', '#fff3e0', '#d94f4f', '#f2d9a0']
const COUNT = 120
/** 动画帧数，约 3.7 秒 */
const DURATION = 220

/**
 * 彩带粒子动画。
 * 由传入的 canvas 承载，ref 收在组件内部，父级只管调 launch()。
 */
export function useConfetti(canvasRef: Ref<HTMLCanvasElement | null>) {
  function launch() {
    const c = canvasRef.value
    if (!c) return
    const w = (c.width = window.innerWidth)
    const h = (c.height = window.innerHeight)
    const g = c.getContext('2d')
    if (!g) return

    const parts = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: -20 - Math.random() * h,
      r: 4 + Math.random() * 6,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      vy: 2 + Math.random() * 3,
      vx: -1 + Math.random() * 2,
      rot: Math.random() * 6,
    }))

    let frame = 0
    const draw = () => {
      g.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.y += p.vy
        p.x += p.vx
        p.rot += 0.1
        g.save()
        g.translate(p.x, p.y)
        g.rotate(p.rot)
        g.fillStyle = p.c
        g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6)
        g.restore()
      }
      frame++
      if (frame < DURATION) requestAnimationFrame(draw)
      else g.clearRect(0, 0, w, h)
    }
    draw()
  }

  return { launch }
}
