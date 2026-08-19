import type { BookingRequest, Student } from '@/types'

export const GROUP_CLASS_MAX_MEMBERS = 100

export function isGroupClass(student: Pick<Student, 'recordType'> | null | undefined) {
  return student?.recordType === 'group_class'
}

export function bookingParticipantStudentIds(
  booking: Pick<BookingRequest, 'studentId' | 'groupClassMemberIds'>,
) {
  return Array.from(new Set([
    booking.studentId,
    ...(booking.groupClassMemberIds || []),
  ].filter(Boolean)))
}

export function bookingParticipantsOverlap(
  left: Pick<BookingRequest, 'studentId' | 'groupClassMemberIds'>,
  right: Pick<BookingRequest, 'studentId' | 'groupClassMemberIds'>,
) {
  const leftIds = new Set(bookingParticipantStudentIds(left))
  return bookingParticipantStudentIds(right).some((studentId) => leftIds.has(studentId))
}

export function canStudentManageBooking(
  booking: Pick<BookingRequest, 'studentId' | 'groupClassId'>,
  signedInStudentId: string,
) {
  return booking.studentId === signedInStudentId && !booking.groupClassId
}

export function normalizeGroupClassIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}
