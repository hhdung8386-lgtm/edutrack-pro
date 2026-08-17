import { createHash } from 'node:crypto'
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

initializeApp()

const db = new Firestore()
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
const PROCESSING_LEASE_MS = 10 * 60 * 1000
const resendApiKey = defineSecret('RESEND_API_KEY')
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
}

type ReminderCandidate = {
  booking: Booking
  bookings: Booking[]
  bookingIds: string[]
  recipient: string
  scheduledAt: Date
  deliveryId: string
  legacyDeliveryIds: string[]
  reminder: ReminderSpec
  sessionEnd: string
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
  if (!dateISO || !time || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !/^\d{1,2}:\d{2}$/.test(time)) return null

  const [year, month, day] = dateISO.split('-').map(Number)
  const [rawHour, minute] = time.split(':').map(Number)
  if (!year || !month || !day || !Number.isInteger(rawHour) || !Number.isInteger(minute) || minute < 0 || minute > 59 || rawHour < 0 || rawHour > 24) {
    return null
  }

  const normalizedHour = rawHour === 24 ? 0 : rawHour
  const utcMillis = Date.UTC(year, month - 1, day + (rawHour === 24 ? 1 : 0), normalizedHour - 7, minute)
  return new Date(utcMillis)
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
    if (legacySnapshots.some((snapshot) => snapshot.data()?.status === 'sent')) return false

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

  const dueReminders = groupReminderDays(activeBookings)
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
        booking,
        bookings: day.bookings,
        bookingIds: day.bookings.map((item) => item.id).sort(),
        legacyBookings: day.bookings,
        previousSessionDeliveryIds,
        sessionEnd: day.dayEnd,
        scheduledAt: parseVietnamSchedule(booking.requestedDate, day.dayStart),
      }
    })
    .filter((item): item is typeof item & { scheduledAt: Date } => Boolean(item.scheduledAt))
    .flatMap(({ booking, bookings, bookingIds, legacyBookings, previousSessionDeliveryIds, sessionEnd, scheduledAt }) => REMINDER_SPECS
      .filter((reminder) => {
        const diff = scheduledAt.getTime() - now.getTime()
        return diff >= reminder.offsetMs - reminder.earlyWindowMs && diff <= reminder.offsetMs + reminder.lateWindowMs
      })
      .map((reminder) => ({ booking, bookings, bookingIds, legacyBookings, previousSessionDeliveryIds, sessionEnd, scheduledAt, reminder })))

  const studentRefs = [...new Set(dueReminders.map(({ booking }) => booking.studentId!))]
    .map((studentId) => db.collection('students').doc(studentId))
  const studentSnapshots = studentRefs.length > 0 ? await db.getAll(...studentRefs) : []
  const studentsById = new Map(studentSnapshots.map((snapshot) => [snapshot.id, snapshot.data() as Student]))
  let invalidRecipientCount = 0

  const candidates = dueReminders.flatMap(({ booking, bookings, bookingIds, legacyBookings, previousSessionDeliveryIds, sessionEnd, scheduledAt, reminder }) => {
    const student = studentsById.get(booking.studentId!)
    const recipient = student?.email?.trim().toLowerCase()
    if (!student || !isEmail(recipient)) {
      invalidRecipientCount += 1
      return []
    }

    return [{
      student,
      candidate: {
        booking,
        bookings,
        recipient,
        scheduledAt,
        reminder,
        bookingIds,
        sessionEnd,
        deliveryId: reminderDeliveryId(booking, reminder),
        legacyDeliveryIds: [
          ...legacyBookings.map((legacyBooking) => legacyReminderDeliveryId(legacyBooking, reminder)),
          ...previousSessionDeliveryIds.filter((deliveryId) => deliveryId.endsWith(`_${reminder.type}`)),
        ],
      },
    }]
  })

  if (invalidRecipientCount > 0) {
    logger.warn('Skipped due reminders because student emails are missing or invalid', { count: invalidRecipientCount })
  }

  return candidates
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
      const messageId = await sendWithResend(candidate, student, apiKey)
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

export const recoverTeacherLogin = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const actorUid = request.auth?.uid
  if (!actorUid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại trước khi khôi phục tài khoản.')

  const actorSnapshot = await db.collection('users').doc(actorUid).get()
  const actorRole = actorSnapshot.data()?.role
  if (!['admin', 'student_manager', 'teacher_manager'].includes(actorRole)) {
    throw new HttpsError('permission-denied', 'Tài khoản không có quyền khôi phục đăng nhập gia sư.')
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
      disabled: false,
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

  // Reset and enable the real Auth account first. If the Firestore transaction
  // is interrupted, the strict UID checks still keep this account locked out
  // until a later retry completes the canonical link.
  await authService.updateUser(recoveredUid, {
    password: TEACHER_FIXED_PASSWORD,
    disabled: false,
  })

  const auditRef = db.collection('adminLogs').doc()
  try {
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

      const currentTeacher = currentTeacherSnapshot.data() || {}
      if (!currentTeacherSnapshot.exists
        || currentTeacher.status === 'resigned'
        || currentTeacher.code !== teacherCode) {
        throw new HttpsError('aborted', 'Hồ sơ gia sư vừa thay đổi; dữ liệu chưa được cập nhật.')
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
        updatedAt: FieldValue.serverTimestamp(),
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
        },
        createdAt: FieldValue.serverTimestamp(),
      })
    })
  } catch (error) {
    if (createdAuthUser) await authService.updateUser(recoveredUid, { disabled: true })
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
