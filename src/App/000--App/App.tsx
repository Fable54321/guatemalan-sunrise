import { useEffect } from "react"
import { Outlet } from "react-router-dom"
import { warmInterviewQuestionsCache } from "../../offline/interviewQuestionsCache"

function App() {
  useEffect(() => {
    const warmCache = () => {
      void warmInterviewQuestionsCache()
    }

    warmCache()
    window.addEventListener("online", warmCache)

    return () => window.removeEventListener("online", warmCache)
  }, [])

  return (
    <>
      <Outlet />
    </>
  )
}

export default App
