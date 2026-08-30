import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  ONLINE_CLASSROOM_ACCESS_COLLECTION,
  ONLINE_CLASSROOM_BOOKING_CONTROLS_COLLECTION,
  ONLINE_CLASSROOM_ROOMS_COLLECTION,
  isSafeClassroomId,
  onlineClassroomAccessGeneration,
  onlineClassroomAccessId,
  onlineClassroomSessionKey,
  onlineClassroomSessionTiming,
  normalizeOnlineClassroomExtensionMinutes,
  type OnlineClassroomBookingLike,
} from './onlineClassroom'
import {
  normalizeOnlineClassroomAttendanceEffectiveSession,
  type OnlineClassroomAttendanceEffectiveSession,
} from './onlineClassroomAttendance'
import {
  ONLINE_CLASSROOM_OPERATION_BOOKING_STATUSES,
  ONLINE_CLASSROOM_OPERATION_QUERY_LIMIT,
  onlineClassroomOperationPage,
} from './onlineClassroomOperations'

const db = new Firestore()
const ONLINE_CLASSROOM_SESSIONS_COLLECTION = 'onlineClassroomSessions'
const MAX_OPERATIONS_RANGE_DAYS = 31

type Booking = OnlineClassroomBookingLike & {
  teacherCode?: string
  teacherName?: string
  studentCode?: string
  studentName?: string
  subjectName?: string
}

type Student = {
  name?: string
  code?: string
  status?: string
  recordType?: string
  learningScheduleType?: string
  classDeliveryMode?: string
}

type Teacher = {
  name?: string
  code?: string
  status?: string
  loginAccountUid?: string
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function timestampIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null
}

function timestampMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null
}

function timingFromHistory(value: unknown): OnlineClassroomAttendanceEffectiveSession | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const session = value as Record<string, unknown>
  const effectiveSessionKey = session.effectiveSessionKey ?? session.sessionKey
  const topLevel = normalizeOnlineClassroomAttendanceEffectiveSession({
    sessionKey: effectiveSessionKey,
    extensionMinutes: session.extensionMinutes,
    scheduledStartsAtMs: timestampMillis(session.effectiveScheduledStartsAt),
    scheduledEndsAtMs: timestampMillis(session.effectiveScheduledEndsAt),
    hardEndsAtMs: timestampMillis(session.effectiveHardEndsAt),
    timingSource: session.effectiveTimingSource,
  })
  if (topLevel) return topLevel
  return typeof session.sessionHistory === 'object'
    && session.sessionHistory !== null
    && !Array.isArray(session.sessionHistory)
    && typeof effectiveSessionKey === 'string'
    ? normalizeOnlineClassroomAttendanceEffectiveSession(
      (session.sessionHistory as Record<string, unknown>)[effectiveSessionKey],
    )
    : null
}

function timingFromRoom(
  sessionKey: string,
  value: unknown,
  booking: Booking,
): OnlineClassroomAttendanceEffectiveSession | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const room = value as Record<string, unknown>
  const extensionMinutes = normalizeOnlineClassroomExtensionMinutes(room.extensionMinutes)
  const persisted = normalizeOnlineClassroomAttendanceEffectiveSession({
    sessionKey,
    extensionMinutes,
    scheduledStartsAtMs: timestampMillis(room.scheduledStartsAt),
    scheduledEndsAtMs: timestampMillis(room.scheduledEndsAt),
    hardEndsAtMs: timestampMillis(room.hardEndsAt),
    timingSource: 'room',
  })
  if (persisted) return persisted
  const fallback = onlineClassroomSessionTiming(booking, extensionMinutes)
  return fallback && normalizeOnlineClassroomAttendanceEffectiveSession({
    sessionKey,
    extensionMinutes,
    scheduledStartsAtMs: fallback.scheduledStartsAt.getTime(),
    scheduledEndsAtMs: fallback.scheduledEndsAt.getTime(),
    hardEndsAtMs: fallback.hardEndsAt.getTime(),
    timingSource: 'legacy-booking-fallback',
  })
}

function optionalCount(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

async function requireSystemAdmin(uid: string | undefined): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại bằng tài khoản Admin.')
  const snapshot = await db.collection('users').doc(uid).get()
  if (snapshot.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Chỉ Admin hệ thống được xem trang quản lý lớp trực tuyến.')
  }
}

function operationBlockReason(
  booking: Booking,
  student: Student | undefined,
  teacher: Teacher | undefined,
  pilotEnabled: boolean,
): string | null {
  if (booking.status !== 'confirmed') return booking.status === 'completed' || booking.lessonId
    ? 'Buổi học đã hoàn tất.'
    : 'Buổi học chưa được xác nhận.'
  if (booking.lessonId) return 'Buổi học đã hoàn tất.'
  if (!booking.teacherId || !booking.studentId) return 'Lịch đang thiếu gia sư hoặc học viên.'
  if (booking.groupClassId) return 'Pilot hiện chỉ hỗ trợ lớp 1 kèm 1.'
  if (!student || student.status !== 'active') return 'Học viên không còn ở trạng thái hoạt động.'
  if (student.recordType === 'group_class') return 'Pilot hiện chỉ hỗ trợ lớp 1 kèm 1.'
  if (student.learningScheduleType === 'offline' || student.classDeliveryMode === 'offline') {
    return 'Đây là lịch học offline.'
  }
  if (!teacher || teacher.status !== 'active') return 'Gia sư không còn ở trạng thái đang dạy.'
  if (!teacher.loginAccountUid) return 'Gia sư chưa có tài khoản đăng nhập chuẩn.'
  if (!pilotEnabled) return 'Admin chưa bật pilot cho học viên.'
  if (!onlineClassroomSessionTiming(booking)) return 'Lịch chưa có ngày giờ hợp lệ.'
  return null
}

export const getOnlineClassroomOperations = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '512MiB',
}, async (request) => {
  await requireSystemAdmin(request.auth?.uid)
  const fromDate = request.data?.fromDate
  const toDate = request.data?.toDate
  if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate) {
    throw new HttpsError('invalid-argument', 'Khoảng ngày không hợp lệ.')
  }
  const fromMs = Date.parse(`${fromDate}T00:00:00.000Z`)
  const toMs = Date.parse(`${toDate}T00:00:00.000Z`)
  if ((toMs - fromMs) / 86_400_000 >= MAX_OPERATIONS_RANGE_DAYS) {
    throw new HttpsError('invalid-argument', `Mỗi lần chỉ xem tối đa ${MAX_OPERATIONS_RANGE_DAYS} ngày.`)
  }

  const bookingsSnapshot = await db.collection('bookingRequests')
    // Filter operational statuses before applying the cap. Limiting the full
    // date range first can let unrelated pending/cancelled rows hide real
    // confirmed or completed classes from Admin.
    .where('status', 'in', [...ONLINE_CLASSROOM_OPERATION_BOOKING_STATUSES])
    .where('requestedDate', '>=', fromDate)
    .where('requestedDate', '<=', toDate)
    .orderBy('requestedDate', 'asc')
    .limit(ONLINE_CLASSROOM_OPERATION_QUERY_LIMIT)
    .get()
  const bookingPage = onlineClassroomOperationPage(bookingsSnapshot.docs)
  const bookings = bookingPage.rows
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Booking)
  if (bookings.length === 0) {
    return { serverNow: new Date().toISOString(), truncated: false, rows: [] }
  }

  const studentIds = [...new Set(bookings.map((booking) => booking.studentId).filter((id): id is string => Boolean(id)))]
  const teacherIds = [...new Set(bookings.map((booking) => booking.teacherId).filter((id): id is string => Boolean(id)))]
  const accessRefs = [
    ...studentIds.map((id) => db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(onlineClassroomAccessId('student', id))),
    ...teacherIds.map((id) => db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(onlineClassroomAccessId('teacher', id))),
  ]
  const [studentSnapshots, teacherSnapshots, accessSnapshots, controlSnapshots] = await Promise.all([
    studentIds.length > 0 ? db.getAll(...studentIds.map((id) => db.collection('students').doc(id))) : [],
    teacherIds.length > 0 ? db.getAll(...teacherIds.map((id) => db.collection('teachers').doc(id))) : [],
    accessRefs.length > 0 ? db.getAll(...accessRefs) : [],
    db.getAll(...bookings.map(
      (booking) => db.collection(ONLINE_CLASSROOM_BOOKING_CONTROLS_COLLECTION).doc(booking.id),
    )),
  ])
  const students = new Map(studentSnapshots.map((snapshot) => [snapshot.id, snapshot.data() as Student]))
  const teachers = new Map(teacherSnapshots.map((snapshot) => [snapshot.id, snapshot.data() as Teacher]))
  const accessById = new Map(accessSnapshots.map((snapshot) => [snapshot.id, snapshot.data() || {}]))

  const currentSessionKeys = bookings.map((booking) => {
    const studentAccess = booking.studentId
      ? accessById.get(onlineClassroomAccessId('student', booking.studentId))
      : undefined
    const teacherAccess = booking.teacherId
      ? accessById.get(onlineClassroomAccessId('teacher', booking.teacherId))
      : undefined
    return onlineClassroomSessionKey(
      booking,
      onlineClassroomAccessGeneration(studentAccess?.generation),
      onlineClassroomAccessGeneration(teacherAccess?.generation),
    )
  })
  const roomRefs = currentSessionKeys
    .map((sessionKey) => db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey))
  const [roomSnapshots, sessionSnapshots] = await Promise.all([
    db.getAll(...roomRefs),
    db.getAll(...bookings.map((booking) => db.collection(ONLINE_CLASSROOM_SESSIONS_COLLECTION).doc(booking.id))),
  ])
  const historicalSessionKeys = sessionSnapshots.map((snapshot, index) => {
    if (roomSnapshots[index]?.exists) return null
    const session = snapshot.data()
    const candidate = session?.effectiveSessionKey ?? session?.sessionKey
    return isSafeClassroomId(candidate) && candidate !== currentSessionKeys[index]
      ? candidate
      : null
  })
  const uniqueHistoricalSessionKeys = [...new Set(
    historicalSessionKeys.filter((sessionKey): sessionKey is string => Boolean(sessionKey)),
  )]
  const historicalRoomSnapshots = uniqueHistoricalSessionKeys.length > 0
    ? await db.getAll(...uniqueHistoricalSessionKeys.map(
      (sessionKey) => db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey),
    ))
    : []
  const historicalRooms = new Map(
    historicalRoomSnapshots.map((snapshot) => [snapshot.id, snapshot]),
  )
  const nowMs = Date.now()
  const rows = bookings.map((booking, index) => {
    const student = booking.studentId ? students.get(booking.studentId) : undefined
    const teacher = booking.teacherId ? teachers.get(booking.teacherId) : undefined
    const studentAccess = booking.studentId
      ? accessById.get(onlineClassroomAccessId('student', booking.studentId))
      : undefined
    const pilotEnabled = studentAccess?.enabled === true
    const currentRoomSnapshot = roomSnapshots[index]
    const historicalSessionKey = historicalSessionKeys[index]
    const historicalRoomSnapshot = historicalSessionKey
      ? historicalRooms.get(historicalSessionKey)
      : undefined
    const resolvedRoomSnapshot = currentRoomSnapshot?.exists
      ? currentRoomSnapshot
      : historicalRoomSnapshot
    const room = resolvedRoomSnapshot?.data() || {}
    const control = controlSnapshots[index]?.data() || null
    const session = sessionSnapshots[index]?.data() || null
    const currentRoomTiming = currentRoomSnapshot?.exists
      ? timingFromRoom(currentSessionKeys[index], currentRoomSnapshot.data(), booking)
      : null
    const historyTiming = timingFromHistory(session)
    const controlTiming = timingFromRoom(currentSessionKeys[index], control, booking)
    const historicalRoomTiming = historicalSessionKey && historicalRoomSnapshot?.exists
      ? timingFromRoom(historicalSessionKey, historicalRoomSnapshot.data(), booking)
      : null
    const fallbackTiming = timingFromRoom(currentSessionKeys[index], {}, booking)
    // The room for the current access generation is authoritative. If pilot
    // access rotated and that room does not exist yet, retain the effective
    // timing/session persisted by the attendance webhook instead of silently
    // falling back to generation N+1 with a zero-minute extension.
    const timing = currentRoomTiming || controlTiming || historyTiming || historicalRoomTiming || fallbackTiming
    const extensionMinutes = timing?.extensionMinutes || 0
    const blockReason = operationBlockReason(booking, student, teacher, pilotEnabled)
    const hardEndsAt = timing ? new Date(timing.hardEndsAtMs).toISOString() : null
    const status = timing
      ? nowMs < timing.scheduledStartsAtMs
        ? 'upcoming'
        : nowMs < timing.hardEndsAtMs && booking.status === 'confirmed' && !booking.lessonId
          ? 'live'
          : 'ended'
      : 'unavailable'
    return {
      bookingId: booking.id,
      requestedDate: booking.requestedDate || '',
      requestedStart: booking.requestedStart || '',
      requestedEnd: booking.requestedEnd || '',
      studentId: booking.studentId || '',
      studentName: student?.name || booking.studentName || '',
      studentCode: student?.code || booking.studentCode || '',
      teacherId: booking.teacherId || '',
      teacherName: teacher?.name || booking.teacherName || '',
      teacherCode: teacher?.code || booking.teacherCode || '',
      subjectName: booking.subjectName || '',
      pilotEnabled,
      eligible: blockReason === null,
      blockReason,
      status,
      roomCreated: resolvedRoomSnapshot?.exists === true || sessionSnapshots[index]?.exists === true,
      sessionKey: timing?.sessionKey || currentSessionKeys[index],
      extensionMinutes,
      extensionAvailable: blockReason === null
        && control?.extensionUsed !== true
        && room.extensionUsed !== true
        && extensionMinutes === 0
        && Boolean(timing && nowMs < timing.hardEndsAtMs),
      scheduledEndsAt: timing ? new Date(timing.scheduledEndsAtMs).toISOString() : null,
      hardEndsAt,
      session: session ? {
        status: typeof session.status === 'string' ? session.status : status,
        teacherFirstJoinedAt: timestampIso(session.teacherFirstJoinedAt),
        teacherLastLeftAt: timestampIso(session.teacherLastLeftAt),
        teacherJoinCount: optionalCount(session.teacherJoinCount),
        studentFirstJoinedAt: timestampIso(session.studentFirstJoinedAt),
        studentLastLeftAt: timestampIso(session.studentLastLeftAt),
        studentJoinCount: optionalCount(session.studentJoinCount),
        teacherLateSeconds: optionalCount(session.teacherLateSeconds),
      } : null,
    }
  }).sort((left, right) => (
    `${left.requestedDate}T${left.requestedStart}`.localeCompare(`${right.requestedDate}T${right.requestedStart}`)
  ))

  return {
    serverNow: new Date(nowMs).toISOString(),
    truncated: bookingPage.truncated,
    rows,
  }
})
