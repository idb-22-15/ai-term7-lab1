<script setup lang="ts">
import type { CV, CascadeClassifier } from '@techstark/opencv-js'
import { ref, onMounted } from 'vue'

const cv = ref<CV | null>(null)

onMounted(async () => {

})

const video = ref<HTMLVideoElement>()
const canvas = ref<HTMLCanvasElement>()
const stream = ref<MediaStream | null>(null)
const isLoaded = ref(false)
let faceCascade: CascadeClassifier | null = null
let eyeCascade: CascadeClassifier | null = null

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
}

const detectFacesAndEyes = () => {
  if (!cv.value) return

  console.log('Detect called')
  if (!video.value || !canvas.value) {
    console.log('Video or canvas not ready')
    return
  }
  if (!faceCascade || !eyeCascade) {
    console.log('Cascades not loaded')
    return
  }
  if (typeof cv.value === 'undefined') {
    console.log('CV not loaded')
    return
  }
  if (video.value.videoWidth === 0 || video.value.videoHeight === 0) {
    console.log('Video not ready')
    return
  }

  try {
    const ctx = canvas.value.getContext('2d')
    if (!ctx) {
      console.log('No 2d context')
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
    console.log('Faces detected:', faces.size())

    for (let i = 0; i < faces.size(); ++i) {
      const faceRect = faces.get(i)
      cv.value.rectangle(src, faceRect, [255, 0, 0, 255], 2)

      const faceROI = gray.roi(faceRect)
      eyeCascade.detectMultiScale(faceROI, eyes, 1.1, 3, 0)
      console.log('Eyes in face', i, ':', eyes.size())

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

onMounted(async () => {
  // Load OpenCV
  const cvPromise = (await import('@techstark/opencv-js')).default

  console.log('OpenCV loaded', cvPromise)
  cv.value = await cvPromise
  console.log('OpenCV cv loaded', cv)

  // Load cascades

  faceCascade = new cv.value.CascadeClassifier()
  eyeCascade = new cv.value.CascadeClassifier()

  const faceCascadeUrl = '/haarcascade_frontalface_default.xml'
  const eyeCascadeUrl = '/haarcascade_eye.xml'

  const faceResponse = await fetch(faceCascadeUrl)
  const faceBuffer = await faceResponse.arrayBuffer()
  const faceData = new Uint8Array(faceBuffer)
  faceCascade.load(faceData)

  const eyeResponse = await fetch(eyeCascadeUrl)
  const eyeBuffer = await eyeResponse.arrayBuffer()
  const eyeData = new Uint8Array(eyeBuffer)
  eyeCascade.load(eyeData)

  console.log('Cascades loaded')
  isLoaded.value = true
})
</script>

<template>
  <UContainer>
    <UPage>
      <h1 class="text-2xl font-bold mb-4">
        Face and Eye Detection
      </h1>
      <div class="mb-4">
        <UButton
          @click="startWebcam"
        >
          Start Webcam
        </UButton>
        <UButton
          @click="stopWebcam"
        >
          Stop Webcam
        </UButton>
        <UButton
          @click="detectFacesAndEyes"
        >
          Detect Faces & Eyes
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
</template>
