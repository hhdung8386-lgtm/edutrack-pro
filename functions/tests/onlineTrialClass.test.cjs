const assert = require('node:assert/strict')
const test = require('node:test')
const {
  ONLINE_TRIAL_CLASS_TTL_MS,
  buildOnlineTrialClassCreationPlan,
  createOnlineTrialClassIdentifiers,
  decideOnlineTrialClassAccess,
  decideOnlineTrialClassViewerRole,
  isOnlineTrialClassRoomName,
  isSafeOnlineTrialClassClientRequestId,
  isSafeOnlineTrialClassId,
  onlineTrialClassCreateRequestDocumentId,
  onlineTrialClassCreateRequestFingerprint,
  onlineTrialClassJoinUrl,
  validateOnlineTrialClassBinding,
  validateOnlineTrialClassWebhookBinding,
} = require('../lib/onlineTrialClass.js')

const NOW_MS = Date.UTC(2026, 7, 30, 9, 0, 0)

test('Trial Class identifiers provide stable capability links and isolated room aliases', () => {
  const first = createOnlineTrialClassIdentifiers()
  const second = createOnlineTrialClassIdentifiers()
  assert.equal(isSafeOnlineTrialClassId(first.trialClassId), true)
  assert.equal(isOnlineTrialClassRoomName(first.roomName), true)
  assert.notEqual(first.trialClassId, second.trialClassId)
  assert.notEqual(first.sessionKey, second.sessionKey)
  assert.notEqual(first.roomName, second.roomName)
  assert.equal(
    onlineTrialClassJoinUrl(first.trialClassId),
    `https://www.123english.edu.vn/lop-hoc-thu/${first.trialClassId}`,
  )
})

test('creation idempotency is scoped by Admin and canonical request content', () => {
  const requestId = '4fb27d6e-3213-4e43-9e9c-2914a920d213'
  assert.equal(isSafeOnlineTrialClassClientRequestId(requestId), true)
  assert.notEqual(
    onlineTrialClassCreateRequestDocumentId('admin-a', requestId),
    onlineTrialClassCreateRequestDocumentId('admin-b', requestId),
  )
  const first = onlineTrialClassCreateRequestFingerprint({
    mode: 'instant',
    title: '  Trial   A ',
    guestDisplayName: ' Học viên ',
  })
  const equivalent = onlineTrialClassCreateRequestFingerprint({
    mode: 'instant',
    title: 'Trial A',
    guestDisplayName: 'Học viên',
  })
  const changed = onlineTrialClassCreateRequestFingerprint({
    mode: 'later',
    title: 'Trial A',
    guestDisplayName: 'Học viên',
  })
  assert.equal(first, equivalent)
  assert.notEqual(first, changed)
})

test('creation plan binds the room to an exact seven-day security expiry', () => {
  const identifiers = createOnlineTrialClassIdentifiers()
  const plan = buildOnlineTrialClassCreationPlan({
    identifiers,
    adminUid: 'admin-a',
    title: 'Lớp học thử',
    createdAtMs: NOW_MS,
  })
  assert.equal(plan.trial.accessExpiresAtMs - plan.trial.createdAtMs, ONLINE_TRIAL_CLASS_TTL_MS)
  assert.equal(plan.room.hardEndsAtMs, plan.trial.accessExpiresAtMs)
  assert.equal(validateOnlineTrialClassBinding({
    trialClassId: plan.trial.trialClassId,
    trialKind: plan.trial.kind,
    trialRoomSessionKey: plan.trial.roomSessionKey,
    trialRoomName: plan.trial.roomName,
    trialAccessExpiresAtMs: plan.trial.accessExpiresAtMs,
    roomScopeType: plan.room.scopeType,
    roomScopeId: plan.room.scopeId,
    roomTrialClassId: plan.room.trialClassId,
    roomSessionKey: plan.room.sessionKey,
    roomName: plan.room.roomName,
    roomHostViewerId: plan.room.hostViewerId,
    roomGuestViewerId: plan.room.guestViewerId,
    roomHardEndsAtMs: plan.room.hardEndsAtMs,
  }), true)
})

test('access expires exactly at the TTL boundary and ended rooms stay closed', () => {
  const expiresAtMs = NOW_MS + ONLINE_TRIAL_CLASS_TTL_MS
  assert.equal(decideOnlineTrialClassAccess({
    state: 'ready', accessExpiresAtMs: expiresAtMs, nowMs: expiresAtMs - 1,
  }), 'allowed')
  assert.equal(decideOnlineTrialClassAccess({
    state: 'live', accessExpiresAtMs: expiresAtMs, nowMs: expiresAtMs,
  }), 'expired')
  assert.equal(decideOnlineTrialClassAccess({
    state: 'ended', accessExpiresAtMs: expiresAtMs, nowMs: NOW_MS,
  }), 'ended')
})

test('only system Admin or canonical active teacher resolves as moderator', () => {
  assert.equal(decideOnlineTrialClassViewerRole({}), 'student')
  assert.equal(decideOnlineTrialClassViewerRole({
    authenticatedUid: 'admin-uid',
    userRole: 'admin',
  }), 'admin')
  assert.equal(decideOnlineTrialClassViewerRole({
    authenticatedUid: 'teacher-uid',
    userRole: 'teacher',
    userTeacherId: 'teacher-a',
    teacherStatus: 'active',
    teacherLoginAccountUid: 'teacher-uid',
  }), 'teacher')
  assert.equal(decideOnlineTrialClassViewerRole({
    authenticatedUid: 'attacker-uid',
    userRole: 'teacher',
    userTeacherId: 'teacher-a',
    teacherStatus: 'active',
    teacherLoginAccountUid: 'canonical-teacher-uid',
  }), 'student')
  assert.equal(decideOnlineTrialClassViewerRole({
    authenticatedUid: 'teacher-uid',
    userRole: 'teacher',
    userTeacherId: 'teacher-a',
    teacherStatus: 'inactive',
    teacherLoginAccountUid: 'teacher-uid',
  }), 'student')
})

test('signed Trial Class attendance can validate without any booking identity', () => {
  const identifiers = createOnlineTrialClassIdentifiers()
  const plan = buildOnlineTrialClassCreationPlan({
    identifiers,
    adminUid: 'admin-a',
    createdAtMs: NOW_MS,
  })
  assert.equal(validateOnlineTrialClassWebhookBinding({
    roomDocumentId: plan.room.sessionKey,
    expectedRoomName: plan.room.roomName,
    roomScopeType: plan.room.scopeType,
    roomScopeId: plan.room.scopeId,
    roomTrialClassId: plan.room.trialClassId,
    roomSessionKey: plan.room.sessionKey,
    roomName: plan.room.roomName,
    roomAccountingImpact: plan.room.accountingImpact,
    trialDocumentId: plan.trial.trialClassId,
    trialKind: plan.trial.kind,
    trialClassId: plan.trial.trialClassId,
    trialRoomSessionKey: plan.trial.roomSessionKey,
    trialRoomName: plan.trial.roomName,
    trialAccountingImpact: plan.trial.accountingImpact,
  }), true)
  assert.equal(validateOnlineTrialClassWebhookBinding({
    roomDocumentId: plan.room.sessionKey,
    expectedRoomName: plan.room.roomName,
    roomScopeType: 'trial',
    roomScopeId: 'different-trial',
    roomTrialClassId: plan.room.trialClassId,
    roomSessionKey: plan.room.sessionKey,
    roomName: plan.room.roomName,
    roomAccountingImpact: 'none',
    trialDocumentId: plan.trial.trialClassId,
    trialKind: 'trial_class',
    trialClassId: plan.trial.trialClassId,
    trialRoomSessionKey: plan.trial.roomSessionKey,
    trialRoomName: plan.trial.roomName,
    trialAccountingImpact: 'none',
  }), false)
})
