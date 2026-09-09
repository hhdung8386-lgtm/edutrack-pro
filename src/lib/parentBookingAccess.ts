import { Timestamp } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { BookingCancellationRequest, BookingRequest, DayOfWeek, Student } from '@/types'
import app from '@/lib/firebase'

export type ParentBookingAccessInput = {
  studentId: string
  studentCode: string
  teacherIds?: string[]
  busyFromDate?: string
  busyToDate?: string
}

export type CancelParentBookingInput = {
  studentId: string
  studentCode: string
  bookingId: string
  reason: string
}

export type ParentBookingState = {
  bookings: BookingRequest[]
  busySlots: BookingRequest[]
  cancellationRequests: BookingCancellationRequest[]
  studentPatch: Partial<Student>
}

const functions = getFunctions(app, 'asia-southeast1')
const getStateCallable = httpsCallable<ParentBookingAccessInput, unknown>(functions, 'getParentBookingState')
const cancelCallable = httpsCallable<CancelParentBookingInput, unknown>(functions, 'cancelParentBooking')

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown, fallback = 0): number {
  const candidate = Number(value)
  return Number.isFinite(candidate) ? candidate : fallback
}

function timestamp(value: unknown): Timestamp | undefined {
  const millis = Number(value)
  return Number.isFinite(millis) ? Timestamp.fromMillis(millis) : undefined
}

function booking(value: unknown, busy = false): BookingRequest {
  const data = record(value)
  const status = text(data.status) as BookingRequest['status']
  const minutes = number(data.requestedMinutes, 25) as BookingRequest['requestedMinutes']
  const decoded: BookingRequest = {
    id: text(data.id),
    status,
    teacherId: text(data.teacherId),
    teacherCode: busy ? '' : text(data.teacherCode),
    teacherName: busy ? '' : text(data.teacherName),
    teacherPhotoURL: busy ? '' : text(data.teacherPhotoURL),
    studentId: busy ? '' : text(data.studentId),
    studentCode: busy ? '' : text(data.studentCode),
    studentName: busy ? '' : text(data.studentName),
    requestedDay: (text(data.requestedDay) || 'mon') as DayOfWeek,
    requestedDate: text(data.requestedDate),
    requestedWeekStart: text(data.requestedWeekStart),
    requestedStart: text(data.requestedStart),
    requestedEnd: text(data.requestedEnd),
    requestedMinutes: minutes,
    createdAt: timestamp(data.createdAtMs) || Timestamp.fromMillis(0),
  }
  const textFields = [
    'groupClassId', 'groupClassCode', 'groupClassName', 'subjectId', 'subjectName',
    'note', 'classroomURL', 'curriculumLink', 'confirmedBy', 'rejectedBy', 'releasedBy',
    'lessonId', 'currency', 'teacherRespondedBy', 'rebookedByBookingId', 'classHuntId',
  ] as const
  textFields.forEach((key) => {
    const field = text(data[key])
    if (field) (decoded as unknown as Record<string, unknown>)[key] = field
  })
  if (Array.isArray(data.groupClassMemberIds)) {
    decoded.groupClassMemberIds = data.groupClassMemberIds.filter((item): item is string => typeof item === 'string')
  }
  const numberFields = [
    'availableMinutesAtRequest', 'heldMinutesAtRequest', 'requestedPoints', 'pointsPer25Minutes',
    'heldMinutesAfterRequest', 'rebookHoldPoints',
  ] as const
  numberFields.forEach((key) => {
    if (data[key] !== undefined) (decoded as unknown as Record<string, unknown>)[key] = number(data[key])
  })
  if (typeof data.heldImmediately === 'boolean') decoded.heldImmediately = data.heldImmediately
  if (typeof data.pendingRebook === 'boolean') decoded.pendingRebook = data.pendingRebook
  // This is an access-control marker only. The immutable compensation itself
  // intentionally never crosses into the parent portal response.
  if (data.parentRebookManaged === true) decoded.parentRebookManaged = true
  const teacherResponse = text(data.teacherResponse)
  if (['pending', 'accepted', 'declined'].includes(teacherResponse)) {
    decoded.teacherResponse = teacherResponse as BookingRequest['teacherResponse']
  }
  const timestampFields = [
    'confirmedAt', 'rejectedAt', 'releasedAt', 'completedAt',
    'teacherConfirmationDeadlineAt', 'teacherRespondedAt', 'rebookedAt',
  ] as const
  timestampFields.forEach((key) => {
    const decodedTimestamp = timestamp(data[`${key}Ms`])
    if (decodedTimestamp) (decoded as unknown as Record<string, unknown>)[key] = decodedTimestamp
  })
  return decoded
}

function cancellation(value: unknown): BookingCancellationRequest {
  const data = record(value)
  return {
    id: text(data.id),
    studentId: text(data.studentId),
    studentCode: text(data.studentCode),
    studentName: text(data.studentName),
    bookingId: text(data.bookingId),
    status: text(data.status) as BookingCancellationRequest['status'],
    requestedAt: timestamp(data.requestedAtMs) || Timestamp.fromMillis(0),
    ...(timestamp(data.resolvedAtMs) ? { resolvedAt: timestamp(data.resolvedAtMs) } : {}),
  }
}

export async function getParentBookingState(input: ParentBookingAccessInput): Promise<ParentBookingState> {
  const response = record((await getStateCallable(input)).data)
  const patch = record(response.studentPatch)
  return {
    bookings: (Array.isArray(response.bookings) ? response.bookings : []).map((item) => booking(item)),
    busySlots: (Array.isArray(response.busySlots) ? response.busySlots : []).map((item) => booking(item, true)),
    cancellationRequests: (Array.isArray(response.cancellationRequests) ? response.cancellationRequests : []).map(cancellation),
    studentPatch: {
      reservedMinutes: number(patch.reservedMinutes),
      heldMinutes: number(patch.heldMinutes),
      pendingRebookBookingId: text(patch.pendingRebookBookingId),
      pendingRebookPoints: number(patch.pendingRebookPoints),
    },
  }
}

export async function cancelParentBooking(input: CancelParentBookingInput): Promise<Partial<Student>> {
  const response = record((await cancelCallable(input)).data)
  const patch = record(response.studentPatch)
  return {
    reservedMinutes: number(patch.reservedMinutes),
    heldMinutes: number(patch.heldMinutes),
    pendingRebookBookingId: text(patch.pendingRebookBookingId),
    pendingRebookPoints: number(patch.pendingRebookPoints),
  }
}

export function parentBookingAccessErrorReason(error: unknown): string {
  const root = record(error)
  const details = record(root.details)
  const reason = details.reason ?? root.reason ?? root.code
  return typeof reason === 'string' ? reason.replace(/^functions\//, '').toUpperCase() : ''
}
