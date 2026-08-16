import assert from 'node:assert/strict'
import test from 'node:test'

import { isReleasedNickname, teacherDisplayName } from '../src/lib/teacherDisplay.ts'

test('uses the English nickname when a teacher has one', () => {
  assert.equal(isReleasedNickname('Janice'), true)
  assert.equal(teacherDisplayName('Janice', 'Trần Mai Anh'), 'Janice')
})

test('falls back to the full name for generated or missing nicknames', () => {
  assert.equal(isReleasedNickname('GV9NKGXX'), false)
  assert.equal(teacherDisplayName('GV9NKGXX', 'Trần Mai Anh'), 'Trần Mai Anh')
  assert.equal(teacherDisplayName('', 'Trần Mai Anh'), 'Trần Mai Anh')
})
