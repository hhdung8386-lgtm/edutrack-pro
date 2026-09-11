import { useEffect, useMemo, useState } from 'react'
import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { BookingRequest } from '@/types'
import {
  activeLinkedLessonIds,
  settleApprovedLessonBookings,
  type LessonSettlementFact,
  type LessonSettlementFacts,
} from '@/lib/bookingLogic'

const IN_QUERY_LIMIT = 30
const EMPTY_FACTS: LessonSettlementFacts = new Map()

/** Đọc trạng thái + học viên của các buổi dạy được ca đặt lịch trỏ tới (tối đa 30 id/truy vấn). */
export async function loadLessonSettlementFactsByIds(lessonIds: string[]): Promise<LessonSettlementFacts> {
  const ids = Array.from(new Set(lessonIds.filter(Boolean)))
  if (ids.length === 0) return EMPTY_FACTS
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += IN_QUERY_LIMIT) {
    chunks.push(ids.slice(index, index + IN_QUERY_LIMIT))
  }
  const snapshots = await Promise.all(chunks.map((chunk) => (
    getDocs(query(collection(db, 'lessons'), where(documentId(), 'in', chunk)))
  )))
  const facts = new Map<string, LessonSettlementFact>()
  snapshots.forEach((snapshot) => snapshot.docs.forEach((lessonDoc) => {
    const data = lessonDoc.data()
    facts.set(lessonDoc.id, {
      status: typeof data.status === 'string' ? data.status : '',
      studentId: typeof data.studentId === 'string' ? data.studentId : '',
    })
  }))
  return facts
}

/**
 * Coi ca còn `confirmed` nhưng đã gắn buổi ĐÃ DUYỆT là ca đã đóng trước khi tính
 * quỹ. Không bao giờ ném lỗi: không đọc được buổi dạy thì giữ nguyên ca (an toàn,
 * không nhả nhầm kim cương).
 */
export async function settleBookingsByApprovedLessons<T extends BookingRequest>(
  bookings: T[],
): Promise<{ bookings: T[]; facts: LessonSettlementFacts }> {
  try {
    const facts = await loadLessonSettlementFactsByIds(activeLinkedLessonIds(bookings))
    return { bookings: settleApprovedLessonBookings(bookings, facts), facts }
  } catch (error) {
    console.error('Load lesson settlement facts failed:', error)
    return { bookings, facts: EMPTY_FACTS }
  }
}

/** Phiên bản hook cho màn hình đã có sẵn danh sách ca từ listener. */
export function useLessonSettlementFacts(bookings: BookingRequest[]): LessonSettlementFacts {
  const idsKey = useMemo(() => activeLinkedLessonIds(bookings).join('|'), [bookings])
  const [loaded, setLoaded] = useState<{ key: string; facts: LessonSettlementFacts }>({ key: '', facts: EMPTY_FACTS })

  useEffect(() => {
    if (!idsKey) return
    let active = true
    loadLessonSettlementFactsByIds(idsKey.split('|'))
      .then((facts) => { if (active) setLoaded({ key: idsKey, facts }) })
      .catch((error) => {
        if (!active) return
        console.error('Load lesson settlement facts failed:', error)
        setLoaded({ key: idsKey, facts: EMPTY_FACTS })
      })
    return () => { active = false }
  }, [idsKey])

  return loaded.key === idsKey ? loaded.facts : EMPTY_FACTS
}
