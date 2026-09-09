const assert = require('node:assert/strict')
const test = require('node:test')

const {
  TeacherBookingSecurityValidationError,
  activeBookingForTeacherConflict,
  attendanceAuditWindowDates,
  normalizeTeacherAttendanceAuditRequest,
  normalizeTeacherBookingResponseRequest,
  teacherAttendanceAuditBookingResponse,
  teacherBookingResponseConflict,
} = require('../lib/teacherBookingSecurity.js')

function targetBooking(overrides = {}) {
  return {
    id: 'booking-target',
    status: 'pending',
    teacherResponse: 'pending',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    requestedDate: '2026-09-09',
    requestedStart: '19:00',
    requestedEnd: '19:50',
    requestedMinutes: 50,
    ...overrides,
  }
}

test('teacher response input accepts only one safe booking id and explicit response', () => {
  assert.deepEqual(normalizeTeacherBookingResponseRequest({ bookingId: ' booking-a ', response: 'accepted' }), {
    bookingId: 'booking-a',
    response: 'accepted',
  })
  assert.throws(
    () => normalizeTeacherBookingResponseRequest({ bookingId: 'booking/a', response: 'accepted' }),
    (error) => error instanceof TeacherBookingSecurityValidationError && error.reason === 'BOOKING_ID_INVALID',
  )
  assert.throws(
    () => normalizeTeacherBookingResponseRequest({ bookingId: 'booking-a', response: 'approved' }),
    (error) => error instanceof TeacherBookingSecurityValidationError && error.reason === 'BOOKING_RESPONSE_INVALID',
  )
})

test('attendance audit input validates identities, real dates and bounded optional minutes', () => {
  assert.deepEqual(normalizeTeacherAttendanceAuditRequest({
    teacherId: 'teacher-a',
    studentId: 'student-a',
    subjectId: 'subject-a',
    date: '2026-09-09',
    minutes: 50,
  }), {
    teacherId: 'teacher-a',
    studentId: 'student-a',
    subjectId: 'subject-a',
    date: '2026-09-09',
    minutes: 50,
  })
  assert.deepEqual(normalizeTeacherAttendanceAuditRequest({
    teacherId: 'teacher-a', studentId: 'student-a', date: '2026-09-09', minutes: 0,
  }), {
    teacherId: 'teacher-a', studentId: 'student-a', date: '2026-09-09',
  })
  assert.throws(
    () => normalizeTeacherAttendanceAuditRequest({ teacherId: 'teacher-a', studentId: 'student-a', date: '2026-02-30' }),
    (error) => error instanceof TeacherBookingSecurityValidationError && error.reason === 'ATTENDANCE_DATE_INVALID',
  )
})

test('active booking classification ignores released rows and declined pending rows', () => {
  assert.equal(activeBookingForTeacherConflict({ status: 'confirmed' }), true)
  assert.equal(activeBookingForTeacherConflict({ status: 'pending', teacherResponse: 'accepted' }), true)
  assert.equal(activeBookingForTeacherConflict({ status: 'pending', teacherResponse: 'declined' }), false)
  assert.equal(activeBookingForTeacherConflict({ status: 'released' }), false)
})

test('teacher acceptance conflict uses half-open intervals for either tutor or any class member', () => {
  const target = targetBooking()
  assert.equal(teacherBookingResponseConflict(target, [{
    id: 'touching-end',
    status: 'confirmed',
    teacherId: 'teacher-a',
    studentId: 'student-b',
    requestedDate: '2026-09-09',
    requestedStart: '19:50',
    requestedEnd: '20:15',
  }]), null)

  assert.equal(teacherBookingResponseConflict(target, [{
    id: 'teacher-overlap',
    status: 'confirmed',
    teacherId: 'teacher-a',
    studentId: 'student-b',
    requestedDate: '2026-09-09',
    requestedStart: '19:25',
    requestedEnd: '20:15',
  }]).id, 'teacher-overlap')

  assert.equal(teacherBookingResponseConflict(target, [{
    id: 'member-overlap',
    status: 'pending',
    teacherResponse: 'accepted',
    teacherId: 'teacher-b',
    studentId: 'group-a',
    groupClassMemberIds: ['student-a'],
    requestedDate: '2026-09-09',
    requestedStart: '19:25',
    requestedEnd: '20:15',
  }]).id, 'member-overlap')

  assert.equal(teacherBookingResponseConflict(target, [{
    id: 'unanswered-pending',
    status: 'pending',
    teacherResponse: 'pending',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    requestedDate: '2026-09-09',
    requestedStart: '19:25',
    requestedEnd: '20:15',
  }]), null)
})

test('corrupt relevant conflict data fails closed instead of allowing a teacher response', () => {
  assert.throws(
    () => teacherBookingResponseConflict(targetBooking(), [{
      id: 'corrupt-row',
      status: 'confirmed',
      teacherId: 'teacher-a',
      studentId: 'student-b',
      requestedDate: '2026-09-09',
      requestedStart: 'not-a-time',
      requestedEnd: '20:00',
    }]),
    (error) => error instanceof TeacherBookingSecurityValidationError
      && error.reason === 'BOOKING_CONFLICT_DATA_INVALID',
  )
})

test('attendance audit window crosses month boundaries deterministically', () => {
  assert.deepEqual(attendanceAuditWindowDates('2026-03-01', 2), [
    '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02', '2026-03-03',
  ])
})

test('teacher audit payload is allow-listed and hides identities, notes, URLs and accounting', () => {
  const response = teacherAttendanceAuditBookingResponse('booking-a', {
    status: 'confirmed',
    teacherResponse: 'accepted',
    teacherId: 'teacher-b',
    teacherName: 'Private legal name',
    studentId: 'student-a',
    studentName: 'Học viên A',
    groupClassMemberIds: ['student-a', 123, 'student-b'],
    subjectId: 'subject-a',
    subjectName: 'VN-1S-L2',
    requestedDate: '2026-09-09',
    requestedStart: '19:00',
    requestedEnd: '19:50',
    requestedMinutes: 50,
    lessonId: 'lesson-a',
    note: 'private',
    classroomURL: 'https://private.example.test',
    requestedPoints: 50,
    salaryAmount: 41_667,
  })

  assert.equal(response.teacherName, 'Gia sư khác')
  assert.deepEqual(response.groupClassMemberIds, ['student-a', 'student-b'])
  assert.equal(Object.hasOwn(response, 'studentName'), false)
  assert.equal(Object.hasOwn(response, 'note'), false)
  assert.equal(Object.hasOwn(response, 'classroomURL'), false)
  assert.equal(Object.hasOwn(response, 'requestedPoints'), false)
  assert.equal(Object.hasOwn(response, 'salaryAmount'), false)
})

test('teacher audit exposes a Class Hunt snapshot only to its owner and fails closed when malformed', () => {
  const source = {
    ...targetBooking({
      status: 'confirmed',
      teacherId: 'teacher-a',
      classHuntId: 'hunt-a',
      classHuntCompensation: {
        version: 1,
        ratePerMinute: 1234,
        currency: 'VND',
        formula: 'flat_per_minute',
      },
    }),
  }
  const own = teacherAttendanceAuditBookingResponse('booking-own', source, true)
  assert.equal(own.classHuntId, 'hunt-a')
  assert.deepEqual(own.classHuntCompensation, {
    version: 1,
    ratePerMinute: 1234,
    currency: 'VND',
    formula: 'flat_per_minute',
  })

  const other = teacherAttendanceAuditBookingResponse('booking-other', source, false)
  assert.equal(Object.hasOwn(other, 'classHuntId'), false)
  assert.equal(Object.hasOwn(other, 'classHuntCompensation'), false)

  const malformed = teacherAttendanceAuditBookingResponse('booking-malformed', {
    ...source,
    classHuntCompensation: { version: 1, ratePerMinute: 'not-a-rate', currency: 'VND', formula: 'flat_per_minute' },
  }, true)
  assert.deepEqual(malformed.classHuntCompensation, {
    version: 0,
    ratePerMinute: 0,
    currency: '',
    formula: '',
  })

  const explicitNull = teacherAttendanceAuditBookingResponse('booking-null', {
    ...source,
    classHuntCompensation: null,
  }, true)
  assert.deepEqual(explicitNull.classHuntCompensation, {
    version: 0,
    ratePerMinute: 0,
    currency: '',
    formula: '',
  })
})
