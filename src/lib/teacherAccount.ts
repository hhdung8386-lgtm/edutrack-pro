import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

interface RetireTeacherAccountInput {
  teacherId: string
  teacherName: string
  nickname: string
  adminId?: string
}

/**
 * Khóa quyền gia sư nhưng giữ nguyên hồ sơ, buổi học và dữ liệu đối soát.
 * Nickname được chuyển sang releasedNickname rồi xóa khỏi trường code để có thể cấp lại.
 */
export async function retireTeacherAccount({
  teacherId,
  teacherName,
  nickname,
  adminId = '',
}: RetireTeacherAccountInput) {
  const releasedNickname = nickname.trim()
  const usersSnapshot = await getDocs(
    query(collection(db, 'users'), where('teacherId', '==', teacherId))
  )

  const batch = writeBatch(db)
  batch.update(doc(db, 'teachers', teacherId), {
    status: 'resigned',
    code: '',
    releasedNickname,
    resignedAt: serverTimestamp(),
    resignedBy: adminId || 'admin',
    updatedAt: serverTimestamp(),
  })

  usersSnapshot.docs.forEach((userDocument) => {
    const userData = userDocument.data()
    batch.update(userDocument.ref, {
      role: 'inactive_teacher',
      username: '',
      releasedUsername: releasedNickname || String(userData.username || ''),
      loginDisabledAt: serverTimestamp(),
      loginDisabledReason: 'teacher_resigned',
      updatedAt: serverTimestamp(),
    })
  })

  const logRef = doc(collection(db, 'adminLogs'))
  batch.set(logRef, {
    adminId,
    action: 'RETIRE_TEACHER_ACCOUNT',
    targetType: 'teacher',
    targetId: teacherId,
    changes: {
      teacherName,
      releasedNickname,
      lockedUserDocuments: usersSnapshot.size,
    },
    createdAt: serverTimestamp(),
  })

  await batch.commit()
}
