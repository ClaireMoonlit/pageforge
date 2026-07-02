import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/animations.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode> // 临时关闭 dnd-kit 在 strict mode 下的问题
  <App />,
  // </React.StrictMode>,
)
