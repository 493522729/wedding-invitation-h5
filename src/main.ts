import { createApp } from 'vue'
import 'viewerjs/dist/viewer.css'
import App from './App.vue'
import router from './router'
import './style.css'

/**
 * 说明：v-viewer 已从依赖中移除。
 *
 * 原因：v-viewer 3.x 的 <v-viewer> 组件在 Vue3 下依赖编译期 slot 解析，
 * 实测点击后完全不初始化（无 overlay 生成、控制台零报错），
 * 常见写法 `app.use(VueViewer)` 还会因该包没有带 install 的默认导出而静默失败。
 * 改用其底层实现 viewerjs 直接调用，功能一致且行为可控。
 */
const app = createApp(App)
app.use(router)
app.mount('#app')

/**
 * 禁掉双指捏合缩放与双击放大 —— 作为 CSS 的兜底，不是主力。
 *
 * 主力是 style.css 里的 `html { touch-action: pan-x pan-y }`：
 * 它在浏览器决定手势的**第一步**就拦住，不依赖任何 JS 时序，最可靠。
 * 之所以还要这一层：iOS 微信对 touch-action 的执行并不完全可靠，
 * 实测纯 CSS 时仍有**偶发**漏窗（宾客两指一捏就把整页放大，
 * 版面撑坏且他自己都很难复原）。
 *
 * 为什么不能用 meta user-scalable=no：iOS 10 之后微信直接忽略它，
 * 写了等于没写。
 *
 * 为什么不用 touch-action: pan-y 兜底：pan-y 不含横向平移，会连带禁掉
 * 首页照片轮播的左右滑动（.track 靠的正是横向触摸滚动），那是页面的
 * 核心交互，不能砸。
 *
 * 注意：**不再为灯箱放行**。touch-action 沿祖先链取交集，
 * html 层禁掉 pinch-zoom 后，灯箱里的浏览器级捏合也一并禁掉了 ——
 * 放行写成死代码反而会误导后来人。灯箱仍可缩放：viewerjs 自带的
 * +/- 按钮与它内部的双击逻辑不依赖浏览器 zoom，走的是 touch 事件。
 *
 * 代价（知情后接受）：视力障碍用户不能再放大页面，违反 WCAG 1.4.4。
 * 对请柬这类视觉密集的单页，缩放本来就会撑坏版面，宾客的实际收益
 * 远大于无障碍损失。
 */
function guardPinchZoom() {
  // 双指手势：阻止默认行为即取消捏合
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) e.preventDefault()
    },
    { passive: false }
  )

  // iOS Safari / WKWebView 专属：捏合的起手事件。
  // 比 touchstart 更靠前，单独拦这一道才够稳（只拦 touchstart 时
  // 实测仍有几率在双指落下的瞬间已经开始缩放）。
  document.addEventListener(
    'gesturestart',
    (e) => {
      e.preventDefault()
    },
    { passive: false }
  )

  /*
   * 双击放大（Smart Zoom）的兜底拦截。
   *
   * touch-action: pan-x pan-y 理论上已经禁掉它，但这个手势是 iOS
   * 特有的，桌面 Chromium 根本不存在，**无法在本地验证是否真被禁**，
   * 只能靠真机确认。而实测在 iOS 微信里仍有漏网，所以再拦一道。
   *
   * 做法：两次触摸结束间隔小于 300ms 就 preventDefault 掉第二次
   * touchend 的默认行为 —— double-tap zoom 正是由这个序列触发的。
   *
   * 误伤评估：只拦「300ms 内第二次触摸」这一个默认行为，click 事件
   * 仍会正常派发，所以快速连点两个不同按钮不会失效；灯箱的拖拽与
   * 双击缩放走自己的 touch 事件处理，preventDefault 不阻止事件传播、
   * 只阻止浏览器 zoom，因此同样不受影响。
   */
  let lastTouchEndAt = 0
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now()
      if (now - lastTouchEndAt < 300) e.preventDefault()
      lastTouchEndAt = now
    },
    { passive: false }
  )
}

guardPinchZoom()
