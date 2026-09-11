import type { BookingRequest, Lesson } from '../types'

export type OverdueDiagnosis =
  | 'approved_lesson'
  | 'pending_lesson'
  | 'rejected_lesson'
  | 'no_lesson'
  | 'other_teacher_lesson'
  | 'ambiguous_lesson'
  | 'conflicting_link'

export type OverdueMatchKind = 'explicit' | 'unique' | null

export interface DiagnosedOverdueBooking {
  booking: BookingRequest
  diagnosis: OverdueDiagnosis
  matchedLesson: Lesson | null
  relatedLessons: Lesson[]
  matchKind: OverdueMatchKind
  canLink: boolean
  daysOverdue: number
  teacherWorkedThatDay: boolean
}

/**
 * A held booking may only be released when no approved attendance owns it and
 * the matching record is not an exceptional subject-reconciliation settlement.
 * Keep this predicate shared by the bulk and row-level actions so a stale UI
 * state cannot make the row action broader than the bulk action.
 */
export function canReleaseDiagnosedOverdueBookingHold(item: DiagnosedOverdueBooking): boolean {
  return (
    (item.diagnosis === 'no_lesson' || item.diagnosis === 'rejected_lesson')
    && !item.matchedLesson?.bookingSubjectReconciliation
  )
}

/**
 * Row-level release after a person has compared the lessons shown on screen.
 * Wider than the bulk predicate only for two cases where no attendance record
 * owns this booking, so releasing its hold can never double-charge or refund:
 * - `other_teacher_lesson`: the pupil was taught by another tutor that day; that
 *   lesson is approved against its own tutor and never consumes this booking.
 * - `ambiguous_lesson` with no pending lesson left: any same-tutor lesson is
 *   already settled, so this extra hold is not waiting for an approval.
 */
export function canManuallyReleaseDiagnosedOverdueBookingHold(item: DiagnosedOverdueBooking): boolean {
  if (canReleaseDiagnosedOverdueBookingHold(item)) return true
  if (item.relatedLessons.some((lesson) => (
    lesson.bookingSubjectReconciliation || explicitlyReferencesBooking(lesson, item.booking.id)
  ))) return false
  if (item.diagnosis === 'other_teacher_lesson') return true
  return item.diagnosis === 'ambiguous_lesson'
    && item.relatedLessons.every((lesson) => lesson.status !== 'pending')
}

const ACTIVE_LESSON_STATUSES = new Set<Lesson['status']>(['pending', 'approved', 'rejected'])

function lessonBookingIds(lesson: Lesson): string[] {
  return Array.from(new Set([
    lesson.bookingRequestId,
    ...(lesson.bookingRequestIds || []),
  ].filter((id): id is string => Boolean(id))))
}

function explicitlyReferencesBooking(lesson: Lesson, bookingId: string): boolean {
  return lessonBookingIds(lesson).includes(bookingId)
    || lesson.scheduleCheck?.bookingId === bookingId
}

function hasAnotherBookingReference(lesson: Lesson, bookingId: string): boolean {
  const storedIds = lessonBookingIds(lesson)
  if (storedIds.some((id) => id !== bookingId)) return true
  return Boolean(lesson.scheduleCheck?.bookingId && lesson.scheduleCheck.bookingId !== bookingId)
}

function diagnosisForLesson(lesson: Lesson): OverdueDiagnosis {
  if (lesson.status === 'approved') return 'approved_lesson'
  if (lesson.status === 'pending') return 'pending_lesson'
  return 'rejected_lesson'
}

function dayDifference(todayISO: string, requestedDate?: string): number {
  if (!requestedDate) return 0
  const today = new Date(`${todayISO}T00:00:00`).getTime()
  const requested = new Date(`${requestedDate}T00:00:00`).getTime()
  if (!Number.isFinite(today) || !Number.isFinite(requested)) return 0
  return Math.max(0, Math.round((today - requested) / 86_400_000))
}

/**
 * Chẩn đoán ca giữ chỗ quá hạn theo nguyên tắc fail-closed.
 *
 * Không bao giờ ghép chỉ vì cùng học viên và cùng ngày. Một buổi chỉ được đề xuất
 * gắn khi có tham chiếu booking rõ ràng, hoặc là cặp duy nhất có cùng học viên,
 * ngày, giáo viên và thời lượng. Các trường hợp còn lại phải được rà soát thủ công.
 */
export function diagnoseOverdueBookings(
  bookings: BookingRequest[],
  lessons: Lesson[],
  todayISO: string,
): DiagnosedOverdueBooking[] {
  const lessonsByStudentDate = new Map<string, Lesson[]>()
  const teacherWorkedDates = new Set<string>()
  const bookingGroupCounts = new Map<string, number>()

  for (const lesson of lessons) {
    const key = `${lesson.studentId}|${lesson.date}`
    const current = lessonsByStudentDate.get(key) || []
    current.push(lesson)
    lessonsByStudentDate.set(key, current)

    if (lesson.status !== 'rejected' && lesson.status !== 'cancelled') {
      teacherWorkedDates.add(`${lesson.teacherId}|${lesson.date}`)
    }
  }

  for (const booking of bookings) {
    const key = `${booking.studentId}|${booking.requestedDate || ''}|${booking.teacherId}`
    bookingGroupCounts.set(key, (bookingGroupCounts.get(key) || 0) + 1)
  }

  return bookings.map((booking) => {
    const sameDayLessons = (lessonsByStudentDate.get(`${booking.studentId}|${booking.requestedDate || ''}`) || [])
      .filter((lesson) => ACTIVE_LESSON_STATUSES.has(lesson.status))
    const exactReferences = sameDayLessons.filter((lesson) => explicitlyReferencesBooking(lesson, booking.id))
    const sameTeacherLessons = sameDayLessons.filter((lesson) => lesson.teacherId === booking.teacherId)
    const common = {
      booking,
      daysOverdue: dayDifference(todayISO, booking.requestedDate),
      teacherWorkedThatDay: teacherWorkedDates.has(`${booking.teacherId}|${booking.requestedDate || ''}`),
    }

    if (exactReferences.length === 1) {
      const lesson = exactReferences[0]
      if (lesson.teacherId !== booking.teacherId) {
        return {
          ...common,
          diagnosis: 'conflicting_link' as const,
          matchedLesson: null,
          relatedLessons: exactReferences,
          matchKind: null,
          canLink: false,
        }
      }
      const diagnosis = diagnosisForLesson(lesson)
      return {
        ...common,
        diagnosis,
        matchedLesson: lesson,
        relatedLessons: exactReferences,
        matchKind: 'explicit' as const,
        // A subject-reconciled approval owns an immutable, exceptional
        // settlement. The ordinary overdue-link repair must not append to it.
        canLink: diagnosis === 'approved_lesson' && !lesson.bookingSubjectReconciliation,
      }
    }

    if (exactReferences.length > 1) {
      return {
        ...common,
        diagnosis: 'conflicting_link' as const,
        matchedLesson: null,
        relatedLessons: exactReferences,
        matchKind: null,
        canLink: false,
      }
    }

    const groupKey = `${booking.studentId}|${booking.requestedDate || ''}|${booking.teacherId}`
    const availableSameTeacher = sameTeacherLessons.filter((lesson) =>
      !hasAnotherBookingReference(lesson, booking.id)
      && lesson.bookingHoldConsumed !== true,
    )

    if (
      availableSameTeacher.length === 1
      && sameTeacherLessons.length === 1
      && bookingGroupCounts.get(groupKey) === 1
      && Number(availableSameTeacher[0].minutes) === Number(booking.requestedMinutes)
    ) {
      const lesson = availableSameTeacher[0]
      const diagnosis = diagnosisForLesson(lesson)
      return {
        ...common,
        diagnosis,
        matchedLesson: lesson,
        relatedLessons: [lesson],
        matchKind: 'unique' as const,
        canLink: diagnosis === 'approved_lesson' && !lesson.bookingSubjectReconciliation,
      }
    }

    if (sameTeacherLessons.length > 0) {
      return {
        ...common,
        diagnosis: 'ambiguous_lesson' as const,
        matchedLesson: null,
        relatedLessons: sameTeacherLessons,
        matchKind: null,
        canLink: false,
      }
    }

    if (sameDayLessons.length > 0) {
      return {
        ...common,
        diagnosis: 'other_teacher_lesson' as const,
        matchedLesson: null,
        relatedLessons: sameDayLessons,
        matchKind: null,
        canLink: false,
      }
    }

    return {
      ...common,
      diagnosis: 'no_lesson' as const,
      matchedLesson: null,
      relatedLessons: [],
      matchKind: null,
      canLink: false,
    }
  })
}

