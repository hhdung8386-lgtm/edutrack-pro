import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type SendTeacherScheduleEmailResult =
  | { sent: true; recipient: string; classCount: number }
  | { sent: false; reason: 'no_classes'; recipient: string }

const functions = getFunctions(app, 'asia-southeast1')
const sendCallable = httpsCallable<{ teacherId: string; testRecipient?: string }, SendTeacherScheduleEmailResult>(
  functions,
  'sendTeacherScheduleEmail',
)

/** Gửi ngay lịch dạy 7 ngày tới của gia sư qua email (hoặc gửi thử tới `testRecipient`). */
export async function sendTeacherScheduleEmail(teacherId: string, testRecipient?: string): Promise<SendTeacherScheduleEmailResult> {
  const result = await sendCallable({ teacherId, ...(testRecipient ? { testRecipient } : {}) })
  return result.data
}

export function teacherScheduleEmailErrorMessage(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
  return message && !/^internal$/i.test(message) ? message : 'Không gửi được email. Vui lòng thử lại sau.'
}
