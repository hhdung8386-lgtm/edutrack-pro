import assert from 'node:assert/strict'
import test from 'node:test'
import { getLessonPoints } from '../src/lib/points.ts'

test('never deducts a stored legacy point value for a zero-minute lesson', () => {
  assert.equal(getLessonPoints({ minutes: 0, points: 25 }), 0)
  assert.equal(getLessonPoints({ minutes: 0, pointsPer25Minutes: 30 }), 0)
})

test('keeps the stored total for a positive-duration legacy lesson', () => {
  assert.equal(getLessonPoints({ minutes: 25, points: 30 }), 30)
})
