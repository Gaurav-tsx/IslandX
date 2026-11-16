import { createRoot } from 'react-dom/client'
import { App } from './App'
// Optional: bundle the Geist font (run `npm i @fontsource-variable/geist`, then uncomment).
// import '@fontsource-variable/geist'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
