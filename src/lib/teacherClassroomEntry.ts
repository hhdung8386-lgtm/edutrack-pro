import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

/**
 * Gia sư bấm "Vào lớp" → ghi giờ máy chủ lên ca học để chấm công đúng giờ.
 * Gọi kiểu "bắn rồi quên": KHÔNG chặn việc mở phòng học; lỗi mạng chỉ báo nhẹ.
 */
export type TeacherClassroomEntryResult = {
  bookingId: string
  recorded: boolean
  first?: boolean
  reason?: 'TOO_EARLY' | 'CLASS_ENDED' | 'REPEATED_CLICK'
  firstAtMs: number | null
  lateMinutes: number | null
  opensAtMs?: number | null
}

const functions = getFunctions(app, 'asia-southeast1')
const entryCallable = httpsCallable<{ bookingId: string }, TeacherClassroomEntryResult>(
  functions,
  'recordTeacherClassroomEntry',
)

export async function recordTeacherClassroomEntry(bookingId: string): Promise<TeacherClassroomEntryResult> {
  const result = await entryCallable({ bookingId })
  return result.data
}
