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
    // Create frame Mat with video dimensions for VideoCapture compatibility
    let frame: any = null

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
      cv.drawKeypoints(objectGray, objKp, objectDisplay, [0, 0, 255, 255]) // Red in BGR
      cv.imshow(objectCanvas, objectDisplay)
      objectDisplay.delete()
    }

    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true)

    let animationFrameId: number | null = null
    let isRunning = true

    function process() {
      if (!isRunning) return

      // Wait for video to have valid dimensions and be actually playing
      if (video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) {
        animationFrameId = requestAnimationFrame(process)
        return
      }

      // Create frame Mat with exact video dimensions
      if (!frame || frame.rows !== video.videoHeight || frame.cols !== video.videoWidth) {
        if (frame) frame.delete()
        frame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4)
      }

      try {
        cap.read(frame)
      } catch (error) {
        console.warn('VideoCapture read error:', error)
        animationFrameId = requestAnimationFrame(process)
        return
      }
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
        
        // Resize canvas to match video if needed
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        
        if (frame) cv.imshow(canvas, frame)
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

            // Draw keypoints on frame - синие точки (BGR)
            cv.drawKeypoints(frame, kp, frame, [255, 0, 0, 255]) // Blue in BGR

            // Draw circles on matched keypoints - голубые точки (BGR)
            for (const match of goodMatchesArray.slice(0, 30)) {
              const scenePt = kp.get(match.trainIdx)
              if (scenePt) {
                cv.circle(frame, new cv.Point(scenePt.pt.x, scenePt.pt.y), 4, [255, 255, 0, 255], -1) // Cyan in BGR
              }
            }

            // Draw match visualization on matchCanvas if provided
            if (matchCanvas) {
              try {
                // Resize images to same height for side-by-side comparison
                const targetHeight = 400
                const objScale = targetHeight / objectMat.rows
                const frameScale = targetHeight / frame.rows

                const objResized = new cv.Mat()
                const frameResized = new cv.Mat()

                cv.resize(objectMat, objResized, new cv.Size(
                  Math.round(objectMat.cols * objScale),
                  targetHeight,
                ))
                cv.resize(frame, frameResized, new cv.Size(
                  Math.round(frame.cols * frameScale),
                  targetHeight,
                ))

                // Create composite
                const width = objResized.cols + frameResized.cols
                const matchOutput = new cv.Mat(targetHeight, width, cv.CV_8UC4)
                matchOutput.setTo([20, 20, 20, 255])

                // Draw lines and circles
                for (let i = 0; i < Math.min(goodMatchesArray.length, 30); i++) {
                  const match = goodMatchesArray[i]
                  if (!match) continue
                  const objPt = objKp.get(match.queryIdx)
                  const scenePt = kp.get(match.trainIdx)
                  if (!objPt || !scenePt) continue

                  const pt1 = new cv.Point(
                    Math.round(objPt.pt.x * objScale),
                    Math.round(objPt.pt.y * objScale),
                  )
                  const pt2 = new cv.Point(
                    Math.round(scenePt.pt.x * frameScale + objResized.cols),
                    Math.round(scenePt.pt.y * frameScale),
                  )

                  // Draw line - green for best, yellow for good (BGR)
                  const color = i < 10 ? [0, 255, 0, 255] : [0, 255, 255, 255] // Green or Yellow in BGR
                  cv.line(matchOutput, pt1, pt2, color, 1)
                }

                // Copy resized images over the lines
                const objRect = new cv.Rect(0, 0, objResized.cols, objResized.rows)
                const frameRect = new cv.Rect(objResized.cols, 0, frameResized.cols, frameResized.rows)

                objResized.copyTo(matchOutput.roi(objRect))
                frameResized.copyTo(matchOutput.roi(frameRect))

                // Draw circles on top
                for (let i = 0; i < Math.min(goodMatchesArray.length, 30); i++) {
                  const match = goodMatchesArray[i]
                  if (!match) continue
                  const objPt = objKp.get(match.queryIdx)
                  const scenePt = kp.get(match.trainIdx)
                  if (!objPt || !scenePt) continue

                  const pt1 = new cv.Point(
                    Math.round(objPt.pt.x * objScale),
                    Math.round(objPt.pt.y * objScale),
                  )
                  const pt2 = new cv.Point(
                    Math.round(scenePt.pt.x * frameScale + objResized.cols),
                    Math.round(scenePt.pt.y * frameScale),
                  )

                  cv.circle(matchOutput, pt1, 3, [0, 0, 255, 255], -1) // Red in BGR
                  cv.circle(matchOutput, pt2, 3, [255, 255, 0, 255], -1) // Cyan in BGR
                }

                // Update canvas
                if (matchCanvas.width !== matchOutput.cols || matchCanvas.height !== matchOutput.rows) {
                  matchCanvas.width = matchOutput.cols
                  matchCanvas.height = matchOutput.rows
                }

                cv.imshow(matchCanvas, matchOutput)

                // Cleanup
                objResized.delete()
                frameResized.delete()
                matchOutput.delete()
              }
              catch (error) {
                console.error('Error creating match visualization:', error)
              }
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
        // Just draw the keypoints even if no match - blue in BGR
        cv.drawKeypoints(frame, kp, frame, [255, 0, 0, 255]) // Blue in BGR
      }

      // Resize canvas to match video if needed
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      
      if (frame) cv.imshow(canvas, frame)

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
        if (frame) frame.delete()
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