const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')
const {
  ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT,
  buildOnlineTrialClassCreationPlan,
} = require('../lib/onlineTrialClass.js')

const CREATED_AT_MS = Date.UTC(2026, 7, 30, 10, 0, 0)
const FORBIDDEN_ACCOUNTING_KEY = /(booking|lesson|payroll|salary|wage|payment|minute|diamond|debit|credit|hold|reserved|used)/i

function allKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([key, nested]) => [
    prefix ? `${prefix}.${key}` : key,
    ...allKeys(nested, prefix ? `${prefix}.${key}` : key),
  ])
}

test('Trial Class creation plan is a standalone, explicitly non-accounting aggregate', () => {
  const plan = buildOnlineTrialClassCreationPlan({
    identifiers: {
      trialClassId: `tr_${'A'.repeat(32)}`,
      sessionKey: `trial_${'a'.repeat(48)}`,
      roomName: `123EnglishTrial${'b'.repeat(48)}`,
      guestViewerId: `trial-guest:${'C'.repeat(32)}`,
    },
    adminUid: 'admin-a',
    createdByName: 'Admin A',
    title: 'Trial Class A',
    guestDisplayName: 'Học viên thử',
    mode: 'instant',
    createdAtMs: CREATED_AT_MS,
  })

  assert.equal(ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT, 'none')
  assert.equal(plan.trial.kind, 'trial_class')
  assert.equal(plan.trial.accountingImpact, 'none')
  assert.equal(plan.room.scopeType, 'trial')
  assert.equal(plan.room.accountingImpact, 'none')
  assert.equal(plan.room.scopeId, plan.trial.trialClassId)
  assert.equal(plan.room.trialClassId, plan.trial.trialClassId)
  assert.equal(plan.room.sessionKey, plan.trial.roomSessionKey)
  assert.equal(plan.room.roomName, plan.trial.roomName)
  assert.equal(plan.room.hardEndsAtMs, plan.trial.accessExpiresAtMs)

  const forbiddenKeys = allKeys(plan).filter((key) => FORBIDDEN_ACCOUNTING_KEY.test(key))
  assert.deepEqual(forbiddenKeys, [], `forbidden accounting linkage fields: ${forbiddenKeys.join(', ')}`)
})

test('Trial Class backend does not reference booking, lesson, payroll, minute, or diamond collections', () => {
  const sourcePaths = [
    join(__dirname, '..', 'src', 'onlineTrialClass.ts'),
    join(__dirname, '..', 'src', 'onlineTrialClassFunctions.ts'),
  ]
  const source = sourcePaths.map((path) => readFileSync(path, 'utf8')).join('\n')
  const forbiddenCollectionOrMutation = [
    /bookingRequests/,
    /\blessons\b/,
    /payrollAdjustments/,
    /teacherPayroll/,
    /requestedMinutes/,
    /approvedMinutes/,
    /reservedDiamonds/,
    /heldDiamonds/,
    /usedDiamonds/,
  ]

  for (const pattern of forbiddenCollectionOrMutation) {
    assert.doesNotMatch(source, pattern)
  }
})

test('signed Trial attendance exits before the legacy booking lookup', () => {
  const source = readFileSync(
    join(__dirname, '..', 'src', 'onlineClassroomAttendanceFunctions.ts'),
    'utf8',
  )
  const trialDispatch = source.indexOf(
    'const trialResult = await acknowledgeTrialClassAttendanceEvent(roomSnapshot, event)',
  )
  const trialExit = source.indexOf('if (trialResult.handled)', trialDispatch)
  const bookingLookup = source.indexOf(
    "const bookingRef = db.collection('bookingRequests')",
    trialExit,
  )

  assert.notEqual(trialDispatch, -1)
  assert.notEqual(trialExit, -1)
  assert.notEqual(bookingLookup, -1)
  assert.ok(trialDispatch < trialExit && trialExit < bookingLookup)
  assert.match(source.slice(trialExit, bookingLookup), /response\.status\(200\)/)
  assert.match(source.slice(trialExit, bookingLookup), /return/)
})
