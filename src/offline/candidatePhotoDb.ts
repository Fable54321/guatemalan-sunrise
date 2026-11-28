import type { CandidatePhotoUpload } from "../api/candidatePhotos"

const DATABASE_NAME = "vegibec-candidate-photos"
const STORE_NAME = "pendingPhotoUploads"

export type PendingCandidatePhotos = CandidatePhotoUpload & {
  createdAt: string
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
  })
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Unable to open photo storage"))
  })
}

export async function queueCandidatePhotos(upload: PendingCandidatePhotos) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, "readwrite")
  transaction.objectStore(STORE_NAME).put(upload)
  await transactionComplete(transaction)
  database.close()
}

export async function getPendingCandidatePhotos() {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, "readonly")
  const uploads = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as PendingCandidatePhotos[]
  await transactionComplete(transaction)
  database.close()
  return uploads.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function removePendingCandidatePhotos(id: string) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, "readwrite")
  transaction.objectStore(STORE_NAME).delete(id)
  await transactionComplete(transaction)
  database.close()
}
