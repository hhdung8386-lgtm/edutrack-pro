import {
  collection,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  where,
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
  const usersSnapshot = await getDocsFromServer(
    query(collection(db, 'users'), where('teacherId', '==', teacherId))
  )
  const teacherRef = doc(db, 'teachers', teacherId)
  const queriedUserRefs = usersSnapshot.docs.map(userDocument => userDocument.ref)
  const logRef = doc(collection(db, 'adminLogs'))

  await runTransaction(db, async transaction => {
    const currentTeacherSnap = await transaction.get(teacherRef)
    if (!currentTeacherSnap.exists()) {
      throw new Error('Không tìm thấy hồ sơ gia sư cần khóa')
    }
    const currentTeacher = currentTeacherSnap.data()
    if (currentTeacher.status === 'resigned') {
      throw new Error('Gia sư này đã được khóa trước đó')
    }
    if (releasedNickname && currentTeacher.code !== releasedNickname) {
      throw new Error('Nickname gia sư đã thay đổi ở nơi khác. Vui lòng tải lại trước khi khóa tài khoản.')
    }

    // UID chuẩn được đọc bên trong transaction để không bỏ sót tài khoản vừa
    // được reset/đổi nickname sau truy vấn users ban đầu.
    const currentCanonicalUid = typeof currentTeacher.loginAccountUid === 'string'
      ? currentTeacher.loginAccountUid
      : ''
    const userRefsById = new Map(queriedUserRefs.map(userRef => [userRef.id, userRef]))
    if (currentCanonicalUid) {
      userRefsById.set(currentCanonicalUid, doc(db, 'users', currentCanonicalUid))
    }
    const currentUserSnaps = await Promise.all(
      Array.from(userRefsById.values()).map(userRef => transaction.get(userRef)),
    )

    currentUserSnaps.forEach(userSnap => {
      if (!userSnap.exists()) return
      const userData = userSnap.data()
      const isCurrentCanonical = userSnap.id === currentCanonicalUid
      const belongsToAnotherTeacher = userData.teacherId
        && userData.teacherId !== teacherId
      const isUnrelatedRole = userData.role !== 'teacher'
        && userData.role !== 'inactive_teacher'
      if (belongsToAnotherTeacher
        || isUnrelatedRole
        || (!userData.teacherId && !isCurrentCanonical)) {
        throw new Error('Liên kết tài khoản đã thay đổi. Vui lòng tải lại trước khi khóa gia sư.')
      }
    })

    transaction.update(teacherRef, {
      status: 'resigned',
      code: '',
      releasedNickname,
      loginAccountUid: '',
      loginAccountUpdatedAt: serverTimestamp(),
      resignedAt: serverTimestamp(),
      resignedBy: adminId || 'admin',
      updatedAt: serverTimestamp(),
    })

    currentUserSnaps.forEach(userSnap => {
      if (!userSnap.exists()) return
      const userData = userSnap.data()
      transaction.set(userSnap.ref, {
        role: 'inactive_teacher',
        username: '',
        releasedUsername: releasedNickname || String(userData.username || ''),
        loginDisabledAt: serverTimestamp(),
        loginDisabledReason: 'teacher_resigned',
        updatedAt: serverTimestamp(),
      }, { merge: true })
    })

    transaction.set(logRef, {
      adminId,
      action: 'RETIRE_TEACHER_ACCOUNT',
      targetType: 'teacher',
      targetId: teacherId,
      changes: {
        teacherName,
        releasedNickname,
        lockedUserDocuments: currentUserSnaps.filter(userSnap => userSnap.exists()).length,
      },
      createdAt: serverTimestamp(),
    })
  })
}
