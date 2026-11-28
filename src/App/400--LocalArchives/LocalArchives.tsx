import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { isNativeArchiveAvailable, listNativePackages, type NativePackageRecord } from "../../native/nativeArchive"
import { syncNativeArchive } from "../../native/syncNativeArchive"

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  pending: "En attente",
  syncing: "Synchronisation",
  synced: "Synchronisé",
  failed: "Échec — à réessayer",
}

export default function LocalArchives() {
  const [records, setRecords] = useState<NativePackageRecord[]>([])
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState("")
  const native = isNativeArchiveAvailable()

  const refresh = async () => {
    setRecords(await listNativePackages())
  }

  useEffect(() => {
    if (!native) return
    const timer = window.setTimeout(() => void refresh().catch(() => setError("Impossible de lire les archives locales.")), 0)
    return () => window.clearTimeout(timer)
  }, [native])

  const synchronize = async () => {
    setSyncing(true)
    setError("")
    try {
      await syncNativeArchive()
      await refresh()
    } catch {
      setError("La synchronisation n’a pas pu être terminée.")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f6ef] px-5 py-8 text-[#24351e] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="text-sm font-bold text-[#5d861b]">← Accueil</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black sm:text-4xl">Archives locales</h1>
            <p className="mt-2 text-[#64715f]">Copies conservées sur cet appareil, indépendamment du serveur.</p>
          </div>
          <button type="button" disabled={!native || syncing || !navigator.onLine} onClick={() => void synchronize()} className="rounded-xl bg-[#5d861b] px-5 py-3 font-black text-white disabled:opacity-45">
            {syncing ? "Synchronisation…" : "Synchroniser maintenant"}
          </button>
        </div>

        {!native && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-900">Les archives natives seront disponibles dans l’application Android.</p>}
        {error && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{error}</p>}

        <div className="mt-7 space-y-3">
          {native && records.length === 0 && <p className="rounded-2xl bg-white p-6 text-center font-semibold text-[#64715f]">Aucune archive locale pour le moment.</p>}
          {records.map((record) => {
            const photoCount = record.kind === "candidate_photos"
              ? (JSON.parse(record.filePathsJson) as string[]).length
              : 0
            return (
              <article key={record.id} className="rounded-2xl border border-[#dfe8d8] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">{record.candidateName || `Candidat ${record.candidateNumber}`}</h2>
                    <p className="text-sm font-semibold text-[#64715f]">No {record.candidateNumber} · {record.kind === "interview" ? "Entrevue" : `${photoCount} photo${photoCount === 1 ? "" : "s"}`}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${record.status === "synced" ? "bg-green-100 text-green-800" : record.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                    {statusLabels[record.status] ?? record.status}
                  </span>
                </div>
                <p className="mt-3 text-xs text-[#7b8677]">{new Date(record.createdAt).toLocaleString("fr-CA")}</p>
                {record.lastError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{record.lastError}</p>}
                <p className="mt-3 break-all text-[11px] text-[#899184]">{record.id}</p>
              </article>
            )
          })}
        </div>
      </div>
    </main>
  )
}
