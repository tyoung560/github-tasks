import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { QueryProvider } from './state/query'
import { AuthProvider } from './state/auth'
import { SettingsProvider } from './state/settings'
import { ToastProvider } from './components/Toast'
import './index.css'

// Hash routing keeps the app deployable to any static host — GitHub Pages
// included — without server-side rewrites for client routes.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>
            <HashRouter>
              <App />
            </HashRouter>
          </ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </QueryProvider>
  </StrictMode>,
)
