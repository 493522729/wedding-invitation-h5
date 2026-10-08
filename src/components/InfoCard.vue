<script setup lang="ts">
import { computed } from 'vue'
import { info } from '../config/wedding'

/**
 * 宾客信息卡：data-driven 渲染。
 * 新增条目只需往 rows 里加一项，无需改模板。
 */
interface Row {
  ic: string
  k: string
  v: string
  sub?: string
}

const rows = computed<Row[]>(() => [
  { ic: '🕛', k: 'TIME 时间', v: `${info.signIn} · ${info.seat}` },
  { ic: '📍', k: 'VENUE 地点', v: `${info.hotel} · ${info.hall}`, sub: info.address },
  // { ic: '📞', k: 'CONTACT 联系人', v: `伴郎 ${info.bestManTel} · 伴娘 ${info.maidTel}` },
  { ic: '🅿️', k: 'PARKING 停车', v: info.parking },
])
</script>

<template>
  <div class="card">
    <div v-for="r in rows" :key="r.k" class="row">
      <div class="ic">{{ r.ic }}</div>
      <div>
        <div class="k">{{ r.k }}</div>
        <div class="v">
          {{ r.v }}
          <small v-if="r.sub">{{ r.sub }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  /* 同终端：半透明兜底 + backdrop-filter，毛玻璃让底图透进来 */
  background: rgba(17, 22, 31, 0.66);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  margin: 14px 16px;
  padding: 16px;
}
.row {
  display: flex;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px dashed #1e2634;
}
.row:last-child { border-bottom: 0; }
.ic {
  font-size: 18px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}
.k {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 3px;
}
.v {
  font-size: 14.5px;
  font-weight: 600;
}
.v small {
  display: block;
  font-weight: 400;
  color: #6b7280;
  font-size: 12px;
  margin-top: 2px;
}
</style>
