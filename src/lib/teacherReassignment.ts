import type { BookingRequest, Teacher } from '@/types'

/** Errors returned by the admin-only teacher substitution transaction. */
export const TEACHER_REASSIGNMENT_ERRORS = {
  SAME_TEACHER: 'TEACHER_REASSIGNMENT_SAME_TEACHER',
  BOOKING_NOT_ACTIVE: 'TEACHER_REASSIGNMENT_BOOKING_NOT_ACTIVE',
  BOOKING_ALREADY_ATTENDED: 'TEACHER_REASSIGNMENT_BOOKING_ALREADY_ATTENDED',
  TARGET_NOT_ACTIVE: 'TEACHER_REASSIGNMENT_TARGET_NOT_ACTIVE',
} as const

export type TeacherReassignmentTarget = Pick<Teacher, 'id' | 'code' | 'name' | 'status'> & {
  photoURL?: string
}

/**
 * A substitution changes ownership of the existing booking. It must never
 * create a second booking or move money between student packages.
 */
export function validateTeacherReassignment(
  booking: Pick<BookingRequest, 'status' | 'lessonId' | 'teacherId'>,
  target: TeacherReassignmentTarget,
) {
  if (booking.teacherId === target.id) {
    throw new Error(TEACHER_REASSIGNMENT_ERRORS.SAME_TEACHER)
  }
  if (booking.lessonId) {
    throw new Error(TEACHER_REASSIGNMENT_ERRORS.BOOKING_ALREADY_ATTENDED)
  }
  if (booking.status !== 'confirmed') {
    throw new Error(TEACHER_REASSIGNMENT_ERRORS.BOOKING_NOT_ACTIVE)
  }
  if (target.status !== 'active') {
    throw new Error(TEACHER_REASSIGNMENT_ERRORS.TARGET_NOT_ACTIVE)
  }
}

export function buildTeacherReassignmentPatch(target: TeacherReassignmentTarget) {
  return {
    teacherId: target.id,
    teacherCode: target.code,
    teacherName: target.name,
    teacherPhotoURL: target.photoURL || '',
    // An admin has already confirmed the substitute assignment. This avoids
    // sending the reassigned class back to the old request-response queue.
    teacherResponse: 'accepted' as const,
  }
}
