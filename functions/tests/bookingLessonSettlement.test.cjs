const test = require('node:test')
const assert = require('node:assert/strict')

const {
  activeLinkedLessonIds,
  createApprovedLessonFactCache,
  isBookingSettledByApprovedLesson,
  readLessonSettlementFacts,
  settleApprovedLessonBookings,
} = require('../lib/bookingLessonSettlement.js')
const { classHuntSubjectAvailability } = require('../lib/classHunting.js')
const { effectiveParentBookingHolds } = require('../lib/parentProfileBooking.js')

function booking(id, overrides = {}) {
  return {
    id,
    status: 'confirmed',
    studentId: 'student-a',
    subjectId: 'subject-a',
    requestedMinutes: 25,
    requestedPoints: 25,
    ...overrides,
  }
}

const facts = new Map([
  ['approved-own', { status: 'approved', studentId: 'student-a' }],
  ['pending-own', { status: 'pending', studentId: 'student-a' }],
  ['rejected-own', { status: 'rejected', studentId: 'student-a' }],
  ['approved-other', { status: 'approved', studentId: 'student-b' }],
])

test('only a live booking linked to an approved lesson of the same student is settled', () => {
  assert.equal(isBookingSettledByApprovedLesson(booking('a', { lessonId: 'approved-own' }), facts), true)
  assert.equal(isBookingSettledByApprovedLesson(booking('b', { status: 'pending', lessonId: 'approved-own' }), facts), true)
  assert.equal(isBookingSettledByApprovedLesson(booking('c', { lessonId: 'pending-own' }), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('d', { lessonId: 'rejected-own' }), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('e', { lessonId: 'approved-other' }), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('f', { lessonId: 'missing' }), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('g'), facts), false)
  assert.equal(isBookingSettledByApprovedLesson(booking('h', { status: 'released', lessonId: 'approved-own' }), facts), false)
})

test('settlement returns a copy and keeps the original array when nothing changes', () => {
  const rows = [booking('legacy', { lessonId: 'approved-own' }), booking('future')]
  const settled = settleApprovedLessonBookings(rows, facts)
  assert.notEqual(settled, rows)
  assert.equal(rows[0].status, 'confirmed')
  assert.deepEqual(settled.map((row) => row.status), ['completed', 'confirmed'])
  const untouched = [booking('future')]
  assert.equal(settleApprovedLessonBookings(untouched, facts), untouched)
  assert.equal(settleApprovedLessonBookings(rows, new Map()), rows)
})

test('collects unique safe lesson ids from live bookings only', () => {
  assert.deepEqual(activeLinkedLessonIds([
    booking('a', { lessonId: 'l2' }),
    booking('b', { lessonId: 'l1' }),
    booking('c', { lessonId: 'l1' }),
    booking('d', { status: 'completed', lessonId: 'l3' }),
    booking('e', { lessonId: 'bad/id' }),
  ]), ['l1', 'l2'])
})

test('reads lesson facts in chunks and ignores missing documents', async () => {
  const calls = []
  const result = await readLessonSettlementFacts(['l1', 'l2', 'l1', 'bad/id'], async (ids) => {
    calls.push(ids)
    return ids.map((id) => ({
      id,
      exists: id === 'l1',
      data: () => ({ status: 'approved', studentId: 'student-a' }),
    }))
  })
  assert.deepEqual(calls, [['l1', 'l2']])
  assert.deepEqual([...result.entries()], [['l1', { status: 'approved', studentId: 'student-a' }]])
})

test('cache keeps approved lessons only and re-reads other states', async () => {
  let reads = 0
  let now = 1_000
  const read = createApprovedLessonFactCache(60_000, 100, () => now)
  const reader = async (ids) => {
    reads += ids.length
    return ids.map((id) => ({ id, exists: true, data: () => ({ status: id === 'approved' ? 'approved' : 'pending', studentId: 's' }) }))
  }
  await read(['approved', 'pending'], reader)
  await read(['approved', 'pending'], reader)
  assert.equal(reads, 3)
  now += 61_000
  await read(['approved'], reader)
  assert.equal(reads, 4)
})

test('legacy approved bookings no longer block parent booking holds', () => {
  const student = { reservedMinutes: 25 }
  const rows = [
    booking('legacy-1', { lessonId: 'approved-own' }),
    booking('legacy-2', { lessonId: 'approved-own' }),
    booking('awaiting', { lessonId: 'pending-own' }),
  ]
  const before = effectiveParentBookingHolds(student, rows, 'subject-a', 'student-a')
  assert.equal(before.activeHeldPoints, 75)
  const after = effectiveParentBookingHolds(student, settleApprovedLessonBookings(rows, facts), 'subject-a', 'student-a')
  assert.equal(after.activeHeldPoints, 25)
  assert.equal(after.effectiveHeldPoints, 25)
})

test('legacy approved bookings no longer shrink class hunting availability', () => {
  const student = {
    remainingMinutes: 100,
    subjects: [{ subjectId: 'subject-a', subjectName: 'English', totalMinutes: 100, usedMinutes: 0, remainingMinutes: 100 }],
  }
  const rows = [booking('legacy', { lessonId: 'approved-own' }), booking('legacy-2', { lessonId: 'approved-own' })]
  const before = classHuntSubjectAvailability({ student, subjectId: 'subject-a', bookings: rows })
  const after = classHuntSubjectAvailability({ student, subjectId: 'subject-a', bookings: settleApprovedLessonBookings(rows, facts) })
  assert.equal(before.availablePoints, 50)
  assert.equal(after.availablePoints, 100)
})
