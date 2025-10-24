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
    const ctx = canvas.value.getContext('2d')
    if (!ctx) {
      return
    }

    canvas.value.width = video.value.videoWidth
    canvas.value.height = video.value.videoHeight
    ctx.drawImage(video.value, 0, 0)

    const src = cv.value.imread(canvas.value)
    const gray = new cv.value.Mat()
    cv.value.cvtColor(src, gray, cv.value.COLOR_RGBA2GRAY, 0)

    const faces = new cv.value.RectVector()
    const eyes = new cv.value.RectVector()

    faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0)

    for (let i = 0; i < faces.size(); ++i) {
      const faceRect = faces.get(i)
      cv.value.rectangle(src, faceRect, [255, 0, 0, 255], 2)

      const faceROI = gray.roi(faceRect)
      eyeCascade.detectMultiScale(faceROI, eyes, 1.1, 3, 0)

      for (let j = 0; j < eyes.size(); ++j) {
        const eyeRect = eyes.get(j)
        const eyeRectAbs = new cv.value.Rect(faceRect.x + eyeRect.x, faceRect.y + eyeRect.y, eyeRect.width, eyeRect.height)
        cv.value.rectangle(src, eyeRectAbs, [0, 255, 0, 255], 2)
      }

      eyes.delete()
      faceROI.delete()
    }

    cv.value.imshow(canvas.value, src)

    src.delete()
    gray.delete()
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

onMounted(async () => {
  try {
    const cvPromise = (await import('@techstark/opencv-js')).default
    cv.value = await cvPromise

    faceCascade = new cv.value.CascadeClassifier()
    eyeCascade = new cv.value.CascadeClassifier()

    const faceCascadeUrl = '/haarcascade_frontalface_default.xml'
    const eyeCascadeUrl = '/haarcascade_eye.xml'

    try {
      const faceLoaded = faceCascade.load(faceCascadeUrl)
      console.log('Face cascade loaded:', faceLoaded)
    }
    catch (error) {
      console.error('Error loading face cascade:', error)
    }

    try {
      const eyeLoaded = eyeCascade.load(eyeCascadeUrl)
      console.log('Eye cascade loaded:', eyeLoaded)
    }
    catch (error) {
      console.error('Error loading eye cascade:', error)
    }

    isLoaded.value = true
    await startWebcam()
  }
  catch (error) {
    console.error('Error during initialization:', error)
  }
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
            :disabled="!isLoaded"
            @click="toggleDetection"
          >
            {{ isDetecting ? 'Stop Detection' : 'Start Detection' }}
          </UButton>
          <UButton
            :disabled="!isLoaded"
            @click="stopWebcam"
          >
            Stop Webcam
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
