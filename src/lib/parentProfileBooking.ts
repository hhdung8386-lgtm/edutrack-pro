import { Timestamp } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { BookingRequest, DayOfWeek, Student } from '@/types'
import app from '@/lib/firebase'

export type CreateParentProfileBookingInput = {
  studentId: string
  studentCode: string
  teacherId: string
  subjectId: string
  requestedDay: DayOfWeek
  requestedDate: string
  requestedWeekStart: string
  requestedStart: string
  requestedMinutes: 25 | 50 | 75 | 100
  clientRequestId: string
}

export type CreateParentProfileBookingResult = {
  booking: BookingRequest
  studentPatch: Partial<Student>
  idempotent: boolean
}

const functions = getFunctions(app, 'asia-southeast1')
const createCallable = httpsCallable<CreateParentProfileBookingInput, unknown>(
  functions,
  'createParentProfileBooking',
)

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`PARENT_BOOKING_RESPONSE_${field}_INVALID`)
  return value
}

function requiredNumber(value: unknown, field: string): number {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`PARENT_BOOKING_RESPONSE_${field}_INVALID`)
  return number
}

export function createParentProfileBookingClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const random = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('')
  return `parent-booking-${Date.now().toString(36)}-${random}`
}

export function parentProfileBookingRequestKey(input: Omit<CreateParentProfileBookingInput, 'clientRequestId'>): string {
  return JSON.stringify(input)
}

export async function createParentProfileBooking(
  input: CreateParentProfileBookingInput,
): Promise<CreateParentProfileBookingResult> {
  const response = record((await createCallable(input)).data)
  const booking = record(response.booking)
  const studentPatch = record(response.studentPatch)
  const createdAtMs = requiredNumber(booking.createdAtMs, 'CREATED_AT')
  const deadlineAtMs = requiredNumber(booking.teacherConfirmationDeadlineAtMs, 'DEADLINE')
  const requestedMinutes = requiredNumber(booking.requestedMinutes, 'MINUTES')
  if (![25, 50, 75, 100].includes(requestedMinutes)) throw new Error('PARENT_BOOKING_RESPONSE_MINUTES_INVALID')
  const status = requiredText(booking.status, 'STATUS')
  if (!['pending', 'confirmed', 'completed', 'rejected', 'released'].includes(status)) {
    throw new Error('PARENT_BOOKING_RESPONSE_STATUS_INVALID')
  }
  const teacherResponse = booking.teacherResponse
  if (teacherResponse !== undefined && !['pending', 'accepted', 'declined'].includes(String(teacherResponse))) {
    throw new Error('PARENT_BOOKING_RESPONSE_TEACHER_RESPONSE_INVALID')
  }

  return {
    booking: {
      id: requiredText(booking.id, 'ID'),
      status: status as BookingRequest['status'],
      teacherResponse: teacherResponse as BookingRequest['teacherResponse'],
      teacherId: requiredText(booking.teacherId, 'TEACHER_ID'),
      teacherCode: typeof booking.teacherCode === 'string' ? booking.teacherCode : '',
      teacherName: requiredText(booking.teacherName, 'TEACHER_NAME'),
      teacherPhotoURL: typeof booking.teacherPhotoURL === 'string' ? booking.teacherPhotoURL : '',
      studentId: requiredText(booking.studentId, 'STUDENT_ID'),
      studentCode: requiredText(booking.studentCode, 'STUDENT_CODE'),
      studentName: requiredText(booking.studentName, 'STUDENT_NAME'),
      subjectId: requiredText(booking.subjectId, 'SUBJECT_ID'),
      subjectName: requiredText(booking.subjectName, 'SUBJECT_NAME'),
      requestedDay: requiredText(booking.requestedDay, 'DAY') as DayOfWeek,
      requestedDate: requiredText(booking.requestedDate, 'DATE'),
      requestedWeekStart: requiredText(booking.requestedWeekStart, 'WEEK'),
      requestedStart: requiredText(booking.requestedStart, 'START'),
      requestedEnd: requiredText(booking.requestedEnd, 'END'),
      requestedMinutes: requestedMinutes as 25 | 50 | 75 | 100,
      requestedPoints: requiredNumber(booking.requestedPoints, 'POINTS'),
      pointsPer25Minutes: requiredNumber(booking.pointsPer25Minutes, 'RATE'),
      availableMinutesAtRequest: requiredNumber(booking.availableMinutesAtRequest, 'AVAILABLE'),
      heldMinutesAtRequest: requiredNumber(booking.heldMinutesAtRequest, 'HELD_BEFORE'),
      heldImmediately: true,
      teacherConfirmationDeadlineAt: Timestamp.fromMillis(deadlineAtMs),
      heldMinutesAfterRequest: requiredNumber(booking.heldMinutesAfterRequest, 'HELD_AFTER'),
      note: typeof booking.note === 'string' ? booking.note : '',
      createdAt: Timestamp.fromMillis(createdAtMs),
    } as BookingRequest,
    studentPatch: {
      reservedMinutes: requiredNumber(studentPatch.reservedMinutes, 'PATCH_RESERVED'),
      heldMinutes: requiredNumber(studentPatch.heldMinutes, 'PATCH_HELD'),
      ...(studentPatch.pendingRebookBookingId === '' ? { pendingRebookBookingId: '' } : {}),
      ...(studentPatch.pendingRebookPoints === 0 ? { pendingRebookPoints: 0 } : {}),
    },
    idempotent: response.idempotent === true,
  }
}

export function parentProfileBookingErrorReason(error: unknown): string {
  const root = record(error)
  const details = record(root.details)
  const reason = details.reason ?? root.reason ?? root.code
  return typeof reason === 'string' ? reason.replace(/^functions\//, '').toUpperCase() : ''
}
