const assert = require('node:assert/strict')
const test = require('node:test')

const {
  CLASS_HUNT_DEFAULT_TTL_MINUTES,
  CLASS_HUNT_MAX_SESSIONS,
  CLASS_HUNT_COMPENSATION_CURRENCY,
  CLASS_HUNT_COMPENSATION_FORMULA,
  CLASS_HUNT_COMPENSATION_VERSION,
  ClassHuntValidationError,
  availableClassHuntSessionCount,
  buildClassHuntDraft,
  classHuntSubjectAvailability,
  classHuntClaimConflictReason,
  classHuntCompensationAmount,
  buildFutureClassHuntSessions,
  classHuntDateTimeMs,
  classHuntLessonPoints,
  classHuntPublishRetryMatches,
  classHuntPublicSlot,
  classHuntPublishFingerprint,
  classHuntPublishRequestDocumentId,
  createClassHuntCompensation,
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
  isClassHuntTeacherProfileComplete,
  isClassHuntTeacherDiscoverable,
  isClassHuntCompensation,
  isClassHuntSessionShape,
  isEligibleOnlineClassHuntTeacher,
  isSafeClassHuntClientRequestId,
  normalizeClassHuntSessionSelectionMode,
  resolveClassHuntSubjectFund,
  sanitizeClassHuntForTeacher,
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

test('CLASS HUNTING keeps its bounded atomic plan and validates selection modes', () => {
  assert.equal(CLASS_HUNT_MAX_SESSIONS, 52)
  assert.equal(normalizeClassHuntSessionSelectionMode(undefined), 'specific')
  assert.equal(normalizeClassHuntSessionSelectionMode('all_remaining'), 'all_remaining')
  assert.throws(
    () => normalizeClassHuntSessionSelectionMode('all'),
    (cause) => cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_SESSION_SELECTION_INVALID',
  )

  const weeklyPlan = buildFutureClassHuntSessions({
    startDate: '2026-09-07',
    selectedDays: ['mon'],
    requestedStart: '19:00',
    requestedMinutes: 50,
    sessionCount: CLASS_HUNT_MAX_SESSIONS,
    nowMs: NOW_MS,
  })
  assert.equal(weeklyPlan.length, CLASS_HUNT_MAX_SESSIONS)
  assert.throws(
    () => buildFutureClassHuntSessions({
      startDate: '2026-09-07', selectedDays: ['mon'], requestedStart: '19:00', requestedMinutes: 50,
      sessionCount: CLASS_HUNT_MAX_SESSIONS + 1, nowMs: NOW_MS,
    }),
    (cause) => cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_SESSION_COUNT_INVALID',
  )
})

test('all-remaining counts only package sessions not already held by a booking', () => {
  const student = {
    subjects: [{
      subjectId: 'subject-l2',
      subjectName: 'Tiếng Anh',
      totalSessions: 24,
      usedSessions: 5,
      minutesPerSession: 50,
      totalMinutes: 1_200,
      usedMinutes: 250,
    }],
  }
  const fund = resolveClassHuntSubjectFund(student, 'subject-l2')
  assert.equal(fund?.minutesPerSession, 50)
  assert.equal(fund?.remainingSessions, 19)
  assert.equal(availableClassHuntSessionCount({
    student,
    subjectId: 'subject-l2',
    bookings: [
      { id: 'confirmed', subjectId: 'subject-l2', status: 'confirmed' },
      { id: 'rebook-hold', subjectId: 'subject-l2', status: 'released', pendingRebook: true, rebookHoldPoints: 50 },
      { id: 'other-subject', subjectId: 'subject-l3', status: 'confirmed' },
    ],
  }), 17)
  assert.equal(availableClassHuntSessionCount({
    student: { subjects: [{ subjectId: 'legacy', totalMinutes: 1_200, usedMinutes: 0 }] },
    subjectId: 'legacy',
    bookings: [],
  }), null)
})

test('subject availability retains attendance-pending and pending-rebook fund holds', () => {
  const student = {
    subjects: [{
      subjectId: 'subject-l2',
      subjectName: 'Tiếng Anh',
      totalSessions: 3,
      usedSessions: 0,
      minutesPerSession: 50,
      totalMinutes: 150,
      usedMinutes: 0,
    }],
    reservedMinutes: 0,
  }
  const availability = classHuntSubjectAvailability({
    student,
    subjectId: 'subject-l2',
    bookings: [
      // lessonId is written at attendance time, but approval has not spent
      // the package yet, so this row must still keep its full hold.
      {
        id: 'awaiting-approval',
        subjectId: 'subject-l2',
        status: 'confirmed',
        lessonId: 'lesson-awaiting-approval',
        requestedMinutes: 50,
        pointsPer25Minutes: 25,
      },
      // A released self-service cancellation can keep a fund hold until its
      // replacement is finalized. It is not a calendar conflict, but it is
      // still unavailable package credit.
      {
        id: 'pending-rebook',
        subjectId: 'subject-l2',
        status: 'released',
        pendingRebook: true,
        rebookHoldPoints: 50,
      },
    ],
  })

  assert.deepEqual(availability, {
    remainingSessions: 3,
    availableSessionCount: 1,
    heldBookingCount: 2,
    heldPoints: 100,
    availablePoints: 50,
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
    classHuntCompensation: {
      version: CLASS_HUNT_COMPENSATION_VERSION,
      ratePerMinute: 50_000,
      currency: CLASS_HUNT_COMPENSATION_CURRENCY,
      formula: CLASS_HUNT_COMPENSATION_FORMULA,
    },
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
    compensationRatePerMinute: 50_000,
  }

  assert.equal(classHuntPublishRetryMatches(exact, stored), true)
  assert.equal(classHuntPublishRetryMatches({ ...exact, studentId: 'student-2' }, stored), false)
  assert.equal(classHuntPublishRetryMatches({ ...exact, subjectId: 'subject-l3' }, stored), false)
  assert.equal(classHuntPublishRetryMatches({ ...exact, sessionCount: 12 }, stored), false)
  assert.equal(classHuntPublishRetryMatches({ ...exact, weekdays: ['mon', 'wed', 'fri', 'fri'] }, stored), false)
  assert.equal(classHuntPublishRetryMatches({ ...exact, compensationRatePerMinute: 50_001 }, stored), false)
  assert.equal(classHuntPublishRetryMatches({ ...exact, compensationRatePerMinute: undefined }, stored), false)

  const legacyStored = { ...stored }
  delete legacyStored.classHuntCompensation
  const legacyRequest = { ...exact }
  delete legacyRequest.compensationRatePerMinute
  assert.equal(classHuntPublishRetryMatches(legacyRequest, legacyStored), true)
  assert.equal(classHuntPublishRetryMatches(exact, legacyStored), false)

  const allRemainingStored = { ...stored, sessionSelectionMode: 'all_remaining' }
  const allRemainingRequest = { ...exact, sessionSelectionMode: 'all_remaining', sessionCount: 1 }
  assert.equal(classHuntPublishRetryMatches(allRemainingRequest, allRemainingStored), true)
  assert.equal(classHuntPublishRetryMatches({ ...allRemainingRequest, sessionSelectionMode: 'specific' }, allRemainingStored), false)
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

test('CLASS HUNTING locks an exact VND-per-minute compensation snapshot without a level multiplier', () => {
  const compensation = createClassHuntCompensation(50_000)
  assert.deepEqual(compensation, {
    version: 1,
    ratePerMinute: 50_000,
    currency: 'VND',
    formula: 'flat_per_minute',
  })
  assert.equal(isClassHuntCompensation(compensation), true)
  assert.equal(isClassHuntCompensation({ ...compensation, ratePerMinute: 50_000.5 }), false)
  assert.equal(isClassHuntCompensation({ ...compensation, currency: 'USD' }), false)
  // 50,000 VND/minute × 50 minutes; no teacher level appears in this formula.
  assert.equal(classHuntCompensationAmount(compensation, 50), 2_500_000)
  assert.equal(classHuntCompensationAmount(compensation, 50, 4), 10_000_000)
  assert.throws(() => createClassHuntCompensation(0), (cause) => (
    cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_COMPENSATION_RATE_INVALID'
  ))
  assert.throws(() => createClassHuntCompensation(12.5), (cause) => (
    cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_COMPENSATION_RATE_INVALID'
  ))
  assert.throws(() => classHuntCompensationAmount(createClassHuntCompensation(Number.MAX_SAFE_INTEGER), 25), (cause) => (
    cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_COMPENSATION_AMOUNT_OVERFLOW'
  ))
})

test('teacher Class Hunting payload exposes only a valid immutable compensation snapshot', () => {
  const compensation = createClassHuntCompensation(42_000)
  const sanitized = sanitizeClassHuntForTeacher({
    id: 'hunt-a',
    status: 'open',
    subjectName: 'Tiếng Anh',
    requestedMinutes: 50,
    sessions: [mondaySession()],
    expiresAtMs: NOW_MS + 60_000,
    classHuntCompensation: compensation,
  })
  assert.deepEqual(sanitized?.classHuntCompensation, compensation)
  assert.notEqual(sanitized?.classHuntCompensation, compensation)

  const legacy = sanitizeClassHuntForTeacher({
    id: 'hunt-legacy', status: 'open', subjectName: 'Tiếng Anh', requestedMinutes: 50,
    sessions: [mondaySession()], expiresAtMs: NOW_MS + 60_000,
  })
  assert.equal(legacy?.classHuntCompensation, undefined)
  assert.equal(sanitizeClassHuntForTeacher({
    id: 'hunt-corrupt', status: 'open', subjectName: 'Tiếng Anh', requestedMinutes: 50,
    sessions: [mondaySession()], expiresAtMs: NOW_MS + 60_000,
    classHuntCompensation: { ...compensation, formula: 'teacher_level' },
  }), null)
})

test('CLASS HUNTING ignores declared availability and preserves real timetable conflicts', () => {
  const session = mondaySession()
  // There is deliberately no availability input in the CLASS HUNTING
  // timetable decision: only saved teaching bookings can block the claim.
  assert.deepEqual(findClassHuntBookingConflicts({
    teacherId: 'teacher-a',
    studentId: 'student-a',
    sessions: [session],
    bookings: [],
  }), [])

  const conflicts = findClassHuntBookingConflicts({
    teacherId: 'teacher-a',
    studentId: 'student-a',
    sessions: [session],
    bookings: [{
      id: 'teacher-overlap', status: 'confirmed', teacherId: 'teacher-a', studentId: 'other-student',
      requestedDate: '2026-09-07', requestedStart: '19:25', requestedEnd: '19:50', requestedMinutes: 25,
    }],
  })
  assert.equal(classHuntClaimConflictReason(conflicts), 'teacher')
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

test('CLASS HUNTING keeps required teacher-profile eligibility separate from availability', () => {
  const completeProfile = {
    photoURL: 'https://cdn.example.test/teacher.jpg',
    gender: 'female',
    yob: 1990,
    livingArea: 'Hà Nội',
    degreeType: 'Bachelor',
    university: 'Đại học',
    major: 'English',
    teachingYears: 4,
    bankName: 'Bank',
    bankAccountNo: '0123456789',
    bankAccountName: 'Nguyen Van A',
  }
  assert.equal(isClassHuntTeacherProfileComplete(completeProfile), true)
  assert.equal(isClassHuntTeacherProfileComplete({ ...completeProfile, bankAccountNo: '   ' }), false)
  assert.equal(isClassHuntTeacherProfileComplete({ ...completeProfile, teachingYears: 0 }), false)
  // There is intentionally no availability field in this predicate.
  assert.equal(isClassHuntTeacherProfileComplete({ ...completeProfile, teachingFormats: ['online'] }), true)
  assert.equal(isClassHuntTeacherDiscoverable({
    ...completeProfile,
    status: 'active',
    subjectIds: [],
    teachingFormats: ['online'],
  }), true)
  assert.equal(isClassHuntTeacherDiscoverable({
    ...completeProfile,
    status: 'active',
    subjectIds: [],
    teachingFormats: ['offline'],
  }), false)
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

  const canonicalDurationConflicts = findClassHuntBookingConflicts({
    teacherId: 'teacher-a',
    studentId: 'student-a',
    sessions: [mondaySession({ requestedStart: '19:40', requestedEnd: '20:30' })],
    bookings: [{
      id: 'legacy-display-end', status: 'confirmed', teacherId: 'teacher-a', studentId: 'other-student',
      requestedDate: '2026-09-07', requestedStart: '19:00', requestedEnd: '19:25', requestedMinutes: 50,
    }],
  })
  assert.deepEqual(canonicalDurationConflicts.map((conflict) => conflict.bookingId), ['legacy-display-end'])
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

test('CLASS HUNTING accepts legacy teacher links when canonical UID is missing', () => {
  const exact = {
    teacherId: 'teacher-a',
    uid: 'teacher-user-a',
    teacherLoginAccountUid: 'teacher-user-a',
    userTeacherId: 'teacher-a',
    userRole: 'teacher',
  }
  assert.equal(hasCanonicalClassHuntTeacherLogin(exact), true)
  assert.equal(hasCanonicalClassHuntTeacherLogin({ ...exact, teacherLoginAccountUid: '' }), true)
  assert.equal(hasCanonicalClassHuntTeacherLogin({ ...exact, teacherLoginAccountUid: undefined }), true)
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
    studentId: 'student-a', subjectId: 'VN-1S-L2', startDate: '2026-09-07', selectedDays: ['thu', 'mon'], requestedStart: '19:00', requestedMinutes: 50, sessionCount: 2, compensationRatePerMinute: 50_000,
  }, NOW_MS)
  const same = buildClassHuntDraft({
    studentId: 'student-a', subjectId: 'VN-1S-L2', startDate: '2026-09-07', selectedDays: ['mon', 'thu'], requestedStart: '19:00', requestedMinutes: 50, sessionCount: 2, compensationRatePerMinute: 50_000,
  }, NOW_MS)
  assert.equal(classHuntPublishFingerprint(first), classHuntPublishFingerprint(same))
  assert.equal(first.expiresInMinutes, CLASS_HUNT_DEFAULT_TTL_MINUTES)
  assert.deepEqual(first.classHuntCompensation, {
    version: 1,
    ratePerMinute: 50_000,
    currency: 'VND',
    formula: 'flat_per_minute',
  })
  assert.notEqual(
    classHuntPublishFingerprint(first),
    classHuntPublishFingerprint({ ...first, classHuntCompensation: createClassHuntCompensation(50_001) }),
  )
  assert.throws(() => buildClassHuntDraft({
    studentId: 'student-a', subjectId: 'VN-1S-L2', startDate: '2026-09-07', selectedDays: ['mon'], requestedStart: '19:00', requestedMinutes: 50, sessionCount: 1, compensationRatePerMinute: -1,
  }, NOW_MS), (cause) => cause instanceof ClassHuntValidationError && cause.reason === 'CLASS_HUNT_COMPENSATION_RATE_INVALID')
  const legacy = buildClassHuntDraft({
    studentId: 'student-a', subjectId: 'VN-1S-L2', startDate: '2026-09-07', selectedDays: ['mon'], requestedStart: '19:00', requestedMinutes: 50, sessionCount: 1,
  }, NOW_MS)
  assert.equal(legacy.classHuntCompensation, undefined)
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
