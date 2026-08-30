export const ONLINE_CLASSROOM_OPERATION_BOOKING_STATUSES = ['confirmed', 'completed'] as const
export const ONLINE_CLASSROOM_OPERATION_MAX_ROWS = 150
export const ONLINE_CLASSROOM_OPERATION_QUERY_LIMIT = ONLINE_CLASSROOM_OPERATION_MAX_ROWS + 1

/**
 * Query one sentinel row beyond the UI cap. `>= 150` is not enough to prove
 * truncation: exactly 150 matching bookings is a complete result.
 */
export function onlineClassroomOperationPage<T>(items: readonly T[]): {
  rows: T[]
  truncated: boolean
} {
  return {
    rows: items.slice(0, ONLINE_CLASSROOM_OPERATION_MAX_ROWS),
    truncated: items.length > ONLINE_CLASSROOM_OPERATION_MAX_ROWS,
  }
}
