import { useState, useCallback } from 'react'
import { useOcr } from '../hooks/useOcr'
import { useExif, formatGMS } from '../hooks/useExif'

export default function AddExif() {
  const [files, setFiles] = useState([])
  const [results, setResults] = useState([])
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, percent: 0 })

  const { extractCoordinates, progress, isProcessing, error: ocrError, setError: setOcrError } = useOcr()
  const { writeGpsExif, downloadImage, setError: setExifError } = useExif()

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files)
    setFiles(selectedFiles)
    setResults([])
    setOcrError(null)
  }

  const processFiles = useCallback(async () => {
    if (files.length === 0) return

    const newResults = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setBatchProgress({ current: i + 1, total: files.length, percent: ((i + 1) / files.length) * 100 })

      try {
        // Leer la imagen como dataURL
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        // Extraer coordenadas mediante OCR
        const { text, coordinates } = await extractCoordinates(dataUrl)

        // Escribir las coordenadas en EXIF
        const newDataUrl = await writeGpsExif(dataUrl, coordinates.latitude, coordinates.longitude)

        newResults.push({
          file,
          success: true,
          coordinates,
          formatted: formatGMS(coordinates.latitude, coordinates.longitude),
          dataUrl: newDataUrl,
          rawText: text
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
    setBatchProgress({ current: 0, total: 0, percent: 0 })
  }, [files, extractCoordinates, writeGpsExif])

  const handleDownload = (result, index) => {
    const filename = `EXIF_GPS_${index + 1}.jpg`
    downloadImage(result.dataUrl, filename)
  }

  const handleDownloadAll = () => {
    results
      .filter((r) => r.success)
      .forEach((result, index) => {
        setTimeout(() => {
          handleDownload(result, index)
        }, index * 200)
      })
  }

  const successCount = results.filter((r) => r.success).length

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Agregar EXIF (OCR a Metadata)</h2>
        <p className="text-slate-400 mb-6">
          Sube imágenes con coordenadas GMS impresas. El sistema las detectará automáticamente
          y las convertirá en metadatos GPS.
        </p>

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
              <span className="text-slate-400">
                {files.length} archivo(s) seleccionado(s)
              </span>
              <button
                onClick={processFiles}
                disabled={isProcessing}
                className="btn-primary"
              >
                {isProcessing ? 'Procesando...' : 'Procesar Imágenes'}
              </button>
            </div>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <span>Analizando imagen {batchProgress.current} de {batchProgress.total}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {ocrError && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200">
              {ocrError}
            </div>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              Resultados: {successCount}/{results.length} procesados correctamente
            </h3>
            {successCount > 0 && (
              <button onClick={handleDownloadAll} className="btn-secondary">
                Descargar Todos
              </button>
            )}
          </div>

          <div className="space-y-3">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  result.success
                    ? 'bg-green-900/20 border-green-700'
                    : 'bg-red-900/20 border-red-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{result.file.name}</p>
                    {result.success ? (
                      <div className="text-sm text-slate-400 mt-1">
                        <p>Lat: {result.formatted.latitude}</p>
                        <p>Lng: {result.formatted.longitude}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-red-400 mt-1">{result.error}</p>
                    )}
                  </div>
                  {result.success && (
                    <button
                      onClick={() => handleDownload(result, index)}
                      className="btn-primary text-sm py-2 px-4"
                    >
                      Descargar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
