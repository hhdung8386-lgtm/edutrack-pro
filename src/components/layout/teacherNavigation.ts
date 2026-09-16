export const TEACHER_MOBILE_PRIMARY_PATHS = [
  '/teacher/schedules',
  '/teacher/booking-requests',
  '/teacher/class-hunting',
  '/teacher/evaluations',
  '/teacher/attendance',
] as const

export function selectTeacherMobilePrimaryItems<T extends { to: string }>(items: T[]): T[] {
  return TEACHER_MOBILE_PRIMARY_PATHS
    .map((path) => items.find((item) => item.to === path))
    .filter((item): item is T => Boolean(item))
}
