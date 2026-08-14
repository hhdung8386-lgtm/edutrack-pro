export type TeacherLoginUserRecord = {
  role?: unknown
  teacherId?: unknown
}

export type TeacherLoginRecoveryDecision =
  | { allowed: true; reclaimsOrphan: boolean }
  | { allowed: false; reason: 'unrelated_role' | 'owned_by_existing_teacher' }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * A login UID may be reclaimed only when it is already owned by this teacher,
 * has never been linked, or points to a teacher document that no longer exists.
 * Existing ownership always wins so recovery cannot steal another teacher's login.
 */
export function decideTeacherLoginRecovery(
  user: TeacherLoginUserRecord | null,
  targetTeacherId: string,
  linkedTeacherExists: boolean,
): TeacherLoginRecoveryDecision {
  if (!user) return { allowed: true, reclaimsOrphan: false }

  const role = text(user.role)
  if (role && role !== 'teacher' && role !== 'inactive_teacher') {
    return { allowed: false, reason: 'unrelated_role' }
  }

  const linkedTeacherId = text(user.teacherId)
  if (!linkedTeacherId || linkedTeacherId === targetTeacherId) {
    return { allowed: true, reclaimsOrphan: false }
  }
  if (linkedTeacherExists) {
    return { allowed: false, reason: 'owned_by_existing_teacher' }
  }
  return { allowed: true, reclaimsOrphan: true }
}

export function teacherLoginEmail(code: string): string {
  const normalizedCode = code.trim()
  if (normalizedCode.includes('@')) return normalizedCode
  return normalizedCode.toLowerCase().startsWith('gv')
    ? `${normalizedCode.toUpperCase()}@edutrackpro.app`
    : `${normalizedCode}@edutrackpro.app`
}
