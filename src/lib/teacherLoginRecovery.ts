import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type TeacherLoginRecoveryResult = {
  success: true
  uid: string
  reclaimedOrphan: boolean
  onlineClassroomPilotDisabled: boolean
}

const functions = getFunctions(app, 'asia-southeast1')
const recoverTeacherLoginCallable = httpsCallable<
  { teacherId: string },
  TeacherLoginRecoveryResult
>(functions, 'recoverTeacherLogin')

export async function recoverTeacherLoginAccount(teacherId: string): Promise<TeacherLoginRecoveryResult> {
  const response = await recoverTeacherLoginCallable({ teacherId })
  return response.data
}

export type TeacherCodeReferenceSyncResult = {
  teacherCode: string
  updated: Record<string, number>
  failed: number
}

const syncTeacherCodeReferencesCallable = httpsCallable<
  { teacherId: string },
  TeacherCodeReferenceSyncResult
>(functions, 'syncTeacherCodeReferences', { timeout: 300_000 })

/** Đổi teacherCode trong lịch đặt / buổi học cũ theo mã mới của gia sư. */
export async function syncTeacherCodeReferences(teacherId: string): Promise<TeacherCodeReferenceSyncResult> {
  const response = await syncTeacherCodeReferencesCallable({ teacherId })
  return response.data
}
