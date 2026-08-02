import assert from 'node:assert/strict'

import {
  convertVnDateTimeToTeacher,
  DAYS_ORDER,
  translateTeacherSlotsToVn,
  translateVnSlotsToTeacher,
} from '../src/lib/timezoneUtils.ts'

function emptySlots() {
  return Object.fromEntries(
    DAYS_ORDER.map((day) => [day, { available: false, timeRanges: [] }]),
  )
}

function slotsFor(day, ranges) {
  const slots = emptySlots()
  slots[day] = { available: ranges.length > 0, timeRanges: ranges }
  return slots
}

function rangesOn(slots, day) {
  return slots[day].timeRanges
}

function assertRanges(slots, day, expected, message) {
  assert.deepEqual(rangesOn(slots, day), expected, message)
}

function semanticCoverage(slots) {
  const minutesPerDay = 24 * 60
  const minutesPerWeek = 7 * minutesPerDay
  const coverage = new Uint8Array(minutesPerWeek)
  const parse = (value) => {
    const [hours, minutes] = value.split(':').map(Number)
    return hours * 60 + minutes
  }

  DAYS_ORDER.forEach((day, dayIndex) => {
    for (const range of slots[day].timeRanges) {
      const start = parse(range.start)
      const rawEnd = parse(range.end)
      const end = rawEnd < start ? rawEnd + minutesPerDay : rawEnd
      for (let minute = start; minute < end; minute++) {
        coverage[((dayIndex * minutesPerDay + minute) % minutesPerWeek + minutesPerWeek) % minutesPerWeek] = 1
      }
    }
  })
  return coverage
}

function assertSemanticEqual(actual, expected, message) {
  assert.deepEqual(semanticCoverage(actual), semanticCoverage(expected), message)
}

// PH (UTC+8): exact 25-minute and 50-minute ranges must not be rounded to
// 30-minute cells or discarded.
const ph25 = slotsFor('mon', [{ start: '18:30', end: '18:55' }])
const ph25InVn = translateTeacherSlotsToVn(ph25, 8)
assertRanges(ph25InVn, 'mon', [{ start: '17:30', end: '17:55' }], 'PH 25-minute range')
assert.deepEqual(translateVnSlotsToTeacher(ph25InVn, 8), ph25, 'PH 25-minute round trip')

const ph50 = slotsFor('mon', [{ start: '18:30', end: '19:20' }])
const ph50InVn = translateTeacherSlotsToVn(ph50, 8)
assertRanges(ph50InVn, 'mon', [{ start: '17:30', end: '18:20' }], 'PH 50-minute range')
assert.deepEqual(translateVnSlotsToTeacher(ph50InVn, 8), ph50, 'PH 50-minute round trip')

// A range crossing midnight stays intact using the existing extended 24:xx
// representation, and a Sunday/Monday conversion wraps the recurring week.
const phMondayAfterMidnight = slotsFor('mon', [{ start: '00:30', end: '01:20' }])
const phMondayAfterMidnightInVn = translateTeacherSlotsToVn(phMondayAfterMidnight, 8)
assertRanges(
  phMondayAfterMidnightInVn,
  'sun',
  [{ start: '23:30', end: '24:20' }],
  'PH to VN midnight/week wrap',
)
assertRanges(
  phMondayAfterMidnightInVn,
  'mon',
  [{ start: '00:00', end: '00:20' }],
  'PH to VN midnight continuation',
)
assert.deepEqual(
  translateVnSlotsToTeacher(phMondayAfterMidnightInVn, 8),
  phMondayAfterMidnight,
  'PH midnight/week round trip',
)

const phMondayThreeHours = slotsFor('mon', [{ start: '00:00', end: '03:00' }])
const phMondayThreeHoursInVn = translateTeacherSlotsToVn(phMondayThreeHours, 8)
assertRanges(
  phMondayThreeHoursInVn,
  'sun',
  [{ start: '23:00', end: '24:20' }],
  'cross-midnight range stays clickable in the previous day',
)
assertRanges(
  phMondayThreeHoursInVn,
  'mon',
  [{ start: '00:00', end: '02:00' }],
  'cross-midnight continuation is visible on the next day',
)
assert.deepEqual(
  translateVnSlotsToTeacher(phMondayThreeHoursInVn, 8),
  phMondayThreeHours,
  'translated end beyond 25:xx round trip',
)

const fullExtendedWindow = slotsFor('mon', [{ start: '00:00', end: '24:20' }])
const fullExtendedWindowInVn = translateTeacherSlotsToVn(fullExtendedWindow, 8)
assertRanges(
  fullExtendedWindowInVn,
  'sun',
  [{ start: '23:00', end: '24:20' }],
  'long merged range remains clickable before midnight',
)
assertRanges(
  fullExtendedWindowInVn,
  'mon',
  [{ start: '00:00', end: '23:20' }],
  'long merged range continuation remains visible',
)
const fullExtendedWindowRoundTrip = translateVnSlotsToTeacher(fullExtendedWindowInVn, 8)
assertRanges(fullExtendedWindowRoundTrip, 'mon', [{ start: '00:00', end: '24:20' }], 'long range round trip')
assertRanges(fullExtendedWindowRoundTrip, 'tue', [{ start: '00:00', end: '00:20' }], 'long range continuation round trip')
assertSemanticEqual(fullExtendedWindowRoundTrip, fullExtendedWindow, 'long range semantic round trip')

const overlappingMultiDay = emptySlots()
overlappingMultiDay.mon = { available: true, timeRanges: [{ start: '18:00', end: '25:20' }] }
overlappingMultiDay.tue = { available: true, timeRanges: [{ start: '00:00', end: '25:20' }] }
const overlappingMultiDayInVn = translateTeacherSlotsToVn(overlappingMultiDay, -8)
const overlappingMultiDayRoundTrip = translateVnSlotsToTeacher(overlappingMultiDayInVn, -8)
assertSemanticEqual(
  overlappingMultiDayRoundTrip,
  overlappingMultiDay,
  'overlapping multi-day ranges survive translation without an oversized merge',
)

const phExtendedClock = slotsFor('mon', [{ start: '24:30', end: '25:20' }])
assertRanges(
  translateTeacherSlotsToVn(phExtendedClock, 8),
  'mon',
  [{ start: '23:30', end: '24:20' }],
  '18:00-25:00 UI window remains compatible',
)
assertRanges(
  translateTeacherSlotsToVn(phExtendedClock, 8),
  'tue',
  [{ start: '00:00', end: '00:20' }],
  '18:00-25:00 continuation is visible on the next day',
)

const pstSunday = slotsFor('sun', [{ start: '18:30', end: '18:55' }])
assertRanges(
  translateTeacherSlotsToVn(pstSunday, -8),
  'mon',
  [{ start: '09:30', end: '09:55' }],
  'PST to VN week wrap',
)

// Fractional offsets use minute precision even though the current country list
// only contains whole-hour offsets.
const offsetFiveThirty = slotsFor('mon', [{ start: '18:30', end: '18:55' }])
const offsetFiveThirtyInVn = translateTeacherSlotsToVn(offsetFiveThirty, 5.5)
assertRanges(
  offsetFiveThirtyInVn,
  'mon',
  [{ start: '20:00', end: '20:25' }],
  'fractional offset',
)
assert.deepEqual(
  translateVnSlotsToTeacher(offsetFiveThirtyInVn, 5.5),
  offsetFiveThirty,
  'fractional offset round trip',
)
assert.deepEqual(
  convertVnDateTimeToTeacher('2026-08-03', '18:30', 5.5),
  { dateISO: '2026-08-03', timeStr: '17:00' },
  'fractional offset preserves the 30-minute component',
)
assert.deepEqual(
  convertVnDateTimeToTeacher('2026-08-03', '23:30', 8),
  { dateISO: '2026-08-04', timeStr: '00:30' },
  'date conversion crosses midnight deterministically',
)
assert.deepEqual(
  convertVnDateTimeToTeacher('', '', 8),
  { dateISO: '', timeStr: '' },
  'invalid date-time input is returned unchanged',
)

// Adjacent ranges merge, while a real five-minute gap remains visible.
const adjacent = slotsFor('mon', [
  { start: '18:30', end: '18:55' },
  { start: '18:55', end: '19:20' },
])
assertRanges(
  translateTeacherSlotsToVn(adjacent, 8),
  'mon',
  [{ start: '17:30', end: '18:20' }],
  'adjacent ranges merge',
)

const withGap = slotsFor('mon', [
  { start: '18:30', end: '18:55' },
  { start: '19:00', end: '19:25' },
])
assertRanges(
  translateTeacherSlotsToVn(withGap, 8),
  'mon',
  [
    { start: '17:30', end: '17:55' },
    { start: '18:00', end: '18:25' },
  ],
  'gaps are preserved',
)

// UTC+7 is a deep clone fast path so existing Vietnam data is not normalized
// or mutated as a side effect.
const vnSource = slotsFor('mon', [{ start: '24:30', end: '25:20' }])
const vnClone = translateTeacherSlotsToVn(vnSource, 7)
assert.deepEqual(vnClone, vnSource, 'UTC+7 data stays byte-for-byte equivalent')
assert.notEqual(vnClone, vnSource, 'top-level object is cloned')
assert.notEqual(vnClone.mon, vnSource.mon, 'day object is cloned')
assert.notEqual(vnClone.mon.timeRanges[0], vnSource.mon.timeRanges[0], 'range object is cloned')
assert.deepEqual(
  translateTeacherSlotsToVn(vnSource, Number.NaN),
  vnSource,
  'invalid legacy offset safely falls back to UTC+7',
)

// Malformed legacy values must be ignored rather than expanded into a very
// long OPEN range, and partial/null shapes must never crash a translation.
const malformed = emptySlots()
malformed.mon = {
  available: true,
  timeRanges: [
    { start: '18:99', end: '19:20' },
    { start: '18:30', end: '50:20' },
    { start: '50:00', end: '50:25' },
    { start: '18:5', end: '18:30' },
    null,
    {},
  ],
}
const malformedTranslated = translateTeacherSlotsToVn(malformed, 8)
for (const day of DAYS_ORDER) {
  assert.equal(malformedTranslated[day].available, false, `malformed ${day} remains unavailable`)
  assert.deepEqual(malformedTranslated[day].timeRanges, [], `malformed ${day} has no ranges`)
}

const missingRanges = emptySlots()
missingRanges.mon = { available: true, timeRanges: null }
assert.doesNotThrow(() => translateTeacherSlotsToVn(missingRanges, 8), 'null ranges are tolerated')

// Representative supported offsets must all round-trip without mutating input.
for (const offset of [-8, -5, 2, 7, 8, 9]) {
  const source = emptySlots()
  source.mon = { available: true, timeRanges: [{ start: '18:30', end: '18:55' }] }
  source.wed = { available: true, timeRanges: [{ start: '09:00', end: '09:50' }] }
  source.sun = { available: true, timeRanges: [{ start: '22:30', end: '23:20' }] }
  const snapshot = structuredClone(source)
  const roundTrip = translateVnSlotsToTeacher(translateTeacherSlotsToVn(source, offset), offset)
  assert.deepEqual(roundTrip, source, `round trip for UTC${offset >= 0 ? '+' : ''}${offset}`)
  assert.deepEqual(source, snapshot, `input remains immutable for UTC${offset >= 0 ? '+' : ''}${offset}`)
}

console.log('timezone slot regression checks passed')
