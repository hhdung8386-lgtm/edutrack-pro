const assert = require('node:assert/strict')
const test = require('node:test')

const {
  CLASS_HUNT_DEFAULT_TTL_MINUTES,
  ClassHuntValidationError,
  buildClassHuntDraft,
  buildFutureClassHuntSessions,
  classHuntDateTimeMs,
  classHuntLessonPoints,
  classHuntPublishRetryMatches,
  classHuntPublicSlot,
  classHuntPublishFingerprint,
  classHuntPublishRequestDocumentId,
  decideClassHuntClaim,
  effectiveClassHuntStatus,
  effectiveClassHuntHeldPoints,
  findClassHuntBookingConflicts,
  hasAcceptedClassHuntContract,
  hasCanonicalClassHuntTeacherLogin,
  hasSufficientClassHuntPointBalance,
  heldPointsForClassHuntBookings,
  heldPointsForClassHuntSubject,
  isActiveIndividualOnlineStudent,
  isClassHuntSessionShape,
  isEligibleOnlineClassHuntTeacher,
  isSafeClassHuntClientRequestId,
  isTeacherAvailableForClassHuntSessions,
  resolveClassHuntSubjectFund,
  studentClassHuntTotals,
  teacherMatchesClassHuntSubject,
} = require('../lib/classHunting.js')

// 09:00 on Tuesday, 01 September 2026 in Vietnam (UTC+7).
const NOW_MS = Date.UTC(2026, 8, 1, 2, 0, 0)

function mondaySession(overrides = {}) {
  return {
    dateISO: '2026-09-07',
    day: 'mon',
    requestedWeekStart: '2026-09-07',
    requestedStart: '19:00',
    requestedEnd: '19:50',
    requestedMinutes: 50,
    ...overrides,
  }
}

test('CLASS HUNTING generates a fixed future Vietnam-calendar series', () => {
  const sessions = buildFutureClassHuntSessions({
    startDate: '2026-09-01',
    selectedDays: ['tue', 'thu'],
    requestedStart: '19:00',
    requestedMinutes: 50,
    sessionCount: 4,
    nowMs: NOW_MS,
  })

  assert.deepEqual(sessions.map((session) => session.dateISO), [
    '2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10',
  ])
  assert.deepEqual(sessions.map((session) => session.requestedWeekStart), [
    '2026-08-31', '2026-08-31', '2026-09-07', '2026-09-07',
  ])
  assert.ok(sessions.every(isClassHuntSessionShape))
  assert.deepEqual(classHuntPublicSlot(sessions[0]), {
    date: '2026-09-01', weekday: 'tue', start: '19:00', end: '19:50', minutes: 50,
  })
})

test('CLASS HUNTING publish retries recover only the exact original selection', () => {
  const stored = {
    studentId: 'student-1',
    studentCode: 'HS001',
    subjectId: 'subject-l2',
    startDate: '2026-09-07',
    selectedDays: ['mon', 'wed', 'fri'],
    requestedStart: '09:00',
    requestedMinutes: 50,
    sessionCount: 13,
    createdAtMs: NOW_MS,
    expiresAtMs: NOW_MS + CLASS_HUNT_DEFAULT_TTL_MINUTES * 60_000,
  }
  const exact = {
    studentId: 'student-1',
    studentCode: 'HS001',
    subjectId: 'subject-l2',
    startDate: '2026-09-07',
    weekdays: ['fri', 'mon', 'wed'],
    startTime: '9:00',
    minutes: 50,
    sessionCount: 13,
  }

  assert.equal(classHuntPublishRetryMatches(exact, stored), true)
  assert.equal(classHuntPublishRetryMatches({ ...exact, studentId: 'student-2' }, stored), false)
  assert.equal(classHuntPublishRetryMatches({ ...exact, subjectId: 'subject-l3' }, stored), false)
  assert.equal(classHuntPublishRetryMatches({ ...exact, sessionCount: 12 }, stored), false)
  assert.equal(classHuntPublishRetryMatches({ ...exact, weekdays: ['mon', 'wed', 'fri', 'fri'] }, stored), false)
})

test('a passed slot today is never silently moved or included', () => {
  const sessions = buildFutureClassHuntSessions({
    startDate: '2026-09-01',
    selectedDays: ['tue'],
    requestedStart: '08:30',
    requestedMinutes: 25,
    sessionCount: 1,
    nowMs: NOW_MS,
  })
  assert.equal(sessions[0].dateISO, '2026-09-08')

  assert.throws(() => buildFutureClassHuntSessions({
    startDate: '2026-08-31',
    selectedDays: ['mon'],
    requestedStart: '19:00',
    requestedMinutes: 50,
    sessionCount: 1,
    nowMs: NOW_MS,
  }), (cause) => cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_START_DATE_PAST')
})

test('duration, count, and extended 24:xx clock values remain canonical', () => {
  const sessions = buildFutureClassHuntSessions({
    startDate: '2026-09-07',
    selectedDays: ['mon'],
    requestedStart: '23:30',
    requestedMinutes: 50,
    sessionCount: 1,
    nowMs: NOW_MS,
  })
  assert.equal(sessions[0].requestedEnd, '24:20')
  assert.equal(
    classHuntDateTimeMs('2026-09-07', '24:20') - classHuntDateTimeMs('2026-09-07', '23:30'),
    50 * 60 * 1000,
  )
  assert.equal(isClassHuntSessionShape(sessions[0]), true)
  assert.equal(isClassHuntSessionShape({ ...sessions[0], day: 'tue' }), false)
  assert.equal(isClassHuntSessionShape({ ...sessions[0], requestedWeekStart: '2026-09-14' }), false)
  assert.throws(() => buildFutureClassHuntSessions({
    startDate: '2026-09-07', selectedDays: ['mon'], requestedStart: '19:00', requestedMinutes: 30, sessionCount: 1, nowMs: NOW_MS,
  }), (cause) => cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_DURATION_INVALID')
  assert.throws(() => buildFutureClassHuntSessions({
    startDate: '2026-09-07', selectedDays: ['mon', 'mon'], requestedStart: '19:00', requestedMinutes: 50, sessionCount: 1, nowMs: NOW_MS,
  }), (cause) => cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_DAYS_INVALID')
})

test('availability requires every session and honors week overrides', () => {
  const sessions = [mondaySession(), mondaySession({ dateISO: '2026-09-14', requestedWeekStart: '2026-09-14' })]
  const baseSlots = {
    mon: { available: true, timeRanges: [{ start: '18:00', end: '22:00' }] },
  }
  assert.equal(isTeacherAvailableForClassHuntSessions({ slots: baseSlots }, sessions), true)
  assert.equal(isTeacherAvailableForClassHuntSessions({
    slots: baseSlots,
    weekOverrides: {
      '2026-09-07': { slots: { mon: { available: false, timeRanges: [] } } },
    },
  }, sessions), false)
  assert.equal(isTeacherAvailableForClassHuntSessions({
    slots: { mon: { available: true, timeRanges: [{ start: '19:10', end: '20:00' }] } },
  }, [mondaySession()]), false)
})

test('only an active individual online student and exact eligible teacher subject match', () => {
  assert.equal(isActiveIndividualOnlineStudent({ status: 'active', recordType: 'individual', classDeliveryMode: 'online' }), true)
  assert.equal(isActiveIndividualOnlineStudent({ status: 'active', recordType: 'group_class', classDeliveryMode: 'online' }), false)
  assert.equal(isActiveIndividualOnlineStudent({ status: 'active', recordType: 'individual', learningScheduleType: 'offline' }), false)

  const teacher = { status: 'active', subjectIds: ['VN-1S-L2'], teachingFormats: ['online'] }
  assert.equal(isEligibleOnlineClassHuntTeacher(teacher), true)
  assert.equal(teacherMatchesClassHuntSubject(teacher, 'VN-1S-L2'), true)
  assert.equal(teacherMatchesClassHuntSubject(teacher, 'same-name-but-different-id'), false)
  assert.equal(isEligibleOnlineClassHuntTeacher({ ...teacher, isTester: true }), false)
  assert.equal(isEligibleOnlineClassHuntTeacher({ ...teacher, teachingFormats: ['offline'] }), false)
})

test('booking conflict scan uses half-open absolute intervals, including 24:xx crossover', () => {
  const overnight = mondaySession({ requestedStart: '23:30', requestedEnd: '24:20' })
  const conflicts = findClassHuntBookingConflicts({
    teacherId: 'teacher-a',
    studentId: 'student-a',
    sessions: [overnight],
    bookings: [
      {
        id: 'booking-next-day', status: 'confirmed', teacherId: 'teacher-a', studentId: 'different-student',
        requestedDate: '2026-09-08', requestedStart: '00:00', requestedEnd: '00:30',
      },
      {
        id: 'declined', status: 'pending', teacherResponse: 'declined', teacherId: 'teacher-a', studentId: 'student-a',
        requestedDate: '2026-09-07', requestedStart: '23:30', requestedEnd: '24:20',
      },
      {
        id: 'touching-end', status: 'confirmed', teacherId: 'teacher-a', studentId: 'student-a',
        requestedDate: '2026-09-08', requestedStart: '00:20', requestedEnd: '00:50',
      },
      {
        id: 'group-member-overlap', status: 'confirmed', teacherId: 'teacher-b', studentId: 'group-class-a',
        groupClassMemberIds: ['student-a'],
        requestedDate: '2026-09-07', requestedStart: '23:45', requestedEnd: '24:10',
      },
    ],
  })
  assert.deepEqual(conflicts.map((conflict) => [conflict.bookingId, conflict.reasons]), [
    ['booking-next-day', ['teacher']],
    ['group-member-overlap', ['student']],
  ])
})

test('subject-package funds fail closed for duplicate rows and legacy single-subject data remains compatible', () => {
  const student = {
    status: 'active',
    subjects: [
      { subjectId: 'VN-1S-L2', subjectName: 'VN 1', curriculumLink: 'https://example.edu.vn/vn-l2', totalMinutes: 300, usedMinutes: 100 },
      { subjectId: 'VN-1S-L2', subjectName: 'VN 1', totalSessions: 2, usedSessions: 1, minutesPerSession: 50 },
      { subjectId: 'OTHER', subjectName: 'Other', totalMinutes: 500, usedMinutes: 0 },
    ],
    reservedMinutes: 120,
  }
  assert.equal(resolveClassHuntSubjectFund(student, 'VN-1S-L2'), null)
  assert.equal(resolveClassHuntSubjectFund({ subjectId: 'legacy', totalSessions: 3, usedSessions: 1, minutesPerSession: 50 }, 'legacy').remainingMinutes, 100)
  assert.deepEqual(studentClassHuntTotals(student), { remainingMinutes: 750, heldMinutes: 120, availableMinutes: 630 })
  assert.deepEqual(
    studentClassHuntTotals({ subjectId: 'legacy', totalMinutes: 200, usedMinutes: 0, reservedMinutes: null, heldMinutes: 70 }),
    { remainingMinutes: 200, heldMinutes: 70, availableMinutes: 130 },
  )
  assert.equal(classHuntLessonPoints(50, 35), 70)
  const activeBookings = [
    { status: 'confirmed', subjectId: 'VN-1S-L2', requestedMinutes: 50, pointsPer25Minutes: 35 },
    { status: 'confirmed', lessonId: 'lesson-awaiting-approval', subjectId: 'VN-1S-L2', requestedMinutes: 50, pointsPer25Minutes: 35 },
    { status: 'pending', teacherResponse: 'declined', subjectId: 'VN-1S-L2', requestedMinutes: 50, pointsPer25Minutes: 35 },
  ]
  assert.equal(heldPointsForClassHuntSubject(activeBookings, 'VN-1S-L2'), 140)
  assert.deepEqual(effectiveClassHuntHeldPoints(student, activeBookings), {
    storedHeldPoints: 120,
    activeBookingHeldPoints: 140,
    heldPoints: 140,
    availablePoints: 610,
  })
})

test('CLASS HUNTING keeps released pending-rebook holds in subject and global ledgers', () => {
  // The released booking no longer blocks a calendar slot, but the student has
  // explicitly kept its 50-point hold for a rebook. Do not let a hunt spend
  // that subject fund merely because another package has aggregate balance.
  const student = {
    subjects: [
      { subjectId: 'VN-1S-L2', totalMinutes: 100, usedMinutes: 0 },
      { subjectId: 'OTHER', totalMinutes: 500, usedMinutes: 0 },
    ],
    reservedMinutes: 0,
  }
  const bookings = [
    {
      status: 'released',
      subjectId: 'VN-1S-L2',
      pendingRebook: true,
      rebookHoldPoints: 50,
    },
    // Once the replacement booking is linked, the old row no longer holds
    // money and must not be counted twice.
    {
      status: 'released',
      subjectId: 'VN-1S-L2',
      pendingRebook: true,
      rebookHoldPoints: 50,
      rebookedByBookingId: 'replacement-booking',
    },
  ]

  assert.equal(heldPointsForClassHuntSubject(bookings, 'VN-1S-L2'), 50)
  assert.equal(heldPointsForClassHuntBookings(bookings), 50)
  assert.deepEqual(effectiveClassHuntHeldPoints(student, bookings), {
    storedHeldPoints: 0,
    activeBookingHeldPoints: 50,
    heldPoints: 50,
    availablePoints: 550,
  })
  assert.equal(hasSufficientClassHuntPointBalance({
    subjectRemainingPoints: 100,
    subjectHeldPoints: heldPointsForClassHuntSubject(bookings, 'VN-1S-L2'),
    availablePoints: 550,
    totalRequiredPoints: 100,
  }), false)
})

test('CLASS HUNTING shares the accepted-contract gate across discovery and claim', () => {
  assert.equal(hasAcceptedClassHuntContract({ type: 'terms_of_service' }), true)
  assert.equal(hasAcceptedClassHuntContract({ status: 'agreed' }), true)
  assert.equal(hasAcceptedClassHuntContract({ status: 'pending' }), true)
  assert.equal(hasAcceptedClassHuntContract({ status: 'approved' }), true)
  assert.equal(hasAcceptedClassHuntContract({ status: 'rejected' }), false)
  assert.equal(hasAcceptedClassHuntContract({}), false)
  assert.equal(hasAcceptedClassHuntContract(null), false)
})

test('CLASS HUNTING only counts a teacher profile with its canonical claimable login', () => {
  const exact = {
    teacherId: 'teacher-a',
    uid: 'teacher-user-a',
    teacherLoginAccountUid: 'teacher-user-a',
    userTeacherId: 'teacher-a',
    userRole: 'teacher',
  }
  assert.equal(hasCanonicalClassHuntTeacherLogin(exact), true)
  assert.equal(hasCanonicalClassHuntTeacherLogin({ ...exact, teacherLoginAccountUid: 'old-user' }), false)
  assert.equal(hasCanonicalClassHuntTeacherLogin({ ...exact, userTeacherId: 'teacher-b' }), false)
  assert.equal(hasCanonicalClassHuntTeacherLogin({ ...exact, userRole: 'student_manager' }), false)
  assert.equal(hasCanonicalClassHuntTeacherLogin({ ...exact, uid: '' }), false)
})

test('CLASS HUNTING rejects a 13-session request when its required point hold exceeds the fund', () => {
  // A 50-minute lesson at 25 points per 25 minutes consumes 50 points. The
  // same balance rule is used while previewing/publishing and rechecked when
  // a teacher claims, so 13 such sessions require 650 points, not 13 units.
  const requiredPoints = classHuntLessonPoints(50, 25) * 13
  assert.equal(requiredPoints, 650)
  assert.equal(hasSufficientClassHuntPointBalance({
    subjectRemainingPoints: 625,
    subjectHeldPoints: 0,
    availablePoints: 625,
    totalRequiredPoints: requiredPoints,
  }), false)
  assert.equal(hasSufficientClassHuntPointBalance({
    subjectRemainingPoints: 700,
    subjectHeldPoints: 50,
    availablePoints: 650,
    totalRequiredPoints: requiredPoints,
  }), true)
  assert.equal(hasSufficientClassHuntPointBalance({
    subjectRemainingPoints: 700,
    subjectHeldPoints: 50,
    availablePoints: 649,
    totalRequiredPoints: requiredPoints,
  }), false)
})

test('publish idempotency is actor-scoped and canonical request content is stable', () => {
  const requestId = 'class-hunt-request-000001'
  assert.equal(isSafeClassHuntClientRequestId(requestId), true)
  assert.notEqual(
    classHuntPublishRequestDocumentId('admin-a', requestId),
    classHuntPublishRequestDocumentId('admin-b', requestId),
  )
  const first = buildClassHuntDraft({
    studentId: 'student-a', subjectId: 'VN-1S-L2', startDate: '2026-09-07', selectedDays: ['thu', 'mon'], requestedStart: '19:00', requestedMinutes: 50, sessionCount: 2,
  }, NOW_MS)
  const same = buildClassHuntDraft({
    studentId: 'student-a', subjectId: 'VN-1S-L2', startDate: '2026-09-07', selectedDays: ['mon', 'thu'], requestedStart: '19:00', requestedMinutes: 50, sessionCount: 2,
  }, NOW_MS)
  assert.equal(classHuntPublishFingerprint(first), classHuntPublishFingerprint(same))
  assert.equal(first.expiresInMinutes, CLASS_HUNT_DEFAULT_TTL_MINUTES)
})

test('claim lifecycle gives first eligible teacher the only write path', () => {
  const expiresAtMs = NOW_MS + 60_000
  assert.equal(decideClassHuntClaim({ status: 'open', expiresAtMs, requestedTeacherId: 'teacher-a', nowMs: NOW_MS }), 'claimable')
  assert.equal(decideClassHuntClaim({ status: 'claimed', expiresAtMs, claimedByTeacherId: 'teacher-a', requestedTeacherId: 'teacher-a', nowMs: NOW_MS }), 'idempotent')
  assert.equal(decideClassHuntClaim({ status: 'claimed', expiresAtMs, claimedByTeacherId: 'teacher-a', requestedTeacherId: 'teacher-b', nowMs: NOW_MS }), 'already-claimed')
  assert.equal(decideClassHuntClaim({ status: 'open', expiresAtMs, requestedTeacherId: 'teacher-a', nowMs: expiresAtMs }), 'expired')
})

test('effective CLASS HUNTING status expires stale open offers without changing terminal states', () => {
  const future = mondaySession()
  const expiredAtBoundary = {
    status: 'open',
    expiresAtMs: NOW_MS,
    sessions: [future],
  }
  assert.equal(effectiveClassHuntStatus(expiredAtBoundary, NOW_MS), 'expired')
  assert.equal(effectiveClassHuntStatus({
    status: 'open',
    expiresAtMs: NOW_MS + 60_000,
    sessions: [mondaySession({ dateISO: '2026-09-01', day: 'tue', requestedWeekStart: '2026-08-31', requestedStart: '08:30', requestedEnd: '08:55', requestedMinutes: 25 })],
  }, NOW_MS), 'expired')
  assert.equal(effectiveClassHuntStatus({
    status: 'open',
    expiresAtMs: NOW_MS + 60_000,
    sessions: [future],
  }, NOW_MS), 'open')
  assert.equal(effectiveClassHuntStatus({
    status: 'claimed',
    expiresAtMs: NOW_MS - 60_000,
    sessions: [future],
  }, NOW_MS), 'claimed')
})
