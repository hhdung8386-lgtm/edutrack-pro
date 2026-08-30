export type OnlineTrialClassStatus = 'ready' | 'live' | 'ended' | 'error'
export type OnlineTrialClassTab = Exclude<OnlineTrialClassStatus, 'error'>

export type OnlineTrialClassSummary = {
  roomId: string
  title: string
  status: OnlineTrialClassStatus
  state: string | null
  createdAt: string | null
  startedAt: string | null
  endedAt: string | null
  accessExpiresAt: string | null
  participantCount: number
  guestUrl: string | null
  adminUrl: string | null
  createdByName: string | null
  accountingImpact: 'none'
}

export type OnlineTrialClassCreateResult = {
  room: OnlineTrialClassSummary
  guestUrl: string
  adminUrl: string
}

export type OnlineTrialClassListResult = {
  rooms: OnlineTrialClassSummary[]
  serverNow: string | null
  hasMore: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function nullableTimestamp(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
  }
  if (isRecord(value)) {
    const seconds = Number(value.seconds ?? value._seconds)
    if (Number.isFinite(seconds)) return new Date(seconds * 1_000).toISOString()
  }
  return null
}

function safeRoute(value: string): string {
  if (!value) return ''
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : ''
  } catch {
    return ''
  }
}

export function normalizeOnlineTrialClassStatus(value: unknown): OnlineTrialClassStatus {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (['live', 'active', 'in_progress', 'started'].includes(status)) return 'live'
  if (['ended', 'closed', 'completed', 'finished', 'expired'].includes(status)) return 'ended'
  if (['error', 'failed', 'setup_failed'].includes(status)) return 'error'
  return 'ready'
}

export function normalizeOnlineTrialClass(value: unknown): OnlineTrialClassSummary | null {
  if (!isRecord(value)) return null
  if (value.accountingImpact !== undefined && value.accountingImpact !== 'none') return null
  const roomId = firstString(value, ['roomId', 'trialClassId', 'classroomId', 'id'])
  if (!roomId) return null

  const participantValue = Number(value.participantCount ?? value.participantsCount ?? 0)
  const participantCount = Number.isFinite(participantValue)
    ? Math.max(0, Math.floor(participantValue))
    : 0

  return {
    roomId,
    title: firstString(value, ['title', 'name', 'roomName']) || `Lớp học thử ${roomId.slice(0, 8)}`,
    status: normalizeOnlineTrialClassStatus(value.status ?? value.state),
    state: firstString(value, ['state']) || null,
    createdAt: nullableTimestamp(value.createdAt),
    startedAt: nullableTimestamp(value.startedAt),
    endedAt: nullableTimestamp(value.endedAt),
    accessExpiresAt: nullableTimestamp(value.accessExpiresAt),
    participantCount,
    guestUrl: safeRoute(firstString(value, ['guestUrl', 'joinUrl', 'studentUrl', 'participantUrl'])) || null,
    adminUrl: safeRoute(firstString(value, ['adminUrl', 'managerUrl', 'hostUrl'])) || null,
    createdByName: firstString(value, ['createdByName', 'creatorName']) || null,
    accountingImpact: 'none',
  }
}

export function normalizeOnlineTrialClassCreateResult(value: unknown): OnlineTrialClassCreateResult {
  if (!isRecord(value)) throw new Error('Máy chủ chưa trả dữ liệu phòng học thử hợp lệ.')
  const roomSource = value.room ?? value.trialClass ?? value.classroom ?? value
  const room = normalizeOnlineTrialClass(roomSource)
  if (!room) throw new Error('Máy chủ chưa trả mã phòng học thử.')

  const roomRecord = isRecord(roomSource) ? roomSource : {}
  const guestUrl = safeRoute(
    firstString(value, ['guestUrl', 'joinUrl', 'studentUrl', 'participantUrl'])
      || firstString(roomRecord, ['guestUrl', 'joinUrl', 'studentUrl', 'participantUrl']),
  )
  const adminUrl = safeRoute(
    firstString(value, ['adminUrl', 'managerUrl', 'hostUrl'])
      || firstString(roomRecord, ['adminUrl', 'managerUrl', 'hostUrl']),
  )
  if (!guestUrl || !adminUrl) {
    throw new Error('Máy chủ chưa trả đủ link tham gia và link quản trị.')
  }

  return {
    room: { ...room, guestUrl, adminUrl },
    guestUrl,
    adminUrl,
  }
}

export function normalizeOnlineTrialClassListResult(value: unknown): OnlineTrialClassListResult {
  const record = isRecord(value) ? value : {}
  const source = Array.isArray(record.rooms)
    ? record.rooms
    : Array.isArray(record.items)
      ? record.items
      : Array.isArray(value)
        ? value
        : []
  const rooms = source
    .map(normalizeOnlineTrialClass)
    .filter((room): room is OnlineTrialClassSummary => room !== null)

  return {
    rooms,
    serverNow: nullableTimestamp(record.serverNow),
    hasMore: record.hasMore === true,
  }
}

export function filterOnlineTrialClasses(
  rooms: OnlineTrialClassSummary[],
  status: OnlineTrialClassTab,
  query: string,
): OnlineTrialClassSummary[] {
  const foldedQuery = query.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('vi')
  return rooms
    .filter((room) => room.status === status || (status === 'ended' && room.status === 'error'))
    .filter((room) => {
      if (!foldedQuery) return true
      return `${room.title} ${room.roomId}`
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase('vi')
        .includes(foldedQuery)
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.startedAt || left.createdAt || '') || 0
      const rightTime = Date.parse(right.startedAt || right.createdAt || '') || 0
      return rightTime - leftTime
    })
}
