import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type EmailReminderHistoryItem = {
  id: string
  status: string
  reminderType: string
  recipient: string
  studentId: string
  studentCode: string
  studentName: string
  teacherName: string
  subjectName: string
  bookingIds: string[]
  bookingCount: number
  scheduleDate: string
  scheduleStart: string
  scheduleEnd: string
  messageId: string
  attemptCount: number
  failureReason: string
  sentAt: string | null
  failedAt: string | null
  updatedAt: string | null
}

type EmailReminderHistoryResponse = {
  items: EmailReminderHistoryItem[]
}

const functions = getFunctions(app, 'asia-southeast1')
const getEmailReminderHistory = httpsCallable<{ limit: number }, EmailReminderHistoryResponse>(
  functions,
  'getEmailReminderHistory',
)

export async function loadEmailReminderHistory(limit = 100): Promise<EmailReminderHistoryItem[]> {
  const response = await getEmailReminderHistory({ limit })
  return Array.isArray(response.data.items) ? response.data.items : []
}
