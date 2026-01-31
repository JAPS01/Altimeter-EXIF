import { useState, useEffect } from 'react'
import AddExif from './components/AddExif'
import Altimeter from './components/Altimeter'

function App() {
  const [activeView, setActiveView] = useState(null) // null = menu, 'addExif', 'altimeter'
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Capturar evento de instalación PWA
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return

    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice

    if (outcome === 'accepted') {
      setInstallPrompt(null)
    }
  }

  const goBack = () => setActiveView(null)

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {activeView && (
                <button
                  onClick={goBack}
                  className="p-2 -ml-2 rounded-lg hover:bg-slate-700 transition-colors"
                  aria-label="Volver"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">GeoMeta</h1>
                {activeView && (
                  <p className="text-xs text-slate-400">
                    {activeView === 'addExif' ? 'Agregar EXIF' : 'Altimeter'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Indicador de estado */}
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                  isOnline
                    ? 'bg-green-900/50 text-green-400'
                    : 'bg-yellow-900/50 text-yellow-400'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-yellow-400'}`} />
                {isOnline ? 'Online' : 'Offline'}
              </div>

              {/* Botón de instalación */}
              {installPrompt && (
                <button
                  onClick={handleInstall}
                  className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-1.5 px-3 rounded-lg transition-colors"
                >
                  Instalar App
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-4 w-full">
        {activeView === null ? (
          // Menú principal con tarjetas
          <div className="flex flex-col gap-4 mt-4">
            <h2 className="text-xl font-bold text-center text-white mb-2">
              Selecciona una herramienta
            </h2>

            {/* Tarjeta Agregar EXIF */}
            <button
              onClick={() => setActiveView('addExif')}
              className="card hover:border-primary-500 transition-all group text-left"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-primary-600/20 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-primary-600/30 transition-colors">
                  <svg className="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-1">Agregar EXIF</h3>
                  <p className="text-sm text-slate-400">
                    OCR a Metadata - Detecta coordenadas impresas en la imagen y las convierte en metadatos GPS
                  </p>
                </div>
                <svg className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {/* Tarjeta Altimeter */}
            <button
              onClick={() => setActiveView('altimeter')}
              className="card hover:border-primary-500 transition-all group text-left"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-green-600/20 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-green-600/30 transition-colors">
                  <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-1">Altimeter</h3>
                  <p className="text-sm text-slate-400">
                    Metadata a Visual - Estampa las coordenadas GPS en la imagen desde galería o cámara
                  </p>
                </div>
                <svg className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {/* Info PWA */}
            <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="flex items-center gap-3 text-slate-400 text-sm">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Procesamiento 100% local. Tus imágenes nunca salen de tu dispositivo.</p>
              </div>
            </div>
          </div>
        ) : activeView === 'addExif' ? (
          <AddExif />
        ) : (
          <Altimeter />
        )}
      </main>

      {/* Footer solo en menú */}
      {activeView === null && (
        <footer className="py-3 text-center text-xs text-slate-500">
          <p>GeoMeta PWA v1.0</p>
        </footer>
      )}
    </div>
  )
}

export default App
