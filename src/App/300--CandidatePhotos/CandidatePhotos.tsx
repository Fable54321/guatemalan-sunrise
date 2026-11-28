import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Capacitor } from "@capacitor/core"
import { Camera, CameraDirection, CameraResultType, CameraSource } from "@capacitor/camera"
import { getCandidateOptions, type CandidateOption } from "../../api/candidatePhotos"
import { getPendingCandidatePhotos, queueCandidatePhotos } from "../../offline/candidatePhotoDb"
import { syncCandidatePhotos } from "../../offline/syncCandidatePhotos"
import { archiveCandidatePhotos } from "../../native/nativeArchive"

const MAX_PHOTOS = 3
const CANDIDATE_CACHE_KEY = "candidate-photo-options"

export default function CandidatePhotos() {
  const [candidateNumber, setCandidateNumber] = useState("")
  const [candidateName, setCandidateName] = useState("")
  const [photos, setPhotos] = useState<Blob[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const [message, setMessage] = useState("")
  const [pendingCount, setPendingCount] = useState(0)
  const [candidateOptions, setCandidateOptions] = useState<CandidateOption[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CANDIDATE_CACHE_KEY) || "[]") as CandidateOption[]
    } catch {
      return []
    }
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshPendingCount = async () => {
    setPendingCount((await getPendingCandidatePhotos().catch(() => [])).length)
  }

  useEffect(() => {
    const initialSync = window.setTimeout(() => {
      void refreshPendingCount().then(() => syncCandidatePhotos().then(setPendingCount))
    }, 0)
    const handleOnline = () => void syncCandidatePhotos().then(setPendingCount)
    window.addEventListener("online", handleOnline)
    return () => {
      window.clearTimeout(initialSync)
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  useEffect(() => {
    if (!navigator.onLine) return
    getCandidateOptions().then((options) => {
      setCandidateOptions(options)
      localStorage.setItem(CANDIDATE_CACHE_KEY, JSON.stringify(options))
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!cameraOpen) return
    let cancelled = false

    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then((stream) => {
      if (cancelled) return stream.getTracks().forEach((track) => track.stop())
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    }).catch(() => {
      setCameraError("La caméra intégrée n’est pas disponible. Utilisez le bouton de caméra de l’appareil.")
    })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [cameraOpen])

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    setCameraOpen(false)
    setCameraError("")
  }

  const takePhoto = () => {
    const video = videoRef.current
    if (!video?.videoWidth || photos.length >= MAX_PHOTOS) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      setPhotos((current) => [...current, blob].slice(0, MAX_PHOTOS))
      closeCamera()
    }, "image/jpeg", 0.88)
  }

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"))
    setPhotos((current) => [...current, ...images].slice(0, MAX_PHOTOS))
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const openCamera = async () => {
    if (!Capacitor.isNativePlatform()) {
      setCameraOpen(true)
      return
    }

    try {
      const image = await Camera.getPhoto({
        source: CameraSource.Camera,
        direction: CameraDirection.Rear,
        resultType: CameraResultType.Uri,
        quality: 88,
        width: 1920,
        correctOrientation: true,
        saveToGallery: false,
      })
      if (!image.webPath) return
      const response = await fetch(image.webPath)
      const blob = await response.blob()
      setPhotos((current) => [...current, blob].slice(0, MAX_PHOTOS))
    } catch (error) {
      const message = error instanceof Error ? error.message.toLocaleLowerCase() : ""
      if (!message.includes("cancel")) setMessage("La caméra n’a pas pu être ouverte.")
    }
  }

  const saveAndContinue = async () => {
    setMessage("")
    if (!candidateNumber.trim() || !candidateName.trim()) {
      setMessage("Entrez le numéro et le nom du candidat.")
      return
    }
    if (photos.length === 0) {
      setMessage("Prenez au moins une photo du candidat.")
      return
    }

    const id = crypto.randomUUID()
    try {
      await archiveCandidatePhotos({
        id,
        candidateNumber: candidateNumber.trim(),
        candidateName: candidateName.trim(),
        photos,
      })
    } catch {
      setMessage("Impossible d’enregistrer les photos dans le stockage durable. Rien n’a été envoyé.")
      return
    }

    await queueCandidatePhotos({
      id,
      candidateNumber: candidateNumber.trim(),
      candidateName: candidateName.trim(),
      photos,
      createdAt: new Date().toISOString(),
    })

    setCandidateNumber("")
    setCandidateName("")
    setPhotos([])
    setMessage("Photos enregistrées. Prêt pour le candidat suivant.")
    await refreshPendingCount()
    if (navigator.onLine) void syncCandidatePhotos().then(setPendingCount)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <main className="min-h-screen bg-[#f3f6ef] px-4 py-5 text-[#24351e] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link to="/" className="mb-2 inline-block text-sm font-bold text-[#5d861b]">← Accueil</Link>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Photos des candidats</h1>
          </div>
          <div className="rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm">
            {pendingCount} en attente
          </div>
        </header>

        {message && <p className="mb-5 rounded-xl border border-[#cbdcb9] bg-white px-4 py-3 font-semibold" role="status">{message}</p>}

        <section className="rounded-3xl border border-[#dfe8d8] bg-white p-5 shadow-[0_18px_50px_rgba(43,70,28,0.08)] sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="font-bold">
              Numéro du candidat
              <input
                value={candidateNumber}
                onChange={(event) => {
                  const value = event.target.value
                  setCandidateNumber(value)
                  const match = candidateOptions.find((candidate) => candidate.candidateNumber === value.trim())
                  if (match) setCandidateName(match.candidateName)
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ex. 150"
                className="mt-2 w-full rounded-xl border border-[#d9e3d2] bg-[#fbfcfa] px-4 py-4 text-lg outline-none focus:border-[#668f20] focus:ring-4 focus:ring-[#668f20]/10"
              />
            </label>
            <label className="font-bold">
              Nom du candidat
              <input
                value={candidateName}
                onChange={(event) => {
                  const value = event.target.value
                  setCandidateName(value)
                  const match = candidateOptions.find((candidate) => candidate.candidateName.toLocaleLowerCase() === value.trim().toLocaleLowerCase())
                  if (match) setCandidateNumber(match.candidateNumber)
                }}
                list="candidate-names"
                autoComplete="off"
                placeholder="Rechercher ou saisir un nom"
                className="mt-2 w-full rounded-xl border border-[#d9e3d2] bg-[#fbfcfa] px-4 py-4 text-lg outline-none focus:border-[#668f20] focus:ring-4 focus:ring-[#668f20]/10"
              />
              <datalist id="candidate-names">
                {candidateOptions.map((candidate) => (
                  <option key={candidate.candidateNumber} value={candidate.candidateName}>
                    {candidate.candidateNumber}
                  </option>
                ))}
              </datalist>
            </label>
          </div>

          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">Photos</h2>
              <span className="font-bold text-[#64715f]">{photos.length} / {MAX_PHOTOS}</span>
            </div>

            <div className="grid min-h-44 grid-cols-3 gap-3">
              {Array.from({ length: MAX_PHOTOS }, (_, index) => {
                const photo = photos[index]
                return photo ? (
                  <PhotoPreview key={`${photo.size}-${index}`} photo={photo} onRemove={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} />
                ) : (
                  <div key={index} className="grid place-items-center rounded-2xl border-2 border-dashed border-[#d9e3d2] bg-[#f8faf6] text-4xl text-[#b1bca9]">+</div>
                )
              })}
            </div>

            <button
              type="button"
              disabled={photos.length >= MAX_PHOTOS}
              onClick={() => void openCamera()}
              className="mt-5 w-full rounded-2xl bg-[#5d861b] px-6 py-5 text-xl font-black text-white shadow-[0_14px_35px_rgba(67,101,20,0.28)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              📷 Prendre une photo
            </button>
          </div>
        </section>

        <button type="button" onClick={() => void saveAndContinue()} className="mt-6 w-full rounded-2xl bg-[#24351e] px-6 py-5 text-xl font-black text-white shadow-lg">
          Candidat suivant →
        </button>
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Caméra">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="font-bold">Photo {photos.length + 1} sur {MAX_PHOTOS}</span>
            <button type="button" onClick={closeCamera} className="rounded-full bg-white/15 px-4 py-2 font-bold">Fermer</button>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#101010]">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
            {cameraError && <div className="absolute inset-0 grid place-items-center p-8 text-center text-lg font-bold">{cameraError}</div>}
          </div>
          <div className="flex items-center justify-center gap-6 px-5 py-5 sm:py-7">
            {cameraError ? (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-2xl bg-white px-7 py-4 text-lg font-black text-black">Ouvrir la caméra</button>
            ) : (
              <button type="button" onClick={takePhoto} aria-label="Prendre la photo" className="h-20 w-20 rounded-full border-8 border-white bg-[#d95726] shadow-[0_0_0_3px_rgba(255,255,255,0.35)]" />
            )}
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { addFiles(event.target.files); closeCamera() }} />
    </main>
  )
}

function PhotoPreview({ photo, onRemove }: { photo: Blob; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(photo), [photo])
  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <img src={url} alt="Aperçu du candidat" className="h-full min-h-44 w-full object-cover" />
      <button type="button" onClick={onRemove} aria-label="Supprimer la photo" className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-black/70 text-xl font-bold text-white">×</button>
    </div>
  )
}
