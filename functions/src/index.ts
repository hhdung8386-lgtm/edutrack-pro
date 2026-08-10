import { initializeApp } from 'firebase-admin/app'
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'

initializeApp()

const db = new Firestore()
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
const PROCESSING_LEASE_MS = 10 * 60 * 1000

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

type Booking = {
  id: string
  status?: string
  lessonId?: string
  studentId?: string
  studentName?: string
  teacherName?: string
  subjectName?: string
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  classroomURL?: string
}

type Student = {
  name?: string
  email?: string
}

type ReminderCandidate = {
  booking: Booking
  recipient: string
  scheduledAt: Date
  deliveryId: string
  reminder: ReminderSpec
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character] ?? character))
}

function formatVietnamSchedule(dateISO: string, time: string): string {
  const [year, month, day] = dateISO.split('-')
  return `${day}/${month}/${year} lúc ${time}`
}

function reminderDeliveryId(booking: Booking, reminder: ReminderSpec): string {
  return `${booking.id}_${reminder.type}_${booking.requestedDate}_${booking.requestedStart?.replace(':', '')}`
}

function emailContent(booking: Booking, student: Student, reminder: ReminderSpec) {
  const learnerName = escapeHtml(student.name || booking.studentName || 'Quý học viên')
  const plainSubject = booking.subjectName || 'buổi học tiếng Anh'
  const subjectName = escapeHtml(plainSubject)
  const teacherName = escapeHtml(booking.teacherName || 'gia sư')
  const time = formatVietnamSchedule(booking.requestedDate || '', booking.requestedStart || '')
  const classroom = booking.classroomURL?.trim()
  const classroomBlock = classroom
    ? `<p style="margin:20px 0"><a href="${escapeHtml(classroom)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 16px;border-radius:8px;text-decoration:none;font-weight:700">Vào phòng học</a></p>`
    : ''

  return {
    subject: `Nhắc lịch học ${reminder.label}: ${plainSubject}`,
    html: `<!doctype html><html lang="vi"><body style="margin:0;background:#f8fafc;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px"><h1 style="font-size:22px;margin:0 0 16px">Nhắc lịch học 123English</h1><p>Chào ${learnerName},</p><p>123English nhắc bạn có buổi <strong>${subjectName}</strong> cùng <strong>${teacherName}</strong> vào <strong>${time}</strong> (${reminder.label}).</p>${classroomBlock}<p style="color:#475569">Nếu lịch học đã được thay đổi, vui lòng liên hệ trung tâm để được hỗ trợ.</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:12px;color:#64748b">Email nhắc lịch tự động từ 123English.</p></main></body></html>`,
  }
}

async function acquireDelivery(candidate: ReminderCandidate, now: Date): Promise<boolean> {
  const ref = db.collection('emailReminderDeliveries').doc(candidate.deliveryId)
  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref)
    const existing = current.data() as { status?: string; processingLeaseUntil?: Timestamp } | undefined
    const leaseUntil = existing?.processingLeaseUntil?.toMillis() ?? 0

    if (existing?.status === 'sent' || (existing?.status === 'processing' && leaseUntil > now.getTime())) return false

    const update = {
      reminderType: candidate.reminder.type,
      bookingId: candidate.booking.id,
      scheduleDate: candidate.booking.requestedDate,
      scheduleStart: candidate.booking.requestedStart,
      status: 'processing',
      recipient: candidate.recipient,
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

  const body = emailContent(candidate.booking, student, candidate.reminder)
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

  const dueBookings = bookingsSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Booking))
    .filter((booking) => !booking.lessonId && booking.studentId)
    .map((booking) => ({ booking, scheduledAt: parseVietnamSchedule(booking.requestedDate, booking.requestedStart) }))
    .filter((item): item is { booking: Booking; scheduledAt: Date } => Boolean(item.scheduledAt))

  const studentRefs = [...new Set(dueBookings.map(({ booking }) => booking.studentId!))]
    .map((studentId) => db.collection('students').doc(studentId))
  const studentSnapshots = studentRefs.length > 0 ? await db.getAll(...studentRefs) : []
  const studentsById = new Map(studentSnapshots.map((snapshot) => [snapshot.id, snapshot.data() as Student]))

  return dueBookings.flatMap(({ booking, scheduledAt }) => {
    const student = studentsById.get(booking.studentId!)
    const recipient = student?.email?.trim().toLowerCase()
    if (!student || !isEmail(recipient)) {
      logger.warn('Skipping reminder because the student email is missing or invalid', { bookingId: booking.id, studentId: booking.studentId })
      return []
    }

    return REMINDER_SPECS
      .filter((reminder) => {
        const diff = scheduledAt.getTime() - now.getTime()
        return diff >= reminder.offsetMs - reminder.earlyWindowMs && diff <= reminder.offsetMs + reminder.lateWindowMs
      })
      .map((reminder) => ({
        student,
        candidate: {
          booking,
          recipient,
          scheduledAt,
          reminder,
          deliveryId: reminderDeliveryId(booking, reminder),
        },
      }))
  })
}

export const sendClassReminders = onSchedule({
  region: 'asia-southeast1',
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  timeoutSeconds: 180,
  memory: '256MiB',
}, async () => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const enabled = process.env.REMINDER_EMAILS_ENABLED === 'true'
  if (!enabled || !apiKey) return

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
