import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import { reloadOnceForNewVersion } from './utils/chunkReload'

// YANGI VERSIYA CHIQQANDA ESKI FAYLLAR.
// Deploy'dan keyin ochiq turgan sahifa eski nomli faylni so'raydi, server
// esa uni o'chirib yuborgan. Vite bu holatda `vite:preloadError` hodisasini
// chiqaradi - sahifa bir marta yangilanadi va yangi fayllar bilan davom
// etadi. `preventDefault` qilinmasa xato ErrorBoundary ga yetib borardi.
// Bu hodisa ushlamagan holatlarni ErrorBoundary o'zi aniqlaydi.
window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForNewVersion()) event.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
