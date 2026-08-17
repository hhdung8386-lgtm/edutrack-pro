import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OFFLINE_TEACHING_AREA_OPTIONS,
  offlineTeachingAreaLabels,
} from '../src/lib/offlineTeachingAreas.ts'

test('exposes the complete offline teaching area list', () => {
  assert.deepEqual(
    OFFLINE_TEACHING_AREA_OPTIONS.map((area) => area.value),
    [
      'central',
      'central_west',
      'west',
      'northwest',
      'northeast',
      'east',
      'south',
      'southwest',
      'hoc_mon',
      'cu_chi',
      'can_gio',
    ],
  )
})

test('keeps legacy profiles safe and preserves unknown future values', () => {
  assert.deepEqual(offlineTeachingAreaLabels(undefined), [])
  assert.deepEqual(
    offlineTeachingAreaLabels(['central', 'central', '', 'future_area']),
    ['Trung tâm (Q1, Q3, Phú Nhuận)', 'future_area'],
  )
})
