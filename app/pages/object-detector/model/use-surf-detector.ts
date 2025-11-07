import type { CV } from '@techstark/opencv-js'

export interface DetectorControls {
  stop: () => void
}

export interface DetectorOptions {
  showMatches?: boolean
}

export function useSurfDetector(cv: CV) {
  function detectAndMatch(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    objectImg: HTMLImageElement,
    objectCanvas?: HTMLCanvasElement,
    matchCanvas?: HTMLCanvasElement,
  ): DetectorControls {
    const cap = new cv.VideoCapture(video)
    const frame = new cv.Mat(video.height, video.width, cv.CV_8UC4)

    const objectMat = cv.imread(objectImg)
    const objectGray = new cv.Mat()
    cv.cvtColor(objectMat, objectGray, cv.COLOR_RGBA2GRAY)

    const detector = new cv.ORB()
    const objKp = new cv.KeyPointVector()
    const objDesc = new cv.Mat()
    detector.detectAndCompute(objectGray, new cv.Mat(), objKp, objDesc)

    // Draw object keypoints on object canvas if provided
    if (objectCanvas) {
      const objectDisplay = objectMat.clone()
      cv.drawKeypoints(objectGray, objKp, objectDisplay, [255, 0, 0, 255])
      cv.imshow(objectCanvas, objectDisplay)
      objectDisplay.delete()
    }

    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true)

    let animationFrameId: number | null = null
    let isRunning = true

    function process() {
      if (!isRunning) return

      cap.read(frame)
      const gray = new cv.Mat()
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY)

      const kp = new cv.KeyPointVector()
      const desc = new cv.Mat()
      detector.detectAndCompute(gray, new cv.Mat(), kp, desc)

      // Skip if no descriptors found
      if (desc.rows === 0 || objDesc.rows === 0) {
        gray.delete()
        kp.delete()
        desc.delete()
        cv.imshow(canvas, frame)
        animationFrameId = requestAnimationFrame(process)
        return
      }

      const matches = new cv.DMatchVector()
      matcher.match(objDesc, desc, matches)

      // Sort matches by distance
      const matchesArray: Array<{ distance: number, queryIdx: number, trainIdx: number }> = []
      for (let i = 0; i < matches.size(); i++) {
        const m = matches.get(i)
        matchesArray.push({ distance: m.distance, queryIdx: m.queryIdx, trainIdx: m.trainIdx })
      }
      matchesArray.sort((a, b) => a.distance - b.distance)

      // Take top 50% as good matches
      const numGoodMatches = Math.floor(matchesArray.length * 0.5)
      const goodMatchesArray = matchesArray.slice(0, Math.max(numGoodMatches, 10))

      // Draw matches and detect object if enough good matches
      if (goodMatchesArray.length >= 4) {
        // Create point arrays properly for OpenCV.js
        const objPointsData: number[] = []
        const scenePointsData: number[] = []

        for (const match of goodMatchesArray) {
          const objPt = objKp.get(match.queryIdx)
          const scenePt = kp.get(match.trainIdx)

          objPointsData.push(objPt.pt.x, objPt.pt.y)
          scenePointsData.push(scenePt.pt.x, scenePt.pt.y)
        }

        const objPoints = cv.matFromArray(goodMatchesArray.length, 1, cv.CV_32FC2, objPointsData)
        const scenePoints = cv.matFromArray(goodMatchesArray.length, 1, cv.CV_32FC2, scenePointsData)

        try {
          // Find homography
          const homography = cv.findHomography(objPoints, scenePoints, cv.RANSAC, 5.0)

          if (!homography.empty()) {
            // Define object corners
            const objCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
              0, 0,
              objectMat.cols, 0,
              objectMat.cols, objectMat.rows,
              0, objectMat.rows,
            ])

            const sceneCorners = new cv.Mat()
            cv.perspectiveTransform(objCorners, sceneCorners, homography)

            // Draw bounding box
            const corners: Array<{ x: number, y: number }> = []
            for (let i = 0; i < 4; i++) {
              const x = sceneCorners.data32F[i * 2]
              const y = sceneCorners.data32F[i * 2 + 1]
              if (x !== undefined && y !== undefined) {
                corners.push(new cv.Point(x, y))
              }
            }

            for (let i = 0; i < corners.length; i++) {
              const nextIdx = (i + 1) % corners.length
              const c1 = corners[i]
              const c2 = corners[nextIdx]
              if (c1 && c2) {
                cv.line(frame, c1, c2, [0, 255, 0, 255], 3)
              }
            }

            // Draw keypoints on frame
            cv.drawKeypoints(frame, kp, frame, [255, 0, 0, 255])

            // Draw match visualization on matchCanvas if provided
            if (matchCanvas) {
              // Create composite image with object on left and scene on right
              const matchOutput = new cv.Mat(
                Math.max(objectMat.rows, frame.rows),
                objectMat.cols + frame.cols,
                cv.CV_8UC4,
              )
              matchOutput.setTo([0, 0, 0, 255])

              // Copy object image to left side
              const objROI = matchOutput.roi(new cv.Rect(0, 0, objectMat.cols, objectMat.rows))
              objectMat.copyTo(objROI)
              objROI.delete()

              // Copy frame to right side
              const frameROI = matchOutput.roi(new cv.Rect(objectMat.cols, 0, frame.cols, frame.rows))
              frame.copyTo(frameROI)
              frameROI.delete()

              // Draw lines between matches
              const maxLines = 30
              for (let i = 0; i < Math.min(goodMatchesArray.length, maxLines); i++) {
                const match = goodMatchesArray[i]
                if (!match) continue
                const objPt = objKp.get(match.queryIdx)
                const scenePt = kp.get(match.trainIdx)
                if (!objPt || !scenePt) continue

                const pt1 = new cv.Point(objPt.pt.x, objPt.pt.y)
                const pt2 = new cv.Point(scenePt.pt.x + objectMat.cols, scenePt.pt.y)

                // Draw line with varying colors based on quality
                const color = i < 10 ? [0, 255, 0, 255] : [255, 255, 0, 255]
                cv.line(matchOutput, pt1, pt2, color, 1)

                // Draw circles
                cv.circle(matchOutput, pt1, 3, [255, 0, 0, 255], -1)
                cv.circle(matchOutput, pt2, 3, [0, 255, 255, 255], -1)
              }

              // Update match canvas size if needed
              if (matchCanvas.width !== matchOutput.cols || matchCanvas.height !== matchOutput.rows) {
                matchCanvas.width = matchOutput.cols
                matchCanvas.height = matchOutput.rows
              }

              cv.imshow(matchCanvas, matchOutput)
              matchOutput.delete()
            }

            objCorners.delete()
            sceneCorners.delete()
            homography.delete()
          }
        }
        catch (error) {
          console.warn('Homography computation failed:', error)
        }

        objPoints.delete()
        scenePoints.delete()
      }
      else {
        // Just draw the keypoints even if no match
        cv.drawKeypoints(frame, kp, frame, [255, 0, 0, 255])
      }

      cv.imshow(canvas, frame)

      // Cleanup
      gray.delete()
      kp.delete()
      desc.delete()
      matches.delete()

      if (isRunning) {
        animationFrameId = requestAnimationFrame(process)
      }
    }

    animationFrameId = requestAnimationFrame(process)

    // Return controls
    return {
      stop: () => {
        isRunning = false
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
        // Cleanup resources
        frame.delete()
        objectMat.delete()
        objectGray.delete()
        objKp.delete()
        objDesc.delete()
        detector.delete()
        matcher.delete()
      },
    }
  }

  return { detectAndMatch }
}
