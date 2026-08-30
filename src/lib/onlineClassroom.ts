import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'
import {
  bookingIntervalEndInMinutes,
  bookingIntervalStartInMinutes,
  type BookingIntervalLike,
} from '@/lib/bookingTime'
import type { OnlineClassroomMeetingProvider } from '@/lib/jitsiMeeting'

export type { OnlineClassroomMeetingProvider } from '@/lib/jitsiMeeting'

export type OnlineClassroomRole = 'admin' | 'teacher' | 'student'
export type OnlineClassroomTargetType = 'teacher' | 'student'

export type ClassroomBoardSnapshot = {
  version: number
  generation?: number
  studentCanWrite: boolean
  operations: unknown[]
}

export type ClassroomBoardDraft = Omit<ClassroomBoardSnapshot, 'version'>

export type OnlineClassroomScreenAnnotationSession = {
  sessionId: string
  active: boolean
  boardSnapshot: ClassroomBoardSnapshot
}

export type OnlineClassroomRecordingConsent = {
  requestId: string
  status: 'pending' | 'accepted' | 'declined' | 'recording'
  requestedByRole: 'admin' | 'teacher'
  requestedAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
  expiresAt: string | null
}

export type OnlineClassroomAccess = {
  bookingId: string
  roomName: string
  meetingDomain: string
  meetingProvider?: OnlineClassroomMeetingProvider
  meetingAppId?: string
  meetingJwt?: string
  publicPilotProvider: boolean
  role: OnlineClassroomRole
  displayName: string
  studentName: string
  teacherName: string
  subjectName: string
  requestedDate: string
  requestedStart: string
  requestedEnd: string
  scheduledStartsAt: string
  scheduledEndsAt: string
  hardEndsAt: string
  extensionMinutes: number
  extensionAvailable: boolean
  serverNow: string
  curriculumLink: string
  boardSnapshot: ClassroomBoardSnapshot
  screenAnnotationSession: OnlineClassroomScreenAnnotationSession | null
  recordingNotice: {
    active: true
    recordingId: string
    startedByRole: 'admin' | 'teacher'
    startedAt: string | null
  } | null
  recordingConsent: OnlineClassroomRecordingConsent | null
}

const functions = getFunctions(app, 'asia-southeast1')

const getPilotStatusCallable = httpsCallable<
  { targetType: OnlineClassroomTargetType; targetId: string },
  {
    enabled: boolean
    credentialHardened: boolean | null
    accountReady: boolean | null
    updatedAt: string | null
  }
>(functions, 'getOnlineClassroomPilotStatus')

const setPilotAccessCallable = httpsCallable<
  { targetType: OnlineClassroomTargetType; targetId: string; enabled: boolean },
  { success: boolean; enabled: boolean }
>(functions, 'setOnlineClassroomPilotAccess')

const issueInviteCallable = httpsCallable<
  { bookingId: string },
  { joinUrl: string }
>(functions, 'issueOnlineClassroomInvite')

const getAccessCallable = httpsCallable<
  { bookingId: string; token?: string },
  OnlineClassroomAccess
>(functions, 'getOnlineClassroomAccess')

const extendSessionCallable = httpsCallable<
  { bookingId: string; minutes: number },
  {
    success: boolean
    extensionMinutes: number
    scheduledEndsAt: string
    hardEndsAt: string
    extensionAvailable: false
    revision: number
    serverNow: string
  }
>(functions, 'extendOnlineClassroomSession')

const saveBoardCallable = httpsCallable<
  { bookingId: string; token?: string; expectedVersion: number; boardSnapshot: ClassroomBoardDraft },
  { success: boolean; version: number; unchanged: boolean }
>(functions, 'saveOnlineClassroomBoard')

const appendBoardOperationCallable = httpsCallable<
  { bookingId: string; token?: string; expectedGeneration: number; operation: unknown },
  {
    success: boolean
    appended: boolean
    duplicate: boolean
    version: number
    boardSnapshot: ClassroomBoardSnapshot
  }
>(functions, 'appendOnlineClassroomBoardOperation')

const beginScreenAnnotationCallable = httpsCallable<
  { bookingId: string },
  { success: boolean; unchanged: boolean; screenAnnotationSession: OnlineClassroomScreenAnnotationSession }
>(functions, 'beginOnlineClassroomScreenAnnotation')

const appendScreenAnnotationOperationCallable = httpsCallable<
  { bookingId: string; sessionId: string; token?: string; expectedGeneration: number; operation: unknown },
  {
    success: boolean
    appended: boolean
    duplicate: boolean
    version: number
    screenAnnotationSession: OnlineClassroomScreenAnnotationSession
  }
>(functions, 'appendOnlineClassroomScreenAnnotationOperation')

const saveScreenAnnotationCallable = httpsCallable<
  {
    bookingId: string
    sessionId: string
    expectedVersion: number
    boardSnapshot: ClassroomBoardDraft
  },
  { success: boolean; version: number; unchanged: boolean; screenAnnotationSession: OnlineClassroomScreenAnnotationSession }
>(functions, 'saveOnlineClassroomScreenAnnotation')

const endScreenAnnotationCallable = httpsCallable<
  { bookingId: string; sessionId: string },
  { success: boolean; screenAnnotationSession: OnlineClassroomScreenAnnotationSession }
>(functions, 'endOnlineClassroomScreenAnnotation')

const requestRecordingConsentCallable = httpsCallable<
  { bookingId: string },
  { recordingConsent: OnlineClassroomRecordingConsent }
>(functions, 'requestOnlineClassroomRecordingConsent')

const respondRecordingConsentCallable = httpsCallable<
  { bookingId: string; requestId: string; accepted: boolean; token?: string },
  { recordingConsent: OnlineClassroomRecordingConsent }
>(functions, 'respondOnlineClassroomRecordingConsent')

export async function getOnlineClassroomPilotStatus(targetType: OnlineClassroomTargetType, targetId: string) {
  return (await getPilotStatusCallable({ targetType, targetId })).data
}

export async function setOnlineClassroomPilotAccess(
  targetType: OnlineClassroomTargetType,
  targetId: string,
  enabled: boolean,
) {
  return (await setPilotAccessCallable({ targetType, targetId, enabled })).data
}

export async function issueOnlineClassroomInvite(bookingId: string): Promise<string> {
  return (await issueInviteCallable({ bookingId })).data.joinUrl
}

export async function requestOnlineClassroomAccess(bookingId: string, token?: string): Promise<OnlineClassroomAccess> {
  return (await getAccessCallable({ bookingId, ...(token ? { token } : {}) })).data
}

export async function extendOnlineClassroomSession(bookingId: string, minutes = 10) {
  return (await extendSessionCallable({ bookingId, minutes })).data
}

export async function saveOnlineClassroomBoard(
  bookingId: string,
  expectedVersion: number,
  boardSnapshot: ClassroomBoardDraft,
  token?: string,
) {
  return (await saveBoardCallable({ bookingId, expectedVersion, boardSnapshot, ...(token ? { token } : {}) })).data
}

export async function appendOnlineClassroomBoardOperation(
  bookingId: string,
  operation: unknown,
  expectedGeneration: number,
  token?: string,
) {
  return (await appendBoardOperationCallable({
    bookingId,
    operation,
    expectedGeneration,
    ...(token ? { token } : {}),
  })).data
}

export async function beginOnlineClassroomScreenAnnotation(bookingId: string) {
  return (await beginScreenAnnotationCallable({ bookingId })).data.screenAnnotationSession
}

export async function appendOnlineClassroomScreenAnnotationOperation(
  bookingId: string,
  sessionId: string,
  operation: unknown,
  expectedGeneration: number,
  token?: string,
) {
  return (await appendScreenAnnotationOperationCallable({
    bookingId,
    sessionId,
    operation,
    expectedGeneration,
    ...(token ? { token } : {}),
  })).data.screenAnnotationSession
}

export async function saveOnlineClassroomScreenAnnotation(
  bookingId: string,
  sessionId: string,
  expectedVersion: number,
  boardSnapshot: ClassroomBoardDraft,
) {
  return (await saveScreenAnnotationCallable({
    bookingId,
    sessionId,
    expectedVersion,
    boardSnapshot,
  })).data.screenAnnotationSession
}

export async function endOnlineClassroomScreenAnnotation(bookingId: string, sessionId: string) {
  return (await endScreenAnnotationCallable({ bookingId, sessionId })).data.screenAnnotationSession
}

export async function requestOnlineClassroomRecordingConsent(bookingId: string) {
  return (await requestRecordingConsentCallable({ bookingId })).data.recordingConsent
}

export async function respondOnlineClassroomRecordingConsent(
  bookingId: string,
  requestId: string,
  accepted: boolean,
  token?: string,
) {
  return (await respondRecordingConsentCallable({
    bookingId,
    requestId,
    accepted,
    ...(token ? { token } : {}),
  })).data.recordingConsent
}

const tokenStorageKey = (bookingId: string) => `123english_classroom_token_${bookingId}`

export function classroomRoute(bookingId: string): string {
  return `/lop-hoc/${encodeURIComponent(bookingId)}`
}

const VIETNAM_OFFSET_MINUTES = 7 * 60
const CLASSROOM_OPEN_BEFORE_MINUTES = 12 * 60
const CLASSROOM_CLOSE_AFTER_MINUTES = 0

export type OnlineClassroomJoinWindow = {
  isOpen: boolean
  opensAt: number | null
  closesAt: number | null
}

/**
 * Convert the repository's Vietnam wall-clock booking convention (including
 * 24:xx/25:00) to the same access window enforced by the callable backend.
 */
export function onlineClassroomJoinWindow(
  booking: BookingIntervalLike,
  nowMs: number,
): OnlineClassroomJoinWindow {
  const vietnamWallClockMinutes = bookingIntervalStartInMinutes(booking)
  const vietnamWallClockEndMinutes = bookingIntervalEndInMinutes(booking)
  if (!Number.isFinite(vietnamWallClockMinutes) || !Number.isFinite(vietnamWallClockEndMinutes)) {
    return { isOpen: false, opensAt: null, closesAt: null }
  }

  const startsAt = (vietnamWallClockMinutes - VIETNAM_OFFSET_MINUTES) * 60_000
  const opensAt = startsAt - CLASSROOM_OPEN_BEFORE_MINUTES * 60_000
  const endsAt = (vietnamWallClockEndMinutes - VIETNAM_OFFSET_MINUTES) * 60_000
  const closesAt = endsAt + CLASSROOM_CLOSE_AFTER_MINUTES * 60_000
  return { isOpen: nowMs >= opensAt && nowMs < closesAt, opensAt, closesAt }
}

export function readClassroomToken(bookingId: string): string {
  if (typeof window === 'undefined') return ''
  const fragmentToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')?.trim()
  if (fragmentToken) return fragmentToken
  try {
    return window.sessionStorage.getItem(tokenStorageKey(bookingId)) || ''
  } catch {
    return ''
  }
}

export function rememberClassroomToken(bookingId: string, token: string) {
  if (typeof window === 'undefined' || !token) return
  try {
    window.sessionStorage.setItem(tokenStorageKey(bookingId), token)
  } catch {
    // Phiên riêng tư có thể chặn sessionStorage; token vẫn sống trong state của trang hiện tại.
  }
}

export function forgetClassroomToken(bookingId: string) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(tokenStorageKey(bookingId))
  } catch {
    // Không có gì cần làm nếu trình duyệt chặn sessionStorage.
  }
}

export function removeClassroomTokenFromAddressBar() {
  if (typeof window === 'undefined' || !window.location.hash) return
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
}

export function cachedClassroomJoinLink(bookingId: string): string {
  if (typeof window === 'undefined') return ''
  const token = readClassroomToken(bookingId)
  return token ? `${window.location.origin}${classroomRoute(bookingId)}#token=${encodeURIComponent(token)}` : ''
}

export function onlineClassroomErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  return raw
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/^functions\/[a-z-]+:\s*/i, '')
    .trim() || 'Chưa thể mở phòng học. Vui lòng thử lại.'
}
