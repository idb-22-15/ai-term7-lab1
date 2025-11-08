<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSurfDetector, type DetectorControls } from './model/use-surf-detector'
import cvPromise, { type CV } from '@techstark/opencv-js'

const cv: CV = await cvPromise

const video = ref<HTMLVideoElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const objectCanvas = ref<HTMLCanvasElement | null>(null)
const matchCanvas = ref<HTMLCanvasElement | null>(null)
const objectImage = ref<HTMLImageElement | null>(null)
const objectImagePreview = ref<string>('')
const isDetecting = ref(false)
const isCameraLoading = ref(true)
const isCameraReady = ref(false)
const cameraError = ref<string>('')
const stream = ref<MediaStream>()
const { detectAndMatch } = useSurfDetector(cv)

let detectorControls: DetectorControls | null = null
let videoFeedId: number | null = null

onMounted(async () => {
  await initializeCamera()
})

onUnmounted(() => {
  cleanup()
})

/**
 * Очищает все активные ресурсы при размонтировании компонента
 * Останавливает видеопоток, детектор и анимационные кадры
 */
function cleanup() {
  // Останавливаем все треки видеопотока
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
  }
  // Останавливаем детектор объектов
  if (detectorControls) {
    detectorControls.stop()
    detectorControls = null
  }
  // Отменяем анимационный кадр для отображения видео
  if (videoFeedId !== null) {
    cancelAnimationFrame(videoFeedId)
    videoFeedId = null
  }
}

/**
 * Инициализирует камеру и настраивает видеопоток
 * Запрашивает доступ к камере, устанавливает размеры canvas и начинает отображение видео
 * @throws {Error} При ошибке доступа к камере
 */
async function initializeCamera() {
  try {
    isCameraLoading.value = true
    cameraError.value = ''

    // Запрашиваем доступ к камере
    stream.value = await navigator.mediaDevices.getUserMedia({ video: true })

    if (video.value) {
      video.value.srcObject = stream.value

      // Устанавливаем обработчики событий видео
      video.value.onloadedmetadata = () => {
        // Устанавливаем размеры canvas точно соответствующие видео
        if (canvas.value && video.value!.videoWidth > 0 && video.value!.videoHeight > 0) {
          canvas.value.width = video.value!.videoWidth
          canvas.value.height = video.value!.videoHeight
        }
      }

      video.value.oncanplay = () => {
        video.value!.play()
      }

      video.value.oncanplaythrough = () => {
        isCameraReady.value = true
        isCameraLoading.value = false
        // Начинаем отображение видеопотока сразу после готовности камеры
        showVideoFeed()
      }
    }
  }
  catch (error) {
    console.error('Error accessing camera:', error)
    isCameraLoading.value = false
    isCameraReady.value = false

    // Обрабатываем различные типы ошибок доступа к камере
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

/**
 * Обрабатывает загрузку файла изображения объекта
 * Создает превью, извлекает ключевые точки ORB и отображает их на canvas
 * @param e - Событие изменения input file
 */
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

    // Сразу рисуем ключевые точки на canvas объекта
    if (objectCanvas.value && img.naturalWidth && img.naturalHeight) {
      const maxWidth = 300
      const maxHeight = 300
      let width = img.naturalWidth
      let height = img.naturalHeight

      // Масштабируем изображение если необходимо
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = width * ratio
        height = height * ratio
      }

      objectCanvas.value.width = width
      objectCanvas.value.height = height

      // Сразу рисуем ключевые точки используя OpenCV
      try {
        // Конвертируем изображение в формат OpenCV Mat
        const objectMat = cv.imread(img)
        const objectGray = new cv.Mat()
        cv.cvtColor(objectMat, objectGray, cv.COLOR_RGBA2GRAY)

        // Создаем детектор ORB и извлекаем ключевые точки
        const detector = new cv.ORB()
        const objKp = new cv.KeyPointVector()
        const objDesc = new cv.Mat()
        detector.detectAndCompute(objectGray, new cv.Mat(), objKp, objDesc)

        // Рисуем ключевые точки
        const objectDisplay = objectMat.clone()
        // Красный цвет в BGR формате для OpenCV
        cv.drawKeypoints(objectGray, objKp, objectDisplay, [0, 0, 255, 255])
        cv.imshow(objectCanvas.value, objectDisplay)

        // Очищаем память OpenCV
        objectDisplay.delete()
        objectMat.delete()
        objectGray.delete()
        objKp.delete()
        objDesc.delete()
        detector.delete()
      }
      catch (error) {
        console.error('Error drawing keypoints:', error)
        // Запасной вариант: просто рисуем изображение
        const ctx = objectCanvas.value.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
      }
    }
  }
}

/**
 * Запускает процесс детекции объектов
 * Проверяет готовность системы и начинает анализ видеопотока с использованием ORB
 */
function startDetection() {
  if (!objectImage.value) {
    alert('Пожалуйста, загрузите образ для поиска')
    return
  }
  if (!isCameraReady.value) {
    alert('Камера не готова')
    return
  }
  if (!video.value || !canvas.value) return

  // Убеждаемся что видео воспроизводится и имеет корректные размеры
  if (video.value.paused || video.value.ended) {
    video.value.play().catch((err) => {
      console.error('Failed to play video:', err)
      alert('Не удалось запустить видео')
    })
    return
  }

  // Ждем немного для стабилизации видео
  setTimeout(() => {
    if (!video.value || !canvas.value) return

    // Убеждаемся что видео действительно воспроизводится и имеет размеры
    console.log('Starting detection with video dimensions:', video.value.videoWidth, 'x', video.value.videoHeight)

    if (video.value.videoWidth === 0 || video.value.videoHeight === 0) {
      alert('Видео еще не готово. Попробуйте еще раз.')
      return
    }

    // Устанавливаем размеры canvas точно соответствующие видео
    canvas.value.width = video.value.videoWidth
    canvas.value.height = video.value.videoHeight

    // Останавливаем отображение видеопотока чтобы избежать конфликтов
    if (videoFeedId !== null) {
      cancelAnimationFrame(videoFeedId)
      videoFeedId = null
    }

    isDetecting.value = true

    // Запускаем детекцию с canvas объекта и canvas совпадений
    detectorControls = detectAndMatch(
      video.value,
      canvas.value,
      objectImage.value,
      objectCanvas.value || undefined,
      matchCanvas.value || undefined,
    )
  }, 500) // Увеличенная задержка для лучшей стабилизации
}

/**
 * Отображает видеопоток на canvas в реальном времени
 * Используется когда детекция не активна для показа живого видео
 */
function showVideoFeed() {
  if (!video.value || !canvas.value) return

  const ctx = canvas.value.getContext('2d')!
  const drawFrame = () => {
    // Прерываем отрисовку если камера не готова или началась детекция
    if (!isCameraReady.value || isDetecting.value) return
    ctx.drawImage(video.value!, 0, 0, canvas.value!.width, canvas.value!.height)
    videoFeedId = requestAnimationFrame(drawFrame)
  }
  drawFrame()
}

/**
 * Останавливает процесс детекции объектов
 * Прекращает анализ и возобновляет отображение обычного видеопотока
 */
function stopDetection() {
  isDetecting.value = false

  // Останавливаем детектор
  if (detectorControls) {
    detectorControls.stop()
    detectorControls = null
  }

  // Возобновляем отображение видеопотока
  showVideoFeed()
}

/**
 * Повторно инициализирует камеру после ошибки
 * Используется для повторной попытки подключения к камере
 */
function retryCamera() {
  initializeCamera()
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-4">
    <div class="max-w-6xl mx-auto">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          Детектор объектов (ORB)
        </h1>
        <p class="text-gray-600">
          Загрузите изображение объекта и система будет искать его в реальном времени через камеру.
          Маркеры отображаются на видео и эталоне, а линии показывают совпадения.
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Camera Feed -->
        <div>
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

        <!-- Right side: Object and Controls -->
        <div class="space-y-4">
          <!-- Object Reference Canvas -->
          <div class="bg-white rounded-lg shadow-md p-4">
            <h2 class="text-xl font-semibold mb-4">
              Эталонное изображение
            </h2>
            <div
              v-if="objectImage"
              class="flex items-center justify-center border rounded-lg bg-gray-50 min-h-[200px]"
            >
              <canvas
                ref="objectCanvas"
                class="max-w-full"
              />
            </div>
            <div
              v-else
              class="flex items-center justify-center border rounded-lg bg-gray-50 min-h-[200px]"
            >
              <p class="text-gray-400 text-sm">
                Загрузите изображение объекта
              </p>
            </div>
          </div>

          <!-- Controls -->
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
              <div
                v-if="isDetecting"
                class="text-sm text-green-600 bg-green-50 p-2 rounded"
              >
                ✓ Детектирование активно. Маркеры отображаются на видео и эталоне.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Match Visualization (full width below) -->
      <div
        v-if="isDetecting"
        class="mt-6"
      >
        <div class="bg-white rounded-lg shadow-md p-4">
          <h2 class="text-xl font-semibold mb-4">
            Визуализация совпадений
          </h2>
          <p class="text-sm text-gray-600 mb-3">
            Зелёные линии - лучшие совпадения (топ-10), жёлтые - хорошие совпадения.
            Красные маркеры - эталон, голубые - обнаруженные на видео.
          </p>
          <div class="overflow-x-auto border rounded-lg bg-gray-50">
            <canvas
              ref="matchCanvas"
              class="max-w-full"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
