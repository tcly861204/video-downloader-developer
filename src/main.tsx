if (import.meta.env.MODE !== 'development') {
  import('@/utils/anti-debug')
}
import 'virtual:uno.css'
import './styles/theme.scss'
import './styles/downloads.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
