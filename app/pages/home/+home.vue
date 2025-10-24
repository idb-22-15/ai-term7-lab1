<script setup lang="ts">
import type { CV, CascadeClassifier } from '@techstark/opencv-js'
import { ref, onMounted, onBeforeUnmount } from 'vue'

const cv = ref<CV | null>(null)
const video = ref<HTMLVideoElement>()
const canvas = ref<HTMLCanvasElement>()
const stream = ref<MediaStream | null>(null)
const isLoaded = ref(false)
const isDetecting = ref(false)
let faceCascade: CascadeClassifier | null = null
let eyeCascade: CascadeClassifier | null = null
let detectionLoopId: number | null = null

const startWebcam = async () => {
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({ video: true })
    if (video.value) {
      video.value.srcObject = stream.value
    }
  }
  catch (error) {
    console.error('Error accessing webcam:', error)
  }
}

const stopWebcam = () => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = null
  }
  isDetecting.value = false
  if (detectionLoopId !== null) {
    cancelAnimationFrame(detectionLoopId)
    detectionLoopId = null
  }
}

const toggleWebcam = () => {
  if (stream.value) {
    stopWebcam()
  }
  else {
    startWebcam()
  }
}

const detectFacesAndEyes = () => {
  if (!cv.value) return

  if (!video.value || !canvas.value) {
    return
  }
  if (!faceCascade || !eyeCascade) {
    return
  }
  if (typeof cv.value === 'undefined') {
    return
  }
  if (video.value.videoWidth === 0 || video.value.videoHeight === 0) {
    return
  }

  try {
    const ctx = canvas.value.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      return
    }

    canvas.value.width = video.value.videoWidth
    canvas.value.height = video.value.videoHeight
    ctx.drawImage(video.value, 0, 0)

    const src = cv.value.imread(canvas.value)
    const gray = new cv.value.Mat()
    cv.value.cvtColor(src, gray, cv.value.COLOR_RGBA2GRAY, 0)

    const small = new cv.value.Mat()
    cv.value.resize(gray, small, new cv.value.Size(gray.cols / 2, gray.rows / 2))

    const faces = new cv.value.RectVector()
    const eyes = new cv.value.RectVector()

    faceCascade.detectMultiScale(small, faces, 1.15, 4, 0, new cv.value.Size(30, 30))

    for (let i = 0; i < faces.size(); ++i) {
      const faceRect = faces.get(i)
      const x1 = faceRect.x * 2
      const y1 = faceRect.y * 2
      const x2 = x1 + faceRect.width * 2
      const y2 = y1 + faceRect.height * 2

      const pt1 = new cv.value.Point(x1, y1)
      const pt2 = new cv.value.Point(x2, y2)
      cv.value.rectangle(src, pt1, pt2, [255, 0, 0, 255], 2)

      const scaledFace = new cv.value.Rect(x1, y1, faceRect.width * 2, faceRect.height * 2)
      const faceROI = gray.roi(scaledFace)
      eyeCascade.detectMultiScale(faceROI, eyes, 1.1, 4, 0, new cv.value.Size(15, 15))

      for (let j = 0; j < eyes.size(); ++j) {
        const eyeRect = eyes.get(j)
        const eyeX1 = x1 + eyeRect.x
        const eyeY1 = y1 + eyeRect.y
        const eyeX2 = eyeX1 + eyeRect.width
        const eyeY2 = eyeY1 + eyeRect.height

        const eyePt1 = new cv.value.Point(eyeX1, eyeY1)
        const eyePt2 = new cv.value.Point(eyeX2, eyeY2)
        cv.value.rectangle(src, eyePt1, eyePt2, [0, 255, 0, 255], 2)
      }

      eyes.delete()
      faceROI.delete()
    }

    cv.value.imshow(canvas.value, src)

    src.delete()
    gray.delete()
    small.delete()
    faces.delete()
  }
  catch (error) {
    console.error('Detection error:', error)
  }
}

const toggleDetection = () => {
  if (!isDetecting.value) {
    isDetecting.value = true
    const loop = () => {
      if (isDetecting.value) {
        detectFacesAndEyes()
        detectionLoopId = requestAnimationFrame(loop)
      }
    }
    loop()
  }
  else {
    isDetecting.value = false
    if (detectionLoopId !== null) {
      cancelAnimationFrame(detectionLoopId)
      detectionLoopId = null
    }
  }
}

const loadOpenCV = async () => {
  const cvPromise = (await import('@techstark/opencv-js')).default
  return await cvPromise
}

const loadCascadeClassifier = async (cvInstance: CV, url: string, filename: string): Promise<CascadeClassifier> => {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  const data = new Uint8Array(buffer)
  cvInstance.FS_createDataFile('/', filename, data, true, false, false)

  const classifier = new cvInstance.CascadeClassifier()
  classifier.load(filename)
  return classifier
}

const initializeApp = async () => {
  try {
    cv.value = await loadOpenCV()

    faceCascade = await loadCascadeClassifier(
      cv.value,
      '/haarcascade_frontalface_default.xml',
      'haarcascade_frontalface_default.xml'
    )

    eyeCascade = await loadCascadeClassifier(
      cv.value,
      '/haarcascade_eye.xml',
      'haarcascade_eye.xml'
    )

    isLoaded.value = true
  }
  catch (error) {
    console.error('Error during initialization:', error)
  }
}

onMounted(() => {
  initializeApp()
})

onBeforeUnmount(() => {
  stopWebcam()
})
</script>

<template>
  <ClientOnly>
    <UContainer>
      <UPage>
        <h1 class="text-2xl font-bold mb-4">
          Face and Eye Detection
        </h1>
        <div class="mb-4 space-x-2">
          <UButton
            :disabled="!isLoaded || !stream"
            @click="toggleDetection"
          >
            {{ isDetecting ? 'Stop Detection' : 'Start Detection' }}
          </UButton>
          <UButton
            :disabled="!isLoaded"
            @click="toggleWebcam"
          >
            {{ stream ? 'Stop Webcam' : 'Start Webcam' }}
          </UButton>
        </div>
        <div class="flex space-x-4">
          <video
            ref="video"
            autoplay
            playsinline
            class="border"
          />
          <canvas
            ref="canvas"
            class="border"
          />
        </div>
      </UPage>
    </UContainer>
  </ClientOnly>
</template>
