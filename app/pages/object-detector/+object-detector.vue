<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSurfDetector } from './model/use-surf-detector'
import cvPromise, { type CV } from '@techstark/opencv-js'

const cv: CV = await cvPromise

const video = ref<HTMLVideoElement>()
const canvas = ref<HTMLCanvasElement>()
const objectImage = ref<HTMLImageElement>()
const isDetecting = ref(false)
const stream = ref<MediaStream>()
const { detectAndMatch } = useSurfDetector(cv)

onMounted(async () => {
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
    })
    video.value!.srcObject = stream.value
  }
  catch (error) {
    console.error('Error accessing camera:', error)
    alert('Не удалось получить доступ к камере')
  }
})

onUnmounted(() => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
  }
})

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const img = new Image()
  img.src = URL.createObjectURL(file)
  img.onload = () => (objectImage.value = img)
}

function startDetection() {
  if (!objectImage.value) {
    alert('Пожалуйста, загрузите образ для поиска')
    return
  }
  isDetecting.value = true
  detectAndMatch(video.value!, canvas.value!, objectImage.value)
}

function stopDetection() {
  isDetecting.value = false
  window.location.reload() // Simple way to stop the detection loop
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-4">
    <div class="max-w-6xl mx-auto">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          Детектор объектов
        </h1>
        <p class="text-gray-600">
          Загрузите изображение объекта и система будет искать его в реальном времени через камеру
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Camera Feed -->
        <div class="lg:col-span-2">
          <div class="bg-white rounded-lg shadow-md p-4">
            <h2 class="text-xl font-semibold mb-4">
              Видеопоток с камеры
            </h2>
            <div class="relative">
              <canvas
                ref="canvas"
                class="w-full border rounded-lg"
                width="640"
                height="480"
              />
              <video
                ref="video"
                autoplay
                playsinline
                muted
                class="hidden"
              />
            </div>
          </div>
        </div>

        <!-- Controls -->
        <div class="space-y-4">
          <div class="bg-white rounded-lg shadow-md p-4">
            <h2 class="text-xl font-semibold mb-4">
              Управление
            </h2>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Загрузить образ объекта
                </label>
                <input
                  type="file"
                  accept="image/*"
                  class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  @change="onFileChange"
                >
              </div>

              <div class="flex gap-2">
                <button
                  :disabled="isDetecting"
                  class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="startDetection"
                >
                  {{ isDetecting ? 'Анализ...' : 'Начать анализ' }}
                </button>

                <button
                  v-if="isDetecting"
                  class="bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700"
                  @click="stopDetection"
                >
                  Остановить
                </button>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow-md p-4">
            <h3 class="text-lg font-semibold mb-2">
              Информация
            </h3>
            <div class="text-sm text-gray-600 space-y-1">
              <p>• Используется алгоритм ORB для поиска устойчивых признаков</p>
              <p>• Зеленая рамка показывает найденный объект</p>
              <p>• Работает в реальном времени</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
