<script setup lang="ts">
/**
 * 报名弹层。含三种状态：填写 / 提交成功 / 已提交过。
 * 提交成功后展示实时统计，让宾客感到「有人已经报了」——
 * 这是 RSVP 唯一的社交激励，比纯表单更容易让人愿意填。
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import RsvpForm from './RsvpForm.vue'
import { fetchStats, type RsvpStats } from '../api/rsvp'
import { dateLabel } from '../config/wedding'
import { demoMode } from '../config/demo'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

/**
 * 报名截止日 = 婚期前 7 天（10/18）。
 * 不能直接用婚期本身 —— 留一周余量给酒店报桌数，
 * 截止日定在婚礼当天等于「宾客填完就已经来不及安排席位」。
 */
const deadline = new Date(`${dateLabel.year}-${dateLabel.month}-${dateLabel.day}T12:00:00`)
deadline.setDate(deadline.getDate() - 7)
const dateBefore = `${deadline.getMonth() + 1} 月 ${deadline.getDate()} 日`

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'submitted'): void }>()

const stats = ref<RsvpStats | null>(null)
const justSubmitted = ref(false)
/** 同一浏览器只提示一次，不反复骚扰已填过的宾客 */
const alreadyDone = ref(false)

const LOCK_KEY = 'wedding:rsvp-done'

const attendingText = computed(() => {
  if (!stats.value) return ''
  const { attending, people } = stats.value
  if (attending === 0) return '还没有人报名，来做第一个吧'
  return people !== attending
    ? `已有 ${attending} 位宾客确认出席，共 ${people} 人`
    : `已有 ${attending} 位宾客确认出席`
})

async function onSubmitted(s: RsvpStats) {
  stats.value = s
  justSubmitted.value = true
  alreadyDone.value = true
  // 通知外层重拉留言：宾客刚写的那句要能立刻出现在跑马灯里，
  // 否则提交完关掉弹层看到还是旧的列表，像是没提交成功
  emit('submitted')
  try {
    localStorage.setItem(LOCK_KEY, '1')
  } catch {
    /* 隐私模式下写不进去也不影响本次流程 */
  }
  /*
   * 必须等 DOM 更新完再放飞：信封的起点是「已收到」状态里那个 💌，
   * 而 justSubmitted 刚置 true 时 Vue 还没渲染它，此时 querySelector
   * 只会拿到 null，动画不播且没有任何报错可查。
   */
  await nextTick()
  flyToWall()
}

/**
 * 从弹层里的💌 放飞一个新信封，飞进终端框里的祝福墙后消失。
 *
 * 四段节奏（用户描述的顺序）：
 *   放大 → 左右上下晃动 → 带旋转飞出 → 缩小至消失
 *
 * **原信封不动**：飞的是另建的新节点（.ok 始终留在原处），
 * 视觉上是「原信封胀出第二个」再飞走，而不是原来那个被搬走了。
 * 新节点初始 opacity 为 0 并迅速淡入，同时 scale 从 0.9 起步，
 * 避免和原信封并排出现两个一模一样的东西。
 *
 * 为什么用 Web Animations API 而不是 CSS class：
 * 起点终点要按**实际屏幕坐标**算（弹层是 fixed 在 body 上的浮层，
 * 终端框在正常文档流里，两者没有共同定位祖先）；
 * 而且多阶段关键帧 + 逐帧 easing 用 CSS 写要拆成animation-delay
 * 与多组 class，WAAPI 一个数组就够，结束后 onfinish 移除节点，
 * 不留残留、不需要复位逻辑。
 *
 * 逐帧 easing 是这个动效的关键：晃动段用 ease-out（收得快），
 * 飞行段用 ease-in（加速冲向终点），整段才有「蓄力—甩出去」的节奏，
 * 用一条线性 easing 会像机械滑块。
 *
 * 已知取舍：飞行终点被弹层自身的遮罩挡住（弹层还没关），
 * 所以「飞进墙里」只成立到方向感为止，时长给足让方向感明确。
 */
function flyToWall() {
  // 选择器必须是 .wish-stamp：`.ok` 会命中终端框里的 .ln.ok（那行绿字
  //「已锁定 新郎 ❤ 新娘」），它比弹层更早出现在 DOM 里，
  // 用 .ok 会让信封从终端第一行那儿飞出去 —— 起点完全错位。
  const fromEl = document.querySelector('.wish-stamp')
  const toEl = document.querySelector('.term-body')
  if (!fromEl || !toEl) return

  // 减少动态效果偏好下不做位移：飞行动画纯属装饰，跳过即可
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const from = fromEl.getBoundingClientRect()
  if (!from.width) return

  /*
   * 终点：弹幕墙里第一条留言所在的**固定位置**。
   *
   * 为什么不用 .w-row 的实时坐标 —— 真机反馈「偶发落点在终端页签上方」。
   * 跑马灯一直在向上滚，飞行这 2 秒里那条留言已经移动了，
   * 按起飞瞬间的坐标算出来的落点，相对最终内容必然是偏的。
   * 现在只取**不动的锚点**：视口顶部（.w-viewport）+ 统计行高度 + 半行，
   * 也就是「第一条留言本该在的位置」，与滚动无关。
   *
   * 横向落在行首附近（偏移约 -90px）让路径是斜的，否则 x 恒为 0，
   * 抛物线的横向弧度完全体现不出来（实测采样验证过）。
   */
  const viewportEl = document.querySelector('.w-viewport')
  const headEl = document.querySelector('.w-head')
  const vp = viewportEl?.getBoundingClientRect() ?? toEl.getBoundingClientRect()
  if (!vp.width) return

  const headH = headEl ? headEl.getBoundingClientRect().height + 8 : 30
  const targetX = vp.left + Math.min(vp.width * 0.25, 90)
  const targetY = vp.top + headH + 16
  const dx = targetX - (from.left + from.width / 2)
  const dy = targetY - (from.top + from.height / 2)

  // 字号与 .ok 一致（44px），初始大小才和原信封对得上
  const SIZE = 44
  const flyer = document.createElement('div')
  flyer.textContent = '\u{1F48C}'
  // fixed + 视口坐标，与 getBoundingClientRect 坐标系一致；
  // z-index 高于遮罩（60）才能在弹层上方飞
  flyer.style.cssText =
    `position:fixed;z-index:70;pointer-events:none;font-size:${SIZE}px;line-height:1;` +
    `left:${from.left + from.width / 2 - SIZE / 2}px;top:${from.top}px;`
  document.body.appendChild(flyer)

  /*
   * 轨迹：直线位移 + 横向摆动 + 纵向 sin 拱，三项合成。
   *
   * 顿挫的根源（这才是上一版不顺滑的原因）：
   * WAAPI 里每个关键帧的 easing 只作用于「它到下一帧」这一段，
   * 而 ease-in 在段起点速度为 0、ease-out 在段终点速度为 0。
   * 之前给飞行段每帧都设了 easing —— 于是每到一个关键帧速度就归零再重新
   * 加速，6 个关键帧就是 6 次顿挫。
   * 现在**帧间一律不设 easing（即 linear）**，速度连续；
   * 整体节奏交给 effect 级的 easing 去控制（见下方 duration 那一行）。
   *
   * S 弯：x = dx·t + SWAY·sin(3πt) + 0.38·SWAY·sin(6.2πt)
   * 两项正弦频率不同（1.5 与 3.1 个周期）叠加，轨迹就有了不对称的摆动，
   * 而不是教科书式的标准 S。sin(3πt) 在 t=0 与 t=1 都为 0，保证起点终点不漂。
   */
  const ARC = 90
  const SWAY = 34
  const at = (t: number) => {
    const x = dx * t + SWAY * Math.sin(3 * Math.PI * t) + 0.38 * SWAY * Math.sin(6.2 * Math.PI * t)
    const y = dy * t - ARC * Math.sin(Math.PI * t)
    return { x, y }
  }

  /** 切线角：让信封的倾斜跟随轨迹方向，而不是匀速自转 */
  const tangent = (t: number) => {
    const e = 0.012
    const a = at(Math.max(0, t - e))
    const b = at(Math.min(1, t + e))
    // 乘 0.45 收敛：轨迹本身很陡，真实切线角会接近垂直，
    // 直接照搬会让信封像侧翻滚，转一半反而失真
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI * 0.45
  }

  /** 飞行段关键帧：t 从 0 到 1密铺 12 帧，形状由公式保证，插值交给 linear */
  const flyFrames = []
  const STEPS = 12
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const p = at(t)
    /*
     * 缩小保底 0.5：原先末值只有 0.04，等于「缩到看不见再消失」，
     * 真机反馈是「缩小速度过快，看不清落点」。
     * 现在全程保持至少半大，快到终点时是**淡出**而不是继续缩没。
     */
    const scale = 0.5 + 0.62 * Math.pow(1 - t, 1.2)
    // 前 70% 完全不透明，最后 30% 才淡出，避免半路就糊掉
    const opacity = t < 0.7 ? 1 : (1 - t) / 0.3
    flyFrames.push({
      transform:
        `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) ` +
        `scale(${scale.toFixed(3)}) rotate(${tangent(t).toFixed(1)}deg)`,
      opacity: Number(opacity.toFixed(3)),
      // 起飞占动画的后 50%，前半留给放大与晃动
      offset: 0.5 + 0.5 * t,
    })
  }

  const anim = flyer.animate(
    [
      // 1) 从原信封里「长」出来：淡入 + 迅速放大
      { transform: 'translate(0,0) scale(0.9) rotate(0deg)', opacity: 0 },
      { transform: 'translate(0,0) scale(1.45) rotate(0deg)', opacity: 1, offset: 0.06 },
      // 2) 左右上下晃动（4 帧，交替偏移 + 反向旋转）
      { transform: 'translate(-7px,-5px) scale(1.45) rotate(-7deg)', offset: 0.15 },
      { transform: 'translate(7px,5px) scale(1.45) rotate(7deg)', offset: 0.24 },
      { transform: 'translate(-5px,-4px) scale(1.42) rotate(-5deg)', offset: 0.33 },
      { transform: 'translate(0,0) scale(1.28) rotate(0deg)', offset: 0.44 },
      // 3) S 形飞行段（全部 linear 插值，速度连续，无顿挫）
      ...flyFrames,
    ],
    {
      // 2400ms：真机反馈「飞行速度再慢一点」，落点淡出也要看得清
      duration: 2400,
      // 整体节奏：慢起 → 加速飞 → 快到终点。放在 effect 级而非关键帧级，
      // 就不会打断帧间速度连续性
      easing: 'cubic-bezier(0.42, 0.05, 0.35, 1)',
      fill: 'forwards',
    }
  )
  anim.onfinish = () => flyer.remove()
}

function loadStats() {
  fetchStats()
    .then((s) => (stats.value = s))
    .catch(() => {
      /* 统计拿不到就只是不显示数字，不打扰宾客 */
    })
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    try {
      // demo 模式恒为 false：每次打开都是空白表单，可反复录制（见 config/demo.ts）
      alreadyDone.value = !demoMode && localStorage.getItem(LOCK_KEY) === '1'
    } catch {
      alreadyDone.value = false
    }
    if (!justSubmitted.value) loadStats()
  },
  { immediate: true }
)

/** 弹层打开时锁住背景滚动，关闭时恢复 */
useBodyScrollLock(computed(() => props.open))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
window.addEventListener('keydown', onKeydown)
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click.self="emit('close')">
      <section
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rsvp-title"
      >
        <button class="close" type="button" aria-label="关闭" @click="emit('close')">×</button>

        <template v-if="justSubmitted">
          <h2 class="title" id="rsvp-title">已收到，谢谢</h2>
          <!--
            类名是 wish-stamp 而不是 ok：终端行用的是 .ln.ok（成功输出的绿字），
            两者同名会让 querySelector('.ok') 匹配到终端框里更靠前的那个，
            动画起点就跑到终端第一行上去了。信封是唯一的，必须独占一个类。
          -->
          <p class="ok wish-stamp">💌</p>
          <p class="desc">您的出席信息已记下，新人一定会看到的。</p>
          <p v-if="attendingText" class="stat">{{ attendingText }}</p>
          <button class="done" type="button" @click="emit('close')">好</button>
        </template>

        <template v-else-if="alreadyDone">
          <h2 class="title" id="rsvp-title">您已经报过名了</h2>
          <p v-if="attendingText" class="stat">{{ attendingText }}</p>
          <p class="desc">如需修改，直接微信联系新人即可。</p>
          <button class="done" type="button" @click="emit('close')">知道了</button>
        </template>

        <template v-else>
          <!--
            文案三层各司其职，且姿态要低：
            标题只说情感（想见到你），不 interrogate 宾客；
            出不席放在说明句里，用「也」字带过 —— 它是新人需要的信息，
            但不该变成一道必须回答的考题。
            截止日单列一行，是硬信息，压暗一档避免抢戏。
          -->
          <h2 class="title" id="rsvp-title">想见到你</h2>
          <p class="desc">在下面告诉我们您能否出席，并写一句想说的话</p>
          <p class="desc deadline">请在 {{ dateBefore }} 前回复</p>
          <p v-if="attendingText" class="stat">{{ attendingText }}</p>
          <RsvpForm @done="onSubmitted" />
        </template>
        <!--
          演示模式提示条：只在 URL 带 ?demo=1 时出现。
          目的是「录完能看见自己忘了关」—— 万一忘了，正式宾客会看到这行字。
        -->
        <p v-if="demoMode" class="replay-hint">演示模式 · 刮卡与报名均可重复体验</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(4, 7, 11, 0.72);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: 88vh;
  overflow-y: auto;
  background: #0d131b;
  border: 1px solid #1e2634;
  border-radius: 18px;
  padding: 24px 18px 20px;
  /*
   * 断掉滚动链：弹层内容滚到尽头后继续拖拽时，默认会把滚动传给背景，
   * 表现为「弹层打开着，底下的首页却跟着动」。
   */
  overscroll-behavior: contain;
}
.close {
  position: absolute;
  top: 10px;
  right: 12px;
  appearance: none;
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
}
.title {
  margin: 0 0 6px;
  font-size: 18px;
  color: #e8c27a;
  letter-spacing: 2px;
  text-align: center;
}
.desc {
  margin: 0 0 4px;
  text-align: center;
  font-size: 13px;
  color: #8b97a8;
  line-height: 1.6;
}
/*
 * 截止日单独一行：它是「要在什么时候前回复」的硬信息，
 * 混在上一句里容易被读漏。
 * 字号与主说明一致（12px 太小、#6b7280 太暗，真机上几乎读不出来），
 * 颜色比主说明亮一档 —— 它是要紧信息，但仍不该盖过标题。
 */
.deadline {
  font-size: 13px;
  color: #9aa7b8;
  margin-bottom: 14px;
}
.stat {
  margin: 0 0 16px;
  text-align: center;
  font-size: 12.5px;
  color: #6f8f7d;
}
.ok {
  margin: 18px 0 8px;
  text-align: center;
  font-size: 44px;
}
/* 录屏模式提示：与整体一致的暗红警示调，但足够显眼 */
.replay-hint {
  margin: 16px 0 0;
  text-align: center;
  font-size: 11px;
  letter-spacing: 1px;
  color: #d99a6c;
  border-top: 1px dashed #3a3026;
  padding-top: 10px;
}

.done {
  appearance: none;
  width: 100%;
  margin-top: 18px;
  border: 1px solid #253044;
  background: #16202c;
  color: #e8e3d8;
  font-family: inherit;
  font-size: 15px;
  padding: 12px;
  border-radius: 11px;
  cursor: pointer;
}
</style>
