import { getFunctions, httpsCallable } from 'firebase/functions'
import type { BookingRequest } from '@/types'
import app from '@/lib/firebase'

const functions = getFunctions(app, 'asia-southeast1')
const respondCallable = httpsCallable<{ bookingId: string; response: 'accepted' | 'declined' }, unknown>(
  functions,
  'respondToBookingRequest',
)
const auditCallable = httpsCallable<{
  teacherId: string
  studentId: string
  subjectId?: string
  date: string
  minutes?: number
}, unknown>(functions, 'getTeacherAttendanceAuditData')

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function respondToBookingRequest(bookingId: string, response: 'accepted' | 'declined') {
  await respondCallable({ bookingId, response })
}

export async function getTeacherAttendanceAuditData(input: {
  teacherId: string
  studentId: string
  subjectId?: string
  date: string
  minutes?: number
}): Promise<{ bookings: BookingRequest[]; sameDayByTeacher: number }> {
  const response = record((await auditCallable(input)).data)
  const bookings = (Array.isArray(response.bookings) ? response.bookings : []).map((value) => {
    const data = record(value)
    return {
      id: text(data.id),
      status: text(data.status),
      teacherResponse: text(data.teacherResponse) || undefined,
      teacherId: text(data.teacherId),
      teacherCode: '',
      teacherName: text(data.teacherName),
      studentId: text(data.studentId),
      studentCode: '',
      studentName: '',
      groupClassMemberIds: Array.isArray(data.groupClassMemberIds)
        ? data.groupClassMemberIds.filter((item): item is string => typeof item === 'string')
        : [],
      subjectId: text(data.subjectId),
      subjectName: text(data.subjectName),
      requestedDay: 'mon',
      requestedDate: text(data.requestedDate),
      requestedStart: text(data.requestedStart),
      requestedEnd: text(data.requestedEnd),
      requestedMinutes: Number(data.requestedMinutes),
      lessonId: text(data.lessonId) || undefined,
      createdAt: undefined,
    } as unknown as BookingRequest
  })
  return { bookings, sameDayByTeacher: Number(response.sameDayByTeacher) || 0 }
}
