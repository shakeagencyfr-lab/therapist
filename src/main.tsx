import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppStoreProvider } from './state/store'
import { applyTheme, defaultTheme } from './theme/theme'
import './styles/global.css'

applyTheme(defaultTheme)

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </StrictMode>,
)
