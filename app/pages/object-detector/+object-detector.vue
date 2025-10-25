<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSurfDetector } from './model/use-surf-detector'
import cvPromise, { type CV } from '@techstark/opencv-js'

const cv: CV = await cvPromise

const video = ref<HTMLVideoElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const objectImage = ref<HTMLImageElement | null>(null)
const objectImagePreview = ref<string>('')
const isDetecting = ref(false)
const isCameraLoading = ref(true)
const isCameraReady = ref(false)
const cameraError = ref<string>('')
const stream = ref<MediaStream>()
const { detectAndMatch } = useSurfDetector(cv)

onMounted(async () => {
  await initializeCamera()
})

onUnmounted(() => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
  }
})

async function initializeCamera() {
  try {
    isCameraLoading.value = true
    cameraError.value = ''

    stream.value = await navigator.mediaDevices.getUserMedia({ video: true })

    if (video.value) {
      video.value.srcObject = stream.value
      video.value.onloadedmetadata = () => {
        // Set canvas size to match video
        if (canvas.value) {
          canvas.value.width = video.value!.videoWidth
          canvas.value.height = video.value!.videoHeight
        }
        video.value!.play()
      }
      video.value.oncanplay = () => {
        isCameraReady.value = true
        isCameraLoading.value = false
        // Start showing video feed immediately when camera is ready
        showVideoFeed()
      }
    }
  }
  catch (error) {
    console.error('Error accessing camera:', error)
    isCameraLoading.value = false
    isCameraReady.value = false

    const err = error as Error & { name: string }
    if (err.name === 'NotAllowedError') {
      cameraError.value = 'Доступ к камере запрещен. Разрешите доступ в настройках браузера.'
    }
    else if (err.name === 'NotFoundError') {
      cameraError.value = 'Камера не найдена.'
    }
    else if (err.name === 'NotReadableError') {
      cameraError.value = 'Камера используется другим приложением.'
    }
    else {
      cameraError.value = 'Ошибка доступа к камере: ' + err.message
    }
  }
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) {
    objectImagePreview.value = ''
    objectImage.value = null
    return
  }

  const img = new Image()
  const url = URL.createObjectURL(file)
  objectImagePreview.value = url

  img.src = url
  img.onload = () => {
    objectImage.value = img
  }
}

function startDetection() {
  if (!objectImage.value) {
    alert('Пожалуйста, загрузите образ для поиска')
    return
  }
  if (!isCameraReady.value) {
    alert('Камера не готова')
    return
  }
  isDetecting.value = true
  // Start detection - video is already showing
  detectAndMatch(video.value!, canvas.value!, objectImage.value)
}

function showVideoFeed() {
  if (!video.value || !canvas.value) return

  const ctx = canvas.value.getContext('2d')!
  const drawFrame = () => {
    if (!isCameraReady.value) return
    ctx.drawImage(video.value!, 0, 0, canvas.value!.width, canvas.value!.height)
    requestAnimationFrame(drawFrame)
  }
  drawFrame()
}

function stopDetection() {
  isDetecting.value = false
  // Clear canvas
  if (canvas.value) {
    const ctx = canvas.value.getContext('2d')!
    ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
  }
}

function retryCamera() {
  initializeCamera()
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
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-semibold">
                Видеопоток с камеры
              </h2>
              <div class="flex items-center gap-2">
                <div
                  class="w-3 h-3 rounded-full"
                  :class="{
                    'bg-gray-400': isCameraLoading,
                    'bg-green-500': isCameraReady && !cameraError,
                    'bg-red-500': cameraError,
                  }"
                />
                <span class="text-sm text-gray-600">
                  {{ isCameraLoading ? 'Загрузка...' : isCameraReady ? 'Готово' : 'Ошибка' }}
                </span>
              </div>
            </div>

            <div class="relative">
              <canvas
                ref="canvas"
                class="w-full border rounded-lg"
                width="640"
                height="480"
                :class="{ 'opacity-50': !isCameraReady }"
              />
              <video
                ref="video"
                autoplay
                playsinline
                muted
                class="hidden"
              />

              <!-- Camera status overlay -->
              <div
                v-if="isCameraLoading"
                class="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg"
              >
                <div class="text-center">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
                  <p class="text-gray-600">
                    Подключение к камере...
                  </p>
                </div>
              </div>

              <div
                v-else-if="cameraError"
                class="absolute inset-0 flex items-center justify-center bg-red-50 rounded-lg"
              >
                <div class="text-center p-4">
                  <div class="text-red-500 mb-2">
                    ⚠️
                  </div>
                  <p class="text-red-700 mb-4">
                    {{ cameraError }}
                  </p>
                  <button
                    class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                    @click="retryCamera"
                  >
                    Повторить попытку
                  </button>
                </div>
              </div>
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

                <!-- Image preview -->
                <div
                  v-if="objectImagePreview"
                  class="mt-3"
                >
                  <p class="text-sm text-gray-600 mb-2">
                    Превью загруженного изображения:
                  </p>
                  <img
                    :src="objectImagePreview"
                    alt="Object preview"
                    class="w-full h-32 object-cover rounded-lg border"
                  >
                </div>
              </div>

              <div class="flex gap-2">
                <button
                  :disabled="isDetecting || !isCameraReady || !objectImage"
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

              <!-- Status messages -->
              <div
                v-if="!isCameraReady && !isCameraLoading"
                class="text-sm text-red-600 bg-red-50 p-2 rounded"
              >
                Камера недоступна. Проверьте разрешения и попробуйте перезагрузить страницу.
              </div>
              <div
                v-if="!objectImage"
                class="text-sm text-orange-600 bg-orange-50 p-2 rounded"
              >
                Загрузите изображение объекта для начала анализа.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
