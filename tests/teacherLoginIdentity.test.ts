import assert from 'node:assert/strict'
import test from 'node:test'
import { selectTeacherLoginIdentity } from '../src/lib/teacherLoginIdentity.ts'

const current = { id: 'uid-current', email: 'Lola@edutrackpro.app', username: 'Lola' }
const legacy = { id: 'uid-legacy', email: 'GVGEVI65@edutrackpro.app', username: 'GVGEVI65' }

test('uses the canonical UID even when legacy teacher documents remain active', () => {
  const result = selectTeacherLoginIdentity(
    [legacy, current],
    current.id,
    'Lola',
    'Lola@edutrackpro.app',
  )

  assert.equal(result.error, null)
  assert.equal(result.identity?.id, current.id)
})

test('stops when a configured canonical UID is missing', () => {
  const result = selectTeacherLoginIdentity(
    [legacy, current],
    'uid-missing',
    'Lola',
    'Lola@edutrackpro.app',
  )

  assert.equal(result.identity, null)
  assert.equal(result.error, 'canonical_missing')
})

test('selects one exact current email for legacy profiles without a canonical UID', () => {
  const result = selectTeacherLoginIdentity(
    [legacy, current],
    '',
    'lola',
    'lola@edutrackpro.app',
  )

  assert.equal(result.error, null)
  assert.equal(result.identity?.id, current.id)
})

test('does not guess when the current identity is duplicated', () => {
  const result = selectTeacherLoginIdentity(
    [current, { ...current, id: 'uid-current-2' }],
    '',
    'Lola',
    'Lola@edutrackpro.app',
  )

  assert.equal(result.identity, null)
  assert.equal(result.error, 'duplicate_current_identity')
})

test('does not guess between unrelated legacy identities', () => {
  const result = selectTeacherLoginIdentity(
    [legacy, { id: 'uid-other', email: 'Other@edutrackpro.app', username: 'Other' }],
    '',
    'Lola',
    'Lola@edutrackpro.app',
  )

  assert.equal(result.identity, null)
  assert.equal(result.error, 'ambiguous_identity')
})

test('allows provisioning flow when no Firestore identity exists', () => {
  const result = selectTeacherLoginIdentity(
    [],
    '',
    'Lola',
    'Lola@edutrackpro.app',
  )

  assert.equal(result.error, null)
  assert.equal(result.identity, null)
})
