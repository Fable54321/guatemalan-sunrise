import type {
  AnswerValue,
  CandidateDetails,
  InterviewQuestion,
} from "../api/candidateInterviews"

const DATABASE_NAME = "vegibec-candidate-interviews"
const DATABASE_VERSION = 1
const CACHE_STORE = "cache"
const DRAFT_STORE = "drafts"
const PENDING_STORE = "pendingInterviews"
const QUESTIONS_CACHE_KEY = "activeQuestions"
const CURRENT_DRAFT_ID = "currentInterview"
const pendingInterviewsChanged = new EventTarget()

type CacheRecord<T> = {
  key: string
  value: T
  updatedAt: string
}

export type InterviewDraft = {
  id: typeof CURRENT_DRAFT_ID
  candidate: CandidateDetails
  answers: Record<number, AnswerValue>
  step: number
  updatedAt: string
}

export type PendingInterview = {
  clientSubmissionId: string
  candidate: CandidateDetails
  answers: Record<number, AnswerValue>
  createdAt: string
  attempts: number
  lastError?: string
  testOnly?: boolean
}

let databasePromise: Promise<IDBDatabase> | null = null

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported by this browser."))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        database.createObjectStore(CACHE_STORE, { keyPath: "key" })
      }

      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: "id" })
      }

      if (!database.objectStoreNames.contains(PENDING_STORE)) {
        const pendingStore = database.createObjectStore(PENDING_STORE, {
          keyPath: "clientSubmissionId",
        })
        pendingStore.createIndex("createdAt", "createdAt")
      }
    }

    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => {
      databasePromise = null
      reject(request.error ?? new Error("Unable to open the offline database."))
    }
    request.onblocked = () => {
      databasePromise = null
      reject(new Error("The offline database upgrade is blocked by another tab."))
    }
  })

  return databasePromise
}

export async function cacheInterviewQuestions(questions: InterviewQuestion[]) {
  const database = await openDatabase()
  const transaction = database.transaction(CACHE_STORE, "readwrite")
  transaction.objectStore(CACHE_STORE).put({
    key: QUESTIONS_CACHE_KEY,
    value: questions,
    updatedAt: new Date().toISOString(),
  } satisfies CacheRecord<InterviewQuestion[]>)
  await transactionComplete(transaction)
}

export async function getCachedInterviewQuestions() {
  const database = await openDatabase()
  const transaction = database.transaction(CACHE_STORE, "readonly")
  const record = await requestResult(
    transaction.objectStore(CACHE_STORE).get(QUESTIONS_CACHE_KEY),
  ) as CacheRecord<InterviewQuestion[]> | undefined
  await transactionComplete(transaction)
  return record?.value ?? null
}

export async function saveInterviewDraft(
  draft: Omit<InterviewDraft, "id" | "updatedAt">,
) {
  const database = await openDatabase()
  const transaction = database.transaction(DRAFT_STORE, "readwrite")
  transaction.objectStore(DRAFT_STORE).put({
    ...draft,
    id: CURRENT_DRAFT_ID,
    updatedAt: new Date().toISOString(),
  } satisfies InterviewDraft)
  await transactionComplete(transaction)
}

export async function getInterviewDraft() {
  const database = await openDatabase()
  const transaction = database.transaction(DRAFT_STORE, "readonly")
  const draft = await requestResult(
    transaction.objectStore(DRAFT_STORE).get(CURRENT_DRAFT_ID),
  ) as InterviewDraft | undefined
  await transactionComplete(transaction)
  return draft ?? null
}

export async function clearInterviewDraft() {
  const database = await openDatabase()
  const transaction = database.transaction(DRAFT_STORE, "readwrite")
  transaction.objectStore(DRAFT_STORE).delete(CURRENT_DRAFT_ID)
  await transactionComplete(transaction)
}

export async function queueInterview(interview: PendingInterview) {
  const database = await openDatabase()
  const transaction = database.transaction(PENDING_STORE, "readwrite")
  transaction.objectStore(PENDING_STORE).put(interview)
  await transactionComplete(transaction)
  pendingInterviewsChanged.dispatchEvent(new Event("change"))
}

export async function getPendingInterviews() {
  const database = await openDatabase()
  const transaction = database.transaction(PENDING_STORE, "readonly")
  const pending = await requestResult(
    transaction.objectStore(PENDING_STORE).index("createdAt").getAll(),
  ) as PendingInterview[]
  await transactionComplete(transaction)
  return pending
}

export async function removePendingInterview(clientSubmissionId: string) {
  const database = await openDatabase()
  const transaction = database.transaction(PENDING_STORE, "readwrite")
  transaction.objectStore(PENDING_STORE).delete(clientSubmissionId)
  await transactionComplete(transaction)
  pendingInterviewsChanged.dispatchEvent(new Event("change"))
}

export function subscribeToPendingInterviews(listener: () => void) {
  pendingInterviewsChanged.addEventListener("change", listener)
  return () => pendingInterviewsChanged.removeEventListener("change", listener)
}

export async function markPendingInterviewAttempt(
  interview: PendingInterview,
  error: string,
) {
  await queueInterview({
    ...interview,
    attempts: interview.attempts + 1,
    lastError: error,
  })
}
