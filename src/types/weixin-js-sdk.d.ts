/**
 * weixin-js-sdk 没有官方类型声明。
 * 这里只声明项目实际用到的 API 表面，未覆盖的方法不要臆造。
 */
declare module 'weixin-js-sdk' {
  /** wx.config 的签名参数，由服务端签名接口返回 */
  export interface WxConfigOptions {
    debug?: boolean
    appId: string
    timestamp: number
    nonceStr: string
    signature: string
    /** 需要授权的接口名列表 */
    jsApiList: string[]
  }

  /** 分享数据；success / fail 是 wx SDK 强制要求的回调 */
  export interface ShareData {
    title?: string
    desc?: string
    link?: string
    imgUrl?: string
    success?: () => void
    fail?: (err: unknown) => void
  }

  const wx: {
    config(options: WxConfigOptions): void
    ready(cb: () => void): void
    error(cb: (err: unknown) => void): void
    /** 更新「发送给朋友」卡片 */
    updateAppMessageShareData(data: ShareData): void
    /** 更新「分享到朋友圈」卡片 */
    updateTimelineShareData(data: ShareData): void
  }

  export default wx
}
