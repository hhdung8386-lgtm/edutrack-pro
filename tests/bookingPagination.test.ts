import assert from 'node:assert/strict'
import test from 'node:test'
import { bookingPage, BOOKING_PAGE_SIZE } from '../src/lib/bookingPagination.ts'

test('a production-sized list stays bounded and every booking is reachable once', () => {
  const bookings = Array.from({ length: 8386 }, (_, id) => ({ id, minutes: 25 }))
  const original = [...bookings]
  const first = bookingPage(bookings, 1)
  assert.equal(first.items.length, BOOKING_PAGE_SIZE)
  assert.equal(first.pageCount, 168)
  assert.equal(first.start, 1)
  assert.equal(first.end, 50)
  const all = Array.from({ length: first.pageCount }, (_, index) => bookingPage(bookings, index + 1).items).flat()
  assert.deepEqual(all, original)
  assert.deepEqual(bookings, original)
  assert.equal(all.reduce((sum, item) => sum + item.minutes, 0), 209650)
  const last = bookingPage(bookings, 168)
  assert.equal(last.items.length, 36)
  assert.equal(last.start, 8351)
  assert.equal(last.end, 8386)
})

test('realtime removal and narrower filters clamp a previously selected page', () => {
  assert.deepEqual(bookingPage(['one', 'two'], 168), {
    page: 1, pageCount: 1, start: 1, end: 2, items: ['one', 'two'],
  })
  const remaining = Array.from({ length: 51 }, (_, id) => id)
  assert.equal(bookingPage(remaining, 168).page, 2)
  assert.deepEqual(bookingPage(remaining, 168).items, [50])
})

test('empty and invalid page inputs do not expose invalid ranges', () => {
  assert.deepEqual(bookingPage([], 4), { page: 1, pageCount: 1, start: 0, end: 0, items: [] })
  for (const page of [0, -1, NaN, Infinity]) assert.equal(bookingPage([1], page).page, 1)
})
