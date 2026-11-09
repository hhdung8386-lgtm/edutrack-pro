import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

interface DeleteStudentSafelyRequest {
  studentId: string
  expectedCode: string
  password: string
}

interface DeleteStudentSafelyResponse {
  backupId: string
  releasedBookingCount: number
}

const functions = getFunctions(app, 'asia-southeast1')

export async function deleteStudentSafely(payload: DeleteStudentSafelyRequest) {
  const callable = httpsCallable<DeleteStudentSafelyRequest, DeleteStudentSafelyResponse>(
    functions,
    'deleteStudentSafely',
  )
  const result = await callable(payload)
  return result.data
}

interface DeleteTeacherSafelyRequest {
  teacherId: string
  expectedName: string
  password: string
}

export async function deleteTeacherSafely(payload: DeleteTeacherSafelyRequest) {
  const callable = httpsCallable<DeleteTeacherSafelyRequest, { backupId: string }>(
    functions,
    'deleteTeacherSafely',
  )
  const result = await callable(payload)
  return result.data
}
