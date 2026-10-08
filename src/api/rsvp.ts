/**
 * RSVP 报名接口客户端。
 *
 * 服务端与请柬同域（由nginx 以 /rsvp-api 前缀反代），
 * 因此不存在跨域，浏览器也不会带 Origin。
 */

/** 与部署的后端保持一致：nginx 里的 location 前缀 */
const BASE = '/rsvp-api'

export interface RsvpStats {
  /** 提交总条数 */
  total: number
  /** 选择出席的条数 */
  attending: number
  /** 选择不出席的条数 */
  declined: number
  /** 出席总人数（各条 count 之和） */
  people: number
}

export interface RsvpEntry {
  id: string
  name: string
  count: number
  attend: boolean
  note: string
  createdAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || '请求失败')
  return data
}

/** 公开统计：只有数字，不含任何宾客信息 */
export function fetchStats(): Promise<RsvpStats> {
  return request<RsvpStats>('/stats')
}

export function submitRsvp(input: {
  name: string
  count: number
  attend: boolean
  note?: string
  /** 是否公开展示在请柬上。缺省按true 处理（与后端一致） */
  wishPublic?: boolean
}): Promise<{ ok: true; stats: RsvpStats }> {
  return request('/submit', { method: 'POST', body: JSON.stringify(input) })
}

/** 公开祝福留言。刻意只有称呼与正文两个字段 */
export interface RsvpWish {
  name: string
  note: string
}

export function fetchWishes(): Promise<{ wishes: RsvpWish[]; count: number }> {
  return request('/wishes')
}

export function login(password: string): Promise<{ ok: true; token: string }> {
  return request('/login', { method: 'POST', body: JSON.stringify({ password }) })
}

export function fetchList(token: string): Promise<{ entries: RsvpEntry[]; stats: RsvpStats }> {
  return request('/list?token=' + encodeURIComponent(token))
}

/** 导出 CSV。token 走查询参数，浏览器直接下载 */
export function exportUrl(token: string): string {
  return BASE + '/export?token=' + encodeURIComponent(token)
}
