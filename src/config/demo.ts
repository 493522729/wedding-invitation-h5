/**
 * 演示（录屏）模式。
 *
 * URL 带 ?demo=1 时，以下「一次性」行为全部按「每次都重来」处理：
 *   - 刮卡：忽略已解锁标记，进入就是刮卡界面（否则解锁过一次就永远跳过）
 *   - 报名：忽略「您已经报过名了」的本地锁定，每次都是空白表单
 *
 * 为什么用 URL 参数而不是给个按钮：录屏时要能反复重录，
 * 手动清 localStorage 容易忘也容易漏（清完还得重开页面）。
 * 参数写在地址栏里，录完直接删掉即恢复正常。
 *
 * 注意：此模式**照常往真实后端写数据**，只是不读取本地标记。
 * 想录又不污染线上名单，请让 dev server 指向本地后端：
 *   node server/rsvp-server.cjs
 *   RSVP_TARGET=http://127.0.0.1:9201 npm run dev
 *
 * 提示条会显示在页面上，防止录完忘记关这个参数。
 */
export const demoMode = new URLSearchParams(location.search).has('demo')
