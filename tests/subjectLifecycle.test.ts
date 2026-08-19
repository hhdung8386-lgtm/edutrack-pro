import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isDeletedSubject,
  isSelectableSubject,
  isVisibleSubject,
} from '../src/lib/subjectLifecycle.ts'

test('soft-deleted subject is retained but excluded from operational catalogs', () => {
  const deleted = { status: 'inactive', isDeleted: true }

  assert.equal(isDeletedSubject(deleted), true)
  assert.equal(isSelectableSubject(deleted), false)
  assert.equal(isVisibleSubject(deleted), false)
})

test('inactive subject remains manageable while legacy active data stays compatible', () => {
  assert.equal(isVisibleSubject({ status: 'inactive' }), true)
  assert.equal(isSelectableSubject({ status: 'inactive' }), false)
  assert.equal(isSelectableSubject({}), true)
})
