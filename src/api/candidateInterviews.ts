export type AnswerType = "boolean" | "integer" | "rating" | "select" | "text"

export type InterviewQuestion = {
  id: number
  section: string
  question_text: string
  answer_type: AnswerType
  options: string[] | { min?: number; max?: number } | null
  display_order: number
  is_required: boolean
}

export type AnswerValue = boolean | number | string

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

  return parseResponse<{ questions: InterviewQuestion[] }>(response)
}

export async function createInterview(
  candidate: CandidateDetails,
  answers: Record<number, AnswerValue>,
  clientSubmissionId: string,
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
      client_submission_id: clientSubmissionId,
      answers: Object.entries(answers).map(([questionId, value]) => ({
        question_id: Number(questionId),
        value,
      })),
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
