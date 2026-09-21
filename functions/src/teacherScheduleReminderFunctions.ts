import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { parseVietnamBookingTime } from './onlineClassroom'
import {
  buildTeacherScheduleEmail,
  groupTeacherScheduleDays,
  isActiveTeachingBooking,
  isTeacherReminderEmail,
  splitTeachingBlocks,
  type TeacherScheduleBooking,
  type TeacherScheduleEmailKind,
  type TeacherScheduleTeacher,
} from './teacherScheduleEmail'

const db = new Firestore()
// Cùng secret với email nhắc lịch học viên (firebase-functions gộp param trùng tên).
const resendApiKey = defineSecret('RESEND_API_KEY')
const DELIVERIES = 'teacherEmailReminderDeliveries'
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
const PROCESSING_LEASE_MS = 10 * 60 * 1000
/** Email tổng hợp lịch ngày mai gửi trong khung 19:00–19:29 giờ VN. */
const DIGEST_HOUR = 19
const DIGEST_WINDOW_MINUTES = 30
/** Nhắc trước mỗi cụm dạy ~60 phút; cửa sổ rộng hơn chu kỳ 10 phút để không sót. */
const UPCOMING_OFFSET_MS = 60 * 60 * 1000
const UPCOMING_EARLY_MS = 8 * 60 * 1000
const UPCOMING_LATE_MS = 8 * 60 * 1000
const MANUAL_LOOKAHEAD_DAYS = 7

function vietnamDateISO(date: Date): string {
  return new Date(date.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10)
}

function vietnamClock(date: Date): { hour: number; minute: number } {
  const vietnam = new Date(date.getTime() + VIETNAM_OFFSET_MS)
  return { hour: vietnam.getUTCHours(), minute: vietnam.getUTCMinutes() }
}

function hashKey(parts: string[]): string {
  return parts.join('_').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 400)
}

async function acquire(deliveryId: string, data: Record<string, unknown>, now: Date): Promise<boolean> {
  const ref = db.collection(DELIVERIES).doc(deliveryId)
  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref)
    const existing = current.data() as { status?: string; processingLeaseUntil?: Timestamp } | undefined
    const leaseUntil = existing?.processingLeaseUntil?.toMillis() ?? 0
    if (existing?.status === 'sent' || (existing?.status === 'processing' && leaseUntil > now.getTime())) return false
    transaction.set(ref, {
      ...data,
      status: 'processing',
      processingLeaseUntil: Timestamp.fromMillis(now.getTime() + PROCESSING_LEASE_MS),
      attemptCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      ...(current.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
    return true
  })
}

async function sendEmail(
  apiKey: string,
  recipient: string,
  body: { subject: string; text: string; html: string },
  idempotencyKey?: string,
): Promise<string> {
  const sender = process.env.REMINDER_EMAIL_FROM?.trim()
  if (!sender) throw new Error('REMINDER_EMAIL_FROM is not configured')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: sender, to: [recipient], subject: body.subject, text: body.text, html: body.html }),
  })
  const result = await response.json().catch(() => ({})) as { id?: string; message?: string }
  if (!response.ok || !result.id) throw new Error(`Resend failed: ${result.message || response.status}`)
  return result.id
}

async function deliver(
  apiKey: string,
  deliveryId: string,
  teacherId: string,
  teacher: TeacherScheduleTeacher,
  days: Array<{ date: string; bookings: TeacherScheduleBooking[] }>,
  kind: TeacherScheduleEmailKind,
  now: Date,
): Promise<'sent' | 'skipped' | 'failed'> {
  const recipient = teacher.email!.trim().toLowerCase()
  const bookingIds = days.flatMap((day) => day.bookings.map((booking) => booking.id)).sort()
  const locked = await acquire(deliveryId, {
    kind,
    teacherId,
    teacherCode: teacher.code || '',
    recipient,
    scheduleDates: days.map((day) => day.date),
    bookingIds,
    bookingCount: bookingIds.length,
  }, now)
  if (!locked) return 'skipped'

  const ref = db.collection(DELIVERIES).doc(deliveryId)
  try {
    const messageId = await sendEmail(apiKey, recipient, buildTeacherScheduleEmail(teacher, days, kind), deliveryId)
    await ref.set({ status: 'sent', messageId, sentAt: FieldValue.serverTimestamp(), processingLeaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return 'sent'
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error)
    logger.error('Failed to send teacher schedule reminder', { deliveryId, teacherId, error: failureReason })
    await ref.set({ status: 'failed', failureReason, failedAt: FieldValue.serverTimestamp(), processingLeaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return 'failed'
  }
}

async function loadTeachers(teacherIds: string[]): Promise<Map<string, TeacherScheduleTeacher>> {
  if (teacherIds.length === 0) return new Map()
  const snapshots = await db.getAll(...teacherIds.map((id) => db.collection('teachers').doc(id)))
  return new Map(snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => [snapshot.id, snapshot.data() as TeacherScheduleTeacher]))
}

function canReceive(teacher: TeacherScheduleTeacher | undefined): teacher is TeacherScheduleTeacher & { email: string } {
  return Boolean(teacher && teacher.status !== 'resigned' && isTeacherReminderEmail(teacher.email))
}

export const sendTeacherScheduleReminders = onSchedule({
  region: 'asia-southeast1',
  schedule: 'every 10 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  timeoutSeconds: 180,
  memory: '256MiB',
  secrets: [resendApiKey],
}, async () => {
  if (process.env.TEACHER_REMINDER_EMAILS_ENABLED !== 'true') return
  const apiKey = resendApiKey.value().trim()
  if (!apiKey || apiKey === 'disabled') return

  const now = new Date()
  const clock = vietnamClock(now)
  const digestDue = clock.hour === DIGEST_HOUR && clock.minute < DIGEST_WINDOW_MINUTES
  const tomorrow = vietnamDateISO(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  const upcomingDates = [
    vietnamDateISO(new Date(now.getTime() + UPCOMING_OFFSET_MS - UPCOMING_EARLY_MS)),
    vietnamDateISO(new Date(now.getTime() + UPCOMING_OFFSET_MS + UPCOMING_LATE_MS)),
  ]
  const dates = [...new Set([...upcomingDates, ...(digestDue ? [tomorrow] : [])])]

  const snapshot = await db.collection('bookingRequests')
    .where('status', '==', 'confirmed')
    .where('requestedDate', 'in', dates)
    .get()
  const days = groupTeacherScheduleDays(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TeacherScheduleBooking)))

  type Job = { deliveryId: string; teacherId: string; kind: TeacherScheduleEmailKind; days: Array<{ date: string; bookings: TeacherScheduleBooking[] }> }
  const jobs: Job[] = []
  for (const day of days) {
    if (digestDue && day.date === tomorrow) {
      jobs.push({ deliveryId: hashKey(['digest', day.teacherId, day.date]), teacherId: day.teacherId, kind: 'digest', days: [day] })
    }
    for (const block of splitTeachingBlocks(day.bookings)) {
      const startsAt = parseVietnamBookingTime(day.date, block.start)
      if (!startsAt) continue
      const diff = startsAt.getTime() - now.getTime()
      if (diff < UPCOMING_OFFSET_MS - UPCOMING_EARLY_MS || diff > UPCOMING_OFFSET_MS + UPCOMING_LATE_MS) continue
      jobs.push({
        deliveryId: hashKey(['upcoming', day.teacherId, day.date, block.start.replace(':', '')]),
        teacherId: day.teacherId,
        kind: 'upcoming',
        days: [{ date: day.date, bookings: block.bookings }],
      })
    }
  }
  if (jobs.length === 0) return

  const teachers = await loadTeachers([...new Set(jobs.map((job) => job.teacherId))])
  const counts = { sent: 0, skipped: 0, failed: 0, noEmail: 0 }
  for (const job of jobs) {
    const teacher = teachers.get(job.teacherId)
    if (!canReceive(teacher)) {
      counts.noEmail += 1
      continue
    }
    counts[await deliver(apiKey, job.deliveryId, job.teacherId, teacher, job.days, job.kind, now)] += 1
  }
  logger.info('Teacher schedule reminder worker finished', { jobs: jobs.length, ...counts })
})

/**
 * Admin bấm "Gửi lịch dạy qua email": gửi ngay lịch 7 ngày tới của một gia sư.
 * `testRecipient` cho phép gửi thử bản xem trước tới email của admin.
 */
export const sendTeacherScheduleEmail = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 60,
  memory: '256MiB',
  secrets: [resendApiKey],
}, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại.')
  const actor = await db.collection('users').doc(uid).get()
  const actorRole = actor.data()?.role
  if (actorRole !== 'admin' && actorRole !== 'teacher_manager') {
    throw new HttpsError('permission-denied', 'Chỉ Admin hoặc quản lý gia sư được gửi email lịch dạy.')
  }

  const teacherId = typeof request.data?.teacherId === 'string' ? request.data.teacherId.trim() : ''
  const testRecipient = typeof request.data?.testRecipient === 'string' ? request.data.testRecipient.trim().toLowerCase() : ''
  if (!teacherId || teacherId.includes('/') || teacherId.length > 160) throw new HttpsError('invalid-argument', 'Thiếu mã gia sư.')
  if (testRecipient && !isTeacherReminderEmail(testRecipient)) throw new HttpsError('invalid-argument', 'Email nhận thử không hợp lệ.')

  const apiKey = resendApiKey.value().trim()
  if (!apiKey || apiKey === 'disabled') throw new HttpsError('failed-precondition', 'Máy chủ chưa cấu hình dịch vụ gửi email.')

  const teacherSnapshot = await db.collection('teachers').doc(teacherId).get()
  if (!teacherSnapshot.exists) throw new HttpsError('not-found', 'Không tìm thấy gia sư.')
  const teacher = teacherSnapshot.data() as TeacherScheduleTeacher
  const recipient = testRecipient || teacher.email?.trim().toLowerCase() || ''
  if (!isTeacherReminderEmail(recipient)) {
    throw new HttpsError('failed-precondition', 'Gia sư chưa có email liên hệ hợp lệ. Hãy bấm "Sửa" để thêm email.')
  }

  const now = new Date()
  const today = vietnamDateISO(now)
  const lastDate = vietnamDateISO(new Date(now.getTime() + (MANUAL_LOOKAHEAD_DAYS - 1) * 24 * 60 * 60 * 1000))
  // Chỉ lọc theo teacherId (index 1 trường) giống trang Lịch dạy, rồi lọc ngày trong bộ nhớ.
  const snapshot = await db.collection('bookingRequests').where('teacherId', '==', teacherId).get()
  const upcoming = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as TeacherScheduleBooking))
    .filter(isActiveTeachingBooking)
    .filter((booking) => booking.requestedDate! >= today && booking.requestedDate! <= lastDate)
    .filter((booking) => {
      const startsAt = parseVietnamBookingTime(booking.requestedDate, booking.requestedStart)
      return !startsAt || startsAt.getTime() > now.getTime()
    })
  const days = groupTeacherScheduleDays(upcoming).map(({ date, bookings }) => ({ date, bookings }))
  if (days.length === 0) {
    return { sent: false, reason: 'no_classes', recipient }
  }

  const deliveryRef = db.collection(DELIVERIES).doc()
  const bookingIds = upcoming.map((booking) => booking.id).sort()
  try {
    const messageId = await sendEmail(apiKey, recipient, buildTeacherScheduleEmail(teacher, days, 'manual'))
    await deliveryRef.set({
      kind: 'manual', status: 'sent', teacherId, teacherCode: teacher.code || '', recipient,
      test: Boolean(testRecipient), requestedBy: uid, bookingIds, bookingCount: bookingIds.length,
      scheduleDates: days.map((day) => day.date), messageId,
      sentAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
    })
    return { sent: true, recipient, classCount: bookingIds.length }
  } catch (error) {
    logger.error('Manual teacher schedule email failed', { teacherId, error: error instanceof Error ? error.message : String(error) })
    throw new HttpsError('internal', 'Gửi email thất bại. Vui lòng thử lại sau.')
  }
})
