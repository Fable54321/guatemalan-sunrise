import {
  getInterviewQuestions,
  type InterviewFormDefinition,
} from "../api/candidateInterviews"
import { cacheInterviewFormDefinition } from "./interviewDb"

let activeRefresh: Promise<InterviewFormDefinition> | null = null

export function refreshInterviewQuestionsCache() {
  if (activeRefresh) return activeRefresh

  activeRefresh = getInterviewQuestions()
    .then(async (definition) => {
      await cacheInterviewFormDefinition(definition).catch(() => undefined)
      return definition
    })
    .finally(() => {
      activeRefresh = null
    })

  return activeRefresh
}

export async function warmInterviewQuestionsCache() {
  if (!navigator.onLine) return

  await refreshInterviewQuestionsCache().catch(() => undefined)
}
