export type JitsiEventHandler = (payload: unknown) => void

export type JitsiCaptureScreenshotResult = {
  dataURL?: string
  error?: string
}

export type JitsiContentSharingParticipantsResult = {
  sharingParticipantIds?: unknown
}

export type JitsiVideoType = 'camera' | 'desktop'

export type JitsiExternalApi = {
  addEventListener: (eventName: string, handler: JitsiEventHandler) => void
  removeEventListener?: (eventName: string, handler: JitsiEventHandler) => void
  executeCommand: (commandName: string, ...args: unknown[]) => void
  captureLargeVideoScreenshot?: () => Promise<JitsiCaptureScreenshotResult>
  getContentSharingParticipants?: () => Promise<JitsiContentSharingParticipantsResult>
  getRoomsInfo: () => Promise<unknown>
  getIFrame?: () => HTMLIFrameElement
  pinParticipant?: (participantId: string, videoType?: JitsiVideoType) => void
  setLargeVideoParticipant?: (participantId?: string, videoType?: JitsiVideoType) => void
  dispose: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function broadcastJitsiTextMessage(
  api: JitsiExternalApi | null,
  text: string,
  localParticipantId = '',
): Promise<number> {
  if (!api || !text) return 0

  const roomsInfo = await api.getRoomsInfo()
  if (!isRecord(roomsInfo) || !Array.isArray(roomsInfo.rooms)) return 0

  const recipientIds = new Set<string>()
  for (const room of roomsInfo.rooms) {
    if (!isRecord(room) || !Array.isArray(room.participants)) continue
    for (const participant of room.participants) {
      if (!isRecord(participant)) continue
      const id = readString(participant.id)
      if (id && id !== localParticipantId) recipientIds.add(id)
    }
  }

  let sentCount = 0
  for (const id of recipientIds) {
    try {
      api.executeCommand('sendEndpointTextMessage', id, text)
      sentCount += 1
    } catch {
      // Một người tham gia có thể vừa rời phòng; tiếp tục gửi cho các thiết bị còn lại.
    }
  }
  return sentCount
}
