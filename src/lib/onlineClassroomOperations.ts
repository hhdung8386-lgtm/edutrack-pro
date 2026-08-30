import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'
import { extendOnlineClassroomSession as extendSession } from '@/lib/onlineClassroom'

export type OnlineClassroomOperationSession = {
  status: string
  teacherFirstJoinedAt: string | null
  teacherLastLeftAt: string | null
  teacherJoinCount: number
  studentFirstJoinedAt: string | null
  studentLastLeftAt: string | null
  studentJoinCount: number
  teacherLateSeconds: number
}

export type OnlineClassroomOperationRow = {
  bookingId: string
  requestedDate: string
  requestedStart: string
  requestedEnd: string
  studentId: string
  studentName: string
  studentCode: string
  teacherId: string
  teacherName: string
  teacherCode: string
  subjectName: string
  pilotEnabled: boolean
  eligible: boolean
  blockReason: string | null
  status?: string
  roomCreated: boolean
  extensionMinutes: number
  extensionAvailable: boolean
  scheduledEndsAt: string | null
  hardEndsAt: string | null
  session: OnlineClassroomOperationSession | null
}

export type GetOnlineClassroomOperationsInput = {
  fromDate: string
  toDate: string
}

export type GetOnlineClassroomOperationsResult = {
  serverNow: string
  truncated?: boolean
  rows: OnlineClassroomOperationRow[]
}

export type ExtendOnlineClassroomSessionInput = {
  bookingId: string
  minutes: 10
}

const functions = getFunctions(app, 'asia-southeast1')

const getOperationsCallable = httpsCallable<
  GetOnlineClassroomOperationsInput,
  GetOnlineClassroomOperationsResult
>(functions, 'getOnlineClassroomOperations')

export async function getOnlineClassroomOperations(
  input: GetOnlineClassroomOperationsInput,
): Promise<GetOnlineClassroomOperationsResult> {
  return (await getOperationsCallable(input)).data
}

/** Keep the page API aligned with the callable's object payload. */
export async function extendOnlineClassroomSession(input: ExtendOnlineClassroomSessionInput) {
  return extendSession(input.bookingId, input.minutes)
}

export function onlineClassroomOperationsErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  return raw
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/^\[?functions\/[a-z-]+\]?:\s*/i, '')
    .trim() || 'Chưa thể tải dữ liệu vận hành lớp trực tuyến. Vui lòng thử lại.'
}
