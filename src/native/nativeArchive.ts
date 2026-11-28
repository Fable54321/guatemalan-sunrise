import { Capacitor } from "@capacitor/core"
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite"
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem"
import type { AnswerValue, CandidateDetails, PracticalTaskAnswers } from "../api/candidateInterviews"

const DATABASE_NAME = "vegibec_recruitment"
const ARCHIVE_ROOT = "VegibecRecruitment"
const CURRENT_DRAFT_ID = "current-interview-draft"
const sqlite = new SQLiteConnection(CapacitorSQLite)

export type NativePackageStatus = "draft" | "pending" | "syncing" | "synced" | "failed"
export type NativePackageKind = "interview" | "candidate_photos"

export type NativePackageRecord = {
  id: string
  kind: NativePackageKind
  candidateNumber: string
  candidateName: string
  status: NativePackageStatus
  payloadJson: string
  filePathsJson: string
  createdAt: string
  updatedAt: string
  syncedAt: string | null
  lastError: string | null
  serverId: string | null
}

let databasePromise: Promise<SQLiteDBConnection> | null = null

export const isNativeArchiveAvailable = () => Capacitor.isNativePlatform()

async function database() {
  if (!isNativeArchiveAvailable()) throw new Error("Native archive is not available on the web")
  if (databasePromise) return databasePromise

  databasePromise = (async () => {
    const existing = await sqlite.isConnection(DATABASE_NAME, false)
    const connection = existing.result
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(DATABASE_NAME, false, "no-encryption", 1, false)

    if (!(await connection.isDBOpen()).result) await connection.open()
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS local_packages (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        candidate_number TEXT NOT NULL,
        candidate_name TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        file_paths_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT,
        last_error TEXT,
        server_id TEXT
      );
      CREATE INDEX IF NOT EXISTS local_packages_status_idx
        ON local_packages (status, created_at);
    `)
    return connection
  })().catch((error) => {
    databasePromise = null
    throw error
  })

  return databasePromise
}

const safeSegment = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9_-]+/g, "-")
  .replace(/^-+|-+$/g, "") || "candidate"

const packageDirectory = (createdAt: string, candidateNumber: string, id: string) => [
  ARCHIVE_ROOT,
  createdAt.slice(0, 10),
  `candidate-${safeSegment(candidateNumber)}`,
  id,
].join("/")

async function ensureDirectory(path: string, directory: Directory) {
  await Filesystem.mkdir({ path, directory, recursive: true }).catch(() => undefined)
}

async function writeRecoveryManifest(path: string, manifest: object) {
  const parent = path.slice(0, path.lastIndexOf("/"))
  await ensureDirectory(parent, Directory.Documents)
  await Filesystem.writeFile({
    path,
    directory: Directory.Documents,
    data: JSON.stringify(manifest, null, 2),
    encoding: Encoding.UTF8,
    recursive: true,
  })
}

async function upsertPackage(record: NativePackageRecord) {
  const connection = await database()
  await connection.run(
    `
      INSERT INTO local_packages (
        id, kind, candidate_number, candidate_name, status, payload_json,
        file_paths_json, created_at, updated_at, synced_at, last_error, server_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        candidate_number = excluded.candidate_number,
        candidate_name = excluded.candidate_name,
        status = excluded.status,
        payload_json = excluded.payload_json,
        file_paths_json = excluded.file_paths_json,
        updated_at = excluded.updated_at,
        synced_at = excluded.synced_at,
        last_error = excluded.last_error,
        server_id = excluded.server_id
    `,
    [
      record.id, record.kind, record.candidateNumber, record.candidateName,
      record.status, record.payloadJson, record.filePathsJson, record.createdAt,
      record.updatedAt, record.syncedAt, record.lastError, record.serverId,
    ],
  )
}

export async function archiveInterview(input: {
  id: string
  candidate: CandidateDetails
  answers: Record<number, AnswerValue>
  practicalTaskAnswers: PracticalTaskAnswers
  generalInformationComment: string
}) {
  if (!isNativeArchiveAvailable()) return
  const createdAt = new Date().toISOString()
  const candidateName = `${input.candidate.firstName} ${input.candidate.lastName}`.trim()
  const payload = {
    clientSubmissionId: input.id,
    candidate: input.candidate,
    answers: input.answers,
    practicalTaskAnswers: input.practicalTaskAnswers,
    generalInformationComment: input.generalInformationComment,
  }
  const record: NativePackageRecord = {
    id: input.id,
    kind: "interview",
    candidateNumber: input.candidate.candidateNumber,
    candidateName,
    status: "pending",
    payloadJson: JSON.stringify(payload),
    filePathsJson: "[]",
    createdAt,
    updatedAt: createdAt,
    syncedAt: null,
    lastError: null,
    serverId: null,
  }
  await upsertPackage(record)
  const directory = packageDirectory(createdAt, record.candidateNumber, record.id)
  await writeRecoveryManifest(`${directory}/interview.json`, { ...record, payload })
}

export async function archiveInterviewDraft(input: {
  candidate: CandidateDetails
  answers: Record<number, AnswerValue>
  practicalTaskAnswers: PracticalTaskAnswers
  generalInformationComment: string
  step: number
}) {
  if (!isNativeArchiveAvailable()) return
  const now = new Date().toISOString()
  const candidateName = `${input.candidate.firstName} ${input.candidate.lastName}`.trim()
  const payload = { ...input, updatedAt: now }
  const record: NativePackageRecord = {
    id: CURRENT_DRAFT_ID,
    kind: "interview",
    candidateNumber: input.candidate.candidateNumber,
    candidateName,
    status: "draft",
    payloadJson: JSON.stringify(payload),
    filePathsJson: "[]",
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    lastError: null,
    serverId: null,
  }
  await upsertPackage(record)
  await writeRecoveryManifest(`${ARCHIVE_ROOT}/drafts/current/interview.json`, {
    ...record,
    payload,
  })
}

export async function deleteNativeInterviewDraft() {
  if (!isNativeArchiveAvailable()) return
  const connection = await database()
  await connection.run("DELETE FROM local_packages WHERE id = ?", [CURRENT_DRAFT_ID])
  await Filesystem.deleteFile({
    path: `${ARCHIVE_ROOT}/drafts/current/interview.json`,
    directory: Directory.Documents,
  }).catch(() => undefined)
}

export async function getNativeInterviewDraft() {
  if (!isNativeArchiveAvailable()) return null
  const connection = await database()
  const result = await connection.query(
    "SELECT payload_json AS payloadJson FROM local_packages WHERE id = ? LIMIT 1",
    [CURRENT_DRAFT_ID],
  )
  const row = result.values?.[0] as { payloadJson?: string } | undefined
  if (!row?.payloadJson) return null
  return JSON.parse(row.payloadJson) as {
    candidate: CandidateDetails
    answers: Record<number, AnswerValue>
    practicalTaskAnswers: PracticalTaskAnswers
    generalInformationComment: string
    step: number
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function archiveCandidatePhotos(input: {
  id: string
  candidateNumber: string
  candidateName: string
  photos: Blob[]
}) {
  if (!isNativeArchiveAvailable()) return
  const createdAt = new Date().toISOString()
  const directory = packageDirectory(createdAt, input.candidateNumber, input.id)
  await ensureDirectory(directory, Directory.Data)
  await ensureDirectory(directory, Directory.Documents)

  const filePaths: string[] = []
  for (const [index, photo] of input.photos.entries()) {
    const name = `photo-${index + 1}.jpg`
    const path = `${directory}/${name}`
    const data = arrayBufferToBase64(await photo.arrayBuffer())
    await Filesystem.writeFile({ path, directory: Directory.Data, data, recursive: true })
    await Filesystem.writeFile({ path, directory: Directory.Documents, data, recursive: true })
    filePaths.push(path)
  }

  const payload = {
    clientSubmissionId: input.id,
    candidateNumber: input.candidateNumber,
    candidateName: input.candidateName,
  }
  const record: NativePackageRecord = {
    id: input.id,
    kind: "candidate_photos",
    candidateNumber: input.candidateNumber,
    candidateName: input.candidateName,
    status: "pending",
    payloadJson: JSON.stringify(payload),
    filePathsJson: JSON.stringify(filePaths),
    createdAt,
    updatedAt: createdAt,
    syncedAt: null,
    lastError: null,
    serverId: null,
  }
  await upsertPackage(record)
  await writeRecoveryManifest(`${directory}/manifest.json`, { ...record, payload, files: filePaths })
}

export async function updateNativePackageStatus(
  id: string,
  status: NativePackageStatus,
  options: { error?: string | null; serverId?: string | number | null } = {},
) {
  if (!isNativeArchiveAvailable()) return
  const connection = await database()
  const now = new Date().toISOString()
  await connection.run(
    `
      UPDATE local_packages
      SET status = ?, updated_at = ?, synced_at = ?, last_error = ?, server_id = COALESCE(?, server_id)
      WHERE id = ?
    `,
    [
      status,
      now,
      status === "synced" ? now : null,
      options.error ?? null,
      options.serverId == null ? null : String(options.serverId),
      id,
    ],
  )
}

export async function listNativePackages() {
  if (!isNativeArchiveAvailable()) return []
  const connection = await database()
  const result = await connection.query(`
    SELECT
      id,
      kind,
      candidate_number AS candidateNumber,
      candidate_name AS candidateName,
      status,
      payload_json AS payloadJson,
      file_paths_json AS filePathsJson,
      created_at AS createdAt,
      updated_at AS updatedAt,
      synced_at AS syncedAt,
      last_error AS lastError,
      server_id AS serverId
    FROM local_packages
    ORDER BY created_at DESC
  `)
  return (result.values ?? []) as NativePackageRecord[]
}
