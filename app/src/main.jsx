import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Viewer from './Viewer.jsx'

// /admin → admin (password gate). Everything else → read-only viewer.
const isAdmin = window.location.pathname.startsWith('/admin')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdmin ? <App /> : <Viewer />}
  </StrictMode>,
)
