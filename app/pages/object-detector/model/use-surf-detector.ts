import type { CV } from '@techstark/opencv-js'

/**
 * Интерфейс для управления детектором объектов
 */
export interface DetectorControls {
  /** Останавливает процесс детекции и освобождает ресурсы */
  stop: () => void
}

/**
 * Опции для настройки детектора
 */
export interface DetectorOptions {
  /** Показывать визуализацию совпадений */
  showMatches?: boolean
}

/**
 * Хук для детекции объектов с использованием ORB алгоритма
 * @param cv - Объект OpenCV.js
 * @returns Объект с функцией detectAndMatch
 */
export function useSurfDetector(cv: CV) {
  /**
   * Запускает детекцию и сопоставление объектов в реальном времени
   * @param video - HTML видео элемент с потоком с камеры
   * @param canvas - Canvas для отображения результата детекции
   * @param objectImg - Эталонное изображение для поиска
   * @param objectCanvas - Canvas для отображения эталона с ключевыми точками
   * @param matchCanvas - Canvas для визуализации совпадений
   * @returns Объект управления детектором
   */
  function detectAndMatch(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    objectImg: HTMLImageElement,
    objectCanvas?: HTMLCanvasElement,
    matchCanvas?: HTMLCanvasElement,
  ): DetectorControls {
    // Используем подход через Canvas вместо VideoCapture для избежания проблем с размерами
    const ctx = canvas.getContext('2d')!
    let frame: any = null

    // Подготовка эталонного изображения
    const objectMat = cv.imread(objectImg)
    const objectGray = new cv.Mat()
    cv.cvtColor(objectMat, objectGray, cv.COLOR_RGBA2GRAY)

    // Инициализация ORB детектора для поиска ключевых точек
    const detector = new cv.ORB()
    const objKp = new cv.KeyPointVector()
    const objDesc = new cv.Mat()
    detector.detectAndCompute(objectGray, new cv.Mat(), objKp, objDesc)

    // Отображаем ключевые точки на эталонном изображении
    if (objectCanvas) {
      const objectDisplay = objectMat.clone()
      // Красные точки в BGR формате
      cv.drawKeypoints(objectGray, objKp, objectDisplay, [0, 0, 255, 255])
      cv.imshow(objectCanvas, objectDisplay)
      objectDisplay.delete()
    }

    // Инициализация сопоставителя по дескрипторам (Brute Force с Hamming расстоянием)
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true)

    let animationFrameId: number | null = null
    let isRunning = true

    /**
     * Основной цикл обработки видео в реальном времени
     */
    function process() {
      if (!isRunning) return

      // Ожидаем пока видео будет готово и будет воспроизводиться
      if (video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) {
        animationFrameId = requestAnimationFrame(process)
        return
      }

      // Убеждаемся что размеры canvas соответствуют видео
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      // Создаем Mat для кадра с размерами canvas
      if (!frame || frame.rows !== canvas.height || frame.cols !== canvas.width) {
        if (frame) frame.delete()
        frame = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4)
      }

      try {
        // Сначала рисуем кадр видео на canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        // Затем читаем из canvas в Mat для обработки OpenCV
        frame = cv.imread(canvas)
      }
      catch (error) {
        console.warn('Ошибка захвата кадра:', error)
        animationFrameId = requestAnimationFrame(process)
        return
      }
      // Конвертируем в градации серого для детектора
      const gray = new cv.Mat()
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY)

      // Находим ключевые точки и дескрипторы в текущем кадре
      const kp = new cv.KeyPointVector()
      const desc = new cv.Mat()
      detector.detectAndCompute(gray, new cv.Mat(), kp, desc)

      // Пропускаем если не найдено дескрипторов
      if (desc.rows === 0 || objDesc.rows === 0) {
        gray.delete()
        kp.delete()
        desc.delete()

        // Canvas уже содержит кадр, просто показываем результат
        if (frame) cv.imshow(canvas, frame)
        animationFrameId = requestAnimationFrame(process)
        return
      }

      // Сопоставляем дескрипторы эталона с текущим кадром
      const matches = new cv.DMatchVector()
      matcher.match(objDesc, desc, matches)

      // Сортируем совпадения по расстоянию (чем меньше, тем лучше)
      const matchesArray: Array<{ distance: number, queryIdx: number, trainIdx: number }> = []
      for (let i = 0; i < matches.size(); i++) {
        const m = matches.get(i)
        matchesArray.push({ distance: m.distance, queryIdx: m.queryIdx, trainIdx: m.trainIdx })
      }
      matchesArray.sort((a, b) => a.distance - b.distance)

      // Берем лучшие 50% совпадений, но не менее 10
      const numGoodMatches = Math.floor(matchesArray.length * 0.5)
      const goodMatchesArray = matchesArray.slice(0, Math.max(numGoodMatches, 10))

      // Рисуем совпадения и определяем объект если достаточно хороших совпадений
      if (goodMatchesArray.length >= 4) {
        // Создаем массивы точек для OpenCV.js в правильном формате
        const objPointsData: number[] = []
        const scenePointsData: number[] = []

        for (const match of goodMatchesArray) {
          const objPt = objKp.get(match.queryIdx)
          const scenePt = kp.get(match.trainIdx)

          objPointsData.push(objPt.pt.x, objPt.pt.y)
          scenePointsData.push(scenePt.pt.x, scenePt.pt.y)
        }

        // Преобразуем в Mat формат для OpenCV
        const objPoints = cv.matFromArray(goodMatchesArray.length, 1, cv.CV_32FC2, objPointsData)
        const scenePoints = cv.matFromArray(goodMatchesArray.length, 1, cv.CV_32FC2, scenePointsData)

        try {
          // Находим гомографию - преобразование координат эталона в координаты сцены
          const homography = cv.findHomography(objPoints, scenePoints, cv.RANSAC, 5.0)

          if (!homography.empty()) {
            // Определяем углы эталонного изображения
            const objCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
              0, 0, // левый верхний
              objectMat.cols, 0, // правый верхний
              objectMat.cols, objectMat.rows, // правый нижний
              0, objectMat.rows, // левый нижний
            ])

            // Преобразуем углы эталона в координаты сцены
            const sceneCorners = new cv.Mat()
            cv.perspectiveTransform(objCorners, sceneCorners, homography)

            // Рисуем ограничивающую рамку вокруг найденного объекта
            const corners: Array<{ x: number, y: number }> = []
            for (let i = 0; i < 4; i++) {
              const x = sceneCorners.data32F[i * 2]
              const y = sceneCorners.data32F[i * 2 + 1]
              if (x !== undefined && y !== undefined) {
                corners.push(new cv.Point(x, y))
              }
            }

            // Соединяем углы зелеными линиями
            for (let i = 0; i < corners.length; i++) {
              const nextIdx = (i + 1) % corners.length
              const c1 = corners[i]
              const c2 = corners[nextIdx]
              if (c1 && c2) {
                cv.line(frame, c1, c2, [0, 255, 0, 255], 3) // Зеленый в BGR
              }
            }

            // Рисуем все ключевые точки на кадре - синие точки
            cv.drawKeypoints(frame, kp, frame, [255, 0, 0, 255]) // Синий в BGR

            // Выделяем совпавшие точки кружками - голубые точки
            for (const match of goodMatchesArray.slice(0, 30)) {
              const scenePt = kp.get(match.trainIdx)
              if (scenePt) {
                cv.circle(frame, new cv.Point(scenePt.pt.x, scenePt.pt.y), 4, [255, 255, 0, 255], -1) // Голубой в BGR
              }
            }

            // Создаем визуализацию совпадений на отдельном canvas
            if (matchCanvas) {
              try {
                // Масштабируем изображения к одинаковой высоте для сравнения
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

                // Создаем составное изображение
                const width = objResized.cols + frameResized.cols
                const matchOutput = new cv.Mat(targetHeight, width, cv.CV_8UC4)
                matchOutput.setTo([20, 20, 20, 255]) // Темно-серый фон

                // Рисуем линии соединяющие совпавшие точки
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

                  // Зеленые линии для лучших совпадений, желтые для хороших
                  const color = i < 10 ? [0, 255, 0, 255] : [0, 255, 255, 255] // Зеленый или желтый в BGR
                  cv.line(matchOutput, pt1, pt2, color, 1)
                }

                // Копируем изображения поверх линий
                const objRect = new cv.Rect(0, 0, objResized.cols, objResized.rows)
                const frameRect = new cv.Rect(objResized.cols, 0, frameResized.cols, frameResized.rows)

                objResized.copyTo(matchOutput.roi(objRect))
                frameResized.copyTo(matchOutput.roi(frameRect))

                // Рисуем маркеры точек поверх изображений
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

                  cv.circle(matchOutput, pt1, 3, [0, 0, 255, 255], -1) // Красный для эталона в BGR
                  cv.circle(matchOutput, pt2, 3, [255, 255, 0, 255], -1) // Голубой для сцены в BGR
                }

                // Обновляем canvas
                if (matchCanvas.width !== matchOutput.cols || matchCanvas.height !== matchOutput.rows) {
                  matchCanvas.width = matchOutput.cols
                  matchCanvas.height = matchOutput.rows
                }

                cv.imshow(matchCanvas, matchOutput)

                // Очистка ресурсов
                objResized.delete()
                frameResized.delete()
                matchOutput.delete()
              }
              catch (error) {
                console.error('Ошибка создания визуализации совпадений:', error)
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
        // Если совпадений недостаточно, просто рисуем ключевые точки
        cv.drawKeypoints(frame, kp, frame, [255, 0, 0, 255]) // Синий в BGR
      }

      // Canvas уже содержит кадр, просто показываем обработанный результат
      if (frame) cv.imshow(canvas, frame)

      // Очистка временных ресурсов
      gray.delete()
      kp.delete()
      desc.delete()
      matches.delete()

      // Продолжаем цикл обработки
      if (isRunning) {
        animationFrameId = requestAnimationFrame(process)
      }
    }

    // Запускаем цикл обработки
    animationFrameId = requestAnimationFrame(process)

    // Возвращаем управление детектором
    return {
      stop: () => {
        isRunning = false
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
        // Очистка всех ресурсов
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
