import assert from 'node:assert/strict'

import {
  bookingIntervalEndInMinutes,
  bookingIntervalStartInMinutes,
  bookingIntervalsOverlap,
  bookingTimeToMinutes,
} from '../src/lib/bookingTime.ts'

const sundayLate = {
  requestedDate: '2026-08-02',
  requestedStart: '23:30',
  requestedEnd: '24:20',
}
const mondayEarly = {
  requestedDate: '2026-08-03',
  requestedStart: '00:00',
  requestedEnd: '00:50',
}
assert.equal(bookingIntervalsOverlap(sundayLate, mondayEarly), true, 'cross-date overlap is blocked')

const sundayAlias = {
  requestedDate: '2026-08-02',
  requestedStart: '24:30',
  requestedEnd: '25:20',
}
const mondayAlias = {
  requestedDate: '2026-08-03',
  requestedStart: '00:30',
  requestedEnd: '01:20',
}
assert.equal(bookingIntervalsOverlap(sundayAlias, mondayAlias), true, 'extended-time alias is blocked')

const mondayAdjacent = {
  requestedDate: '2026-08-03',
  requestedStart: '00:20',
  requestedEnd: '00:45',
}
assert.equal(bookingIntervalsOverlap(sundayLate, mondayAdjacent), false, 'adjacent cross-date classes remain allowed')

const fallbackDuration = {
  requestedDate: '2026-08-03',
  requestedStart: '18:30',
  requestedMinutes: 25,
}
assert.equal(
  bookingIntervalEndInMinutes(fallbackDuration) - bookingIntervalStartInMinutes(fallbackDuration),
  25,
  'requestedMinutes is used when requestedEnd is absent',
)

const staleEqualEnd = {
  requestedDate: '2026-08-03',
  requestedStart: '18:30',
  requestedEnd: '18:30',
  requestedMinutes: 25,
}
assert.equal(
  bookingIntervalEndInMinutes(staleEqualEnd) - bookingIntervalStartInMinutes(staleEqualEnd),
  25,
  'validated requestedMinutes wins over a stale equal requestedEnd',
)
assert.equal(
  bookingIntervalsOverlap(staleEqualEnd, {
    requestedDate: '2026-08-04',
    requestedStart: '10:00',
    requestedEnd: '10:25',
  }),
  false,
  'a stale equal end cannot block the following day',
)
assert.equal(
  Number.isNaN(bookingIntervalEndInMinutes({
    requestedDate: '2026-08-03',
    requestedStart: '18:30',
    requestedEnd: '49:00',
  })),
  true,
  'an implausibly long inferred interval is rejected',
)
assert.equal(
  Number.isNaN(bookingIntervalEndInMinutes({
    requestedDate: '2026-08-03',
    requestedStart: '18:30',
    requestedEnd: '18:30',
  })),
  true,
  'a zero-length inferred interval is rejected',
)

assert.equal(Number.isNaN(bookingTimeToMinutes('18:99')), true, 'invalid minutes are rejected')
assert.equal(
  bookingIntervalsOverlap({ requestedDate: 'bad', requestedStart: '18:30', requestedEnd: '18:55' }, fallbackDuration),
  false,
  'invalid date input does not create a conflict',
)

console.log('booking time regression checks passed')
