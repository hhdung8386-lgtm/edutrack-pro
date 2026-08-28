import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type OnlineClassroomRecordingMetadata = {
  recordingId: string
  bookingId: string
  status: string
  teacherName: string
  studentName: string
  subjectName: string
  requestedDate: string
  requestedStart: string
  requestedEnd: string
  fileName: string
  sizeBytes: number
  readyAt: string | null
  expiresAt: string | null
}

export type OnlineClassroomRecordingAccess = OnlineClassroomRecordingMetadata & {
  viewerRole: 'admin' | 'teacher' | 'student'
  playbackUrl: string
  downloadUrl: string
}

export type OnlineClassroomRecordingSummary = OnlineClassroomRecordingMetadata & {
  viewUrl: string
}

const functions = getFunctions(app, 'asia-southeast1')

const startRecordingCallable = httpsCallable<
  { bookingId: string; mimeType: string },
  {
    recordingId: string
    uploadSessionUrl: string
    replayUrl: string
    shareToken: string
    expiresAt: string
    maxBytes: number
  }
>(functions, 'startOnlineClassroomRecording')

const finalizeRecordingCallable = httpsCallable<
  { recordingId: string },
  { success: boolean } & OnlineClassroomRecordingMetadata
>(functions, 'finalizeOnlineClassroomRecording')

const abandonRecordingCallable = httpsCallable<
  { recordingId: string },
  { success: boolean }
>(functions, 'abandonOnlineClassroomRecording')

const getRecordingCallable = httpsCallable<
  { recordingId: string; token?: string },
  OnlineClassroomRecordingAccess
>(functions, 'getOnlineClassroomRecording')

const createShareLinkCallable = httpsCallable<
  { recordingId: string },
  { replayUrl: string }
>(functions, 'createOnlineClassroomRecordingShareLink')

const confirmDownloadedCallable = httpsCallable<
  { recordingId: string; token?: string; confirmed: true },
  { success: boolean; alreadyDeleted: boolean }
>(functions, 'confirmOnlineClassroomRecordingDownloaded')

const listRecordingsCallable = httpsCallable<
  { bookingIds: string[] },
  { recordings: Record<string, OnlineClassroomRecordingSummary> }
>(functions, 'getOnlineClassroomRecordingsForBookings')

export async function startOnlineClassroomRecording(bookingId: string, mimeType: string) {
  return (await startRecordingCallable({ bookingId, mimeType })).data
}

export async function finalizeOnlineClassroomRecording(recordingId: string) {
  return (await finalizeRecordingCallable({ recordingId })).data
}

export async function abandonOnlineClassroomRecording(recordingId: string) {
  return (await abandonRecordingCallable({ recordingId })).data
}

export async function getOnlineClassroomRecording(recordingId: string, token?: string) {
  return (await getRecordingCallable({ recordingId, ...(token ? { token } : {}) })).data
}

export async function createOnlineClassroomRecordingShareLink(recordingId: string) {
  return (await createShareLinkCallable({ recordingId })).data.replayUrl
}

export async function confirmOnlineClassroomRecordingDownloaded(recordingId: string, token?: string) {
  return (await confirmDownloadedCallable({ recordingId, confirmed: true, ...(token ? { token } : {}) })).data
}

export async function getOnlineClassroomRecordingsForBookings(bookingIds: string[]) {
  return (await listRecordingsCallable({ bookingIds })).data.recordings
}

const recordingTokenStorageKey = (recordingId: string) => `123english_recording_token_${recordingId}`

export function readOnlineClassroomRecordingToken(recordingId: string): string {
  if (typeof window === 'undefined') return ''
  const fragmentToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')?.trim()
  if (fragmentToken) return fragmentToken
  try {
    return window.sessionStorage.getItem(recordingTokenStorageKey(recordingId)) || ''
  } catch {
    return ''
  }
}

export function rememberOnlineClassroomRecordingToken(recordingId: string, token: string): void {
  if (typeof window === 'undefined' || !token) return
  try {
    window.sessionStorage.setItem(recordingTokenStorageKey(recordingId), token)
  } catch {
    // Link vẫn hoạt động trong lần tải hiện tại nếu trình duyệt chặn sessionStorage.
  }
}

export function removeOnlineClassroomRecordingTokenFromAddressBar(): void {
  if (typeof window === 'undefined' || !window.location.hash) return
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
}

export function onlineClassroomRecordingErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  return raw
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/^functions\/[a-z-]+:\s*/i, '')
    .trim() || 'Chưa thể truy cập bản ghi. Vui lòng thử lại.'
}
