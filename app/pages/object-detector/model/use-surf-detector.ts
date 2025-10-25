import type { CV } from '@techstark/opencv-js'

export function useSurfDetector(cv: CV) {
  function detectAndMatch(video: HTMLVideoElement, canvas: HTMLCanvasElement, objectImg: HTMLImageElement) {
    const cap = new cv.VideoCapture(video)
    const frame = new cv.Mat(video.height, video.width, cv.CV_8UC4)

    const objectMat = cv.imread(objectImg)
    const objectGray = new cv.Mat()
    cv.cvtColor(objectMat, objectGray, cv.COLOR_RGBA2GRAY)

    const detector = new cv.ORB()
    const objKp = new cv.KeyPointVector()
    const objDesc = new cv.Mat()
    detector.detectAndCompute(objectGray, new cv.Mat(), objKp, objDesc)

    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false)

    function process() {
      cap.read(frame)
      const gray = new cv.Mat()
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY)

      const kp = new cv.KeyPointVector()
      const desc = new cv.Mat()
      detector.detectAndCompute(gray, new cv.Mat(), kp, desc)

      const matches = new cv.DMatchVector()
      matcher.match(objDesc, desc, matches)

      // Filter good matches using Lowe's ratio test
      const goodMatches = new cv.DMatchVector()
      for (let i = 0; i < matches.size(); i++) {
        const match = matches.get(i)
        if (match.distance < 0.75 * matches.get(i + 1)?.distance || i === matches.size() - 1) {
          goodMatches.push_back(match)
        }
      }

      // Draw matches and detect object if enough good matches
      if (goodMatches.size() >= 4) {
        // Get object keypoints
        const objPoints = new cv.Mat()
        const scenePoints = new cv.Mat()

        for (let i = 0; i < goodMatches.size(); i++) {
          const match = goodMatches.get(i)
          const objPt = objKp.get(match.queryIdx)
          const scenePt = kp.get(match.trainIdx)

          objPoints.push_back(new cv.Mat([[objPt.pt.x], [objPt.pt.y]], cv.CV_32F))
          scenePoints.push_back(new cv.Mat([[scenePt.pt.x], [scenePt.pt.y]], cv.CV_32F))
        }

        // Find homography
        const homography = cv.findHomography(objPoints, scenePoints, cv.RANSAC, 5.0)

        if (!homography.empty()) {
          // Define object corners
          const objCorners = new cv.Mat(4, 2, cv.CV_32F)
          objCorners.data32F[0] = 0
          objCorners.data32F[1] = 0
          objCorners.data32F[2] = objectMat.cols
          objCorners.data32F[3] = 0
          objCorners.data32F[4] = objectMat.cols
          objCorners.data32F[5] = objectMat.rows
          objCorners.data32F[6] = 0
          objCorners.data32F[7] = objectMat.rows

          const sceneCorners = new cv.Mat()
          cv.perspectiveTransform(objCorners, sceneCorners, homography)

          // Draw bounding box
          cv.line(frame,
            new cv.Point(sceneCorners.floatAt(0, 0), sceneCorners.floatAt(0, 1)),
            new cv.Point(sceneCorners.floatAt(1, 0), sceneCorners.floatAt(1, 1)),
            [0, 255, 0, 255], 2)
          cv.line(frame,
            new cv.Point(sceneCorners.floatAt(1, 0), sceneCorners.floatAt(1, 1)),
            new cv.Point(sceneCorners.floatAt(2, 0), sceneCorners.floatAt(2, 1)),
            [0, 255, 0, 255], 2)
          cv.line(frame,
            new cv.Point(sceneCorners.floatAt(2, 0), sceneCorners.floatAt(2, 1)),
            new cv.Point(sceneCorners.floatAt(3, 0), sceneCorners.floatAt(3, 1)),
            [0, 255, 0, 255], 2)
          cv.line(frame,
            new cv.Point(sceneCorners.floatAt(3, 0), sceneCorners.floatAt(3, 1)),
            new cv.Point(sceneCorners.floatAt(0, 0), sceneCorners.floatAt(0, 1)),
            [0, 255, 0, 255], 2)

          objCorners.delete()
          sceneCorners.delete()
        }

        objPoints.delete()
        scenePoints.delete()
        homography.delete()
      }

      cv.imshow(canvas, frame)

      // Очистка
      gray.delete()
      desc.delete()
      matches.delete()
      goodMatches.delete()

      requestAnimationFrame(process)
    }

    requestAnimationFrame(process)
  }

  return { detectAndMatch }
}
