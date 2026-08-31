import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root'
import { applyTheme, defaultTheme } from './theme/theme'
import './styles/global.css'

applyTheme(defaultTheme)

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
