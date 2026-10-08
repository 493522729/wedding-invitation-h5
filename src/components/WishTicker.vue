<script setup lang="ts">
/**
 * 祝福跑马灯：终端文案打完之后，接管那块 180px 的空间。
 *
 * 为什么放在终端框里：宾客打开请柬第一眼就在页面最顶部，
 * 一条已有 N 位宾客留下祝福的社会证明直接影响报名率；
 * 而额外加一条横幅会占掉宝贵的高度（首屏本来就被终端占了三成）。
 * 复用同一块空间 = 零新增高度。
 *
 * 为什么要复制一份内容做无缝循环：CSS 动画把整组内容 translateY(-50%)
 * 移出去后，末尾与开头是同一条内容，视觉上完全接得上 —— 容器高度不变，
 * 没有滚到头突然跳回开头的断裂感。
 */
import { computed, onMounted, ref } from 'vue'
import { fetchWishes, type RsvpWish } from '../api/rsvp'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const wishes = ref<RsvpWish[]>([])
const loaded = ref(false)
/** 浮层是否展开 */
const wallOpen = ref(false)
/** 点击暂停：跑马灯正在动的时候没人能读完一句话 */
const paused = ref(false)

/** 拉取留言。抽成函数是为了让提交成功后能重新拉一遍 */
async function load() {
  try {
    const res = await fetchWishes()
    wishes.value = res.wishes
  } catch {
    // 拿不到就不显示 —— 宁可没有，不要一个空框或错误占位
    wishes.value = []
  } finally {
    loaded.value = true
  }
}

onMounted(load)

// 宾客提交祝福后由外部触发重拉，让自己的那句立刻出现在跑马灯里
// count 一并暴露：终端面板要靠它决定「留言够不够格切跑马灯」
defineExpose({ refresh: load, count: computed(() => wishes.value.length) })

/** 留言不足 4 条时不滚动：内容太少会看出循环痕迹 */
const scrollable = computed(() => wishes.value.length >= 4)

/**
 * 动画时长按条数算，让每条停留时间大致相同 ——
 * 写死秒数的话，10 条和 40 条的滚动速度会差很多。
 * 每条约 3.4 秒。
 */
const duration = computed(() => `${Math.max(12, wishes.value.length * 3.4)}s`)

/**
 * 单行高度，与CSS 里的 --row 保持一致。
 *
 * 34px 配13px 字号时行距是字号的 2.6 倍，真机上看松散得像散落的句子。
 * 收到 32px 后比例降到 2.1：仍然透气，但一眼能看出这是个列表。
 */
const rowHeight = 32

function togglePause() {
  paused.value = !paused.value
}

// 浮层打开时同样要锁住背景滚动（与报名弹层共用一套逻辑）
useBodyScrollLock(computed(() => wallOpen.value))
</script>

<template>
  <div v-if="loaded && wishes.length" class="wishes">
    <!-- 统计行：社会证明本身，也是浮层入口 -->
    <button class="w-head" type="button" @click="wallOpen = true">
      <span class="w-title">
        已有<b class="w-count">{{ wishes.length }}</b>位宾客留下祝福
      </span>
      <span class="w-more">全部 &rsaquo;</span>
    </button>

    <!-- 跑马灯本体。点击暂停，方便停下来读完一句 -->
    <div class="w-viewport" :class="{ paused, still: !scrollable }" @click="togglePause">
      <div
        class="w-track"
        :style="scrollable ? { animationDuration: duration, '--row': rowHeight + 'px' } : undefined"
      >
        <div class="w-group">
          <p v-for="(w, i) in wishes" :key="'a' + i" class="w-row">
            <b class="w-name">{{ w.name }}</b>
            <span class="w-note">{{ w.note }}</span>
          </p>
        </div>
        <!-- 第二份仅供无缝衔接，屏幕阅读器读不到 -->
        <div v-if="scrollable" class="w-group" aria-hidden="true">
          <p v-for="(w, i) in wishes" :key="'b' + i" class="w-row">
            <b class="w-name">{{ w.name }}</b>
            <span class="w-note">{{ w.note }}</span>
          </p>
        </div>
      </div>
    </div>

    <!-- 只在真正暂停时提示：留言不足 4 条时本来就不滚动，
     这时「点一下暂停」是句假话，点了也没反应 -->
    <p v-if="scrollable && paused" class="w-hint">已暂停，点一下继续</p>

    <!-- 祝福墙：跑马灯只能飘短句，想认真读完就点开这里 -->
    <Teleport to="body">
      <div v-if="wallOpen" class="w-mask" @click.self="wallOpen = false">
        <section class="w-sheet" role="dialog" aria-modal="true" aria-labelledby="w-wall-title">
          <!--
            头部固定，只有列表滚动。
            原来整个 sheet 是一个滚动容器，标题与关闭按钮都在里面 ——
            一翻页它们就跟着滚走，而这两个恰是浮层的「门把手」，
            滚到一半想关都关不掉。
          -->
          <header class="w-sheet-head">
            <h3 id="w-wall-title" class="w-sheet-title">大家的祝福</h3>
            <p class="w-sheet-sub">{{ wishes.length }} 条</p>
            <button class="w-close" type="button" aria-label="关闭" @click="wallOpen = false">×</button>
          </header>
          <ul class="w-list">
            <li v-for="(w, i) in wishes" :key="i" class="w-item">
              <b>{{ w.name }}</b>
              <p>{{ w.note }}</p>
            </li>
          </ul>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.wishes {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.w-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0 0 8px;
  font-family: inherit;
  color: #e8c27a;
  font-size: 13.5px;
  cursor: pointer;
  text-align: left;
}
.w-more {
  color: #8b97a8;
  font-size: 12.5px;
  flex: 0 0 auto;
}
/*
 * 人数单独用亮色。
 *
 * 整句都是同一个金色时，「已有 10 位」里的数字是淹没在文案里的 ——
 * 而这个数字恰恰是社会证明的核心（决定别人要不要跟着写）。
 * 提亮 + 加粗 + 略放大，让它一眼被看到。
 * 暖白而非纯白：纯白在金色旁边偏冷，暖调更贴请柬的整体配色。
 */
.w-count {
  color: #fff3d6;
  font-weight: 700;
  font-size: 1.16em;
  padding: 0 3px 0 2px;
  /* 等宽数字：条数变化时不会把后面的字挤得左右跳 */
  font-variant-numeric: tabular-nums;
}
/* 视口：固定高度，超出裁掉。上下淡出，让留言飘进飘出而不是被硬切 */
.w-viewport {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  /*
 * 上下渐隐各占 32%：原先 24% 时最后一行只露上半截，
 * 看起来像「文字坏了」而不是在飘。加长后过渡占 1.5 行，读起来是渐隐。
 */
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 32%, #000 68%, transparent);
  mask-image: linear-gradient(180deg, transparent, #000 32%, #000 68%, transparent);
  cursor: pointer;
}
.w-track {
  animation: w-scroll linear infinite;
  will-change: transform;
}
/*
 * 只认paused 类，不写 :hover。
 *
 * 移动端的 :hover 会「粘住」—— 触摸后该状态一直保持到下一次触摸别处，
 * 于是「点开祝福墙再关闭」之后，跑马灯就永久暂停了（真机反馈）。
 * 移动端没有真实 hover，暂停只应由点击显式切换。
 */
.w-viewport.paused .w-track {
  animation-play-state: paused;
}
/* 留言不足 4 条时干脆不滚，避免看出循环接缝 */
.w-viewport.still .w-track {
  animation: none;
}
.w-group {
  /* 底部留一行高度，让最后一条有空间飘出去 */
  padding-bottom: var(--row, 42px);
}
.w-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  height: var(--row, 32px);
  margin: 0;
  padding: 0;
  line-height: var(--row, 32px);
  /* 15px：真机截图里13px偏小，尤其是称呼部分 */
  font-size: 15px;
  color: #d6d2c8;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.w-name {
  color: #e8c27a;
  font-weight: 600;
  flex: 0 0 auto;
}
.w-note {
  /*
   * flex 子项截断三件套，少一个都不生效：
   *   min-width: 0    flex 子项默认 min-width:auto，不肯收缩到内容宽度以下
   *   white-space     不加它，长文本会**换行**而不是省略 —— 换行会把那一行
   *                   撑高，行与行之间就出现莫名其妙的大间隙（真机反馈）
   *   overflow+ellipsis负责画省略号
   * 完整留言在祝福墙浮层里可读，这里截断不影响获取。
   */
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.w-hint {
  flex: 0 0 auto;
  margin: 4px 0 0;
  font-size: 11px;
  color: #5f6a79;
  text-align: center;
}
/*
 * 位移 -50% 而不是具体像素：两组内容高度相同，移动一半就正好接上，
 * 且不论留言有多少条都成立。
 */
@keyframes w-scroll {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-50%);
  }
}

/* ---------- 浮层：与 RsvpSheet 同一套范式 ---------- */
.w-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(4, 7, 11, 0.72);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}
.w-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 420px;
  /* 关键：sheet 本身不滚动，只让 .w-list 滚。
     头部因此天然固定，不需要 position:sticky —— 固定定位在 flex 里
     反而要处理 z-index 与背景，拆成两段更省事也更稳。 */
  max-height: 82vh;
  overflow: hidden;
  /* 断掉滚动链，拖到底继续拖不会带动背景 */
  overscroll-behavior: contain;
  background: #0d131b;
  border: 1px solid #1e2634;
  border-radius: 18px;
  padding: 24px 18px 20px;
}
/* 头部：固定不动的标题与关闭按钮 */
.w-sheet-head {
  position: relative;
  flex: 0 0 auto;
  padding-bottom: 10px;
  border-bottom: 1px solid #18202c;
}
.w-close {
  position: absolute;
  /* 相对 .w-sheet-head 定位（头部是它的定位祖先） */
  top: -6px;
  right: -4px;
  appearance: none;
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
}
.w-sheet-title {
  margin: 0;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 2px;
  color: #e8c27a;
}
.w-sheet-sub {
  margin: 6px 0 4px;
  text-align: center;
  font-size: 12px;
  color: #6b7280;
}
.w-list {
  flex: 1 1 auto;
  /* 唯一可滚动区域：iOS 加 momentum 让惯性滚动更顺 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  list-style: none;
  margin: 0;
  padding: 0;
}
.w-item {
  padding: 11px 0;
  border-bottom: 1px solid #18202c;
}
.w-item:last-child {
  border-bottom: 0;
}
.w-item b {
  display: block;
  font-size: 13px;
  color: #e8c27a;
  margin-bottom: 4px;
}
.w-item p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: #d6d2c8;
  word-break: break-word;
}

/* 减少动态效果：跑马灯停下来逐条读，浮层照常可用 */
@media (prefers-reduced-motion: reduce) {
  .w-track {
    animation: none !important;
  }
  .w-viewport {
    -webkit-mask-image: none;
    mask-image: none;
    overflow-y: auto;
  }
}
</style>