import type { BookingRequest, ClassHuntCompensation, Lesson } from '@/types'

/** A non-empty Class Hunt id is the provenance marker for a rate override. */
function classHuntIdOf(value: Pick<BookingRequest, 'classHuntId'>): string {
  return typeof value.classHuntId === 'string' ? value.classHuntId.trim() : ''
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * This deliberately validates the complete contract rather than treating an
 * arbitrary `pricePerMinute` field as an override. Price and level are legacy
 * display fields; the nested snapshot is the only source of an override.
 */
export function isClassHuntCompensation(value: unknown): value is ClassHuntCompensation {
  const source = record(value)
  return Boolean(
    source
    && source.version === 1
    && Number.isSafeInteger(Number(source.ratePerMinute))
    && Number(source.ratePerMinute) > 0
    && source.currency === 'VND'
    && source.formula === 'flat_per_minute',
  )
}

export const CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR = 'CLASS_HUNT_COMPENSATION_INVALID'

type ClassHuntCompensationBooking = Pick<
  BookingRequest,
  'classHuntId' | 'classHuntCompensation' | 'classHuntCompensationInvalid'
>

function hasClassHuntCompensationMarker(value: ClassHuntCompensationBooking): boolean {
  return value.classHuntCompensationInvalid === true
    || Object.prototype.hasOwnProperty.call(value, 'classHuntCompensation')
}

/**
 * Reads a rate only from currently confirmed/approval-eligible booking rows.
 * A lesson marker is intentionally never an authority: a client must not be
 * able to manufacture a special rate by writing a pending lesson document.
 *
 * Legacy Class Hunt bookings created before this feature have no nested
 * snapshot and remain on the old formula. A mixed or malformed new batch
 * fails closed, because a combined payroll row has only one rate.
 */
export function classHuntCompensationFromBookings(
  bookings: readonly ClassHuntCompensationBooking[],
): ClassHuntCompensation | null {
  if (bookings.some((booking) => !classHuntIdOf(booking) && hasClassHuntCompensationMarker(booking))) {
    throw new Error(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR)
  }
  const huntBookings = bookings.filter((booking) => Boolean(classHuntIdOf(booking)))
  if (huntBookings.length === 0) return null
  if (huntBookings.length !== bookings.length) {
    throw new Error(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR)
  }
  if (huntBookings.some((booking) => booking.classHuntCompensationInvalid === true)) {
    throw new Error(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR)
  }
  const firstHuntId = classHuntIdOf(huntBookings[0])
  if (!huntBookings.every((booking) => classHuntIdOf(booking) === firstHuntId)) {
    throw new Error(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR)
  }

  // Legacy rows omit the field entirely. An explicit null (or any other
  // present-but-invalid value) is corruption, not permission to fall back to
  // a current subject/teacher price.
  if (!huntBookings.some(hasClassHuntCompensationMarker)) return null
  const snapshots = huntBookings.map((booking) => booking.classHuntCompensation)
  if (!snapshots.every(isClassHuntCompensation)) {
    throw new Error(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR)
  }

  const first = snapshots[0] as ClassHuntCompensation
  const allMatch = snapshots.every((value) => (
    value?.version === first.version
    && value.ratePerMinute === first.ratePerMinute
    && value.currency === first.currency
    && value.formula === first.formula
  ))
  if (!allMatch) throw new Error(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR)
  return { ...first }
}

/** A lesson's stored snapshot is for display/recalculation only, never authority. */
export function classHuntCompensationFromLesson(
  lesson: Pick<Lesson, 'classHuntCompensation'>,
): ClassHuntCompensation | null {
  return isClassHuntCompensation(lesson.classHuntCompensation)
    ? { ...lesson.classHuntCompensation }
    : null
}

/**
 * Attendance batching may combine only records with the same compensation
 * semantics. `null` represents the normal legacy formula, so a normal booking
 * can never be merged into a new override booking by accident.
 */
export function sameClassHuntCompensation(
  left: ClassHuntCompensationBooking,
  right: ClassHuntCompensationBooking,
): boolean {
  const leftHuntId = classHuntIdOf(left)
  const rightHuntId = classHuntIdOf(right)
  if ((!leftHuntId && hasClassHuntCompensationMarker(left)) || (!rightHuntId && hasClassHuntCompensationMarker(right))) {
    return false
  }
  if (!leftHuntId && !rightHuntId) return true
  if (!leftHuntId || !rightHuntId) return false
  if (leftHuntId !== rightHuntId) return false
  if (left.classHuntCompensationInvalid === true || right.classHuntCompensationInvalid === true) return false

  const leftCompensation = left.classHuntCompensation
  const rightCompensation = right.classHuntCompensation
  if (!hasClassHuntCompensationMarker(left) && !hasClassHuntCompensationMarker(right)) return true // legacy Class Hunt rows
  if (!isClassHuntCompensation(leftCompensation) || !isClassHuntCompensation(rightCompensation)) return false
  return leftCompensation.version === rightCompensation.version
    && leftCompensation.ratePerMinute === rightCompensation.ratePerMinute
    && leftCompensation.currency === rightCompensation.currency
    && leftCompensation.formula === rightCompensation.formula
}

export function classHuntCompensationSalary(
  minutes: number,
  compensation: ClassHuntCompensation,
): number {
  const safeMinutes = Number(minutes)
  if (!Number.isSafeInteger(safeMinutes) || safeMinutes < 0) {
    throw new Error(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR)
  }
  const amount = safeMinutes * compensation.ratePerMinute
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR)
  }
  return amount
}

/**
 * Fields written together so a Class Hunt cannot accidentally regain a level
 * multiplier in one consumer while another consumer stays flat.
 */
export function classHuntCompensationLegacyFields(compensation: ClassHuntCompensation) {
  return {
    classHuntCompensation: { ...compensation },
    pricePerMinute: compensation.ratePerMinute,
    teacherLevel: 1,
    currency: compensation.currency,
  }
}

export function classHuntPayrollCompensationFields(compensation: ClassHuntCompensation) {
  return {
    classHuntCompensation: { ...compensation },
    pricePerMinute: compensation.ratePerMinute,
    level: 1,
    currency: compensation.currency,
  }
}

/** Uses the immutable snapshot when present; otherwise keeps legacy pricing untouched. */
export function salaryForLesson(
  lesson: Pick<Lesson, 'minutes' | 'classHuntCompensation'>,
  legacy: { pricePerMinute: number; level: number; currency: string; calculate: (minutes: number, pricePerMinute: number, level: number, currency: string) => number },
) {
  const compensation = classHuntCompensationFromLesson(lesson)
  if (compensation) {
    return {
      salary: classHuntCompensationSalary(lesson.minutes, compensation),
      pricePerMinute: compensation.ratePerMinute,
      level: 1,
      currency: compensation.currency,
      compensation,
    }
  }
  return {
    salary: legacy.calculate(lesson.minutes, legacy.pricePerMinute, legacy.level, legacy.currency),
    pricePerMinute: legacy.pricePerMinute,
    level: legacy.level,
    currency: legacy.currency,
    compensation: null,
  }
}
