import {
  getInterviewQuestions,
  type InterviewQuestion,
} from "../api/candidateInterviews"
import { cacheInterviewQuestions } from "./interviewDb"

let activeRefresh: Promise<InterviewQuestion[]> | null = null

export function refreshInterviewQuestionsCache() {
  if (activeRefresh) return activeRefresh

  activeRefresh = getInterviewQuestions()
    .then(async ({ questions }) => {
      await cacheInterviewQuestions(questions).catch(() => undefined)
      return questions
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
