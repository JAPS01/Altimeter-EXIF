import { useState, useCallback } from 'react'
import piexif from 'piexifjs'

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
            const latRef = exifData.GPS[piexif.GPSIFD.GPSLatitudeRef]
            const lng = exifData.GPS[piexif.GPSIFD.GPSLongitude]
            const lngRef = exifData.GPS[piexif.GPSIFD.GPSLongitudeRef]

            if (lat && lng) {
              const latDecimal = gmsToDecimal(
                lat[0][0] / lat[0][1],
                lat[1][0] / lat[1][1],
                lat[2][0] / lat[2][1],
                latRef
              )
              const lngDecimal = gmsToDecimal(
                lng[0][0] / lng[0][1],
                lng[1][0] / lng[1][1],
                lng[2][0] / lng[2][1],
                lngRef
              )

              // Extraer altitud
              let altitude = null
              if (exifData.GPS[piexif.GPSIFD.GPSAltitude]) {
                const alt = exifData.GPS[piexif.GPSIFD.GPSAltitude]
                altitude = alt[0] / alt[1]
                // Si GPSAltitudeRef es 1, está bajo el nivel del mar
                if (exifData.GPS[piexif.GPSIFD.GPSAltitudeRef] === 1) {
                  altitude = -altitude
                }
              }

              // Extraer dirección de la cámara (GPSImgDirection)
              let direction = null
              if (exifData.GPS[piexif.GPSIFD.GPSImgDirection]) {
                const dir = exifData.GPS[piexif.GPSIFD.GPSImgDirection]
                direction = dir[0] / dir[1]
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
