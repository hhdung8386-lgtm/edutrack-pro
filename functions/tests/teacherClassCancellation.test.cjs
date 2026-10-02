const assert = require('node:assert/strict')
const test = require('node:test')

const {
  TeacherClassCancellationValidationError,
  bookingStartMs,
  makeupProposalWindowBlocker,
  normalizeTeacherClassCancellationRequest,
  teacherCancellationPenaltySnapshot,
  teacherCancellationRequestBlocker,
  teacherCancellationWithdrawBlocker,
} = require('../lib/teacherClassCancellation.js')

function booking(overrides = {}) {
  return {
    status: 'confirmed',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    requestedDate: '2026-09-20',
    requestedStart: '19:00',
    requestedEnd: '19:25',
    requestedMinutes: 25,
    ...overrides,
  }
}

// 2026-09-20 19:00 giờ VN = 12:00 UTC
const START_MS = Date.UTC(2026, 8, 20, 12, 0)

test('request input needs a safe booking id and a real reason', () => {
  assert.deepEqual(
    normalizeTeacherClassCancellationRequest({ bookingId: ' b-1 ', reason: '  Bận việc gia đình  ' }),
    { bookingId: 'b-1', action: 'request', reason: 'Bận việc gia đình', acceptLatePenalty: false, makeupProposals: null },
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ bookingId: 'b/1', reason: 'Bận việc gia đình' }),
    (error) => error instanceof TeacherClassCancellationValidationError && error.reason === 'BOOKING_ID_INVALID',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', reason: ' ốm ' }),
    (error) => error.reason === 'CANCELLATION_REASON_REQUIRED',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', reason: 'x'.repeat(501) }),
    (error) => error.reason === 'CANCELLATION_REASON_TOO_LONG',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', action: 'approve', reason: 'Bận việc gia đình' }),
    (error) => error.reason === 'CANCELLATION_ACTION_INVALID',
  )
  assert.deepEqual(
    normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', action: 'withdraw' }),
    { bookingId: 'b-1', action: 'withdraw', reason: '', acceptLatePenalty: false, makeupProposals: null },
  )
})

test('late cancellation needs explicit consent and snapshots one 50k VND penalty', () => {
  const exactlyOneHourBefore = START_MS - 60 * 60 * 1000
  const fiftyNineMinutesBefore = START_MS - 59 * 60 * 1000
  assert.deepEqual(
    teacherCancellationPenaltySnapshot(booking(), exactlyOneHourBefore, false),
    { amount: 0, currency: 'VND', noticeMinutes: 60 },
  )
  assert.throws(
    () => teacherCancellationPenaltySnapshot(booking(), fiftyNineMinutesBefore, false),
    (error) => error instanceof TeacherClassCancellationValidationError
      && error.reason === 'LATE_CANCELLATION_PENALTY_CONSENT_REQUIRED',
  )
  assert.deepEqual(
    teacherCancellationPenaltySnapshot(booking(), fiftyNineMinutesBefore, true),
    { amount: 50_000, currency: 'VND', noticeMinutes: 59 },
  )
})

test('class start is read in Vietnam time and malformed dates fail closed', () => {
  assert.equal(bookingStartMs(booking()), START_MS)
  assert.equal(bookingStartMs(booking({ requestedDate: '2026-02-30' })), null)
  assert.equal(bookingStartMs(booking({ requestedStart: '7:00' })), null)
  assert.equal(bookingStartMs(booking({ requestedDate: undefined })), null)
})

test('only an own, confirmed, unattended, future class can be requested', () => {
  const before = START_MS - 60_000
  assert.equal(teacherCancellationRequestBlocker(booking(), 'teacher-a', before), '')
  assert.equal(teacherCancellationRequestBlocker(booking(), 'teacher-b', before), 'BOOKING_TEACHER_MISMATCH')
  assert.equal(teacherCancellationRequestBlocker(booking({ status: 'pending' }), 'teacher-a', before), 'BOOKING_NOT_CONFIRMED')
  assert.equal(teacherCancellationRequestBlocker(booking({ status: 'released' }), 'teacher-a', before), 'BOOKING_NOT_CONFIRMED')
  assert.equal(teacherCancellationRequestBlocker(booking({ lessonId: 'lesson-1' }), 'teacher-a', before), 'BOOKING_ALREADY_ATTENDED')
  assert.equal(
    teacherCancellationRequestBlocker(booking({ teacherCancellationStatus: 'pending' }), 'teacher-a', before),
    'CANCELLATION_ALREADY_PENDING',
  )
  assert.equal(teacherCancellationRequestBlocker(booking(), 'teacher-a', START_MS), 'BOOKING_ALREADY_STARTED')
  assert.equal(teacherCancellationRequestBlocker(booking({ requestedDate: '' }), 'teacher-a', before), 'BOOKING_TIME_INVALID')
  // Bị từ chối trước đó vẫn được xin lại.
  assert.equal(
    teacherCancellationRequestBlocker(booking({ teacherCancellationStatus: 'rejected' }), 'teacher-a', before),
    '',
  )
})

test('withdraw only works on the own pending request', () => {
  assert.equal(teacherCancellationWithdrawBlocker(booking({ teacherCancellationStatus: 'pending' }), 'teacher-a'), '')
  assert.equal(
    teacherCancellationWithdrawBlocker(booking({ teacherCancellationStatus: 'pending' }), 'teacher-b'),
    'BOOKING_TEACHER_MISMATCH',
  )
  assert.equal(
    teacherCancellationWithdrawBlocker(booking({ teacherCancellationStatus: 'approved' }), 'teacher-a'),
    'CANCELLATION_NOT_PENDING',
  )
  assert.equal(teacherCancellationWithdrawBlocker(booking(), 'teacher-a'), 'CANCELLATION_NOT_PENDING')
})

test('makeup proposals are optional only for legacy clients and must be 1-3 valid unique slots', () => {
  const base = { bookingId: 'b-1', reason: 'Bận việc gia đình' }
  assert.deepEqual(
    normalizeTeacherClassCancellationRequest({
      ...base,
      makeupProposals: [{ date: '2026-09-22', time: '19:00' }, { date: ' 2026-09-23 ', time: '20:30' }],
    }).makeupProposals,
    [{ date: '2026-09-22', time: '19:00' }, { date: '2026-09-23', time: '20:30' }],
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ ...base, makeupProposals: [] }),
    (error) => error.reason === 'MAKEUP_PROPOSALS_REQUIRED',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({
      ...base,
      makeupProposals: [1, 2, 3, 4].map((day) => ({ date: `2026-09-2${day}`, time: '19:00' })),
    }),
    (error) => error.reason === 'MAKEUP_PROPOSALS_TOO_MANY',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ ...base, makeupProposals: [{ date: '2026-09-22', time: '' }] }),
    (error) => error.reason === 'MAKEUP_PROPOSALS_INVALID',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ ...base, makeupProposals: [{ date: '2026-02-30', time: '19:00' }] }),
    (error) => error.reason === 'MAKEUP_PROPOSALS_INVALID',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ ...base, makeupProposals: 'thu 2' }),
    (error) => error.reason === 'MAKEUP_PROPOSALS_INVALID',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({
      ...base,
      makeupProposals: [{ date: '2026-09-22', time: '19:00' }, { date: '2026-09-22', time: '19:00' }],
    }),
    (error) => error.reason === 'MAKEUP_PROPOSALS_DUPLICATE',
  )
  assert.equal(
    normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', action: 'withdraw', makeupProposals: 'x' }).makeupProposals,
    null,
  )
})

test('makeup proposals must be after now and within the next 7 Vietnam days', () => {
  // 2026-09-20 23:30 giờ VN
  const now = Date.UTC(2026, 8, 20, 16, 30)
  assert.equal(makeupProposalWindowBlocker(null, now), '')
  assert.equal(makeupProposalWindowBlocker([{ date: '2026-09-20', time: '23:45' }], now), '')
  assert.equal(makeupProposalWindowBlocker([{ date: '2026-09-27', time: '23:55' }], now), '')
  assert.equal(makeupProposalWindowBlocker([{ date: '2026-09-20', time: '23:30' }], now), 'MAKEUP_PROPOSAL_IN_PAST')
  assert.equal(makeupProposalWindowBlocker([{ date: '2026-09-19', time: '19:00' }], now), 'MAKEUP_PROPOSAL_IN_PAST')
  assert.equal(makeupProposalWindowBlocker([{ date: '2026-09-28', time: '00:00' }], now), 'MAKEUP_PROPOSAL_OUT_OF_WINDOW')
  // 00:30 giờ VN ngày 21 (vẫn là 20/09 theo UTC): hôm nay là 21/09 nên hạn chót là 28/09
  const afterMidnight = Date.UTC(2026, 8, 20, 17, 30)
  assert.equal(makeupProposalWindowBlocker([{ date: '2026-09-28', time: '21:00' }], afterMidnight), '')
})
