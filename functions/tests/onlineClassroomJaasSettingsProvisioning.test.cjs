const assert = require('node:assert/strict')
const test = require('node:test')
const {
  decideOnlineClassroomTrialSettingsProvisioning,
  isOnlineClassroomTrialRoomAlias,
} = require('../lib/onlineClassroomJaasSettingsProvisioning.js')

const TRIAL_ID = `tr_${'A'.repeat(32)}`
const SESSION_KEY = `trial_${'b'.repeat(48)}`
const TRIAL_ROOM_ALIAS = `123EnglishTrial${'a'.repeat(48)}`
const LEGACY_ROOM_ALIAS = `123EnglishPilot${'b'.repeat(48)}`
const NOW_MS = Date.UTC(2026, 7, 30, 10, 0, 0)
const HARD_END_MS = NOW_MS + 45 * 60 * 1000

function activeDocuments(overrides = {}) {
  const room = {
    scopeType: 'trial',
    scopeId: TRIAL_ID,
    trialClassId: TRIAL_ID,
    sessionKey: SESSION_KEY,
    roomName: TRIAL_ROOM_ALIAS,
    hostViewerId: 'trial-host:admin-a',
    guestViewerId: `trial-guest:${'C'.repeat(32)}`,
    state: 'scheduled',
    hardEndsAt: { toMillis: () => HARD_END_MS },
    accountingImpact: 'none',
    ...overrides.room,
  }
  const trial = {
    kind: 'trial_class',
    trialClassId: TRIAL_ID,
    state: 'ready',
    roomSessionKey: SESSION_KEY,
    roomName: TRIAL_ROOM_ALIAS,
    accessExpiresAt: HARD_END_MS,
    accountingImpact: 'none',
    ...overrides.trial,
  }
  return {
    roomDocuments: [{ id: SESSION_KEY, data: room }],
    trialClassDocument: { id: TRIAL_ID, data: trial },
  }
}

test('Trial Class alias has a namespace separate from legacy booking rooms', () => {
  assert.equal(isOnlineClassroomTrialRoomAlias(TRIAL_ROOM_ALIAS), true)
  assert.equal(isOnlineClassroomTrialRoomAlias(LEGACY_ROOM_ALIAS), false)
  assert.equal(isOnlineClassroomTrialRoomAlias('123EnglishTrial-short'), false)
})

test('legacy booking provisioning remains byte-for-byte independent of Trial metadata', () => {
  assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
    roomAlias: LEGACY_ROOM_ALIAS,
    nowMs: NOW_MS,
  }), { ok: true, scope: 'legacy' })

  assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
    roomAlias: LEGACY_ROOM_ALIAS,
    roomDocuments: [],
    trialClassDocument: null,
    nowMs: NOW_MS,
  }), { ok: true, scope: 'legacy' })
})

test('active Trial Class provisioning requires a complete non-accounting binding', () => {
  for (const state of ['ready', 'live']) {
    assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
      roomAlias: TRIAL_ROOM_ALIAS,
      nowMs: NOW_MS,
      ...activeDocuments({ trial: { state } }),
    }), { ok: true, scope: 'trial' })
  }

  assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
    roomAlias: TRIAL_ROOM_ALIAS,
    nowMs: NOW_MS,
    ...activeDocuments({ room: { accountingImpact: 'payroll' } }),
  }), { ok: false, error: 'trial-room-invalid' })
})

test('ended and expired Trial Classes fail closed while ready/live rooms remain eligible', () => {
  for (const state of ['ended', 'expired']) {
    assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
      roomAlias: TRIAL_ROOM_ALIAS,
      nowMs: NOW_MS,
      ...activeDocuments({ trial: { state } }),
    }), { ok: false, error: 'trial-room-closed' })
  }

  assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
    roomAlias: TRIAL_ROOM_ALIAS,
    nowMs: HARD_END_MS,
    ...activeDocuments({ trial: { state: 'live' } }),
  }), { ok: false, error: 'trial-room-closed' })
})

test('missing, duplicate, stale, or mismatched Trial bindings fail closed', () => {
  assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
    roomAlias: TRIAL_ROOM_ALIAS,
    nowMs: NOW_MS,
    roomDocuments: [],
  }), { ok: false, error: 'trial-room-not-found' })

  const active = activeDocuments()
  assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
    roomAlias: TRIAL_ROOM_ALIAS,
    nowMs: NOW_MS,
    roomDocuments: [active.roomDocuments[0], active.roomDocuments[0]],
  }), { ok: false, error: 'trial-room-ambiguous' })

  assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
    roomAlias: TRIAL_ROOM_ALIAS,
    nowMs: NOW_MS,
    ...activeDocuments({ trial: { roomSessionKey: 'different-session' } }),
  }), { ok: false, error: 'trial-room-invalid' })

  assert.deepEqual(decideOnlineClassroomTrialSettingsProvisioning({
    roomAlias: TRIAL_ROOM_ALIAS,
    nowMs: NOW_MS,
    ...activeDocuments({ trial: { accessExpiresAt: HARD_END_MS + 1 } }),
  }), { ok: false, error: 'trial-room-invalid' })
})
