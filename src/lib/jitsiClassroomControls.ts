export type JitsiKnockingParticipant = {
  id: string
  name: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseJitsiKnockingParticipant(payload: unknown): JitsiKnockingParticipant | null {
  if (!isRecord(payload) || !isRecord(payload.participant)) return null
  const id = typeof payload.participant.id === 'string' ? payload.participant.id.trim() : ''
  if (!id) return null
  const rawName = typeof payload.participant.name === 'string' ? payload.participant.name.trim() : ''
  return { id, name: rawName || 'Học viên' }
}

export function jitsiClassroomToolbarButtons(canShareScreen: boolean): string[] {
  return [
    'microphone',
    'camera',
    ...(canShareScreen ? ['desktop'] : []),
    'chat',
    'raisehand',
    'participants-pane',
    'tileview',
    'closedcaptions',
    'select-background',
    'videoquality',
    'settings',
    'shortcuts',
    'hangup',
  ]
}

/**
 * Enter device preview muted by default so a denied or slow media permission
 * cannot block the prejoin screen. Users can still enable either device from
 * Jitsi before joining, while observer/admin mode remains force-muted.
 */
export function jitsiClassroomInitialMediaMuted(
  observerMode: boolean,
  startMuted = true,
): boolean {
  return observerMode || startMuted
}
