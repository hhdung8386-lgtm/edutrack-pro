import {
  ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT,
  isOnlineTrialClassRoomName,
  validateOnlineTrialClassBinding,
} from './onlineTrialClass'

export const ONLINE_CLASSROOM_TRIAL_ROOM_ALIAS_PATTERN = /^123EnglishTrial[a-f0-9]{48}$/

export type OnlineClassroomProvisioningDocument = {
  id: string
  data: unknown
}

export type OnlineClassroomTrialProvisioningDecision =
  | { ok: true; scope: 'legacy' | 'trial' }
  | {
    ok: false
    error:
      | 'invalid-clock'
      | 'trial-room-not-found'
      | 'trial-room-ambiguous'
      | 'trial-room-invalid'
      | 'trial-room-closed'
  }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Date) {
    const millis = value.getTime()
    return Number.isSafeInteger(millis) ? millis : null
  }
  if (Number.isSafeInteger(value) && Number(value) > 0) return Number(value)
  if (!isRecord(value) || typeof value.toMillis !== 'function') return null
  try {
    const millis = value.toMillis()
    return Number.isSafeInteger(millis) && millis > 0 ? millis : null
  } catch {
    return null
  }
}

export function isOnlineClassroomTrialRoomAlias(value: unknown): value is string {
  return isOnlineTrialClassRoomName(value)
    && ONLINE_CLASSROOM_TRIAL_ROOM_ALIAS_PATTERN.test(value)
}

/**
 * Keep the legacy booking provisioning contract untouched while applying a
 * strict, database-backed lifecycle fence to the separately prefixed Trial
 * Class rooms. The prefix is intentionally part of the security boundary: if
 * a Trial room binding disappears, it remains identifiable and is denied
 * instead of falling through to the legacy behavior.
 */
export function decideOnlineClassroomTrialSettingsProvisioning(input: {
  roomAlias: unknown
  roomDocuments?: readonly OnlineClassroomProvisioningDocument[]
  trialClassDocument?: OnlineClassroomProvisioningDocument | null
  nowMs: number
}): OnlineClassroomTrialProvisioningDecision {
  if (!isOnlineClassroomTrialRoomAlias(input.roomAlias)) {
    return { ok: true, scope: 'legacy' }
  }
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs <= 0) {
    return { ok: false, error: 'invalid-clock' }
  }

  const roomDocuments = input.roomDocuments ?? []
  if (roomDocuments.length === 0) {
    return { ok: false, error: 'trial-room-not-found' }
  }
  if (roomDocuments.length !== 1) {
    return { ok: false, error: 'trial-room-ambiguous' }
  }

  const roomDocument = roomDocuments[0]
  const room = roomDocument && isRecord(roomDocument.data) ? roomDocument.data : null
  const trialDocument = input.trialClassDocument
  const trial = trialDocument && isRecord(trialDocument.data) ? trialDocument.data : null
  if (!room
    || !trial
    || typeof roomDocument.id !== 'string'
    || !roomDocument.id
    || typeof trialDocument?.id !== 'string'
    || !trialDocument.id) {
    return { ok: false, error: 'trial-room-invalid' }
  }

  const trialClassId = typeof room.trialClassId === 'string' ? room.trialClassId : ''
  const roomHardEndMs = timestampMillis(room.hardEndsAt)
  const accessExpiresAtMs = timestampMillis(trial.accessExpiresAt)
  if (trial.state === 'ended'
    || trial.state === 'expired'
    || room.state === 'ending'
    || room.state === 'ended'
    || (accessExpiresAtMs !== null && accessExpiresAtMs <= input.nowMs)) {
    return { ok: false, error: 'trial-room-closed' }
  }
  const bindingIsValid = validateOnlineTrialClassBinding({
    trialClassId: trialDocument.id,
    trialKind: trial.kind,
    trialRoomSessionKey: trial.roomSessionKey,
    trialRoomName: trial.roomName,
    trialAccessExpiresAtMs: accessExpiresAtMs,
    roomScopeType: room.scopeType,
    roomScopeId: room.scopeId,
    roomTrialClassId: room.trialClassId,
    roomSessionKey: room.sessionKey,
    roomName: room.roomName,
    roomHostViewerId: room.hostViewerId,
    roomGuestViewerId: room.guestViewerId,
    roomHardEndsAtMs: roomHardEndMs,
  })
    && trial.trialClassId === trialDocument.id
    && trialClassId === trialDocument.id
    && roomDocument.id === room.sessionKey
    && room.roomName === input.roomAlias
    && room.state === 'scheduled'
    && room.accountingImpact === ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT
    && trial.roomName === input.roomAlias
    && trial.accountingImpact === ONLINE_TRIAL_CLASS_ACCOUNTING_IMPACT
    && roomHardEndMs !== null
    && accessExpiresAtMs !== null
    && roomHardEndMs === accessExpiresAtMs

  if (!bindingIsValid) {
    return { ok: false, error: 'trial-room-invalid' }
  }
  if ((trial.state !== 'ready' && trial.state !== 'live')
    || roomHardEndMs <= input.nowMs
    || accessExpiresAtMs <= input.nowMs) {
    return { ok: false, error: 'trial-room-closed' }
  }

  return { ok: true, scope: 'trial' }
}
