import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR,
  classHuntCompensationFromBookings,
  sameClassHuntCompensation,
} from '../src/lib/classHuntCompensation.ts'
import type { BookingRequest, ClassHuntCompensation } from '../src/types/index.ts'

const compensation: ClassHuntCompensation = {
  version: 1,
  ratePerMinute: 1234,
  currency: 'VND',
  formula: 'flat_per_minute',
}

function booking(id: string, overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id,
    status: 'confirmed',
    teacherId: 'teacher-a',
    teacherCode: 'teacher-a',
    teacherName: 'Teacher A',
    studentId: 'student-a',
    studentCode: 'HS123456',
    studentName: 'Student A',
    subjectId: 'subject-a',
    subjectName: 'English',
    requestedDay: 'mon',
    requestedDate: '2026-09-14',
    requestedStart: '19:00',
    requestedEnd: '19:25',
    requestedMinutes: 25,
    createdAt: {} as BookingRequest['createdAt'],
    ...overrides,
  }
}

test('same Class Hunt provenance and snapshot can be batched', () => {
  const first = booking('booking-a', { classHuntId: 'hunt-a', classHuntCompensation: compensation })
  const second = booking('booking-b', { classHuntId: 'hunt-a', classHuntCompensation: { ...compensation } })

  assert.equal(sameClassHuntCompensation(first, second), true)
  assert.deepEqual(classHuntCompensationFromBookings([first, second]), compensation)
})

test('normal and Class Hunt bookings never share one attendance/payroll batch', () => {
  const normal = booking('booking-normal')
  const overridden = booking('booking-hunt', { classHuntId: 'hunt-a', classHuntCompensation: compensation })

  assert.equal(sameClassHuntCompensation(normal, overridden), false)
  assert.throws(
    () => classHuntCompensationFromBookings([normal, overridden]),
    new RegExp(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR),
  )
})

test('matching rate alone cannot batch two different Class Hunt records', () => {
  const first = booking('booking-a', { classHuntId: 'hunt-a', classHuntCompensation: compensation })
  const second = booking('booking-b', { classHuntId: 'hunt-b', classHuntCompensation: { ...compensation } })

  assert.equal(sameClassHuntCompensation(first, second), false)
  assert.throws(
    () => classHuntCompensationFromBookings([first, second]),
    new RegExp(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR),
  )
})

test('a malformed Class Hunt snapshot fails closed instead of falling back to live pricing', () => {
  const malformed = booking('booking-malformed', {
    classHuntId: 'hunt-a',
    classHuntCompensation: {
      version: 1,
      ratePerMinute: 0,
      currency: 'VND',
      formula: 'flat_per_minute',
    } as unknown as ClassHuntCompensation,
  })

  assert.throws(
    () => classHuntCompensationFromBookings([malformed]),
    new RegExp(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR),
  )
})

test('the private audit malformed-marker cannot be mistaken for a legacy Class Hunt', () => {
  const malformedAuditBooking = booking('booking-malformed-audit', {
    classHuntId: 'hunt-a',
    classHuntCompensationInvalid: true,
  })

  assert.throws(
    () => classHuntCompensationFromBookings([malformedAuditBooking]),
    new RegExp(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR),
  )
  assert.equal(sameClassHuntCompensation(malformedAuditBooking, malformedAuditBooking), false)
})

test('a compensation marker without Class Hunt provenance is corrupt, not a normal booking', () => {
  const orphanedSnapshot = booking('booking-orphaned-snapshot', {
    classHuntCompensation: compensation,
  })
  const normal = booking('booking-normal')

  assert.throws(
    () => classHuntCompensationFromBookings([orphanedSnapshot]),
    new RegExp(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR),
  )
  assert.equal(sameClassHuntCompensation(orphanedSnapshot, normal), false)
})

test('an explicit null Class Hunt snapshot is corruption, not legacy compatibility', () => {
  const nullSnapshot = booking('booking-null-snapshot', {
    classHuntId: 'hunt-a',
    classHuntCompensation: null as unknown as ClassHuntCompensation,
  })

  assert.throws(
    () => classHuntCompensationFromBookings([nullSnapshot]),
    new RegExp(CLASS_HUNT_COMPENSATION_INTEGRITY_ERROR),
  )
  assert.equal(sameClassHuntCompensation(nullSnapshot, nullSnapshot), false)
})

test('legacy Class Hunt bookings without the nested snapshot retain the legacy formula', () => {
  const first = booking('legacy-a', { classHuntId: 'legacy-hunt' })
  const second = booking('legacy-b', { classHuntId: 'legacy-hunt' })

  assert.equal(sameClassHuntCompensation(first, second), true)
  assert.equal(classHuntCompensationFromBookings([first, second]), null)
})
