import assert from 'node:assert/strict'
import test from 'node:test'
import {
  jitsiClassroomToolbarButtons,
  parseJitsiKnockingParticipant,
} from '../src/lib/jitsiClassroomControls.ts'

test('screen sharing is only exposed in the manager toolbar', () => {
  assert.equal(jitsiClassroomToolbarButtons(false).includes('desktop'), false)
  assert.equal(jitsiClassroomToolbarButtons(true).includes('desktop'), true)
})

test('lobby participant events are normalized and unsafe payloads are ignored', () => {
  assert.deepEqual(parseJitsiKnockingParticipant({ participant: { id: ' guest-1 ', name: ' Lan ' } }), {
    id: 'guest-1',
    name: 'Lan',
  })
  assert.deepEqual(parseJitsiKnockingParticipant({ participant: { id: 'guest-2' } }), {
    id: 'guest-2',
    name: 'Học viên',
  })
  assert.equal(parseJitsiKnockingParticipant({ participant: { id: '' } }), null)
})
