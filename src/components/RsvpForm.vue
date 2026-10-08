<script setup lang="ts">
/**
 * 报名表单（宾客侧）。
 *
 * 只收姓名、人数、是否出席与一句备注，不问手机号——
 * 微信里让宾客填手机号的意愿很低，问了反而是负担，也徒增隐私风险。
 */
import { computed, ref } from 'vue'
import { submitRsvp, type RsvpStats } from '../api/rsvp'
import { DEFAULT_WISHES } from '../config/wedding'

const emit = defineEmits<{
  (e: 'done', stats: RsvpStats): void
}>()

const name = ref('')
const count = ref(1)
const attend = ref<true | false>(true)
const note = ref('')
/**
 * 留言是否公开展示在请柬上。
 * 默认勾选：跑马灯是请柬的氛围担当，空着不好看；
 * 但必须让宾客能主动取消 —— 有人只想对新人说，并不想被公开展示。
 */
const wishPublic = ref(true)

const submitting = ref(false)
const error = ref('')

/** 与后端校验保持一致：这里先拦一道，避免白跑一趟 */
const nameValid = computed(() => {
  const v = name.value.trim()
  return v.length > 0 && v.length <= 20
})
const countValid = computed(() => count.value >= 1 && count.value <= 20)
const canSubmit = computed(() => nameValid.value && countValid.value && !submitting.value)

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = ''
  try {
    // 没留言就替他写一句：空着提交会让请柬顶部的跑马灯断档
    const typed = note.value.trim()
    const finalNote = typed || DEFAULT_WISHES[Math.floor(Math.random() * DEFAULT_WISHES.length)]
    const res = await submitRsvp({
      name: name.value.trim(),
      count: count.value,
      attend: attend.value,
      note: finalNote,
      wishPublic: wishPublic.value,
    })
    emit('done', res.stats)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '提交失败，请稍后再试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="rsvp-form" novalidate @submit.prevent="onSubmit">
    <label class="f">
      <span class="k">贵姓</span>
      <input
        v-model="name"
        type="text"
        maxlength="20"
        placeholder="怎么称呼您"
        autocomplete="name"
        :aria-invalid="name.length > 0 && !nameValid"
      />
    </label>

    <fieldset class="f">
      <legend class="k">出席</legend>
      <div class="seg">
        <button
          type="button"
          class="opt"
          :class="{ on: attend === true }"
          :aria-pressed="attend === true"
          @click="attend = true"
        >
          出席
        </button>
        <button
          type="button"
          class="opt"
          :class="{ on: attend === false }"
          :aria-pressed="attend === false"
          @click="attend = false"
        >
          遗憾缺席
        </button>
      </div>
    </fieldset>

    <label v-if="attend" class="f">
      <span class="k">几位</span>
      <div class="stepper">
        <button type="button" aria-label="减少" :disabled="count <= 1" @click="count--">−</button>
        <input v-model.number="count" type="number" min="1" max="20" inputmode="numeric" />
        <button type="button" aria-label="增加" :disabled="count >= 20" @click="count++">+</button>
      </div>
    </label>

    <label class="f">
      <span class="k">想说的话<span class="opt-hint">（可不填）</span></span>
      <textarea v-model="note" maxlength="100" rows="2" placeholder="不填的话，我们替你写一句"></textarea>
    </label>

    <label class="f">
      <span class="check">
        <input v-model="wishPublic" type="checkbox" />
        <span>把这句话展示在请柬的祝福墙上</span>
      </span>
      <span v-if="wishPublic" class="opt-hint">取消勾选则只有新人能看到</span>
    </label>

    <p v-if="error" class="err" role="alert">{{ error }}</p>

    <button class="submit" type="submit" :disabled="!canSubmit">
      {{ submitting ? '提交中…' : '送出祝福' }}
    </button>
  </form>
</template>

<style scoped>
.rsvp-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.f {
  display: flex;
  flex-direction: column;
  gap: 7px;
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.k {
  font-size: 12px;
  color: #8b97a8;
  letter-spacing: 1px;
  padding: 0;
}
.opt-hint {
  color: #6b7280;
  font-size: 11px;
}
/*
 * 公开展示勾选。
 *
 * checkbox 的 font-size 必须 >= 16px —— 与输入框同一个坑：
 * iOS 聚焦时字号小于 16px 会自动放大整个页面，勾选框虽小，
 * 但它一旦被点中同样会触发缩放。
 */
.check {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: #b9c3d0;
  cursor: pointer;
  user-select: none;
}
.check input {
  appearance: none;
  width: 20px;
  height: 20px;
  margin: 0;
  flex: 0 0 auto;
  border: 1px solid #3a4658;
  border-radius: 6px;
  background: #10151d;
  /* appearance:none 之后 input 仍保留默认 padding，会把设定的 20px 撑到 26px */
  padding: 0;
  font-size: 16px;
  display: grid;
  place-content: center;
  cursor: pointer;
}
/* 用伪元素画对勾：避免额外引入字体图标，也避免checkbox 默认勾在部分内核里显示成灰块 */
.check input:checked {
  background: linear-gradient(135deg, #e8c27a, #d9a441);
  border-color: #e8c27a;
}
.check input:checked::after {
  content: '';
  width: 10px;
  height: 5px;
  border-left: 2px solid #1a1206;
  border-bottom: 2px solid #1a1206;
  transform: rotate(-45deg) translate(1px, -1px);
}
input,
textarea {
  appearance: none;
  width: 100%;
  box-sizing: border-box;
  background: #10151d;
  border: 1px solid #253044;
  border-radius: 10px;
  color: #f2f4f7;
  font-family: inherit;
  /*
   * 16px 是硬下限，不能为了「和正文同级」而调小。
   * iOS（含微信内置浏览器）在聚焦输入框时，若字号小于 16px
   * 会自动放大整个页面 —— 宾客点一下「怎么称呼您」就被拦腰放大，
   * 键盘遮住输入框、还得手动缩回去，报名流程直接断在那里。
   * 这个行为不受 touch-action 控制（禁不掉 pinch-zoom 也拦不住它），
   * 唯一的解法就是把字号提到 16px 及以上。
   */
  font-size: 16px;
  padding: 11px 12px;
}
textarea {
  resize: none;
  line-height: 1.5;
}
input::placeholder,
textarea::placeholder {
  color: #5b6675;
}
input[aria-invalid='true'] {
  border-color: #d94f4f;
}
.seg {
  display: flex;
  gap: 8px;
}
.opt {
  flex: 1;
  appearance: none;
  border: 1px solid #253044;
  background: #10151d;
  color: #8b97a8;
  font-family: inherit;
  font-size: 14px;
  padding: 11px 8px;
  border-radius: 10px;
  cursor: pointer;
}
.opt.on {
  border-color: #e8c27a;
  color: #e8c27a;
  background: #1a1710;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stepper button {
  appearance: none;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border: 1px solid #253044;
  background: #10151d;
  color: #f2f4f7;
  font-size: 20px;
  line-height: 1;
  border-radius: 10px;
  cursor: pointer;
}
.stepper button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.stepper input {
  text-align: center;
  flex: 1;
  min-width: 0;
}
.err {
  margin: 0;
  font-size: 13px;
  color: #e88a8a;
}
.submit {
  appearance: none;
  border: 0;
  background: linear-gradient(135deg, #e8c27a, #d9a441);
  color: #1a1206;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
  padding: 13px;
  border-radius: 12px;
  cursor: pointer;
}
.submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
