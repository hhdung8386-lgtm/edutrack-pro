import {
  collection,
  doc,
  documentId,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { BookingRequest, Student } from '@/types'
import { isBookingHoldingStudentFund, lessonReferencedBookingIds } from '@/lib/bookingLogic'
import { getBookingPoints } from '@/lib/points'
import {
  classifyOrphanSubjectBooking,
  isApprovedUnsettledBooking,
  ledgerHeldPointsAfterSettlement,
  storedHeldPoints,
  type RepairLessonFact,
} from '@/lib/bookingLedgerRepair'

const IN_QUERY_LIMIT = 30
const PARALLEL_QUERIES = 8

export interface RepairDataset {
  /** Ca đang giữ quỹ: pending, confirmed và ca tự hủy còn giữ chờ đặt lại. */
  bookings: BookingRequest[]
  bookingsByStudent: Map<string, BookingRequest[]>
  lessons: Map<string, RepairLessonFact>
  students: Map<string, Student>
}

export function lessonFactFrom(id: string, data: Record<string, unknown>): RepairLessonFact {
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  return {
    id,
    status: text(data.status),
    studentId: text(data.studentId),
    teacherId: text(data.teacherId),
    subjectId: text(data.subjectId),
    referencedBookingIds: lessonReferencedBookingIds({
      bookingRequestId: text(data.bookingRequestId) || undefined,
      bookingRequestIds: Array.isArray(data.bookingRequestIds) ? data.bookingRequestIds.filter((item): item is string => typeof item === 'string') : undefined,
      scheduleCheck: data.scheduleCheck as never,
    } as never),
    hasSubjectReconciliation: Boolean(data.bookingSubjectReconciliation),
  }
}

async function inChunks<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += IN_QUERY_LIMIT) chunks.push(ids.slice(index, index + IN_QUERY_LIMIT))
  const results: T[] = []
  for (let index = 0; index < chunks.length; index += PARALLEL_QUERIES) {
    const batch = await Promise.all(chunks.slice(index, index + PARALLEL_QUERIES).map(load))
    batch.forEach((items) => results.push(...items))
  }
  return results
}

export async function loadRepairLessonFacts(lessonIds: string[]): Promise<Map<string, RepairLessonFact>> {
  const ids = Array.from(new Set(lessonIds.filter(Boolean)))
  const facts = await inChunks(ids, async (chunk) => {
    const snapshot = await getDocs(query(collection(db, 'lessons'), where(documentId(), 'in', chunk)))
    return snapshot.docs.map((lessonDoc) => lessonFactFrom(lessonDoc.id, lessonDoc.data()))
  })
  return new Map(facts.map((fact) => [fact.id, fact]))
}

async function loadStudentsByIds(studentIds: string[]): Promise<Map<string, Student>> {
  const ids = Array.from(new Set(studentIds.filter(Boolean)))
  const students = await inChunks(ids, async (chunk) => {
    const snapshot = await getDocs(query(collection(db, 'students'), where(documentId(), 'in', chunk)))
    return snapshot.docs.map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data() } as Student))
  })
  return new Map(students.map((student) => [student.id, student]))
}

/** Chỉ đọc (một lần khi mở trang). Không có listener. */
export async function loadRepairDataset(options: {
  studentId?: string
  onProgress?: (label: string) => void
} = {}): Promise<RepairDataset> {
  options.onProgress?.('Đang tải các ca đang giữ kim cương...')
  const toBooking = (snapshot: Awaited<ReturnType<typeof getDocs>>) => snapshot.docs.map((bookingDoc) => ({
    id: bookingDoc.id,
    ...(bookingDoc.data() as object),
  } as BookingRequest))
  const snapshots = options.studentId
    ? [await getDocs(query(collection(db, 'bookingRequests'), where('studentId', '==', options.studentId)))]
    : await Promise.all([
      getDocs(query(collection(db, 'bookingRequests'), where('status', '==', 'pending'))),
      getDocs(query(collection(db, 'bookingRequests'), where('status', '==', 'confirmed'))),
      getDocs(query(collection(db, 'bookingRequests'), where('pendingRebook', '==', true))),
    ])
  const byId = new Map<string, BookingRequest>()
  snapshots.flatMap(toBooking).forEach((booking) => byId.set(booking.id, booking))
  const bookings = Array.from(byId.values()).filter((booking) => Boolean(booking.studentId) && (
    isBookingHoldingStudentFund(booking) || (booking.status === 'released' && booking.pendingRebook === true)
  ))

  options.onProgress?.('Đang đối chiếu buổi điểm danh đã gắn...')
  const lessons = await loadRepairLessonFacts(bookings.flatMap((booking) => (
    isBookingHoldingStudentFund(booking) && booking.lessonId ? [booking.lessonId] : []
  )))

  options.onProgress?.('Đang tải hồ sơ học viên...')
  const students = await loadStudentsByIds(bookings.map((booking) => booking.studentId))

  const bookingsByStudent = new Map<string, BookingRequest[]>()
  bookings.forEach((booking) => {
    bookingsByStudent.set(booking.studentId, [...(bookingsByStudent.get(booking.studentId) || []), booking])
  })
  return { bookings, bookingsByStudent, lessons, students }
}

export interface RepairActionResult {
  changed: number
  skipped: number
  heldBefore: number
  heldAfter: number
}

export const REPAIR_DATA_CHANGED = 'REPAIR_DATA_CHANGED_RELOAD'

/**
 * Đóng các ca đã có buổi được duyệt của MỘT học viên trong một transaction, rồi
 * đặt số giữ lưu = tổng kim cương thật sự còn giữ. Đọc lại mọi ca và buổi ngay
 * lúc ghi; nếu số giữ trên hồ sơ đã đổi so với lúc tải (có ca mới/hủy) thì dừng
 * để tải lại, không ghi đè.
 */
export async function closeApprovedBookingsForStudent(input: {
  studentId: string
  bookingIds: string[]
  studentHoldingBookingIds: string[]
  expectedStoredHeld: number
  actorUid: string
}): Promise<RepairActionResult> {
  return runTransaction(db, async (tx) => {
    const studentRef = doc(db, 'students', input.studentId)
    const studentSnap = await tx.get(studentRef)
    if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')
    const student = { id: studentSnap.id, ...studentSnap.data() } as Student
    const heldBefore = storedHeldPoints(student)
    if (heldBefore !== input.expectedStoredHeld) throw new Error(REPAIR_DATA_CHANGED)

    const ids = Array.from(new Set([...input.studentHoldingBookingIds, ...input.bookingIds]))
    const bookingSnaps = await Promise.all(ids.map((id) => tx.get(doc(db, 'bookingRequests', id))))
    const fresh = bookingSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...snap.data() } as BookingRequest))
      .filter((booking) => booking.studentId === input.studentId)
    const lessonIds = Array.from(new Set(fresh.flatMap((booking) => (
      isBookingHoldingStudentFund(booking) && booking.lessonId ? [booking.lessonId] : []
    ))))
    const lessonSnaps = await Promise.all(lessonIds.map((id) => tx.get(doc(db, 'lessons', id))))
    const lessons = new Map(lessonSnaps
      .filter((snap) => snap.exists())
      .map((snap) => [snap.id, lessonFactFrom(snap.id, snap.data())] as const))

    const requested = new Set(input.bookingIds)
    const targets = fresh.filter((booking) => (
      requested.has(booking.id)
      && isApprovedUnsettledBooking(booking, booking.lessonId ? lessons.get(booking.lessonId) : null)
    ))
    if (targets.length === 0) {
      return { changed: 0, skipped: input.bookingIds.length, heldBefore, heldAfter: heldBefore }
    }
    const heldAfter = ledgerHeldPointsAfterSettlement(fresh, lessons)

    targets.forEach((booking) => {
      tx.update(doc(db, 'bookingRequests', booking.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        holdResolution: 'approved_lesson_settled',
        holdResolvedAt: serverTimestamp(),
        holdResolvedBy: input.actorUid,
      })
    })
    tx.update(studentRef, {
      reservedMinutes: heldAfter,
      heldMinutes: heldAfter,
      updatedAt: serverTimestamp(),
    })
    tx.set(doc(collection(db, 'adminLogs')), {
      adminId: input.actorUid,
      action: 'BULK_SETTLE_APPROVED_BOOKINGS',
      targetType: 'student',
      targetId: input.studentId,
      changes: {
        studentCode: student.code || '',
        bookingIds: targets.map((booking) => booking.id),
        lessonIds: Array.from(new Set(targets.map((booking) => booking.lessonId || ''))),
        closedPoints: targets.reduce((sum, booking) => sum + getBookingPoints(booking), 0),
        heldBefore,
        heldAfter,
      },
      createdAt: serverTimestamp(),
    })
    return { changed: targets.length, skipped: input.bookingIds.length - targets.length, heldBefore, heldAfter }
  })
}

/**
 * Chuyển các ca đang giữ mà trỏ môn không còn trong gói về đúng gói duy nhất của
 * học viên. Không đổi kim cương, giờ học, gia sư hay buổi điểm danh.
 */
export async function repointOrphanSubjectBookingsForStudent(input: {
  studentId: string
  bookingIds: string[]
  actorUid: string
}): Promise<RepairActionResult> {
  return runTransaction(db, async (tx) => {
    const studentRef = doc(db, 'students', input.studentId)
    const studentSnap = await tx.get(studentRef)
    if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')
    const student = { id: studentSnap.id, ...studentSnap.data() } as Student
    const heldBefore = storedHeldPoints(student)

    const bookingSnaps = await Promise.all(input.bookingIds.map((id) => tx.get(doc(db, 'bookingRequests', id))))
    const fresh = bookingSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...snap.data() } as BookingRequest))
      .filter((booking) => booking.studentId === input.studentId)
    const lessonIds = Array.from(new Set(fresh.flatMap((booking) => (booking.lessonId ? [booking.lessonId] : []))))
    const lessonSnaps = await Promise.all(lessonIds.map((id) => tx.get(doc(db, 'lessons', id))))
    const lessons = new Map(lessonSnaps
      .filter((snap) => snap.exists())
      .map((snap) => [snap.id, lessonFactFrom(snap.id, snap.data())] as const))

    const updates = fresh.flatMap((booking) => {
      const row = classifyOrphanSubjectBooking(booking, student, booking.lessonId ? lessons.get(booking.lessonId) : null)
      // A linked lesson that vanished cannot prove the target subject; leave it for manual review.
      if (booking.lessonId && !lessons.has(booking.lessonId)) return []
      return row && !row.blocker && row.target ? [{ booking, target: row.target }] : []
    })
    if (updates.length === 0) {
      return { changed: 0, skipped: input.bookingIds.length, heldBefore, heldAfter: heldBefore }
    }
    updates.forEach(({ booking, target }) => {
      tx.update(doc(db, 'bookingRequests', booking.id), {
        subjectId: target.subjectId,
        subjectName: target.subjectName,
        ...(target.curriculumLink ? { curriculumLink: target.curriculumLink } : {}),
        subjectRepairedFromId: booking.subjectId || '',
        subjectRepairedFromName: booking.subjectName || '',
        subjectRepairedAt: serverTimestamp(),
        subjectRepairedBy: input.actorUid,
        updatedAt: serverTimestamp(),
      })
    })
    tx.set(doc(collection(db, 'adminLogs')), {
      adminId: input.actorUid,
      action: 'REPOINT_ORPHAN_SUBJECT_BOOKINGS',
      targetType: 'student',
      targetId: input.studentId,
      changes: {
        studentCode: student.code || '',
        bookingIds: updates.map(({ booking }) => booking.id),
        fromSubjects: Array.from(new Set(updates.map(({ booking }) => `${booking.subjectId || ''}|${booking.subjectName || ''}`))),
        toSubjectId: updates[0].target.subjectId,
        toSubjectName: updates[0].target.subjectName,
        heldPointsUnchanged: heldBefore,
      },
      createdAt: serverTimestamp(),
    })
    return { changed: updates.length, skipped: input.bookingIds.length - updates.length, heldBefore, heldAfter: heldBefore }
  })
}
