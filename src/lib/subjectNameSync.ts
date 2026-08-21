import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { buildStudentSubjectNamePatch, buildTeacherSubjectNamesPatch } from '@/lib/subjectNameSyncCore'
import { buildPublicTeacherProfile, publicProfileAsTeacher, type PublicTeacherProfile } from '@/lib/publicTeacherProfile'

const BATCH_SIZE = 400
const TRANSACTION_CONCURRENCY = 8

type ScalarCollectionName = 'topUpPackages' | 'topUpRequests' | 'bookingRequests' | 'lessons' | 'publicLessons'

export interface SubjectNameSyncSummary {
  students: number
  teachers: number
  publicTeacherProfiles: number
  topUpPackages: number
  topUpRequests: number
  bookingRequests: number
  lessons: number
  publicLessons: number
  total: number
}

async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<boolean>) {
  let changed = 0
  for (let offset = 0; offset < items.length; offset += TRANSACTION_CONCURRENCY) {
    const results = await Promise.all(items.slice(offset, offset + TRANSACTION_CONCURRENCY).map(worker))
    changed += results.filter(Boolean).length
  }
  return changed
}

async function updateScalarReferences(collectionName: ScalarCollectionName, subjectId: string, subjectName: string) {
  const snapshot = await getDocs(query(collection(db, collectionName), where('subjectId', '==', subjectId)))
  const references = snapshot.docs
    .filter((document) => document.data().subjectName !== subjectName)
    .map((document) => document.ref)

  for (let offset = 0; offset < references.length; offset += BATCH_SIZE) {
    const batch = writeBatch(db)
    references.slice(offset, offset + BATCH_SIZE).forEach((reference) => batch.update(reference, { subjectName }))
    await batch.commit()
  }
  return references.length
}

async function updateTransactionalReferences(
  references: DocumentReference[],
  buildPatch: (data: Record<string, unknown>) => Record<string, unknown> | null,
) {
  return runWithConcurrency(references, async (reference) => runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists()) return false
    const patch = buildPatch(snapshot.data())
    if (!patch) return false
    transaction.update(reference, patch)
    return true
  }))
}

async function updateStudents(subjectId: string, subjectName: string) {
  // Firestore không query được subjectId bên trong mảng object `subjects`, nên
  // đọc danh sách một lần rồi chỉ mở transaction cho hồ sơ thực sự liên quan.
  const snapshot = await getDocs(collection(db, 'students'))
  const references = snapshot.docs
    .filter((document) => buildStudentSubjectNamePatch(document.data(), subjectId, subjectName))
    .map((document) => document.ref)
  return updateTransactionalReferences(references, (data) => buildStudentSubjectNamePatch(data, subjectId, subjectName))
}

async function updateTeachers(subjectId: string, subjectName: string) {
  const snapshot = await getDocs(query(collection(db, 'teachers'), where('subjectIds', 'array-contains', subjectId)))
  let teachers = 0
  let publicTeacherProfiles = 0

  for (let offset = 0; offset < snapshot.docs.length; offset += TRANSACTION_CONCURRENCY) {
    const results = await Promise.all(snapshot.docs.slice(offset, offset + TRANSACTION_CONCURRENCY).map(async (teacherDocument) => {
      const teacherResult = await runTransaction(db, async (transaction) => {
        const latest = await transaction.get(teacherDocument.ref)
        if (!latest.exists()) return null
        const patch = buildTeacherSubjectNamesPatch(latest.data(), subjectId, subjectName)
        if (patch) transaction.update(teacherDocument.ref, patch)
        const currentNames = Array.isArray(latest.data().subjectNames) ? latest.data().subjectNames.map(String) : []
        return {
          changed: Boolean(patch),
          nextNames: (patch?.subjectNames as string[] | undefined) || currentNames,
        }
      })
      if (!teacherResult) return { teacher: false, publicProfile: false }

      let publicProfile = false
      try {
        // Chỉ profile đang publish mới đọc được theo Rules. Đọc đúng document
        // theo id để không cần query/list, sau đó round-trip qua whitelist nhằm
        // loại field legacy có thể làm Rules từ chối cả một update nhỏ.
        const publicProfileRef = doc(db, 'publicTeacherProfiles', teacherDocument.id)
        const existingPublicProfile = await getDoc(publicProfileRef)
        if (!existingPublicProfile.exists() || existingPublicProfile.data().isPublished !== true) {
          return { teacher: teacherResult.changed, publicProfile: false }
        }

        const publicTeacher = publicProfileAsTeacher(
          teacherDocument.id,
          existingPublicProfile.data() as PublicTeacherProfile,
        )
        publicTeacher.subjectNames = teacherResult.nextNames
        const sanitizedProfile = buildPublicTeacherProfile(publicTeacher)
        await setDoc(publicProfileRef, {
          ...sanitizedProfile,
          publishedAt: existingPublicProfile.data().publishedAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        publicProfile = true
      } catch (error: unknown) {
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
        // Profile ẩn hoặc chưa tồn tại không được Rules cho đọc. Đây không phải
        // lỗi đồng bộ dữ liệu vận hành và không được chặn booking/lesson phía sau.
        if (!code.includes('not-found') && !code.includes('permission-denied')) throw error
      }
      return { teacher: teacherResult.changed, publicProfile }
    }))
    teachers += results.filter((result) => result.teacher).length
    publicTeacherProfiles += results.filter((result) => result.publicProfile).length
  }
  return { teachers, publicTeacherProfiles }
}

export async function syncSubjectNameReferences(subjectId: string, subjectName: string): Promise<SubjectNameSyncSummary> {
  // Thứ tự giảm cửa sổ race: nguồn môn đã được cập nhật trước; gói/yêu cầu nạp
  // cập nhật trước học viên, rồi học viên trước booking, booking trước lesson.
  const topUpPackages = await updateScalarReferences('topUpPackages', subjectId, subjectName)
  const topUpRequests = await updateScalarReferences('topUpRequests', subjectId, subjectName)
  const students = await updateStudents(subjectId, subjectName)
  const { teachers, publicTeacherProfiles } = await updateTeachers(subjectId, subjectName)
  const bookingRequests = await updateScalarReferences('bookingRequests', subjectId, subjectName)
  const lessons = await updateScalarReferences('lessons', subjectId, subjectName)
  const publicLessons = await updateScalarReferences('publicLessons', subjectId, subjectName)

  const summary = {
    students,
    teachers,
    publicTeacherProfiles,
    topUpPackages,
    topUpRequests,
    bookingRequests,
    lessons,
    publicLessons,
  }
  return { ...summary, total: Object.values(summary).reduce((sum, count) => sum + count, 0) }
}
