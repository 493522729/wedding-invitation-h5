/// <reference types="vite/client" />

/**
 * .vue 单文件组件的模块声明。
 * 缺了它 vue-tsc 会报 "Cannot find module './views/Xxx.vue'"，
 * 而 vite build 本身能过（esbuild 不做类型检查）—— 属于静默失败。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

/**
 * 补充项目自己的环境变量类型。
 * ImportMetaEnv 由 vite/client 声明为可扩展接口，此处合并而非覆盖。
 */
interface ImportMetaEnv {
  /**
   * 微信 JS-SDK 签名接口地址，形如 `https://your-domain.com/api/wx-sign`。
   * 不配置时分享静默降级为 index.html 的 OG 透明分享。
   */
  readonly VITE_WX_SIGN_API?: string
}
