import { ApiError, createInterview } from "../api/candidateInterviews"
import {
  getPendingInterviews,
  markPendingInterviewAttempt,
  removePendingInterview,
} from "./interviewDb"

export type SyncResult = {
  synced: number
  remaining: number
}

let activeSync: Promise<SyncResult> | null = null

async function runSync(): Promise<SyncResult> {
  if (!navigator.onLine) {
    const pending = await getPendingInterviews()
    return { synced: 0, remaining: pending.length }
  }

  const pending = await getPendingInterviews()
  let synced = 0

  for (const interview of pending) {
    // Remove records created by the temporary local-test mode instead of uploading them.
    if (interview.testOnly) {
      await removePendingInterview(interview.clientSubmissionId)
      continue
    }

    try {
      await createInterview(
        interview.candidate,
        interview.answers,
        interview.clientSubmissionId,
      )
      await removePendingInterview(interview.clientSubmissionId)
      synced += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : "Synchronization failed."
      await markPendingInterviewAttempt(interview, message)

      if (!(error instanceof ApiError) || error.status === 401 || error.status >= 500) {
        break
      }
    }
  }

  return {
    synced,
    remaining: (await getPendingInterviews()).length,
  }
}

export function syncPendingInterviews() {
  if (activeSync) return activeSync

  activeSync = runSync().finally(() => {
    activeSync = null
  })

  return activeSync
}
