import { Directory, Filesystem } from "@capacitor/filesystem"
import { createInterview, type AnswerValue, type CandidateDetails, type PracticalTaskAnswers } from "../api/candidateInterviews"
import { uploadCandidatePhotos } from "../api/candidatePhotos"
import { isNativeArchiveAvailable, listNativePackages, updateNativePackageStatus } from "./nativeArchive"

type InterviewPayload = {
  clientSubmissionId: string
  candidate: CandidateDetails
  answers: Record<number, AnswerValue>
  practicalTaskAnswers: PracticalTaskAnswers
  generalInformationComment: string
}

type PhotoPayload = {
  clientSubmissionId: string
  candidateNumber: string
  candidateName: string
}

function base64ToBlob(data: string, contentType = "image/jpeg") {
  const binary = atob(data.includes(",") ? data.slice(data.indexOf(",") + 1) : data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: contentType })
}

export async function syncNativeArchive() {
  if (!isNativeArchiveAvailable() || !navigator.onLine) return

  const packages = (await listNativePackages())
    .filter((record) => record.status === "pending" || record.status === "failed")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  for (const record of packages) {
    try {
      await updateNativePackageStatus(record.id, "syncing")

      if (record.kind === "interview") {
        const payload = JSON.parse(record.payloadJson) as InterviewPayload
        const result = await createInterview(
          payload.candidate,
          payload.answers,
          payload.practicalTaskAnswers,
          payload.clientSubmissionId,
          payload.generalInformationComment,
        )
        await updateNativePackageStatus(record.id, "synced", { serverId: result.interview.id })
        continue
      }

      const payload = JSON.parse(record.payloadJson) as PhotoPayload
      const paths = JSON.parse(record.filePathsJson) as string[]
      const photos = await Promise.all(paths.map(async (path) => {
        const result = await Filesystem.readFile({ path, directory: Directory.Data })
        if (result.data instanceof Blob) return result.data
        return base64ToBlob(result.data)
      }))
      await uploadCandidatePhotos({
        id: payload.clientSubmissionId,
        candidateNumber: payload.candidateNumber,
        candidateName: payload.candidateName,
        photos,
      })
      await updateNativePackageStatus(record.id, "synced")
    } catch (error) {
      await updateNativePackageStatus(record.id, "failed", {
        error: error instanceof Error ? error.message : "Synchronization failed",
      })
    }
  }
}
