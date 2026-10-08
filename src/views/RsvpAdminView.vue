<script setup lang="ts">
/**
 * 报名管理页（新人自己看名单用）。
 *
 * 口令不存前端，登录后由服务端签发 token 放在内存里 ——
 * 刷新页面即失效，避免 token 长期驻留在浏览器。
 */
import { computed, onMounted, ref } from 'vue'
import { exportUrl, fetchList, fetchStats, login, type RsvpEntry, type RsvpStats } from '../api/rsvp'

const password = ref('')
const token = ref('')
const entries = ref<RsvpEntry[]>([])
const stats = ref<RsvpStats | null>(null)

const loggingIn = ref(false)
const loading = ref(false)
const error = ref('')

const attending = computed(() => entries.value.filter((e) => e.attend))
const declined = computed(() => entries.value.filter((e) => !e.attend))

async function loadPublicStats() {
  try {
    stats.value = await fetchStats()
  } catch {
    // 统计拿不到不影响登录与管理，先静默处理
  }
}

async function onLogin() {
  if (!password.value || loggingIn.value) return
  loggingIn.value = true
  error.value = ''
  try {
    const res = await login(password.value)
    token.value = res.token
    password.value = ''
    await loadList()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loggingIn.value = false
  }
}

async function loadList() {
  if (!token.value) return
  loading.value = true
  try {
    const res = await fetchList(token.value)
    entries.value = res.entries
    stats.value = res.stats
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取失败'
    // token 失效则退回登录态
    if (e instanceof Error && e.message === '请先登录') token.value = ''
  } finally {
    loading.value = false
  }
}

/**
 * 把服务端存的 UTC 时间转成本地时区显示。
 *
 * 服务端用 toISOString() 存的是 **UTC**，而服务器时区是 Asia/Shanghai，
 * 直接显示会比真实时间早 8 小时（真机反馈「时间不太对劲」）。
 *
 * 旧数据的兼容：早期版本截断了末尾的 Z（`2026-10-06 06:15:44`），
 * 于是它既不带时区标记、也没地方标明它是 UTC —— 补一个 Z 才能正确转换。
 * 新数据已是完整 ISO，自带 Z，走第一个分支。
 */
function formatTime(s: string): string {
  if (!s) return ''
  const iso = s.includes('Z') ? s : s.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`
}

function onLogout() {
  token.value = ''
  entries.value = []
}

onMounted(loadPublicStats)
</script>

<template>
  <main class="page">
    <h1 class="title">婚礼报名名单</h1>

    <!-- 未登录：只显示公开统计，口令框在下面 -->
    <section v-if="!token" class="card">
      <p v-if="stats" class="stat">
        已有 <b>{{ stats.attending }}</b> 位宾客确认出席
        <template v-if="stats.people !== stats.attending">
          ，共 <b>{{ stats.people }}</b> 人
        </template>
      </p>
      <p v-else class="stat muted">正在读取统计…</p>

      <form class="login" @submit.prevent="onLogin">
        <label class="k" for="pwd">管理口令</label>
        <input
          id="pwd"
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="请输入口令"
        />
        <button class="btn primary" type="submit" :disabled="!password || loggingIn">
          {{ loggingIn ? '验证中…' : '查看名单' }}
        </button>
      </form>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
    </section>

    <!-- 已登录：名单 -->
    <template v-else>
      <section class="card bar">
        <div class="nums">
          <span>出席 <b>{{ attending.length }}</b></span>
          <span>缺席 <b>{{ declined.length }}</b></span>
          <span>总人数 <b>{{ stats?.people ?? 0 }}</b></span>
        </div>
        <div class="acts">
          <a class="btn small" :href="exportUrl(token)" download>导出 CSV</a>
          <button class="btn small ghost" @click="loadList">刷新</button>
          <button class="btn small ghost" @click="onLogout">退出</button>
        </div>
      </section>

      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <p v-if="loading" class="muted">读取中…</p>
      <p v-else-if="entries.length === 0" class="muted">还没有宾客报名。</p>

      <section v-for="group in [{ t: '出席', list: attending }, { t: '不出席', list: declined }]" :key="group.t">
        <h2 v-if="group.list.length" class="grp">
          {{ group.t }} <span class="cnt">{{ group.list.length }}</span>
        </h2>
        <ul v-if="group.list.length" class="list">
          <li v-for="e in group.list" :key="e.id" class="item">
            <div class="line1">
              <span class="nm">{{ e.name }}</span>
              <span class="ct">{{ e.count }} 位</span>
            </div>
            <p v-if="e.note" class="note">{{ e.note }}</p>
            <time class="at">{{ formatTime(e.createdAt) }}</time>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 26px 16px 60px;
  /*
   * 管理页是给自己用的工具页，信息密度高、还要长时间核对名单，
   * 宾客侧那层 0.58 的底图蒙版在这里不够 —— 再压一层近纯色的底，
   * 保证表格与文字的可读性。宾客侧的请柬页仍保留照片氛围。
   */
  background: rgba(9, 12, 18, 0.88);
  min-height: 100vh;
  /*
   * 必须用 dvh（动态视口高度），不能用 vh。
   * vh 在移动端指的是「地址栏完全展开时」的视口，比用户实际看到的
   * 区域高出一截（iPhone 上约 100px），于是页面「超高」而能上下滚动 ——
   * 内容只有终端那一点、本该刚好一屏，却出现了滚动条。
   * dvh 会把地址栏占位算进去，等于真实可见高度。
   * 前一行 100vh 是旧内核回退（不支持 dvh 时至少不塌陷）。
   */
  min-height: 100dvh;
}
.title {
  font-size: 20px;
  color: #e8c27a;
  letter-spacing: 2px;
  margin: 0 0 18px;
}
.card {
  background: #0e141d;
  border: 1px solid #1e2634;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 16px;
}
.stat {
  margin: 0 0 14px;
  font-size: 14px;
  color: #c8d0dc;
}
.stat b {
  color: #39d98a;
  font-size: 17px;
}
.muted {
  color: #6b7280;
  font-size: 13px;
}
.login {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.k {
  font-size: 12px;
  color: #8b97a8;
}
input {
  appearance: none;
  background: #10151d;
  border: 1px solid #253044;
  border-radius: 10px;
  color: #f2f4f7;
  font-family: inherit;
  /* 16px 是 iOS 的硬阈值：小于它聚焦时会自动放大整个页面。
     与 RsvpForm 的输入框同规格，别因为「看起来偏大」而调小。 */
  font-size: 16px;
  padding: 11px 12px;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}
.nums {
  display: flex;
  gap: 14px;
  font-size: 13px;
  color: #8b97a8;
}
.nums b {
  color: #e8e3d8;
  font-size: 16px;
}
.acts {
  display: flex;
  gap: 8px;
}
.btn {
  appearance: none;
  border: 1px solid #253044;
  background: #16202c;
  color: #e8e3d8;
  font-family: inherit;
  font-size: 14px;
  padding: 12px;
  border-radius: 11px;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
}
.btn.primary {
  background: linear-gradient(90deg, #39d98a, #2ea66c);
  color: #04130b;
  border: 0;
  font-weight: 600;
}
.btn.small {
  padding: 7px 12px;
  font-size: 12.5px;
  border-radius: 9px;
}
.btn.ghost {
  background: transparent;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.err {
  color: #e88a8a;
  font-size: 13px;
}
.grp {
  font-size: 14px;
  color: #c8d0dc;
  margin: 20px 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.cnt {
  font-size: 11px;
  color: #6b7280;
  border: 1px solid #253044;
  border-radius: 999px;
  padding: 1px 7px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  background: #0e141d;
  border: 1px solid #1e2634;
  border-radius: 11px;
  padding: 11px 13px;
}
.line1 {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}
.nm {
  color: #f2f4f7;
  font-size: 15px;
}
.ct {
  color: #39d98a;
  font-size: 13px;
  flex: 0 0 auto;
}
.note {
  margin: 7px 0 0;
  color: #a8b2c1;
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.at {
  display: block;
  margin-top: 7px;
  color: #5b6675;
  font-size: 11px;
}
</style>
