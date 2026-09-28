export type AbsenceBooking = {
  id: string
  status?: string
  lessonId?: string
  studentId?: string
  studentCode?: string
  subjectId?: string
  requestedDate?: string
  requestedStart?: string
  classHuntId?: string
  groupClassId?: string
  groupClassMemberIds?: string[]
}

/** Mirrors the teacher timetable's same-day absence scope without charging later slots. */
export function laterSameDayAbsenceBookings<T extends AbsenceBooking>(
  current: T,
  candidates: T[],
): T[] {
  return candidates.filter((item) => item.id !== current.id
    && item.status === 'confirmed'
    && !item.lessonId
    && item.studentId === current.studentId
    && (!item.studentCode || !current.studentCode || item.studentCode === current.studentCode)
    && item.subjectId === current.subjectId
    && item.requestedDate === current.requestedDate
    && (item.classHuntId || '') === (current.classHuntId || '')
    && Boolean(item.requestedStart)
    && String(item.requestedStart) > String(current.requestedStart)
    && !item.groupClassId
    && !(Array.isArray(item.groupClassMemberIds) && item.groupClassMemberIds.length > 1))
    .sort((left, right) => String(left.requestedStart).localeCompare(String(right.requestedStart)))
}

export function absenceMinutes(type: 'with_permission' | 'without_permission', index: number): 0 | 25 {
  return type === 'without_permission' && index === 0 ? 25 : 0
}
