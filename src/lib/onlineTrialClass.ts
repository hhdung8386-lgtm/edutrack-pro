import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'
import {
  normalizeOnlineTrialClass,
  normalizeOnlineTrialClassCreateResult,
  normalizeOnlineTrialClassListResult,
  type OnlineTrialClassCreateResult,
  type OnlineTrialClassListResult,
  type OnlineTrialClassSummary,
} from '@/lib/onlineTrialClassModel'

export type CreateOnlineTrialClassInput = {
  mode: 'later' | 'instant'
  title?: string
  guestDisplayName?: string
}

type CreateOnlineTrialClassCallableInput = CreateOnlineTrialClassInput & {
  clientRequestId: string
}

export type ListOnlineTrialClassesInput = {
  limit?: number
}

export type EndOnlineTrialClassInput = {
  roomId: string
}

export type TrialClassroomAccess = {
  roomId: string
  trialClassId: string
  classroomType: 'trial'
  meetingProvider: 'jaas'
  meetingDomain: string
  meetingAppId: string
  meetingJwt: string
  roomName: string
  role: 'admin' | 'teacher' | 'student'
  displayName: string
  title: string
  joinUrl: string
  status: 'ready' | 'live' | 'ended' | 'expired'
  state: 'ready' | 'live' | 'ended' | 'expired'
  hardEndsAt: string | null
  accessExpiresAt: string | null
  serverNow: string | null
  accountingImpact: 'none'
}

type GetOnlineTrialClassAccessInput = {
  trialClassId: string
  displayName?: string
}

const functions = getFunctions(app, 'asia-southeast1')

const createCallable = httpsCallable<CreateOnlineTrialClassCallableInput, unknown>(
  functions,
  'createOnlineTrialClass',
)
const listCallable = httpsCallable<ListOnlineTrialClassesInput, unknown>(
  functions,
  'listOnlineTrialClasses',
)
const endCallable = httpsCallable<EndOnlineTrialClassInput, unknown>(
  functions,
  'endOnlineTrialClass',
)
const accessCallable = httpsCallable<GetOnlineTrialClassAccessInput, unknown>(
  functions,
  'getOnlineTrialClassAccess',
)

const pendingCreateRequestIds = new Map<string, string>()
const CREATE_REQUEST_STORAGE_PREFIX = '123english:trial-create-request:'
const CREATE_REQUEST_MAX_AGE_MS = 30 * 60 * 1_000

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `trial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

function createFingerprint(input: CreateOnlineTrialClassInput): string {
  return JSON.stringify({
    mode: input.mode,
    title: input.title?.trim() || '',
    guestDisplayName: input.guestDisplayName?.trim() || '',
  })
}

function fingerprintStorageKey(fingerprint: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `${CREATE_REQUEST_STORAGE_PREFIX}${(hash >>> 0).toString(36)}`
}

function readStoredCreateRequestId(fingerprint: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.sessionStorage.getItem(fingerprintStorageKey(fingerprint))
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { fingerprint?: unknown; requestId?: unknown; createdAt?: unknown }
    if (parsed.fingerprint !== fingerprint
      || typeof parsed.requestId !== 'string'
      || !parsed.requestId
      || typeof parsed.createdAt !== 'number'
      || Date.now() - parsed.createdAt > CREATE_REQUEST_MAX_AGE_MS) {
      window.sessionStorage.removeItem(fingerprintStorageKey(fingerprint))
      return ''
    }
    return parsed.requestId
  } catch {
    return ''
  }
}

function storeCreateRequestId(fingerprint: string, requestId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(fingerprintStorageKey(fingerprint), JSON.stringify({
      fingerprint,
      requestId,
      createdAt: Date.now(),
    }))
  } catch {
    // The in-memory idempotency key remains available when storage is blocked.
  }
}

function clearStoredCreateRequestId(fingerprint: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(fingerprintStorageKey(fingerprint))
  } catch {
    // Nothing else is required after a confirmed successful creation.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function nullableStringField(record: Record<string, unknown>, key: string): string | null {
  return stringField(record, key) || null
}

export async function createOnlineTrialClass(
  input: CreateOnlineTrialClassInput,
): Promise<OnlineTrialClassCreateResult> {
  const fingerprint = createFingerprint(input)
  const clientRequestId = pendingCreateRequestIds.get(fingerprint)
    || readStoredCreateRequestId(fingerprint)
    || createRequestId()
  pendingCreateRequestIds.set(fingerprint, clientRequestId)
  storeCreateRequestId(fingerprint, clientRequestId)
  // A failed call intentionally leaves the key in memory. Retrying the same
  // payload therefore reaches the backend as the same logical creation.
  const response = await createCallable({ ...input, clientRequestId })
  const result = normalizeOnlineTrialClassCreateResult(response.data)
  pendingCreateRequestIds.delete(fingerprint)
  clearStoredCreateRequestId(fingerprint)
  return result
}

export async function listOnlineTrialClasses(
  input: ListOnlineTrialClassesInput = {},
): Promise<OnlineTrialClassListResult> {
  const response = await listCallable(input)
  return normalizeOnlineTrialClassListResult(response.data)
}

export async function endOnlineTrialClass(
  roomId: string,
): Promise<OnlineTrialClassSummary> {
  const response = await endCallable({ roomId })
  const data = response.data
  const source = typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>).room
      ?? (data as Record<string, unknown>).trialClass
      ?? data
    : data
  const room = normalizeOnlineTrialClass(source)
  if (!room) throw new Error('Máy chủ chưa xác nhận phòng đã kết thúc.')
  return room
}

export async function getOnlineTrialClassAccess(
  trialClassId: string,
  displayName?: string,
): Promise<TrialClassroomAccess> {
  const response = await accessCallable({
    trialClassId,
    ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
  })
  if (!isRecord(response.data)) throw new Error('Máy chủ chưa trả quyền truy cập phòng học thử.')
  const data = response.data
  const roomId = stringField(data, 'roomId') || stringField(data, 'trialClassId')
  const resolvedTrialClassId = stringField(data, 'trialClassId') || roomId
  const meetingProvider = stringField(data, 'meetingProvider')
  const role = stringField(data, 'role')
  const accountingImpact = stringField(data, 'accountingImpact')
  const rawStatus = stringField(data, 'status') || stringField(data, 'state')
  const rawState = stringField(data, 'state') || rawStatus
  if (!roomId || !resolvedTrialClassId) throw new Error('Máy chủ chưa trả mã phòng học thử.')
  if (meetingProvider !== 'jaas') throw new Error('Phòng học thử chưa có cấu hình JaaS hợp lệ.')
  if (!['admin', 'teacher', 'student'].includes(role)) throw new Error('Máy chủ chưa xác định vai trò vào phòng.')
  if (!['ready', 'live', 'ended', 'expired'].includes(rawStatus)
    || !['ready', 'live', 'ended', 'expired'].includes(rawState)) {
    throw new Error('Máy chủ trả trạng thái phòng học thử không hợp lệ.')
  }
  if (accountingImpact !== 'none') throw new Error('Phòng học thử có cấu hình tính phí không hợp lệ.')

  const requiredKeys = ['meetingDomain', 'meetingAppId', 'meetingJwt', 'roomName', 'title', 'joinUrl'] as const
  for (const key of requiredKeys) {
    if (!stringField(data, key)) throw new Error(`Máy chủ chưa trả trường ${key} của phòng học thử.`)
  }

  return {
    roomId,
    trialClassId: resolvedTrialClassId,
    classroomType: 'trial',
    meetingProvider: 'jaas',
    meetingDomain: stringField(data, 'meetingDomain'),
    meetingAppId: stringField(data, 'meetingAppId'),
    meetingJwt: stringField(data, 'meetingJwt'),
    roomName: stringField(data, 'roomName'),
    role: role as TrialClassroomAccess['role'],
    displayName: stringField(data, 'displayName'),
    title: stringField(data, 'title'),
    joinUrl: stringField(data, 'joinUrl'),
    status: rawStatus as TrialClassroomAccess['status'],
    state: rawState as TrialClassroomAccess['state'],
    hardEndsAt: nullableStringField(data, 'hardEndsAt'),
    accessExpiresAt: nullableStringField(data, 'accessExpiresAt'),
    serverNow: nullableStringField(data, 'serverNow'),
    accountingImpact: 'none',
  }
}

export function onlineTrialClassErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  const cleaned = raw
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/^\[?functions\/[a-z-]+\]?:\s*/i, '')
    .trim()

  if (/permission-denied|không có quyền/i.test(cleaned)) {
    return 'Tài khoản hiện tại không có quyền quản lý phòng học thử.'
  }
  if (/unauthenticated|đăng nhập/i.test(cleaned)) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  }
  if (/resource-exhausted|too many|quá nhiều/i.test(cleaned)) {
    return 'Hệ thống đang tạo quá nhiều phòng. Vui lòng chờ ít giây rồi thử lại.'
  }
  if (/failed-precondition|đã kết thúc/i.test(cleaned)) {
    return 'Phòng này đã kết thúc hoặc không còn ở trạng thái có thể thao tác.'
  }
  if (/unavailable|network|offline/i.test(cleaned)) {
    return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.'
  }
  if (/internal|unknown|not-found/i.test(cleaned)) {
    return 'Máy chủ phòng học thử chưa sẵn sàng. Vui lòng thử lại sau ít phút.'
  }
  return cleaned || 'Chưa thể xử lý phòng học thử. Vui lòng thử lại.'
}

export type {
  OnlineTrialClassCreateResult,
  OnlineTrialClassListResult,
  OnlineTrialClassStatus,
  OnlineTrialClassSummary,
  OnlineTrialClassTab,
} from '@/lib/onlineTrialClassModel'
