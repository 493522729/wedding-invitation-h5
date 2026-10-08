/**
 * 婚礼 RSVP（报名）服务
 *
 * 与请柬同域部署，由 nginx 以 /rsvp-api 前缀反代到本服务，
 * 因此前端不需要处理跨域。
 *
 * 设计取舍：
 *  - 只收「姓名 + 人数 + 是否出席」，不碰手机号。宾客在微信里填
 *    手机号的意愿很低，收集了反而是负担，也徒增隐私风险。
 *  - 名单存JSON 文件而非数据库。婚礼规模下就是几十到几百条记录，
 *    单文件足够，且能直接备份、可人工查看。
 *  - 管理口令只存 scrypt 哈希，明文不落盘。登录后签发短期 token。
 *  - 提交接口按 IP 限流，避免被刷出成百上千条假记录。
 *
 * 环境变量：
 *   PORT          监听端口（容器内 9201）
 *   DATA_FILE     名单文件路径（挂载卷持久化）
 *   ADMIN_SALT    管理口令的盐
 *   ADMIN_HASHscrypt 后的口令哈希（hex）
 *   TRUST_PROXY   是否信任 X-Forwarded-For（经 nginx 反代时为 1）
 */

const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const PORT = Number(process.env.PORT) || 9201
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'rsvp.json')
const TRUST_PROXY = process.env.TRUST_PROXY === '1'
const ADMIN_SALT = process.env.ADMIN_SALT || ''
const ADMIN_HASH = process.env.ADMIN_HASH || ''
/** 管理会话有效期：2 小时，够看完名单又不长期有效 */
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000
/** 同一 IP 10 分钟内最多提交次数 */
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

/* ---------- 数据存取 ---------- */

/** 内存中的名单，写入时同步落盘（数据量小，够用且避免并发写坏文件） */
let entries = []
/** token -> 过期时间戳 */
const sessions = new Map()
/** ip -> 最近提交时间戳数组 */
const rateLog = new Map()

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    entries = Array.isArray(parsed.entries) ? parsed.entries : []
  } catch {
    // 首次启动还没有文件是正常情况
    entries = []
  }
}

function persist() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  const tmp = DATA_FILE + '.tmp'
  // 先写临时文件再改名：避免写入途中崩溃留下半个损坏的 JSON
  fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2))
  fs.renameSync(tmp, DATA_FILE)
}

/* ---------- 工具 ---------- */

function send(res, status, body, extraHeaders) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v)
  }
  res.end(JSON.stringify(body))
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for']
    if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      // 报名信息只有几十字节，上限卡到 4KB 足够
      if (size > (limitBytes || 4096)) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (size === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('JSON 解析失败'))
      }
    })
    req.on('error', reject)
  })
}

function verifyPassword(input) {
  if (!ADMIN_SALT || !ADMIN_HASH || !input) return false
  const calc = crypto.scryptSync(String(input), ADMIN_SALT, 32).toString('hex')
  // 定长比较，避免通过响应时间侧信道逐字节猜出口令
  const a = Buffer.from(calc, 'hex')
  const b = Buffer.from(ADMIN_HASH, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function isRateLimited(ip) {
  const now = Date.now()
  const hits = (rateLog.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_LIMIT) {
    rateLog.set(ip, hits)
    return true
  }
  hits.push(now)
  rateLog.set(ip, hits)
  // 定期清理过期 IP，避免长期运行时无限增长
  if (rateLog.size > 5000) {
    for (const [k, v] of rateLog) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateLog.delete(k)
    }
  }
  return false
}

function validToken(token) {
  if (!token) return false
  const exp = sessions.get(token)
  if (!exp) return false
  if (Date.now() > exp) {
    sessions.delete(token)
    return false
  }
  return true
}

function stats() {
  const yes = entries.filter((e) => e.attend)
  const no = entries.filter((e) => !e.attend)
  return {
    total: entries.length,
    attending: yes.length,
    declined: no.length,
    people: yes.reduce((sum, e) => sum + (e.count || 1), 0),
  }
}

/**
 * 把存的 UTC 时间转成本地时间字符串。
 *
 * 服务端在 Asia/Shanghai 时区运行，直接输出 UTC 会比真实时间早 8 小时，
 * 导出的表格拿给新人看时对不上「谁先谁后」。旧数据没有 Z，补上再解析。
 */
function toLocalTime(s) {
  if (!s) return ''
  const iso = s.includes('Z') ? s : s.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return s
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

/** 生成 CSV。加BOM，Excel 打开中文不乱码 */
function toCsv() {
  const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"'
  const rows = [['提交时间', '姓名', '人数', '是否出席', '备注', '留言公开展示']]
  for (const e of entries) {
    rows.push([
      toLocalTime(e.createdAt),
      e.name,
      e.count,
      e.attend ? '出席' : '不出席',
      e.note || '',
      // 老数据没有这个字段时按「公开」记，与 /wishes 的口径保持一致
      e.wishPublic === false ? '否' : '是',
    ])
  }
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

/* ---------- 路由 ---------- */

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const route = url.pathname.replace(/^\/rsvp-api/, '') || '/'

  // 报名页与请柬同源，这里允许 CORS 只对白名单域名开放；
  // 实际部署在同域下，浏览器不会带 Origin，因此保持不输出即可。
  if (req.method === 'OPTIONS') return send(res, 204, {})

  /* 公开接口：只回统计数字，不含任何宾客信息 */
  if (route === '/stats' && req.method === 'GET') {
    return send(res, 200, stats())
  }

  /*
   * 公开祝福留言：给请柬顶部的跑马灯与祝福墙用。
   *
   * 隐私边界（刻意只回两个字段）：
   *   返回 name + note，**不返回** 人数、是否出席、提交时间、id。
   * 公开展示只需要称呼和留言本身，多给一个字段就多泄露一分 ——
   * 尤其「是否出席」和「带几个人」是最不该公开的信息。
   *
   * wishPublic === false 的不返回（宾客在表单里勾了「不公开」）。
   * 判false 而不是判true：老数据没有这个字段，按默认公开处理。
   *
   * 最新在最前：宾客打开请柬看到的是刚写下的那几条，
   * 更有「现在正在发生」的参与感。
   */
  if (route === '/wishes' && req.method === 'GET') {
    const wishes = entries
      .filter((e) => e.wishPublic !== false && (e.note || '').trim())
      .map((e) => ({ name: e.name, note: e.note }))
      .reverse()
    return send(res, 200, { wishes, count: wishes.length })
  }

  /* 提交报名 */
  if (route === '/submit' && req.method === 'POST') {
    const ip = clientIp(req)
    if (isRateLimited(ip)) {
      return send(res, 429, { error: '提交过于频繁，请稍后再试' })
    }

    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { error: e.message })
    }

    const name = String(body.name || '').trim()
    const count = Number(body.count)
    const attend = body.attend === true
    const note = String(body.note || '').trim().slice(0, 100)
    /*
     * 留言是否公开展示在请柬上。
     * 默认展示：表单里的勾选框是默认勾上的，宾客主动取消才传 false。
     * 写成 `=== false` 而不是 `Boolean(body.x)`，是为了让「字段缺失」
     * 与「显式取消」区分开 —— 老数据没有这个字段，按默认展示处理。
     */
    const wishPublic = body.wishPublic === false ? false : true

    if (!name) return send(res, 400, { error: '请填写姓名' })
    if (name.length > 20) return send(res, 400, { error: '姓名过长' })
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return send(res, 400, { error: '人数需在 1-20 之间' })
    }

    const entry = {
      id: crypto.randomUUID(),
      name,
      count,
      attend,
      note,
      wishPublic,
      /*
       * 存**带时区标记的** UTC ISO（末尾的 Z 不能截掉）。
       *
       * 原先slice(0,19) 把 Z 截了，于是这个值既不带时区、也没地方标明
       * 它是 UTC —— 管理页只能原样显示，比真实时间早 8 小时（服务器在
       * Asia/Shanghai，toISOString() 给的是 UTC，真机反馈「时间不对」）。
       * 带上 Z 之后前端才能正确转成本地时区显示。
       * 秒也保留：核对多条记录的先后顺序时需要它。
       */
      createdAt: new Date().toISOString(),
    }
    entries.push(entry)
    persist()

    return send(res, 200, { ok: true, stats: stats() })
  }

  /* 管理登录 */
  if (route === '/login' && req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { error: e.message })
    }
    if (!verifyPassword(body.password)) {
      // 稍作延迟，让暴力破解的成本高一些
      await new Promise((r) => setTimeout(r, 300))
      return send(res, 401, { error: '口令不正确' })
    }
    const token = crypto.randomBytes(24).toString('hex')
    sessions.set(token, Date.now() + TOKEN_TTL_MS)
    return send(res, 200, { ok: true, token, expireAt: Date.now() + TOKEN_TTL_MS })
  }

  /* 名单 */
  if (route === '/list' && req.method === 'GET') {
    if (!validToken(url.searchParams.get('token'))) {
      return send(res, 401, { error: '请先登录' })
    }
    return send(res, 200, { entries, stats: stats() })
  }

  /* 导出 CSV */
  if (route === '/export' && req.method === 'GET') {
    if (!validToken(url.searchParams.get('token'))) {
      return send(res, 401, { error: '请先登录' })
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', 'attachment; filename="wedding-rsvp.csv"')
    res.end(toCsv())
    return
  }

  /* 健康检查 */
  if (route === '/health' && req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      count: entries.length,
      adminConfigured: Boolean(ADMIN_SALT && ADMIN_HASH),
    })
  }

  return send(res, 404, { error: '接口不存在' })
}

load()
http
  .createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('[rsvp] 未捕获异常', e)
      if (!res.headersSent) send(res, 500, { error: '内部错误' })
    })
  })
  .listen(PORT, () => {
    console.log('[rsvp] listening on ' + PORT + ', data: ' + DATA_FILE)
  })
