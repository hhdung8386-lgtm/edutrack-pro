import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { buildReminderEmail, reminderTeacherName, type ReminderEmailBooking, type ReminderEmailStudent } from './reminderEmail'
import { groupReminderDays, groupReminderSessions, type ReminderSessionBooking } from './reminderSessions'
import { aggregateTeacherRanking, type TeacherRankingProfile, type TeacherRankingRow } from './teacherRanking'
import { decideTeacherLoginRecovery, teacherLoginEmail } from './teacherLoginRecovery'
import {
  accountDeletionBlockReason,
  normalizedAccountEmail,
  PROTECTED_ACCOUNT_EMAILS,
} from './staffAccountManagement'
import { createOnlineClassroomEmailInvite } from './onlineClassroomFunctions'
import {
  ONLINE_CLASSROOM_ACCESS_COLLECTION,
  ONLINE_CLASSROOM_CREDENTIAL_ROTATION_LEASE_MS,
  canAcquireOnlineClassroomCredentialMutation,
  onlineClassroomAccessGeneration,
  onlineClassroomAccessId,
  onlineClassroomCredentialMutationMatches,
  onlineClassroomCredentialRotationFence,
  onlineClassroomPilotReminderDeliveryId,
  parseVietnamBookingTime,
  partitionOnlineClassroomReminderBookings,
} from './onlineClassroom'

export {
  appendOnlineClassroomBoardOperation,
  getOnlineClassroomAccess,
  getOnlineClassroomPilotStatus,
  issueOnlineClassroomInvite,
  rotateOnlineClassroomTeacherPassword,
  saveOnlineClassroomBoard,
  setOnlineClassroomPilotAccess,
} from './onlineClassroomFunctions'

export {
  abandonOnlineClassroomRecording,
  cleanupOnlineClassroomRecordings,
  confirmOnlineClassroomRecordingDownloaded,
  createOnlineClassroomRecordingShareLink,
  finalizeOnlineClassroomRecording,
  getOnlineClassroomRecording,
  getOnlineClassroomRecordingForBooking,
  getOnlineClassroomRecordingsForBookings,
  requestOnlineClassroomRecordingConsent,
  respondOnlineClassroomRecordingConsent,
  startOnlineClassroomRecording,
  touchOnlineClassroomRecordingUpload,
} from './onlineClassroomRecordingFunctions'

export {
  getOnlineClassroomGiftEvents,
  sendOnlineClassroomGift,
} from './onlineClassroomGiftFunctions'

export { cleanupOnlineClassroomEphemeralData } from './onlineClassroomEphemeralCleanup'

initializeApp()

const db = new Firestore()
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
const PROCESSING_LEASE_MS = 10 * 60 * 1000
const resendApiKey = defineSecret('RESEND_API_KEY')
const studentDeletePassword = defineSecret('STUDENT_DELETE_PASSWORD')
const TEACHER_RANKING_CACHE_MS = 5 * 60 * 1000
const teacherRankingCache = new Map<string, { expiresAt: number; rows: TeacherRankingRow[] }>()
const TEACHER_FIXED_PASSWORD = '1234560'

const REMINDER_SPECS = [
  {
    type: 'class-12h-v1',
    offsetMs: 12 * 60 * 60 * 1000,
    earlyWindowMs: 7 * 60 * 1000,
    lateWindowMs: 3 * 60 * 1000,
    label: 'trước khoảng 12 giờ',
  },
  {
    type: 'class-30m-v1',
    offsetMs: 30 * 60 * 1000,
    earlyWindowMs: 4 * 60 * 1000,
    lateWindowMs: 2 * 60 * 1000,
    label: 'trước khoảng 30 phút',
  },
] as const

type ReminderSpec = typeof REMINDER_SPECS[number]

type Booking = ReminderEmailBooking & ReminderSessionBooking & {
  id: string
  status?: string
  lessonId?: string
  studentName?: string
  teacherId?: string
  requestedMinutes?: number
}

type Student = ReminderEmailStudent & {
  name?: string
  email?: string
  onlineClassroomPilotEnabled?: boolean
}

type ReminderCandidate = {
  pilot: boolean
  booking: Booking
  bookings: Booking[]
  bookingIds: string[]
  recipient: string
  scheduledAt: Date
  deliveryId: string
  legacyDeliveryIds: string[]
  reminder: ReminderSpec
  sessionEnd: string
  studentPilotGeneration?: number
  teacherPilotGeneration?: number
  generationDeliveryIdEnabled?: boolean
  pilotAccessChangedAtMs?: number
}

function vietnamDateISO(now: Date): string {
  const vietnam = new Date(now.getTime() + VIETNAM_OFFSET_MS)
  const year = vietnam.getUTCFullYear()
  const month = String(vietnam.getUTCMonth() + 1).padStart(2, '0')
  const day = String(vietnam.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function tomorrowISO(now: Date): string {
  return vietnamDateISO(new Date(now.getTime() + 24 * 60 * 60 * 1000))
}

function parseVietnamSchedule(dateISO?: string, time?: string): Date | null {
  return parseVietnamBookingTime(dateISO, time)
}

function isEmail(value: string | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
}

function legacyReminderDeliveryId(booking: Booking, reminder: ReminderSpec): string {
  return `${booking.id}_${reminder.type}_${booking.requestedDate}_${booking.requestedStart?.replace(':', '')}`
}

function sessionReminderDeliveryId(booking: Booking, sessionStart: string, reminder: ReminderSpec): string {
  const businessKey = [
    booking.studentId || '',
    booking.teacherId || '',
    booking.subjectId || '',
    booking.requestedDate || '',
    sessionStart,
    reminder.type,
  ].join('|')
  const digest = createHash('sha256').update(businessKey).digest('hex').slice(0, 32)
  return `session_${digest}_${reminder.type}`
}

function reminderDeliveryId(booking: Booking, reminder: ReminderSpec): string {
  const businessKey = [booking.studentId || '', booking.requestedDate || '', reminder.type].join('|')
  const digest = createHash('sha256').update(businessKey).digest('hex').slice(0, 32)
  return `day_${digest}_${reminder.type}`
}

async function acquireDelivery(candidate: ReminderCandidate, now: Date): Promise<boolean> {
  const ref = db.collection('emailReminderDeliveries').doc(candidate.deliveryId)
  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref)
    const existing = current.data() as { status?: string; processingLeaseUntil?: Timestamp } | undefined
    const leaseUntil = existing?.processingLeaseUntil?.toMillis() ?? 0

    if (existing?.status === 'sent' || (existing?.status === 'processing' && leaseUntil > now.getTime())) return false

    // Tương thích với các email đã gửi trước bản sửa: nếu bất kỳ ô con nào của
    // cụm đã gửi rồi thì không gửi lại một email cụm mới trong cùng cửa sổ nhắc.
    const legacyRefs = [...new Set(candidate.legacyDeliveryIds)]
      .filter((deliveryId) => deliveryId !== candidate.deliveryId)
      .map((deliveryId) => db.collection('emailReminderDeliveries').doc(deliveryId))
    const legacySnapshots = await Promise.all(legacyRefs.map((legacyRef) => transaction.get(legacyRef)))
    const legacySentAfterCurrentAccess = legacySnapshots.some((snapshot) => {
      const legacy = snapshot.data()
      if (legacy?.status !== 'sent') return false
      if (!candidate.pilot || !candidate.generationDeliveryIdEnabled) return true
      const sentAtMs = legacy.sentAt instanceof Timestamp ? legacy.sentAt.toMillis() : 0
      return sentAtMs >= (candidate.pilotAccessChangedAtMs || 0)
    })
    if (legacySentAfterCurrentAccess) return false

    const update = {
      reminderType: candidate.reminder.type,
      bookingId: candidate.booking.id,
      bookingIds: candidate.bookingIds,
      bookingCount: candidate.bookingIds.length,
      scheduleDate: candidate.booking.requestedDate,
      scheduleStart: candidate.booking.requestedStart,
      scheduleEnd: candidate.sessionEnd,
      scheduleTimes: [...new Set(candidate.bookings.map((booking) => {
        const start = booking.requestedStart || ''
        const end = booking.requestedEnd || ''
        return end ? `${start}–${end}` : start
      }).filter(Boolean))],
      status: 'processing',
      recipient: candidate.recipient,
      studentId: candidate.booking.studentId || '',
      studentCode: candidate.booking.studentCode || '',
      studentName: candidate.booking.studentName || '',
      teacherId: [...new Set(candidate.bookings.map((booking) => booking.teacherId).filter(Boolean))].join(', '),
      teacherName: [...new Set(candidate.bookings.map((booking) => reminderTeacherName(booking)).filter(Boolean))].join(', '),
      subjectId: [...new Set(candidate.bookings.map((booking) => booking.subjectId).filter(Boolean))].join(', '),
      subjectName: [...new Set(candidate.bookings.map((booking) => booking.subjectName).filter(Boolean))].join(', '),
      processingLeaseUntil: Timestamp.fromMillis(now.getTime() + PROCESSING_LEASE_MS),
      attemptCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }
    transaction.set(ref, current.exists
      ? update
      : { ...update, createdAt: FieldValue.serverTimestamp() }, { merge: true })

    return true
  })
}

async function sendWithResend(candidate: ReminderCandidate, student: Student, apiKey: string): Promise<string> {
  const sender = process.env.REMINDER_EMAIL_FROM?.trim()
  if (!sender) throw new Error('REMINDER_EMAIL_FROM is not configured')

  const body = buildReminderEmail(candidate.bookings, student, candidate.reminder.label)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': candidate.deliveryId,
    },
    body: JSON.stringify({
      from: sender,
      to: [candidate.recipient],
      subject: body.subject,
      text: body.text,
      html: body.html,
    }),
  })

  const result = await response.json().catch(() => ({})) as { id?: string; message?: string }
  if (!response.ok || !result.id) throw new Error(`Resend failed: ${result.message || response.status}`)
  return result.id
}

async function collectCandidates(now: Date): Promise<Array<{ candidate: ReminderCandidate; student: Student }>> {
  const bookingsSnapshot = await db.collection('bookingRequests')
    .where('status', '==', 'confirmed')
    .where('requestedDate', 'in', [vietnamDateISO(now), tomorrowISO(now)])
    .get()

  const activeBookings = bookingsSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Booking))
    .filter((booking) => !booking.lessonId && booking.studentId)

  // The scheduled backend reads the private allowlist directly. Public mirror
  // fields remain UI hints only and can never decide whether a legacy link is
  // emailed for a pilot booking.
  const accessIds = [...new Set(activeBookings.flatMap((booking) => [
    booking.studentId ? onlineClassroomAccessId('student', booking.studentId) : '',
    booking.teacherId ? onlineClassroomAccessId('teacher', booking.teacherId) : '',
  ]).filter(Boolean))]
  const accessSnapshots = accessIds.length > 0
    ? await db.getAll(...accessIds.map((id) => db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION).doc(id)))
    : []
  const accessById = new Map(accessSnapshots.map((snapshot) => [snapshot.id, {
    enabled: snapshot.data()?.enabled === true,
    generation: onlineClassroomAccessGeneration(snapshot.data()?.generation),
    reminderGenerationDeliveryEnabled: snapshot.data()?.reminderGenerationDeliveryEnabled === true,
    updatedAtMs: snapshot.data()?.updatedAt instanceof Timestamp
      ? snapshot.data()!.updatedAt.toMillis()
      : 0,
  }]))
  const enabledAccessIds = new Set(accessSnapshots
    .filter((snapshot) => snapshot.data()?.enabled === true)
    .map((snapshot) => snapshot.id))
  const partitioned = partitionOnlineClassroomReminderBookings(activeBookings, enabledAccessIds)

  const legacyGroups = groupReminderDays(partitioned.legacy)
    .map((day) => {
      const firstBooking = day.bookings[0]
      const booking: Booking = {
        ...firstBooking,
        requestedStart: day.dayStart,
        requestedEnd: day.dayEnd,
      }
      const previousSessionDeliveryIds = groupReminderSessions(day.bookings).flatMap((session) => REMINDER_SPECS.map((reminder) =>
        sessionReminderDeliveryId(session.bookings[0], session.sessionStart, reminder)))
      return {
        pilot: false,
        booking,
        bookings: day.bookings,
        bookingIds: day.bookings.map((item) => item.id).sort(),
        legacyBookings: day.bookings,
        previousSessionDeliveryIds,
        sessionEnd: day.dayEnd,
        scheduledAt: parseVietnamSchedule(booking.requestedDate, day.dayStart),
      }
    })

  const pilotGroups = groupReminderSessions(partitioned.pilot).map((session) => {
    const firstBooking = session.bookings[0]
    const booking: Booking = {
      ...firstBooking,
      requestedStart: session.sessionStart,
      requestedEnd: session.sessionEnd,
    }
    return {
      pilot: true,
      booking,
      // One adjacent reservation block is one class reminder and one room
      // entry point. Keep all booking ids for audit/deduplication, but send the
      // first booking's private link so a 50/75/100-minute block is not spammed.
      bookings: [booking],
      bookingIds: session.bookings.map((item) => item.id).sort(),
      legacyBookings: session.bookings,
      previousSessionDeliveryIds: [] as string[],
      sessionEnd: session.sessionEnd,
      scheduledAt: parseVietnamSchedule(booking.requestedDate, session.sessionStart),
    }
  })

  const dueReminders = [...legacyGroups, ...pilotGroups]
    .filter((item): item is typeof item & { scheduledAt: Date } => Boolean(item.scheduledAt))
    .flatMap(({ pilot, booking, bookings, bookingIds, legacyBookings, previousSessionDeliveryIds, sessionEnd, scheduledAt }) => REMINDER_SPECS
      .filter((reminder) => {
        const diff = scheduledAt.getTime() - now.getTime()
        return diff >= reminder.offsetMs - reminder.earlyWindowMs && diff <= reminder.offsetMs + reminder.lateWindowMs
      })
      .map((reminder) => ({ pilot, booking, bookings, bookingIds, legacyBookings, previousSessionDeliveryIds, sessionEnd, scheduledAt, reminder })))

  const studentRefs = [...new Set(dueReminders.map(({ booking }) => booking.studentId!))]
    .map((studentId) => db.collection('students').doc(studentId))
  const studentSnapshots = studentRefs.length > 0 ? await db.getAll(...studentRefs) : []
  const studentsById = new Map(studentSnapshots.map((snapshot) => [snapshot.id, snapshot.data() as Student]))
  let invalidRecipientCount = 0

  const candidates = dueReminders.flatMap(({ pilot, booking, bookings, bookingIds, legacyBookings, previousSessionDeliveryIds, sessionEnd, scheduledAt, reminder }) => {
    const student = studentsById.get(booking.studentId!)
    const recipient = student?.email?.trim().toLowerCase()
    if (!student || !isEmail(recipient)) {
      invalidRecipientCount += 1
      return []
    }

    const studentPilotAccess = booking.studentId
      ? accessById.get(onlineClassroomAccessId('student', booking.studentId))
      : undefined
    const teacherPilotAccess = booking.teacherId
      ? accessById.get(onlineClassroomAccessId('teacher', booking.teacherId))
      : undefined
    const useGenerationDeliveryId = Boolean(
      studentPilotAccess?.reminderGenerationDeliveryEnabled
      || teacherPilotAccess?.reminderGenerationDeliveryEnabled,
    )

    return [{
      student,
      candidate: {
        pilot,
        booking,
        bookings,
        recipient,
        scheduledAt,
        reminder,
        bookingIds,
        sessionEnd,
        studentPilotGeneration: studentPilotAccess?.generation,
        teacherPilotGeneration: teacherPilotAccess?.generation,
        generationDeliveryIdEnabled: useGenerationDeliveryId,
        pilotAccessChangedAtMs: Math.max(
          studentPilotAccess?.updatedAtMs || 0,
          teacherPilotAccess?.updatedAtMs || 0,
        ),
        deliveryId: pilot
          ? useGenerationDeliveryId
            ? onlineClassroomPilotReminderDeliveryId(
              booking,
              reminder.type,
              studentPilotAccess?.generation,
              teacherPilotAccess?.generation,
            )
            : onlineClassroomPilotReminderDeliveryId(booking, reminder.type)
          : reminderDeliveryId(booking, reminder),
        legacyDeliveryIds: [
          ...legacyBookings.map((legacyBooking) => legacyReminderDeliveryId(legacyBooking, reminder)),
          ...previousSessionDeliveryIds.filter((deliveryId) => deliveryId.endsWith(`_${reminder.type}`)),
          ...(pilot ? [
            sessionReminderDeliveryId(booking, booking.requestedStart || '', reminder),
            reminderDeliveryId(booking, reminder),
          ] : []),
        ],
      },
    }]
  })

  if (invalidRecipientCount > 0) {
    logger.warn('Skipped due reminders because student emails are missing or invalid', { count: invalidRecipientCount })
  }

  return candidates
}

async function attachOnlineClassroomEmailInvites(
  candidate: ReminderCandidate,
  _student: Student,
): Promise<ReminderCandidate> {
  if (!candidate.pilot) return candidate

  // Tạo token chỉ SAU KHI acquireDelivery đã giữ lease. Nếu làm trong
  // collectCandidates, mỗi lần worker quét lại một email đã gửi sẽ sinh thêm
  // token còn hiệu lực dù email bị bỏ qua.
  const bookings = await Promise.all(candidate.bookings.map(async (booking) => {
    try {
      const invite = await createOnlineClassroomEmailInvite(booking)
      if (invite.studentPilotGeneration !== candidate.studentPilotGeneration
        || invite.teacherPilotGeneration !== candidate.teacherPilotGeneration) {
        throw new Error('ONLINE_CLASSROOM_REMINDER_ACCESS_SUPERSEDED')
      }
      return { ...booking, onlineClassroomPilot: true, onlineClassroomURL: invite.joinUrl }
    } catch (error) {
      logger.error('Failed to issue online classroom email invite', {
        bookingId: booking.id,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }))
  return { ...candidate, bookings }
}

export const sendClassReminders = onSchedule({
  region: 'asia-southeast1',
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  timeoutSeconds: 180,
  memory: '256MiB',
  secrets: [resendApiKey],
}, async () => {
  const enabled = process.env.REMINDER_EMAILS_ENABLED === 'true'
  if (!enabled) return

  const apiKey = resendApiKey.value().trim()
  if (!apiKey || apiKey === 'disabled') return

  const now = new Date()
  const candidates = await collectCandidates(now)
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const { candidate, student } of candidates) {
    const locked = await acquireDelivery(candidate, now)
    if (!locked) {
      skipped += 1
      continue
    }

    try {
      const emailCandidate = await attachOnlineClassroomEmailInvites(candidate, student)
      const messageId = await sendWithResend(emailCandidate, student, apiKey)
      await db.collection('emailReminderDeliveries').doc(candidate.deliveryId).set({
        status: 'sent',
        messageId,
        sentAt: FieldValue.serverTimestamp(),
        processingLeaseUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      sent += 1
    } catch (error) {
      failed += 1
      logger.error('Failed to send class reminder', { bookingId: candidate.booking.id, error: error instanceof Error ? error.message : String(error) })
      await db.collection('emailReminderDeliveries').doc(candidate.deliveryId).set({
        status: 'failed',
        failureReason: error instanceof Error ? error.message : String(error),
        failedAt: FieldValue.serverTimestamp(),
        processingLeaseUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
  }

  logger.info('Class reminder worker finished', { candidates: candidates.length, sent, skipped, failed })
})

export const getTeacherRanking = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại để xem bảng xếp hạng.')

  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = userSnapshot.data()?.role
  if (!['teacher', 'admin', 'teacher_manager'].includes(role)) {
    throw new HttpsError('permission-denied', 'Tài khoản không có quyền xem bảng xếp hạng gia sư.')
  }

  const month = typeof request.data?.month === 'string' ? request.data.month.trim() : ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new HttpsError('invalid-argument', 'Tháng cần có định dạng YYYY-MM.')
  }

  const forceRefresh = request.data?.refresh === true
  const cached = teacherRankingCache.get(month)
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { rows: cached.rows, cached: true }
  }

  const lessonsSnapshot = await db.collection('publicLessons')
    .where('date', '>=', `${month}-01`)
    .where('date', '<=', `${month}-31`)
    .get()
  const lessons = lessonsSnapshot.docs.map((snapshot) => snapshot.data())
  const provisionalRows = aggregateTeacherRanking(lessons, month)
  const teacherSnapshots = provisionalRows.length > 0
    ? await db.getAll(...provisionalRows.map((row) => db.collection('teachers').doc(row.teacherId)))
    : []
  const profiles = new Map<string, TeacherRankingProfile>(teacherSnapshots.map((snapshot) => [
    snapshot.id,
    snapshot.data() || {},
  ]))
  const rows = aggregateTeacherRanking(lessons, month, profiles)

  teacherRankingCache.set(month, { expiresAt: Date.now() + TEACHER_RANKING_CACHE_MS, rows })
  logger.info('Teacher ranking loaded', {
    month,
    lessonReads: lessonsSnapshot.size,
    teacherReads: teacherSnapshots.length,
    rows: rows.length,
    forceRefresh,
  })
  return { rows, cached: false }
})

function accountTimestampISO(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

async function requireSystemAdmin(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại để quản lý tài khoản.')
  const actorSnapshot = await db.collection('users').doc(uid).get()
  if (actorSnapshot.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Chỉ Admin cấp cao được quản lý tài khoản đăng nhập.')
  }
  return uid
}

function matchesProtectedPassword(candidate: string, expected: string): boolean {
  const candidateHash = createHash('sha256').update(candidate, 'utf8').digest()
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(candidateHash, expectedHash)
}

export const deleteStudentSafely = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  secrets: [studentDeletePassword],
}, async (request) => {
  const actorUid = await requireSystemAdmin(request.auth?.uid)
  const studentId = typeof request.data?.studentId === 'string' ? request.data.studentId.trim() : ''
  const expectedCode = typeof request.data?.expectedCode === 'string' ? request.data.expectedCode.trim().toUpperCase() : ''
  const password = typeof request.data?.password === 'string' ? request.data.password : ''

  if (!studentId || studentId.includes('/') || studentId.length > 160 || !expectedCode || !password) {
    throw new HttpsError('invalid-argument', 'Thiếu thông tin xác nhận xóa học viên.')
  }

  const configuredPassword = studentDeletePassword.value()
  if (!configuredPassword) {
    throw new HttpsError('failed-precondition', 'Mật khẩu xóa học viên chưa được cấu hình trên máy chủ.')
  }
  if (!matchesProtectedPassword(password, configuredPassword)) {
    logger.warn('Protected student deletion rejected', { actorUid, studentId, expectedCode })
    throw new HttpsError('permission-denied', 'Mật khẩu xóa học viên không đúng.')
  }

  const studentRef = db.collection('students').doc(studentId)
  const bookingQuery = db.collection('bookingRequests')
    .where('studentId', '==', studentId)
    .where('status', 'in', ['pending', 'confirmed'])
  const backupRef = db.collection('studentDeletionBackups').doc()
  const logRef = db.collection('adminLogs').doc()

  const result = await db.runTransaction(async (transaction) => {
    const studentSnapshot = await transaction.get(studentRef)
    if (!studentSnapshot.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ học viên cần xóa.')

    const studentData = studentSnapshot.data() || {}
    const currentCode = typeof studentData.code === 'string' ? studentData.code.trim().toUpperCase() : ''
    if (currentCode !== expectedCode) {
      throw new HttpsError('failed-precondition', 'Mã học viên đã thay đổi. Hãy tải lại danh sách rồi thử lại.')
    }

    const bookingSnapshot = await transaction.get(bookingQuery)
    const activeBookings = bookingSnapshot.docs
    if (activeBookings.length > 450) {
      throw new HttpsError('resource-exhausted', 'Học viên có quá nhiều lịch đang giữ chỗ; vui lòng liên hệ kỹ thuật để xử lý an toàn.')
    }

    transaction.create(backupRef, {
      originalStudentId: studentId,
      studentCode: currentCode,
      studentName: typeof studentData.name === 'string' ? studentData.name : '',
      studentData,
      releasedBookingIds: activeBookings.map((snapshot) => snapshot.id),
      releasedBookingCount: activeBookings.length,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: actorUid,
      deletedByEmail: request.auth?.token.email || '',
      recoveryStatus: 'available',
      source: 'deleteStudentSafely-v1',
    })

    activeBookings.forEach((snapshot) => {
      transaction.update(snapshot.ref, {
        status: 'released',
        releasedAt: FieldValue.serverTimestamp(),
        releasedBy: `admin:${actorUid}`,
        deletionBackupId: backupRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    transaction.create(logRef, {
      action: 'DELETE_STUDENT_PROTECTED',
      actorUid,
      actorEmail: request.auth?.token.email || '',
      targetType: 'student',
      targetId: studentId,
      targetCode: currentCode,
      targetName: typeof studentData.name === 'string' ? studentData.name : '',
      backupId: backupRef.id,
      releasedBookingCount: activeBookings.length,
      createdAt: FieldValue.serverTimestamp(),
    })
    transaction.delete(studentRef)

    return { releasedBookingCount: activeBookings.length }
  })

  logger.info('Student deleted with protected backup', {
    actorUid,
    studentId,
    expectedCode,
    backupId: backupRef.id,
    releasedBookingCount: result.releasedBookingCount,
  })
  return { backupId: backupRef.id, ...result }
})

export const listStaffAccounts = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (request) => {
  const actorUid = await requireSystemAdmin(request.auth?.uid)
  const authService = getAuth()
  const authUsers: Awaited<ReturnType<typeof authService.listUsers>>['users'] = []
  let pageToken: string | undefined

  do {
    const page = await authService.listUsers(1000, pageToken)
    authUsers.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)

  const profilesSnapshot = await db.collection('users').get()
  const profilesByUid = new Map(profilesSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()]))
  const profileCountByEmail = new Map<string, number>()
  profilesSnapshot.docs.forEach((snapshot) => {
    const email = normalizedAccountEmail(snapshot.data().email)
    if (email) profileCountByEmail.set(email, (profileCountByEmail.get(email) || 0) + 1)
  })

  const accounts = authUsers.map((authUser) => {
    const profile = profilesByUid.get(authUser.uid)
    const email = normalizedAccountEmail(authUser.email || profile?.email)
    const role = typeof profile?.role === 'string' ? profile.role : 'missing_profile'
    const username = typeof profile?.username === 'string' && profile.username.trim()
      ? profile.username.trim()
      : authUser.displayName?.trim() || email.split('@')[0] || authUser.uid
    const lastSignInAt = accountTimestampISO(authUser.metadata.lastSignInTime)
    const createdAt = accountTimestampISO(authUser.metadata.creationTime)
      || accountTimestampISO(profile?.createdAt)

    return {
      uid: authUser.uid,
      email,
      username,
      role,
      accessScope: typeof profile?.accessScope === 'string' ? profile.accessScope : null,
      disabled: authUser.disabled,
      protected: authUser.uid === actorUid || role === 'admin' || PROTECTED_ACCOUNT_EMAILS.has(email),
      profileExists: Boolean(profile),
      duplicateProfileCount: email ? profileCountByEmail.get(email) || 0 : 0,
      createdAt,
      lastSignInAt,
    }
  })

  accounts.sort((left, right) => {
    const leftTime = left.lastSignInAt ? Date.parse(left.lastSignInAt) : 0
    const rightTime = right.lastSignInAt ? Date.parse(right.lastSignInAt) : 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return left.username.localeCompare(right.username, 'vi')
  })

  logger.info('Staff accounts listed', {
    actorUid,
    authAccountCount: accounts.length,
    profileCount: profilesSnapshot.size,
  })
  return { accounts }
})

function firebaseAuthErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
}

export const deleteStaffAccounts = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 120,
  memory: '256MiB',
}, async (request) => {
  const actorUid = await requireSystemAdmin(request.auth?.uid)
  const rawUids: unknown[] = Array.isArray(request.data?.uids) ? request.data.uids : []
  const uids = [...new Set(rawUids
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value && !value.includes('/') && value.length <= 160))]

  if (!uids.length) throw new HttpsError('invalid-argument', 'Chưa chọn tài khoản cần xóa.')
  if (uids.length > 50) {
    throw new HttpsError('invalid-argument', 'Mỗi lượt chỉ được xóa tối đa 50 tài khoản để đảm bảo an toàn.')
  }

  const authService = getAuth()
  const deletedUids: string[] = []
  const failures: Array<{ uid: string; message: string }> = []

  // Xử lý tuần tự để tránh dồn tải lên Authentication và giữ kết quả từng UID
  // rõ ràng nếu một tài khoản được đổi quyền trong lúc thao tác.
  for (const uid of uids) {
    try {
      const profileRef = db.collection('users').doc(uid)
      const profileSnapshot = await profileRef.get()
      const profile = profileSnapshot.data() || {}
      let authEmail = ''
      try {
        const authUser = await authService.getUser(uid)
        authEmail = normalizedAccountEmail(authUser.email)
      } catch (error) {
        if (firebaseAuthErrorCode(error) !== 'auth/user-not-found') throw error
      }

      const profileEmail = normalizedAccountEmail(profile.email)
      if (accountDeletionBlockReason({
        actorUid,
        targetUid: uid,
        role: profile.role,
        authEmail,
        profileEmail,
      })) {
        failures.push({ uid, message: 'Tài khoản Admin hoặc phiên đang đăng nhập được bảo vệ.' })
        continue
      }

      await db.runTransaction(async (transaction) => {
        const latestProfileSnapshot = await transaction.get(profileRef)
        const latestProfile = latestProfileSnapshot.data() || {}
        if (latestProfile.role === 'admin') {
          throw new Error('PROTECTED_ACCOUNT_CHANGED')
        }

        const teacherId = typeof latestProfile.teacherId === 'string' ? latestProfile.teacherId.trim() : ''
        if (teacherId) {
          const teacherRef = db.collection('teachers').doc(teacherId)
          const teacherSnapshot = await transaction.get(teacherRef)
          if (teacherSnapshot.exists && teacherSnapshot.data()?.loginAccountUid === uid) {
            transaction.set(teacherRef, {
              loginAccountUid: '',
              loginAccountUpdatedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true })
          }
        }
        transaction.delete(profileRef)
      })

      // Xóa hồ sơ quyền trước rồi mới xóa Authentication. Nếu dịch vụ Auth lỗi
      // giữa chừng, tài khoản vẫn bị khóa quyền và lần thử sau có thể hoàn tất.
      try {
        await authService.deleteUser(uid)
      } catch (error) {
        if (firebaseAuthErrorCode(error) !== 'auth/user-not-found') throw error
      }
      deletedUids.push(uid)
    } catch (error) {
      const message = error instanceof Error && error.message === 'PROTECTED_ACCOUNT_CHANGED'
        ? 'Tài khoản vừa được đổi thành Admin nên đã dừng xóa hồ sơ quyền.'
        : 'Không thể xóa hoàn toàn tài khoản này. Vui lòng tải lại và thử lại.'
      failures.push({ uid, message })
      logger.error('Failed to delete staff account', {
        actorUid,
        targetUid: uid,
        code: firebaseAuthErrorCode(error),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await db.collection('adminLogs').add({
    adminId: actorUid,
    action: 'DELETE_STAFF_ACCOUNTS',
    targetType: 'user',
    targetIds: uids,
    deletedUids,
    failures,
    createdAt: FieldValue.serverTimestamp(),
  })

  logger.info('Staff account deletion completed', {
    actorUid,
    requestedCount: uids.length,
    deletedCount: deletedUids.length,
    failedCount: failures.length,
  })
  return { deletedUids, failures }
})

export const recoverTeacherLogin = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const actorUid = request.auth?.uid
  if (!actorUid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại trước khi khôi phục tài khoản.')

  const actorSnapshot = await db.collection('users').doc(actorUid).get()
  const actorRole = actorSnapshot.data()?.role
  if (actorRole !== 'admin') {
    throw new HttpsError('permission-denied', 'Chỉ Admin hệ thống được khôi phục đăng nhập gia sư.')
  }

  const teacherId = typeof request.data?.teacherId === 'string' ? request.data.teacherId.trim() : ''
  if (!teacherId || teacherId.includes('/') || teacherId.length > 160) {
    throw new HttpsError('invalid-argument', 'Hồ sơ gia sư không hợp lệ.')
  }

  const teacherRef = db.collection('teachers').doc(teacherId)
  const teacherSnapshot = await teacherRef.get()
  if (!teacherSnapshot.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ gia sư.')

  const teacher = teacherSnapshot.data() || {}
  if (teacher.status === 'resigned') {
    throw new HttpsError('failed-precondition', 'Gia sư đã nghỉ dạy; cần kích hoạt lại trước khi khôi phục đăng nhập.')
  }
  const teacherCode = typeof teacher.code === 'string' ? teacher.code.trim() : ''
  if (!teacherCode) throw new HttpsError('failed-precondition', 'Hồ sơ gia sư chưa có mã đăng nhập.')

  const linkedUsersSnapshot = await db.collection('users').where('teacherId', '==', teacherId).get()
  const canonicalUid = typeof teacher.loginAccountUid === 'string' ? teacher.loginAccountUid.trim() : ''
  const canonicalUser = canonicalUid
    ? linkedUsersSnapshot.docs.find((snapshot) => snapshot.id === canonicalUid)?.data()
    : undefined
  const fallbackEmail = teacherLoginEmail(teacherCode)
  const candidateEmails = Array.from(new Set([
    fallbackEmail,
    typeof canonicalUser?.email === 'string' ? canonicalUser.email.trim() : '',
  ].filter(Boolean)))

  const authService = getAuth()
  let authUser: Awaited<ReturnType<typeof authService.getUserByEmail>> | null = null
  let createdAuthUser = false
  for (const email of candidateEmails) {
    try {
      authUser = await authService.getUserByEmail(email)
      break
    } catch (error: unknown) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      if (code !== 'auth/user-not-found') throw error
    }
  }
  if (!authUser) {
    authUser = await authService.createUser({
      email: fallbackEmail,
      password: TEACHER_FIXED_PASSWORD,
      // The account stays unusable until the canonical Firestore link commits.
      disabled: true,
    })
    createdAuthUser = true
  }

  const recoveredUid = authUser.uid
  const recoveredUserRef = db.collection('users').doc(recoveredUid)
  const recoveredUserSnapshot = await recoveredUserRef.get()
  const recoveredUser = recoveredUserSnapshot.exists ? recoveredUserSnapshot.data() || {} : null
  const previousRecoveredTeacherId = recoveredUser && typeof recoveredUser.teacherId === 'string'
    ? recoveredUser.teacherId.trim()
    : ''
  const previousOwnerSnapshot = previousRecoveredTeacherId && previousRecoveredTeacherId !== teacherId
    ? await db.collection('teachers').doc(previousRecoveredTeacherId).get()
    : null
  const initialDecision = decideTeacherLoginRecovery(
    recoveredUser,
    teacherId,
    previousOwnerSnapshot?.exists === true,
  )
  if (!initialDecision.allowed) {
    if (createdAuthUser) await authService.updateUser(recoveredUid, { disabled: true })
    const message = initialDecision.reason === 'unrelated_role'
      ? 'Email đăng nhập đang thuộc một tài khoản quản trị hoặc vai trò khác.'
      : 'Email đăng nhập đang thuộc một hồ sơ gia sư còn tồn tại.'
    throw new HttpsError('failed-precondition', `${message} Đã dừng khôi phục để bảo vệ dữ liệu.`)
  }

  const classroomAccessRef = db.collection(ONLINE_CLASSROOM_ACCESS_COLLECTION)
    .doc(onlineClassroomAccessId('teacher', teacherId))
  const recoveryNonce = randomBytes(16).toString('hex')
  let recovery: { fence: number; generation: number }
  try {
    recovery = await db.runTransaction(async (transaction) => {
      const [currentTeacherSnapshot, classroomAccessSnapshot] = await Promise.all([
        transaction.get(teacherRef),
        transaction.get(classroomAccessRef),
      ])
      const currentTeacher = currentTeacherSnapshot.data() || {}
      if (!currentTeacherSnapshot.exists
        || currentTeacher.status === 'resigned'
        || currentTeacher.code !== teacherCode) {
        throw new HttpsError('aborted', 'Hồ sơ gia sư vừa thay đổi; dữ liệu chưa được cập nhật.')
      }
      const access = classroomAccessSnapshot.data() || {}
      const transactionNow = Date.now()
      if (!canAcquireOnlineClassroomCredentialMutation(access, transactionNow)) {
        throw new HttpsError(
          'aborted',
          'Mật khẩu gia sư đang được xử lý ở một yêu cầu khác. Vui lòng chờ rồi thử lại.',
          { reason: 'TEACHER_CREDENTIAL_ROTATION_IN_PROGRESS' },
        )
      }
      const fence = onlineClassroomCredentialRotationFence(access.credentialRotationFence) + 1
      const generation = onlineClassroomAccessGeneration(access.generation) + 1
      transaction.set(classroomAccessRef, {
        targetType: 'teacher',
        targetId: teacherId,
        enabled: false,
        generation,
        reminderGenerationDeliveryEnabled: true,
        credentialHardenedUid: FieldValue.delete(),
        credentialHardenedAt: FieldValue.delete(),
        credentialHardenedBy: FieldValue.delete(),
        credentialRotationState: 'recovering',
        credentialRotationNonce: recoveryNonce,
        credentialRotationFence: fence,
        credentialRotationLeaseExpiresAt: Timestamp.fromMillis(
          transactionNow + ONLINE_CLASSROOM_CREDENTIAL_ROTATION_LEASE_MS,
        ),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
        ...(classroomAccessSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true })
      transaction.set(teacherRef, {
        onlineClassroomPilotEnabled: false,
        onlineClassroomPilotUpdatedAt: FieldValue.delete(),
        onlineClassroomPilotUpdatedBy: FieldValue.delete(),
      }, { merge: true })
      return { fence, generation }
    })
  } catch (error) {
    if (createdAuthUser) await authService.updateUser(recoveredUid, { disabled: true }).catch(() => undefined)
    throw error
  }

  const auditRef = db.collection('adminLogs').doc()
  let authPasswordChanged = false
  try {
    // Every Auth password writer owns the same per-teacher lease. Therefore a
    // password returned by a successful rotation cannot be overwritten by a
    // concurrent account-recovery request.
    await authService.updateUser(recoveredUid, {
      password: TEACHER_FIXED_PASSWORD,
      disabled: false,
    })
    authPasswordChanged = true
    await authService.revokeRefreshTokens(recoveredUid)
    await db.runTransaction(async (transaction) => {
      const currentTeacherSnapshot = await transaction.get(teacherRef)
      const currentRecoveredUserSnapshot = await transaction.get(recoveredUserRef)
      const currentLinkedUsersSnapshot = await transaction.get(
        db.collection('users').where('teacherId', '==', teacherId),
      )
      const currentRecoveredUser = currentRecoveredUserSnapshot.exists
        ? currentRecoveredUserSnapshot.data() || {}
        : null
      const currentPreviousTeacherId = currentRecoveredUser && typeof currentRecoveredUser.teacherId === 'string'
        ? currentRecoveredUser.teacherId.trim()
        : ''
      const previousOwnerRef = currentPreviousTeacherId && currentPreviousTeacherId !== teacherId
        ? db.collection('teachers').doc(currentPreviousTeacherId)
        : null
      const currentPreviousOwnerSnapshot = previousOwnerRef
        ? await transaction.get(previousOwnerRef)
        : null
      const classroomAccessSnapshot = await transaction.get(classroomAccessRef)

      const currentTeacher = currentTeacherSnapshot.data() || {}
      if (!currentTeacherSnapshot.exists
        || currentTeacher.status === 'resigned'
        || currentTeacher.code !== teacherCode) {
        throw new HttpsError('aborted', 'Hồ sơ gia sư vừa thay đổi; dữ liệu chưa được cập nhật.')
      }
      if (!onlineClassroomCredentialMutationMatches(classroomAccessSnapshot.data(), {
        state: 'recovering',
        nonce: recoveryNonce,
        fence: recovery.fence,
      })) {
        throw new HttpsError('aborted', 'Phiên khôi phục mật khẩu đã hết hạn hoặc bị thay thế.')
      }
      const currentDecision = decideTeacherLoginRecovery(
        currentRecoveredUser,
        teacherId,
        currentPreviousOwnerSnapshot?.exists === true,
      )
      if (!currentDecision.allowed) {
        throw new HttpsError('aborted', 'Liên kết UID vừa thay đổi; dữ liệu chưa được cập nhật.')
      }

      currentLinkedUsersSnapshot.docs.forEach((snapshot) => {
        if (snapshot.id === recoveredUid) return
        transaction.set(snapshot.ref, {
          role: 'inactive_teacher',
          loginDisabledAt: FieldValue.serverTimestamp(),
          loginDisabledReason: 'replaced_by_account_recovery',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      })

      transaction.set(recoveredUserRef, {
        uid: recoveredUid,
        email: authUser?.email || fallbackEmail,
        username: teacherCode,
        role: 'teacher',
        teacherId,
        createdAt: currentRecoveredUser?.createdAt || FieldValue.serverTimestamp(),
        loginDisabledAt: null,
        loginDisabledReason: '',
        resetPasswordAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      transaction.set(teacherRef, {
        loginAccountUid: recoveredUid,
        loginAccountUpdatedAt: FieldValue.serverTimestamp(),
        onlineClassroomPilotEnabled: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      transaction.set(classroomAccessRef, {
        targetType: 'teacher',
        targetId: teacherId,
        enabled: false,
        generation: recovery.generation,
        reminderGenerationDeliveryEnabled: true,
        credentialHardenedUid: FieldValue.delete(),
        credentialHardenedAt: FieldValue.delete(),
        credentialHardenedBy: FieldValue.delete(),
        credentialRotationState: 'recovery_cooldown',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
        ...(classroomAccessSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true })
      transaction.set(auditRef, {
        adminId: actorUid,
        action: 'RESTORE_TEACHER_LOGIN',
        targetType: 'teacher',
        targetId: teacherId,
        changes: {
          teacherCode,
          recoveredUid,
          previousCanonicalUid: canonicalUid,
          previousRecoveredTeacherId: currentPreviousTeacherId,
          reclaimedOrphan: currentDecision.reclaimsOrphan,
          onlineClassroomPilotDisabled: true,
        },
        createdAt: FieldValue.serverTimestamp(),
      })
    })
  } catch (error) {
    if (createdAuthUser) await authService.updateUser(recoveredUid, { disabled: true }).catch(() => undefined)
    await db.runTransaction(async (transaction) => {
      const accessSnapshot = await transaction.get(classroomAccessRef)
      const access = accessSnapshot.data() || {}
      if (access.credentialRotationNonce !== recoveryNonce
        || access.credentialRotationFence !== recovery.fence
        || access.credentialRotationState !== 'recovering') return
      transaction.set(classroomAccessRef, {
        credentialRotationState: 'recovery_required',
        credentialRotationNonce: FieldValue.delete(),
        credentialRotationLeaseExpiresAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
      }, { merge: true })
    }).catch((cleanupError) => {
      logger.error('Unable to release failed teacher login recovery lease', {
        teacherId,
        recoveredUid,
        recoveryNonce,
        recoveryFence: recovery.fence,
        authPasswordChanged,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    })
    throw error
  }

  logger.info('Teacher login recovered', {
    actorUid,
    teacherId,
    recoveredUid,
    previousCanonicalUid: canonicalUid,
    reclaimedOrphan: initialDecision.reclaimsOrphan,
  })
  return {
    success: true,
    uid: recoveredUid,
    reclaimedOrphan: initialDecision.reclaimsOrphan,
    onlineClassroomPilotDisabled: true,
  }
})

function timestampISO(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null
}

export const getEmailReminderHistory = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại để xem lịch sử email.')

  const userSnapshot = await db.collection('users').doc(uid).get()
  if (userSnapshot.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Chỉ quản trị viên được xem lịch sử email.')
  }

  const requestedLimit = Number(request.data?.limit)
  const historyLimit = Number.isInteger(requestedLimit)
    ? Math.min(200, Math.max(20, requestedLimit))
    : 100
  const deliveriesSnapshot = await db.collection('emailReminderDeliveries')
    .orderBy('updatedAt', 'desc')
    .limit(historyLimit)
    .get()

  const bookingIds = [...new Set(deliveriesSnapshot.docs.flatMap((snapshot) => {
    const data = snapshot.data()
    const ids = Array.isArray(data.bookingIds) ? data.bookingIds : [data.bookingId]
    return ids.filter((value): value is string => typeof value === 'string' && value.length > 0)
  }))]
  const bookingSnapshots = bookingIds.length > 0
    ? await db.getAll(...bookingIds.map((bookingId) => db.collection('bookingRequests').doc(bookingId)))
    : []
  const bookingsById = new Map(bookingSnapshots.map((snapshot) => [snapshot.id, snapshot.data() || {}]))

  return {
    items: deliveriesSnapshot.docs.map((snapshot) => {
      const data = snapshot.data()
      const itemBookingIds = (Array.isArray(data.bookingIds) ? data.bookingIds : [data.bookingId])
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
      const fallbackBookings = itemBookingIds.map((bookingId) => bookingsById.get(bookingId) || {})
      const fallbackBooking = fallbackBookings[0] || {}
      const fallbackTeacherNames = [...new Set(fallbackBookings
        .map((booking) => reminderTeacherName(booking))
        .filter(Boolean))]
      const scheduleTimes = Array.isArray(data.scheduleTimes)
        ? data.scheduleTimes.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : fallbackBookings
          .sort((left, right) => String(left.requestedStart || '').localeCompare(String(right.requestedStart || '')))
          .map((booking) => booking.requestedEnd
            ? `${booking.requestedStart || ''}–${booking.requestedEnd}`
            : String(booking.requestedStart || ''))
          .filter(Boolean)
      return {
        id: snapshot.id,
        status: typeof data.status === 'string' ? data.status : 'unknown',
        reminderType: typeof data.reminderType === 'string' ? data.reminderType : '',
        recipient: typeof data.recipient === 'string' ? data.recipient : '',
        studentId: typeof data.studentId === 'string' ? data.studentId : (fallbackBooking.studentId || ''),
        studentCode: typeof data.studentCode === 'string' ? data.studentCode : (fallbackBooking.studentCode || ''),
        studentName: typeof data.studentName === 'string' ? data.studentName : (fallbackBooking.studentName || ''),
        teacherName: fallbackTeacherNames.join(', ')
          || (typeof data.teacherName === 'string' ? data.teacherName : (fallbackBooking.teacherName || '')),
        subjectName: typeof data.subjectName === 'string' ? data.subjectName : (fallbackBooking.subjectName || ''),
        bookingIds: itemBookingIds,
        bookingCount: itemBookingIds.length,
        scheduleDate: typeof data.scheduleDate === 'string' ? data.scheduleDate : (fallbackBooking.requestedDate || ''),
        scheduleStart: typeof data.scheduleStart === 'string' ? data.scheduleStart : (fallbackBooking.requestedStart || ''),
        scheduleEnd: typeof data.scheduleEnd === 'string' ? data.scheduleEnd : (fallbackBooking.requestedEnd || ''),
        scheduleTimes,
        messageId: typeof data.messageId === 'string' ? data.messageId : '',
        attemptCount: Number(data.attemptCount || 0),
        failureReason: typeof data.failureReason === 'string' ? data.failureReason.slice(0, 300) : '',
        sentAt: timestampISO(data.sentAt),
        failedAt: timestampISO(data.failedAt),
        updatedAt: timestampISO(data.updatedAt),
      }
    }),
  }
})
