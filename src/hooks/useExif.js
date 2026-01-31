import { useState, useCallback } from 'react'
import piexif from 'piexifjs'

// Extrae un valor racional EXIF de forma segura (puede ser [num, denom] o número directo)
function extractRational(value) {
  if (value === null || value === undefined) return 0
  if (Array.isArray(value)) {
    const num = value[0]
    const denom = value[1]
    if (denom === 0 || denom === undefined) return 0
    return num / denom
  }
  if (typeof value === 'number') return value
  return 0
}

// Extrae coordenadas GPS de un array de valores racionales
function extractGpsCoordinate(gpsArray) {
  if (!gpsArray || !Array.isArray(gpsArray) || gpsArray.length < 3) return NaN

  const degrees = extractRational(gpsArray[0])
  const minutes = extractRational(gpsArray[1])
  const seconds = extractRational(gpsArray[2])

  if (isNaN(degrees) || isNaN(minutes) || isNaN(seconds)) return NaN

  return degrees + minutes / 60 + seconds / 3600
}

// Convierte grados decimales a formato GMS (Grados, Minutos, Segundos)
export function decimalToGMS(decimal) {
  const absolute = Math.abs(decimal)
  const degrees = Math.floor(absolute)
  const minutesNotTruncated = (absolute - degrees) * 60
  const minutes = Math.floor(minutesNotTruncated)
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(2)

  return { degrees, minutes, seconds: parseFloat(seconds) }
}

// Convierte GMS a grados decimales
export function gmsToDecimal(degrees, minutes, seconds, direction) {
  let decimal = degrees + minutes / 60 + seconds / 3600
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal
  }
  return decimal
}

// Formatea coordenadas GMS para visualización
export function formatGMS(lat, lng) {
  const latGMS = decimalToGMS(lat)
  const lngGMS = decimalToGMS(lng)
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'

  return {
    latitude: `${latGMS.degrees}° ${latGMS.minutes}' ${latGMS.seconds}" ${latDir}`,
    longitude: `${lngGMS.degrees}° ${lngGMS.minutes}' ${lngGMS.seconds}" ${lngDir}`
  }
}

// Convierte un número a formato racional EXIF [[num, denom], ...]
function toRational(number) {
  const gms = decimalToGMS(Math.abs(number))
  return [
    [gms.degrees, 1],
    [gms.minutes, 1],
    [Math.round(gms.seconds * 100), 100]
  ]
}

export function useExif() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Lee los metadatos EXIF de una imagen
  const readExif = useCallback(async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const dataUrl = e.target.result
          const exifData = piexif.load(dataUrl)

          let gpsData = null

          if (exifData.GPS && exifData.GPS[piexif.GPSIFD.GPSLatitude]) {
            const lat = exifData.GPS[piexif.GPSIFD.GPSLatitude]
            const latRef = exifData.GPS[piexif.GPSIFD.GPSLatitudeRef] || 'N'
            const lng = exifData.GPS[piexif.GPSIFD.GPSLongitude]
            const lngRef = exifData.GPS[piexif.GPSIFD.GPSLongitudeRef] || 'E'

            if (lat && lng) {
              // Extraer coordenadas usando función robusta
              let latDecimal = extractGpsCoordinate(lat)
              let lngDecimal = extractGpsCoordinate(lng)

              // Aplicar dirección
              if (!isNaN(latDecimal) && (latRef === 'S' || latRef === 's')) {
                latDecimal = -Math.abs(latDecimal)
              }
              if (!isNaN(lngDecimal) && (lngRef === 'W' || lngRef === 'w' || lngRef === 'O' || lngRef === 'o')) {
                lngDecimal = -Math.abs(lngDecimal)
              }

              // Solo procesar si las coordenadas son válidas
              if (!isNaN(latDecimal) && !isNaN(lngDecimal)) {
                // Extraer altitud
                let altitude = null
                if (exifData.GPS[piexif.GPSIFD.GPSAltitude]) {
                  const alt = exifData.GPS[piexif.GPSIFD.GPSAltitude]
                  altitude = extractRational(alt)
                  if (isNaN(altitude)) altitude = null
                  // Si GPSAltitudeRef es 1, está bajo el nivel del mar
                  if (altitude !== null && exifData.GPS[piexif.GPSIFD.GPSAltitudeRef] === 1) {
                    altitude = -altitude
                  }
                }

                // Extraer dirección de la cámara (GPSImgDirection)
                let direction = null
                if (exifData.GPS[piexif.GPSIFD.GPSImgDirection]) {
                  const dir = exifData.GPS[piexif.GPSIFD.GPSImgDirection]
                  direction = extractRational(dir)
                  if (isNaN(direction)) direction = null
                }

                gpsData = {
                  latitude: latDecimal,
                  longitude: lngDecimal,
                  formatted: formatGMS(latDecimal, lngDecimal),
                  altitude,
                  direction
                }
              }
            }
          }

          // Extraer fecha y hora del EXIF
          let dateTime = null
          if (exifData.Exif && exifData.Exif[piexif.ExifIFD.DateTimeOriginal]) {
            dateTime = exifData.Exif[piexif.ExifIFD.DateTimeOriginal]
          } else if (exifData['0th'] && exifData['0th'][piexif.ImageIFD.DateTime]) {
            dateTime = exifData['0th'][piexif.ImageIFD.DateTime]
          }

          resolve({ exifData, gpsData, dateTime, dataUrl })
        } catch (err) {
          reject(new Error('No se pudo leer los metadatos EXIF'))
        }
      }

      reader.onerror = () => reject(new Error('Error al leer el archivo'))
      reader.readAsDataURL(file)
    })
  }, [])

  // Escribe coordenadas GPS en los metadatos EXIF de una imagen
  const writeGpsExif = useCallback(async (dataUrl, latitude, longitude) => {
    try {
      let exifData
      try {
        exifData = piexif.load(dataUrl)
      } catch {
        exifData = { '0th': {}, Exif: {}, GPS: {}, '1st': {}, thumbnail: null }
      }

      // Configurar datos GPS
      exifData.GPS[piexif.GPSIFD.GPSLatitudeRef] = latitude >= 0 ? 'N' : 'S'
      exifData.GPS[piexif.GPSIFD.GPSLatitude] = toRational(latitude)
      exifData.GPS[piexif.GPSIFD.GPSLongitudeRef] = longitude >= 0 ? 'E' : 'W'
      exifData.GPS[piexif.GPSIFD.GPSLongitude] = toRational(longitude)
      exifData.GPS[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0]

      const exifBytes = piexif.dump(exifData)
      const newDataUrl = piexif.insert(exifBytes, dataUrl)

      return newDataUrl
    } catch (err) {
      throw new Error('Error al escribir metadatos EXIF: ' + err.message)
    }
  }, [])

  // Convierte dataURL a Blob para descarga
  const dataUrlToBlob = useCallback((dataUrl) => {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)[1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], { type: mime })
  }, [])

  // Descarga una imagen procesada
  const downloadImage = useCallback((dataUrl, filename) => {
    const blob = dataUrlToBlob(dataUrl)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [dataUrlToBlob])

  return {
    readExif,
    writeGpsExif,
    downloadImage,
    dataUrlToBlob,
    loading,
    setLoading,
    error,
    setError
  }
}
