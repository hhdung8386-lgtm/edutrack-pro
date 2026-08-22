import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDefaultBulkClassification,
  getStudentClassification,
  STUDENT_CLASSIFICATION_OPTIONS,
} from '../src/lib/studentClassification.ts'

test('legacy and unclassified students remain in fixed without a data backfill', () => {
  assert.equal(getStudentClassification({}), 'fixed')
  assert.equal(getStudentClassification({ learningScheduleType: 'unclassified' }), 'fixed')
  assert.equal(getStudentClassification({ learningScheduleType: 'fixed' }), 'fixed')
})

test('explicit flexible and offline classifications remain distinct', () => {
  assert.equal(getStudentClassification({ learningScheduleType: 'flexible' }), 'flexible')
  assert.equal(getStudentClassification({ learningScheduleType: 'offline' }), 'offline')
  assert.deepEqual(STUDENT_CLASSIFICATION_OPTIONS.map((option) => option.value), [
    'fixed',
    'flexible',
    'offline',
  ])
})

test('bulk picker defaults away from the current category to avoid no-op writes', () => {
  assert.equal(getDefaultBulkClassification('fixed'), 'flexible')
  assert.equal(getDefaultBulkClassification('flexible'), 'fixed')
  assert.equal(getDefaultBulkClassification('offline'), 'fixed')
  assert.equal(getDefaultBulkClassification('all'), 'fixed')
})
