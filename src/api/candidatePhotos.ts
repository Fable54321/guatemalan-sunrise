export type CandidatePhotoUpload = {
  id: string
  candidateNumber: string
  candidateName: string
  photos: Blob[]
}

export type CandidateOption = {
  candidateNumber: string
  candidateName: string
}

const apiBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "")

export async function getCandidateOptions() {
  const response = await fetch(`${apiBaseUrl}/candidate-interviews/candidates`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error(`Candidate lookup failed (${response.status})`)

  const payload = await response.json() as {
    candidates: Array<{ candidate_number: string; first_name: string | null; last_name: string | null }>
  }
  return payload.candidates.map((candidate) => ({
    candidateNumber: candidate.candidate_number,
    candidateName: [candidate.first_name, candidate.last_name].filter(Boolean).join(" "),
  })).filter((candidate) => candidate.candidateName)
}

export async function uploadCandidatePhotos(upload: CandidatePhotoUpload) {
  const body = new FormData()
  body.set("client_submission_id", upload.id)
  body.set("candidate_number", upload.candidateNumber)
  body.set("candidate_name", upload.candidateName)
  upload.photos.forEach((photo, index) => {
    body.append("photos", photo, `${upload.candidateNumber}-${index + 1}.jpg`)
  })

  const response = await fetch(`${apiBaseUrl}/candidate-interviews/photos`, {
    method: "POST",
    credentials: "include",
    body,
  })

  if (!response.ok) throw new Error(`Photo upload failed (${response.status})`)
}
