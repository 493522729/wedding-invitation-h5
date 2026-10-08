<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useConfetti } from '../composables/useConfetti'

/** 彩带画布：ref 收在组件内部，只对外暴露 launch() */
const canvasRef = useTemplateRef<HTMLCanvasElement>('confetti')
const { launch } = useConfetti(canvasRef)

defineExpose({ launch })
</script>

<template>
  <canvas ref="confetti" class="confetti" aria-hidden="true"></canvas>
</template>

<style scoped>
.confetti {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 40;
}
</style>
