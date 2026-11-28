export type AnswerType = "boolean" | "integer" | "rating" | "select" | "text"

export type InterviewQuestion = {
  id: number
  section_id: number
  section_code: string
  question_text: string
  answer_type: AnswerType
  options: string[] | { min?: number; max?: number } | null
  display_order: number
  is_required: boolean
}

export type InterviewSection = {
  id: number
  code: string
  name: string
  display_order: number
}

export type PracticalTask = {
  id: string
  section_id: number
  section_code: string
  description: string
  display_order: number
}

export type InterviewFormDefinition = {
  sections: InterviewSection[]
  questions: InterviewQuestion[]
  practical_tasks: PracticalTask[]
}

export type AnswerValue = boolean | number | string
export type QuestionAnswers = Record<number, AnswerValue>
export type PracticalTaskAnswers = Record<string, number>

export type CandidateDetails = {
  candidateNumber: string
  firstName: string
  lastName: string
  phoneNumber1: string
  phoneNumber2: string
}

type ApiErrorPayload = {
  error?: string
  message?: string
  field_errors?: Record<string, string>
}

export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string>

  constructor(message: string, status: number, fieldErrors = {}) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "")

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload

  if (!response.ok) {
    throw new ApiError(
      payload.error || payload.message || "Une erreur inattendue est survenue.",
      response.status,
      payload.field_errors,
    )
  }

  return payload
}

export async function getInterviewQuestions(signal?: AbortSignal) {
  const response = await fetch(`${apiBaseUrl}/candidate-interviews/questions`, {
    credentials: "include",
    signal,
  })

  return parseResponse<InterviewFormDefinition>(response)
}

export async function createInterview(
  candidate: CandidateDetails,
  answers: QuestionAnswers,
  practicalTaskAnswers: PracticalTaskAnswers,
  clientSubmissionId: string,
  generalInformationComment = "",
) {
  const response = await fetch(`${apiBaseUrl}/candidate-interviews`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidate_number: candidate.candidateNumber,
      first_name: candidate.firstName,
      last_name: candidate.lastName,
      phone_number_1: candidate.phoneNumber1,
      phone_number_2: candidate.phoneNumber2,
      general_information_comment: generalInformationComment.trim(),
      client_submission_id: clientSubmissionId,
      answers: [
        ...Object.entries(answers).map(([questionId, value]) => ({
          question_id: Number(questionId),
          value,
        })),
        ...Object.entries(practicalTaskAnswers).map(([practicalTaskId, value]) => ({
          practical_task_id: practicalTaskId,
          value,
        })),
      ],
    }),
  })

  return parseResponse<{
    interview: {
      id: number
      candidate_number: string
      first_name: string
      last_name: string
      phone_number_1: string
      phone_number_2: string | null
      client_submission_id: string
    }
  }>(response)
}
