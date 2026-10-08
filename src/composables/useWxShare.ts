import { share, photos } from '../config/wedding'
import type { WxConfigOptions, ShareData } from 'weixin-js-sdk'

/** 只在微信内置浏览器里才需要 SDK */
function inWeChat(): boolean {
  return /micromessenger/i.test(navigator.userAgent)
}

/**
 * 微信自定义分享卡片。
 * 需要三件外部条件，缺任一则静默降级为「透明分享」（靠 index.html 的 OG meta）：
 *   1. 公众号后台配置 JS 接口安全域名
 *   2. 环境变量 VITE_WX_SIGN_API 指向服务端签名接口
 *   3. 服务端持有 AppSecret 并计算 signature
 */
export function useWxShare() {
  async function setup() {
    const api = import.meta.env.VITE_WX_SIGN_API
    // 本地开发未配置签名接口时直接跳过，避免控制台刷 404
    if (!api || !inWeChat()) return

    try {
      // 分享链接需去掉 hash，否则签名校验会失败
      const url = location.href.split('#')[0]
      const res = await fetch(`${api}?url=${encodeURIComponent(url)}`)
      if (!res.ok) return
      const { appId, timestamp, nonceStr, signature } = (await res.json()) as Omit<
        WxConfigOptions,
        'jsApiList' | 'debug'
      >

      // SDK 约 20KB，非微信环境完全用不上，按需加载不进主 chunk
      const { default: wx } = await import('weixin-js-sdk')

      wx.config({
        debug: false,
        appId,
        timestamp,
        nonceStr,
        signature,
        // 只列当前仍可用的接口。
        // onMenuShareAppMessage / onMenuShareTimeline 早已下架，
        // 留在列表里会让部分微信版本直接 config 失败。
        jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
      })

      // 微信 SDK 类型要求 success 回调必须显式传入
      const noop = () => {}
      // imgUrl 必须是绝对地址，缩略图按微信要求不小于 300×300
      const base: Omit<ShareData, 'title'> = {
        link: url,
        imgUrl: new URL(photos.cover, location.origin).href,
        success: noop,
      }

      wx.ready(() => {
        wx.updateAppMessageShareData({ ...base, title: share.title, desc: share.desc })
        // 朋友圈卡片标题有长度上限，用单独准备的短句，避免被截断
        wx.updateTimelineShareData({ ...base, title: share.timelineTitle })
      })
      wx.error((err: unknown) => {
        console.warn('[wedding] wx.config 失败，回退透明分享', err)
      })
    } catch (e) {
      console.warn('[wedding] 初始化微信分享失败，回退透明分享', e)
    }
  }

  return { setup }
}
