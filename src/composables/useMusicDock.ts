import { ref } from 'vue'

/**
 * 音乐按钮的呈现位置。
 *
 * 为什么要共享：悬浮按钮挂在 App.vue（全局，跨路由），
 * 而详情页要把音乐键收进底部报名栏（见 InviteView 的 rsvp-dock）。
 * 两处都要知道「现在该谁显示」，所以状态必须模块级共享，
 * 不能各组件自己存一份。
 *
 * 置位时机：InviteView 进入详情阶段（stage === 'done'）时为 true，
 * 离开该页面时必须复位 —— 否则从详情页进相册页后，
 * 悬浮按钮会一直消失，相册页就没法控制音乐了。
 */
const dockMode = ref(false)

export function useMusicDock() {
  return { dockMode }
}