/**
 * Duyệt buổi trước 10/08/2026 chỉ gắn `lessonId` lên ca đặt lịch mà không đóng ca
 * (`status` vẫn `confirmed`). Buổi đã duyệt đã trừ quỹ, nên nếu còn tính ca đó là
 * đang giữ thì học viên bị giữ kim cương hai lần và bị chặn đặt lịch/Class Hunting.
 *
 * Module thuần: chỉ phân loại trên bản sao, không ghi dữ liệu. Buổi chưa đọc được,
 * không tồn tại, chưa duyệt hoặc thuộc học viên khác giữ nguyên ca để không nhả nhầm.
 */
export interface LessonSettlementFact {
  status: string
  studentId: string
}

export type LessonSettlementFacts = ReadonlyMap<string, LessonSettlementFact>

interface SettlementBookingLike {
  status?: unknown
  lessonId?: unknown
  studentId?: unknown
}

export interface LessonSnapshotLike {
  id: string
  exists: boolean
  data(): Record<string, unknown> | undefined
}

const SAFE_LESSON_ID = /^[A-Za-z0-9_-]{1,160}$/
export const LESSON_SETTLEMENT_READ_CHUNK = 100

function activeLinkedLessonId(booking: SettlementBookingLike): string {
  if (booking.status !== 'pending' && booking.status !== 'confirmed') return ''
  return typeof booking.lessonId === 'string' && SAFE_LESSON_ID.test(booking.lessonId) ? booking.lessonId : ''
}

export function activeLinkedLessonIds(bookings: readonly SettlementBookingLike[]): string[] {
  return [...new Set(bookings.map(activeLinkedLessonId).filter(Boolean))].sort()
}

export function isBookingSettledByApprovedLesson(
  booking: SettlementBookingLike,
  facts: LessonSettlementFacts,
): boolean {
  const lessonId = activeLinkedLessonId(booking)
  if (!lessonId) return false
  const fact = facts.get(lessonId)
  return Boolean(
    fact
    && fact.status === 'approved'
    && typeof booking.studentId === 'string'
    && booking.studentId !== ''
    && fact.studentId === booking.studentId,
  )
}

export function settleApprovedLessonBookings<T extends SettlementBookingLike>(
  bookings: T[],
  facts: LessonSettlementFacts,
): T[] {
  if (facts.size === 0) return bookings
  let changed = false
  const next = bookings.map((booking) => {
    if (!isBookingSettledByApprovedLesson(booking, facts)) return booking
    changed = true
    return { ...booking, status: 'completed' } as T
  })
  return changed ? next : bookings
}

export async function readLessonSettlementFacts(
  lessonIds: readonly string[],
  readLessons: (ids: string[]) => Promise<LessonSnapshotLike[]>,
): Promise<Map<string, LessonSettlementFact>> {
  const facts = new Map<string, LessonSettlementFact>()
  const ids = [...new Set(lessonIds.filter((id) => SAFE_LESSON_ID.test(id)))]
  for (let index = 0; index < ids.length; index += LESSON_SETTLEMENT_READ_CHUNK) {
    const snapshots = await readLessons(ids.slice(index, index + LESSON_SETTLEMENT_READ_CHUNK))
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return
      const data = snapshot.data() || {}
      facts.set(snapshot.id, {
        status: typeof data.status === 'string' ? data.status : '',
        studentId: typeof data.studentId === 'string' ? data.studentId : '',
      })
    })
  }
  return facts
}

/**
 * Feed lớp của gia sư được gọi định kỳ. Buổi đã duyệt gần như không đổi nên chỉ
 * nhớ đệm kết quả `approved` trong instance; trạng thái khác luôn đọc lại. Các
 * transaction giữ chỗ/nhận lớp không dùng cache này.
 */
export function createApprovedLessonFactCache(ttlMs: number, maxEntries = 5000, now: () => number = Date.now) {
  const entries = new Map<string, { fact: LessonSettlementFact; expiresAtMs: number }>()
  return async function readCachedLessonSettlementFacts(
    lessonIds: readonly string[],
    readLessons: (ids: string[]) => Promise<LessonSnapshotLike[]>,
  ): Promise<Map<string, LessonSettlementFact>> {
    const nowMs = now()
    const facts = new Map<string, LessonSettlementFact>()
    const missing: string[] = []
    lessonIds.forEach((id) => {
      const entry = entries.get(id)
      if (entry && entry.expiresAtMs > nowMs) facts.set(id, entry.fact)
      else missing.push(id)
    })
    const fresh = await readLessonSettlementFacts(missing, readLessons)
    if (entries.size + fresh.size > maxEntries) entries.clear()
    fresh.forEach((fact, id) => {
      facts.set(id, fact)
      if (fact.status === 'approved') entries.set(id, { fact, expiresAtMs: nowMs + ttlMs })
    })
    return facts
  }
}
