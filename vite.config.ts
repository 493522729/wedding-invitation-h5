import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 报名接口的联调目标（仅本地 dev server 用）。
 *
 * 缺了这段代理，本地 fetch('/rsvp-api/stats') 会直接打到 dev server 上，
 * 拿到 400/404 —— 接口明明是好的，却像是后端挂了。
 * 生产环境由 nginx 以 /rsvp-api 前缀反代，所以本地照着转发到同一路径即可。
 *
 * ⚠️ 默认指向生产：**本地填的报名会写进线上真实名单**。
 * 填一遍验证联调没问题；反复测表单请起一份本地后端并覆盖这个变量：
 *   RSVP_TARGET=http://127.0.0.1:8787 npm run dev
 */
const RSVP_TARGET = process.env.RSVP_TARGET || 'http://127.0.0.1:9201'

// 部署在 /wedding 子路径，故 base 为 '/wedding/'（末尾斜杠不能省）
// 若部署到域名根路径，把下面改成 '/'
export default defineConfig({
  plugins: [vue()],
  base: '/wedding/',
  server: {
    proxy: {
      //匹配的是 fetch 里的绝对路径 /rsvp-api/*，不含 base 前缀
      '/rsvp-api': {
        target: RSVP_TARGET,
        changeOrigin: true,
      },
    },
  },
})