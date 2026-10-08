<script setup lang="ts">
import { onMounted } from 'vue'
import { photos } from './config/wedding'
import MusicToggle from './components/MusicToggle.vue'
import ClickDiag from './components/ClickDiag.vue'

/**
 * 底图与蒙版都在 CSS 里（body::before 的 background-image），
 * 照片地址由下方注入 --page-bg 变量，避免在样式表里写死部署 base。
 *
 * 曾经改用 <img> + object-fit 来解决 iOS 地址栏收起导致的
 * 「下滚放大、上滚缩回」，但 <img> 有固有宽高比，在灯箱（viewerjs）
 * 里会被容器裁切，出现「照片跑到底图下面」的观感问题。
 * 权衡之后恢复 CSS 方案：灯箱显示完整比背景缩放平顺更重要。
 */
onMounted(() => {
  /*
   * 选 p01 而非刮卡用的 scratch：p01 是两人并排的合照，横版但主体居中，
   * 铺成整屏背景时「有内容」而非只有剪影，氛围更贴合请柬。
   * 找不到 p01 时退回刮卡底图，保证背景不会整个消失。
   */
  const bgPhoto = photos.gallery.find((p) => p.id === 'p01') ?? photos.gallery[0]
  const bgUrl = bgPhoto ? bgPhoto.display : photos.scratch
  document.documentElement.style.setProperty('--page-bg', `url(${bgUrl})`)

  /*
   * 提前预取相册页的代码分块。
   *
   * 路由用的是动态 import（代码分割），首次点「查看全部」时
   * 才去下载 AlbumView 的 chunk（52KB JS + 1.6KB CSS）。
   * 微信内置浏览器里一次往返要100–500ms，路由会一直等 chunk
   * 就绪才切换，宾客看到的就是「点了没反应」。
   *
   * 为什么用 requestIdleCallback：首屏正在加载图片和跑打字动画，
   * 这时抢带宽会拖慢 LCP。等浏览器空闲再预取，既有时间又不动用
   * 首屏带宽。宾客通常要滚到轮播区才点「查看全部」，
   * 那时预取早已完成，点击是瞬时的。
   */
  const prefetch = () => {
    // 动态 import 会被 Vite 识别为同一 chunk，这里只是「提前触发下载」
    void import('./views/AlbumView.vue')
  }

  if ('requestIdleCallback' in window) {
    ;(window as Window & { requestIdleCallback: (cb: () => void, o?: object) => void })
      .requestIdleCallback(prefetch, { timeout: 3000 })
  } else {
    // 老 WebView 没有 requestIdleCallback，退化为延后执行
    setTimeout(prefetch, 2000)
  }
})
</script>

<template>
  <router-view />
  <!--
    音乐按钮挂在 App 层而非页面里：
    邀请页 ↔ 相册页切换时音乐不中断，按钮也不会在切页时闪烁。
  -->
  <MusicToggle />
  <!-- 仅在 URL 带 ?clickdiag=1 时渲染，正式访客看不到 -->
  <ClickDiag />
</template>
