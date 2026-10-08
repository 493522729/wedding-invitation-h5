import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * 路由说明
 *
 * 用 hash 模式（`/wedding/#/album`）而非 history：nginx 只需 `try_files` 一条，
 * 刷新 /album 不会 404，也不用额外配 URL rewrite —— 部署最省事。
 * 微信内分享 hash 地址同样正常工作。
 *
 * base 必须传 import.meta.env.BASE_URL（即 /wedding/）：
 * 不传则 hash 里的 base 为空，部署到子路径后刷新或直接访问 #/album 会路由到 /
 * 而落到站点外的页面去。hash 模式下这个值只影响 base 推导，不产生额外路径层级。
 */
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'invite',
      component: () => import('../views/InviteView.vue'),
    },
    {
      path: '/album',
      name: 'album',
      component: () => import('../views/AlbumView.vue'),
    },
    // 报名管理页：新人自己看名单，宾客误入也看不到内容（需口令）
    {
      path: '/rsvp',
      name: 'rsvp',
      component: () => import('../views/RsvpAdminView.vue'),
    },
    // 兜底：未知路径回首页，避免出现空白页
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  /**
   * 返回详情页时恢复原滚动位置：宾客在照片区点「查看全部」进相册，
   * 返回后应该还停在照片区，而不是被甩到页面顶部或底部。
   * 离开前把 scrollY 存进 history.state，浏览器自带返回优先用它。
   */
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition
    if (to.name === 'invite' && from.name === 'album') {
      const y = Number((window.history.state as { scrollY?: number } | null)?.scrollY)
      if (Number.isFinite(y) && y > 0) return { top: y }
    }
    return { top: 0 }
  },
})

/** 离开页面「前」记录当前滚动位置，供 scrollBehavior 恢复 */
router.beforeEach((_to, _from) => {
  if (window.history.state) {
    window.history.replaceState(
      { ...window.history.state, scrollY: window.scrollY },
      ''
    )
  }
})

export default router
