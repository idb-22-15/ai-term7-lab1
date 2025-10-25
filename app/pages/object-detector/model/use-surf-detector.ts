import cv from '@techstack/opencv-js'

export function useSurfDetector() {
  function detectAndMatch(video: HTMLVideoElement, canvas: HTMLCanvasElement, objectImg: HTMLImageElement) {
    const ctx = canvas.getContext('2d')!
    const cap = new cv.VideoCapture(video)
    const frame = new cv.Mat(video.height, video.width, cv.CV_8UC4)

    const objectMat = cv.imread(objectImg)
    const objectGray = new cv.Mat()
    cv.cvtColor(objectMat, objectGray, cv.COLOR_RGBA2GRAY)

    const detector = new cv.ORB()
    const objKp = new cv.KeyPointVector()
    const objDesc = new cv.Mat()
    detector.detectAndCompute(objectGray, new cv.Mat(), objKp, objDesc)

    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true)

    function process() {
      cap.read(frame)
      const gray = new cv.Mat()
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY)

      const kp = new cv.KeyPointVector()
      const desc = new cv.Mat()
      detector.detectAndCompute(gray, new cv.Mat(), kp, desc)

      const matches = new cv.DMatchVector()
      matcher.match(objDesc, desc, matches)

      // Отрисовка
      const result = new cv.Mat()
      cv.drawMatches(objectMat, objKp, gray, kp, matches, result)

      cv.imshow(canvas, result)

      // Очистка
      gray.delete()
      desc.delete()
      result.delete()

      requestAnimationFrame(process)
    }

    requestAnimationFrame(process)
  }

  return { detectAndMatch }
}
