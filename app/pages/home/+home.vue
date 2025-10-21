<script setup lang="ts">

import { ref, onMounted } from 'vue'

declare const cv: any

const video = ref<HTMLVideoElement>()
const canvas = ref<HTMLCanvasElement>()
const stream = ref<MediaStream | null>(null)
let faceCascade: cv.CascadeClassifier | null = null
let eyeCascade: cv.CascadeClassifier | null = null

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
  if (!video.value || !canvas.value || !faceCascade || !eyeCascade) return

  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  canvas.value.width = video.value.videoWidth
  canvas.value.height = video.value.videoHeight
  ctx.drawImage(video.value, 0, 0)

  const src = cv.imread(canvas.value)
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0)

  const faces = new cv.RectVector()
  const eyes = new cv.RectVector()

  faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0)

  for (let i = 0; i < faces.size(); ++i) {
    const faceRect = faces.get(i)
    cv.rectangle(src, faceRect, [255, 0, 0, 255], 2)

    const faceROI = gray.roi(faceRect)
    eyeCascade.detectMultiScale(faceROI, eyes, 1.1, 3, 0)

    for (let j = 0; j < eyes.size(); ++j) {
      const eyeRect = eyes.get(j)
      const eyeRectAbs = new cv.Rect(faceRect.x + eyeRect.x, faceRect.y + eyeRect.y, eyeRect.width, eyeRect.height)
      cv.rectangle(src, eyeRectAbs, [0, 255, 0, 255], 2)
    }

    eyes.delete()
    faceROI.delete()
  }

  cv.imshow(canvas.value, src)

  src.delete()
  gray.delete()
  faces.delete()
}

onMounted(() => {
  // Load OpenCV
  const script = document.createElement('script')
  script.src = 'https://docs.opencv.org/4.5.2/opencv.js'
  script.onload = async () => {
    console.log('OpenCV loaded')

    // Load cascades
    faceCascade = new cv.CascadeClassifier()
    eyeCascade = new cv.CascadeClassifier()

    const faceCascadeUrl = 'https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml'
    const eyeCascadeUrl = 'https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_eye.xml'

    const faceResponse = await fetch(faceCascadeUrl)
    const faceBuffer = await faceResponse.arrayBuffer()
    const faceData = new Uint8Array(faceBuffer)
    faceCascade.load(faceData)

    const eyeResponse = await fetch(eyeCascadeUrl)
    const eyeBuffer = await eyeResponse.arrayBuffer()
    const eyeData = new Uint8Array(eyeBuffer)
    eyeCascade.load(eyeData)

    console.log('Cascades loaded')
  }
  document.head.appendChild(script)
})
</script>

<template>
  <UContainer>
     <UPage>
      <h1 class="text-2xl font-bold mb-4">
      Face and Eye Detection
    </h1>
    <div class="mb-4">
      <button
        class="bg-blue-500 text-white px-4 py-2 rounded mr-2"
        @click="startWebcam"
      >
        Start Webcam
      </button>
      <button
        class="bg-red-500 text-white px-4 py-2 rounded mr-2"
        @click="stopWebcam"
      >
        Stop Webcam
      </button>
      <button
        class="bg-green-500 text-white px-4 py-2 rounded"
        @click="detectFacesAndEyes"
      >
        Detect Faces & Eyes
      </button>
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