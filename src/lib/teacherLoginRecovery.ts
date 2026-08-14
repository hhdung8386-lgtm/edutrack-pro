import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type TeacherLoginRecoveryResult = {
  success: true
  uid: string
  reclaimedOrphan: boolean
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
