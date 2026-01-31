import { useState, useCallback, useRef } from 'react'
import Tesseract from 'tesseract.js'

// Patrones de regex para detectar coordenadas en formato GMS
const GMS_PATTERNS = [
  // Formato: 18° 27' 30.5" N, 69° 57' 21.3" W
  /(\d{1,3})[°º]\s*(\d{1,2})[''′]\s*([\d.]+)[""″]?\s*([NSns])\s*[,;]?\s*(\d{1,3})[°º]\s*(\d{1,2})[''′]\s*([\d.]+)[""″]?\s*([EWOewo])/gi,
  // Formato: N 18° 27' 30.5", W 69° 57' 21.3"
  /([NSns])\s*(\d{1,3})[°º]\s*(\d{1,2})[''′]\s*([\d.]+)[""″]?\s*[,;]?\s*([EWOewo])\s*(\d{1,3})[°º]\s*(\d{1,2})[''′]\s*([\d.]+)[""″]?/gi,
  // Formato: 18 27 30.5 N 69 57 21.3 W (sin símbolos)
  /(\d{1,3})\s+(\d{1,2})\s+([\d.]+)\s*([NSns])\s+(\d{1,3})\s+(\d{1,2})\s+([\d.]+)\s*([EWOewo])/gi,
]

// Parsea el texto detectado para extraer coordenadas
function parseCoordinates(text) {
  for (const pattern of GMS_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)

    if (match) {
      let latDeg, latMin, latSec, latDir, lngDeg, lngMin, lngSec, lngDir

      // Determinar el formato basado en el patrón
      if (match[1].match(/[NSns]/)) {
        // Formato: N/S primero
        latDir = match[1].toUpperCase()
        latDeg = parseFloat(match[2])
        latMin = parseFloat(match[3])
        latSec = parseFloat(match[4])
        lngDir = match[5].toUpperCase() === 'O' ? 'W' : match[5].toUpperCase()
        lngDeg = parseFloat(match[6])
        lngMin = parseFloat(match[7])
        lngSec = parseFloat(match[8])
      } else {
        // Formato: grados primero
        latDeg = parseFloat(match[1])
        latMin = parseFloat(match[2])
        latSec = parseFloat(match[3])
        latDir = match[4].toUpperCase()
        lngDeg = parseFloat(match[5])
        lngMin = parseFloat(match[6])
        lngSec = parseFloat(match[7])
        lngDir = match[8].toUpperCase() === 'O' ? 'W' : match[8].toUpperCase()
      }

      // Convertir a decimal
      let latitude = latDeg + latMin / 60 + latSec / 3600
      let longitude = lngDeg + lngMin / 60 + lngSec / 3600

      if (latDir === 'S') latitude = -latitude
      if (lngDir === 'W') longitude = -longitude

      // Validar rangos
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return {
          latitude,
          longitude,
          raw: match[0],
          gms: {
            lat: { degrees: latDeg, minutes: latMin, seconds: latSec, direction: latDir },
            lng: { degrees: lngDeg, minutes: lngMin, seconds: lngSec, direction: lngDir }
          }
        }
      }
    }
  }

  return null
}

export function useOcr() {
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const workerRef = useRef(null)

  // Inicializa el worker de Tesseract
  const initWorker = useCallback(async () => {
    if (!workerRef.current) {
      workerRef.current = await Tesseract.createWorker('spa+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100))
          }
        }
      })
    }
    return workerRef.current
  }, [])

  // Procesa una imagen para extraer coordenadas mediante OCR
  const extractCoordinates = useCallback(async (imageSource) => {
    setIsProcessing(true)
    setError(null)
    setProgress(0)

    try {
      const worker = await initWorker()

      const { data: { text } } = await worker.recognize(imageSource)

      const coordinates = parseCoordinates(text)

      if (!coordinates) {
        throw new Error('No se detectaron coordenadas válidas en la imagen. Asegúrate de que el texto sea legible y esté en formato GMS (ej: 18° 27\' 30" N, 69° 57\' 21" W)')
      }

      setProgress(100)
      return { text, coordinates }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsProcessing(false)
    }
  }, [initWorker])

  // Procesa múltiples imágenes
  const extractCoordinatesBatch = useCallback(async (images, onProgress) => {
    const results = []

    for (let i = 0; i < images.length; i++) {
      try {
        const result = await extractCoordinates(images[i])
        results.push({ file: images[i], success: true, ...result })
      } catch (err) {
        results.push({ file: images[i], success: false, error: err.message })
      }

      if (onProgress) {
        onProgress((i + 1) / images.length * 100, i + 1, images.length)
      }
    }

    return results
  }, [extractCoordinates])

  // Limpia el worker
  const terminate = useCallback(async () => {
    if (workerRef.current) {
      await workerRef.current.terminate()
      workerRef.current = null
    }
  }, [])

  return {
    extractCoordinates,
    extractCoordinatesBatch,
    terminate,
    progress,
    isProcessing,
    error,
    setError
  }
}
