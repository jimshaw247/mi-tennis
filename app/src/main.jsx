import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Viewer from './Viewer.jsx'
import Upsets from './Upsets.jsx'

// Routes:
//   /admin   → admin app (password gate)
//   /upsets  → orphan thought-experiment page comparing model odds to results
//   /        → read-only viewer
const path = window.location.pathname
const root = createRoot(document.getElementById('root'))
if (path.startsWith('/admin')) {
  root.render(<StrictMode><App /></StrictMode>)
} else if (path.startsWith('/upsets')) {
  root.render(<StrictMode><Upsets /></StrictMode>)
} else {
  root.render(<StrictMode><Viewer /></StrictMode>)
}
