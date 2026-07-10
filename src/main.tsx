import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Handle dynamic import chunk load failures (due to new Vercel deployments changing asset hashes)
window.addEventListener('error', (e) => {
  const msg = e.message || ''
  if (
    msg.includes('dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch')
  ) {
    const hasReloaded = sessionStorage.getItem('chunk-load-error-reload')
    if (!hasReloaded) {
      sessionStorage.setItem('chunk-load-error-reload', 'true')
      window.location.reload()
    }
  }
}, true)

// Clear reload flag after successful boot to allow future retries
if (sessionStorage.getItem('chunk-load-error-reload')) {
  setTimeout(() => {
    sessionStorage.removeItem('chunk-load-error-reload')
  }, 5000)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
