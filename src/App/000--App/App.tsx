import { useEffect, useState } from "react"
import { Link, Outlet } from "react-router-dom"
import {
  getPendingInterviews,
  subscribeToPendingInterviews,
} from "../../offline/interviewDb"
import { warmInterviewQuestionsCache } from "../../offline/interviewQuestionsCache"

function App() {
  const [savedInterviewCount, setSavedInterviewCount] = useState(0)

  useEffect(() => {
    const warmCache = () => {
      void warmInterviewQuestionsCache()
    }

    warmCache()
    window.addEventListener("online", warmCache)

    return () => window.removeEventListener("online", warmCache)
  }, [])

  useEffect(() => {
    const refreshSavedInterviewCount = () => {
      void getPendingInterviews()
        .then((interviews) => setSavedInterviewCount(interviews.length))
        .catch(() => undefined)
    }

    refreshSavedInterviewCount()
    return subscribeToPendingInterviews(refreshSavedInterviewCount)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[#dce7d3] bg-white/95 px-5 py-3 text-[#24351e] shadow-sm backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link to="/" className="text-sm font-black tracking-tight transition hover:text-[#4f7818] sm:text-base">
            Recrutement
          </Link>
          <p
            className="inline-flex items-center gap-2 rounded-full bg-[#edf3e7] px-3 py-1.5 text-xs font-extrabold text-[#486718] sm:text-sm"
            role="status"
            aria-live="polite"
          >
            <span className="h-2 w-2 rounded-full bg-[#668f20]" />
            <span>
              {savedInterviewCount} entrevue{savedInterviewCount === 1 ? "" : "s"} sauvegardée{savedInterviewCount === 1 ? "" : "s"}
              <span className="hidden sm:inline"> sur cet appareil</span>
            </span>
          </p>
        </div>
      </header>
      <Outlet />
    </>
  )
}

export default App
