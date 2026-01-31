import { useState, useCallback, useRef, useEffect } from 'react'
import { useExif } from '../hooks/useExif'
import JSZip from 'jszip'

export default function Altimeter() {
  const [files, setFiles] = useState([])
  const [results, setResults] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [useCamera, setUseCamera] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [deviceHeading, setDeviceHeading] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  const { readExif, dataUrlToBlob } = useExif()

  // Escuchar orientación del dispositivo para obtener heading
  useEffect(() => {
    const handleOrientation = (event) => {
      if (event.alpha !== null) {
        setDeviceHeading(event.alpha)
      }
    }

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation)
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [])

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files)
    setFiles(selectedFiles)
    setResults([])
  }

  // Convierte grados a dirección cardinal
  const degreesToCardinal = (degrees) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    const index = Math.round(degrees / 45) % 8
    return directions[index]
  }

  // Formatea fecha EXIF (YYYY:MM:DD HH:MM:SS) a formato legible
  const formatExifDateTime = (exifDateTime) => {
    if (!exifDateTime) return null
    const [datePart, timePart] = exifDateTime.split(' ')
    if (!datePart) return null

    const [year, month, day] = datePart.split(':')
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    return {
      time: timePart ? timePart.substring(0, 5) : null,
      date: `${months[parseInt(month) - 1]} ${parseInt(day)}, ${year}`
    }
  }

  // Estampa las coordenadas GPS en la parte inferior de la imagen
  const stampImage = useCallback(async (dataUrl, gpsData, dateTime) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        canvas.width = img.width
        canvas.height = img.height

        ctx.drawImage(img, 0, 0)

        // Usar la dimensión menor para calcular tamaños (funciona en horizontal y vertical)
        const minDimension = Math.min(img.width, img.height)

        // Tamaño de fuente único para ambas líneas
        const fontSize = Math.max(36, Math.min(90, minDimension / 10))
        const lineSpacing = fontSize * 0.2

        // Calcular altura de franja basada en el contenido (2 líneas del mismo tamaño)
        const totalTextHeight = fontSize * 2 + lineSpacing
        const stampHeight = totalTextHeight + (minDimension * 0.04)

        // Franja gris oscura transparente en la parte inferior
        ctx.fillStyle = 'rgba(30, 30, 30, 0.8)'
        ctx.fillRect(0, img.height - stampHeight, canvas.width, stampHeight)

        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${fontSize}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Construir textos
        let coordText = `${gpsData.formatted.latitude} | ${gpsData.formatted.longitude}`
        if (gpsData.direction !== null && gpsData.direction !== undefined) {
          const directionDeg = Math.round(gpsData.direction)
          const cardinal = degreesToCardinal(gpsData.direction)
          coordText += `  ${directionDeg}° ${cardinal}`
        }

        let timeDate = formatExifDateTime(dateTime)
        if (!timeDate) {
          const now = new Date()
          timeDate = {
            time: now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
            date: now.toLocaleDateString('es', { month: 'short', day: 'numeric', year: 'numeric' })
          }
        }
        let secondLineText = `${timeDate.time} | ${timeDate.date}`
        if (gpsData.altitude !== null && gpsData.altitude !== undefined) {
          secondLineText += `  |  ${Math.round(gpsData.altitude)} m`
        }

        // Calcular posición vertical centrada
        const stampTop = img.height - stampHeight
        const verticalPadding = (stampHeight - totalTextHeight) / 2
        const firstLineY = stampTop + verticalPadding + (fontSize / 2)
        const secondLineY = firstLineY + fontSize + lineSpacing

        // === LÍNEA 1: Coordenadas + Dirección (centrado) ===
        ctx.fillText(coordText, canvas.width / 2, firstLineY)

        // === LÍNEA 2: Hora | Fecha | Altitud (centrado) ===
        ctx.fillText(secondLineText, canvas.width / 2, secondLineY)

        resolve(canvas.toDataURL('image/jpeg', 0.95))
      }
      img.src = dataUrl
    })
  }, [])

  const processFiles = useCallback(async () => {
    if (files.length === 0) return

    setIsProcessing(true)
    const newResults = []

    for (const file of files) {
      try {
        const { gpsData, dateTime, dataUrl } = await readExif(file)

        if (!gpsData) {
          newResults.push({
            file,
            success: false,
            error: 'La imagen no contiene metadatos GPS'
          })
          continue
        }

        const stampedDataUrl = await stampImage(dataUrl, gpsData, dateTime)

        newResults.push({
          file,
          success: true,
          gpsData,
          originalDataUrl: dataUrl,
          stampedDataUrl
        })
      } catch (err) {
        newResults.push({
          file,
          success: false,
          error: err.message
        })
      }
    }

    setResults(newResults)
    setIsProcessing(false)
  }, [files, readExif, stampImage])

  const handleDownload = (result) => {
    const originalName = result.file.name.replace(/\.[^/.]+$/, '')
    const filename = `${originalName}_STAMPED.jpg`

    const blob = dataUrlToBlob(result.stampedDataUrl)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleDownloadAll = async () => {
    const successResults = results.filter((r) => r.success)

    if (successResults.length === 0) return

    if (successResults.length === 1) {
      handleDownload(successResults[0])
      return
    }

    // Múltiples archivos: crear ZIP
    const zip = new JSZip()
    const firstFileName = successResults[0].file.name.replace(/\.[^/.]+$/, '')

    successResults.forEach((result, index) => {
      const originalName = result.file.name.replace(/\.[^/.]+$/, '')
      const filename = `${originalName}_STAMPED.jpg`

      // Convertir dataURL a datos binarios
      const base64Data = result.stampedDataUrl.split(',')[1]
      zip.file(filename, base64Data, { base64: true })
    })

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${firstFileName}_STAMPED.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Funcionalidad de cámara mejorada para móvil
  const startCamera = async () => {
    try {
      // Solicitar permisos de orientación en iOS
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission()
      }

      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setCameraStream(stream)
      setUseCamera(true)

      // Esperar a que el ref esté disponible
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 100)
    } catch (err) {
      console.error('Error cámara:', err)
      alert('No se pudo acceder a la cámara. Asegúrate de dar permisos. Error: ' + err.message)
    }
  }

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
    }
    setUseCamera(false)
  }

  const capturePhoto = async () => {
    if (!videoRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95)

    // Obtener geolocalización actual
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude, altitude, heading } = position.coords

          // Usar heading del GPS o del sensor de orientación
          const direction = heading || deviceHeading || null

          const gpsData = {
            latitude,
            longitude,
            formatted: {
              latitude: formatCoord(latitude, 'N', 'S'),
              longitude: formatCoord(longitude, 'E', 'W')
            },
            altitude: altitude || null,
            direction: direction
          }

          const stampedDataUrl = await stampImage(dataUrl, gpsData, null)

          setResults((prev) => [
            ...prev,
            {
              file: { name: `Captura_${Date.now()}.jpg` },
              success: true,
              gpsData,
              originalDataUrl: dataUrl,
              stampedDataUrl
            }
          ])
        },
        (err) => {
          alert('No se pudo obtener la ubicación: ' + err.message)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    } else {
      alert('Geolocalización no disponible en este dispositivo')
    }
  }

  const successCount = results.filter((r) => r.success).length

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => {
              stopCamera()
              setUseCamera(false)
            }}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              !useCamera
                ? 'bg-primary-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Galería
          </button>
          <button
            onClick={startCamera}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              useCamera
                ? 'bg-primary-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Cámara
          </button>
        </div>

        {!useCamera ? (
          <div className="space-y-4">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="input-file"
              disabled={isProcessing}
            />

            {files.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">
                  {files.length} archivo(s)
                </span>
                <button
                  onClick={processFiles}
                  disabled={isProcessing}
                  className="btn-primary"
                >
                  {isProcessing ? 'Procesando...' : 'Estampar'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {deviceHeading !== null && (
                <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-sm">
                  {Math.round(deviceHeading)}° {degreesToCardinal(deviceHeading)}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={capturePhoto} className="btn-primary flex-1">
                Capturar
              </button>
              <button onClick={stopCamera} className="btn-secondary">
                Cerrar
              </button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">
              {successCount}/{results.length} procesados
            </h3>
            {successCount > 0 && (
              <button onClick={handleDownloadAll} className="btn-secondary text-sm py-2">
                {successCount > 1 ? 'Descargar ZIP' : 'Descargar'}
              </button>
            )}
          </div>

          <div className="grid gap-3 grid-cols-2">
            {results.map((result, index) => (
              <div
                key={index}
                className={`rounded-lg border overflow-hidden ${
                  result.success
                    ? 'border-green-700'
                    : 'bg-red-900/20 border-red-700'
                }`}
              >
                {result.success ? (
                  <>
                    <img
                      src={result.stampedDataUrl}
                      alt={result.file.name}
                      className="w-full"
                    />
                    <div className="p-2 bg-slate-800">
                      <p className="text-xs truncate mb-1">{result.file.name}</p>
                      <button
                        onClick={() => handleDownload(result)}
                        className="btn-primary text-xs py-1.5 px-3 w-full"
                      >
                        Descargar
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{result.file.name}</p>
                    <p className="text-xs text-red-400 mt-1">{result.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Helper para formatear coordenadas
function formatCoord(value, posDir, negDir) {
  const abs = Math.abs(value)
  const deg = Math.floor(abs)
  const min = Math.floor((abs - deg) * 60)
  const sec = ((abs - deg - min / 60) * 3600).toFixed(2)
  const dir = value >= 0 ? posDir : negDir
  return `${deg}° ${min}' ${sec}" ${dir}`
}
