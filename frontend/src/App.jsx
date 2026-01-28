import { Analytics } from '@vercel/analytics/react'
import MauboussinAIAnalyzer from './components/MauboussinAnalyzer-WithBackend'

function App() {
  return (
    <>
      <MauboussinAIAnalyzer />
      <Analytics />
    </>
  )
}

export default App
