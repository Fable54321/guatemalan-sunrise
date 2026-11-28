import { uploadCandidatePhotos } from "../api/candidatePhotos"
import { getPendingCandidatePhotos, removePendingCandidatePhotos } from "./candidatePhotoDb"
import { updateNativePackageStatus } from "../native/nativeArchive"

let activeSync: Promise<number> | null = null

export function syncCandidatePhotos() {
  if (activeSync) return activeSync

  activeSync = (async () => {
    if (!navigator.onLine) return (await getPendingCandidatePhotos()).length

    for (const upload of await getPendingCandidatePhotos()) {
      try {
        await updateNativePackageStatus(upload.id, "syncing")
        await uploadCandidatePhotos(upload)
        await updateNativePackageStatus(upload.id, "synced")
        await removePendingCandidatePhotos(upload.id)
      } catch (error) {
        await updateNativePackageStatus(upload.id, "failed", {
          error: error instanceof Error ? error.message : "Photo synchronization failed",
        })
        // Keep this upload intact until the API is available or connectivity returns.
        break
      }
    }

    return (await getPendingCandidatePhotos()).length
  })().finally(() => {
    activeSync = null
  })

  return activeSync
}
