if (import.meta.env.MODE !== 'development') {
  import('@/utils/anti-debug')
}
import 'virtual:uno.css'
import './styles/theme.css'
import './styles/layout.css'
import './styles/dashboard.css'
import './styles/downloads.css'
import './styles/settings.css'
import './styles/login.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
