<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSurfDetector } from './model/use-surf-detector'

const video = ref<HTMLVideoElement>()
const canvas = ref<HTMLCanvasElement>()
const objectImage = ref<HTMLImageElement>()
const { detectAndMatch } = useSurfDetector()

onMounted(async () => {
  await initOpenCv()
  const stream = await navigator.mediaDevices.getUserMedia({ video: true })
  video.value!.srcObject = stream
})

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const img = new Image()
  img.src = URL.createObjectURL(file)
  img.onload = () => (objectImage.value = img)
}

function startDetection() {
  if (!objectImage.value) return alert('Загрузите образ')
  detectAndMatch(video.value!, canvas.value!, objectImage.value)
}
</script>

<template>
  <div>
    <video
      ref="video"
      autoplay
      playsinline
      class="hidden"
    />
    <canvas ref="canvas" />
    <input
      type="file"
      accept="image/*"
      @change="onFileChange"
    >
    <button @click="startDetection">
      Старт анализа
    </button>
  </div>
</template>
