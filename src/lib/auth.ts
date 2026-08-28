import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  type UserCredential,
} from 'firebase/auth'
import {
  doc, getDoc, getDocFromServer, collection, query, where, getDocsFromServer,
  updateDoc, runTransaction, serverTimestamp,
  type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { auth, db, secondaryAuth } from './firebase'
import { selectTeacherLoginIdentity } from './teacherLoginIdentity'

const TEACHER_FIXED_PASSWORD = '1234560'

type FirebaseErrorLike = Error & { code?: string }

function toFirebaseError(error: unknown): FirebaseErrorLike {
  return error instanceof Error
    ? error as FirebaseErrorLike
    : new Error(String(error))
}

function errorWithCause(message: string, cause: unknown) {
  const error = new Error(message) as Error & { cause?: unknown }
  error.cause = cause
  return error
}

function teacherUserData(uid: string, email: string, username: string, teacherId: string) {
  return {
    uid,
    email,
    username,
    role: 'teacher' as const,
    teacherId,
  }
}

async function ensureTeacherUserDocument(
  uid: string,
  email: string,
  username: string,
  teacherId: string,
) {
  const userDocRef = doc(db, 'users', uid)
  const userDocSnap = await getDoc(userDocRef)

  if (!userDocSnap.exists()) {
    // Quyền truy cập phải được Admin khởi tạo trước. Không tự cấp role teacher
    // từ màn hình đăng nhập công khai.
    throw new Error('LOGIN_PROFILE_MISSING')
  }

  const userData = userDocSnap.data()
  if (userData.role !== 'teacher') {
    throw new Error('LOGIN_ROLE_LOCKED')
  }

  if (!userData.teacherId) {
    // Liên kết quyền phải do Admin khôi phục. Tự gắn teacherId từ trang đăng nhập
    // công khai có thể chạy song song với đổi nickname và tạo hai UID hoạt động.
    throw new Error('LOGIN_PROFILE_MISSING')
  }

  if (userData.teacherId !== teacherId) {
    throw new Error('LOGIN_TEACHER_MISMATCH')
  }

  // Chỉ đồng bộ metadata không cấp quyền; role và teacherId đã phải khớp sẵn.
  if (
    userData.email !== email
    || userData.username !== username
  ) {
    await updateDoc(userDocRef, {
      ...teacherUserData(uid, email, username, teacherId),
      updatedAt: serverTimestamp(),
    })
  }
}

export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  const userDoc = await getDocFromServer(doc(db, 'users', credential.user.uid))
  if (!userDoc.exists()) {
    await firebaseSignOut(auth)
    throw new Error('Tài khoản chưa được khởi tạo đầy đủ. Vui lòng nhờ Admin tạo lại bằng đúng email và mật khẩu để khôi phục quyền truy cập.')
  }
  const data = userDoc.data()
  // Luồng email quản trị không được nhận role teacher. Mọi gia sư bắt buộc đi
  // qua signInTeacher để kiểm tra trạng thái, UID chuẩn và liên kết hồ sơ.
  const allowedRoles = ['admin', 'student_manager', 'teacher_manager', 'guest'] as const
  const role = data.role
  if (!allowedRoles.includes(role)) {
    await firebaseSignOut(auth)
    throw new Error('Tài khoản không có quyền truy cập')
  }
  return {
    user: credential.user,
    role,
    teacherId: data.teacherId,
    accessScope: role === 'student_manager' && data.accessScope === 'booking_only' ? 'booking_only' as const : null,
  }
}

export async function signInTeacher(teacherCode: string, password: string) {
  if (password.length < 6) throw new Error('Mật khẩu không đúng')

  const exact = teacherCode.trim()
  const capitalized = exact.charAt(0).toUpperCase() + exact.slice(1).toLowerCase()
  const upper = exact.toUpperCase()
  const searchCodes = Array.from(new Set([exact, capitalized, upper]))

  const teacherDocsById = new Map<string, QueryDocumentSnapshot<DocumentData>>()
  for (const c of searchCodes) {
    const q = query(collection(db, 'teachers'), where('code', '==', c))
    const snap = await getDocsFromServer(q)
    snap.docs.forEach(teacherDoc => teacherDocsById.set(teacherDoc.id, teacherDoc))
  }

  if (teacherDocsById.size > 1) {
    throw new Error('Mã gia sư đang liên kết với nhiều hồ sơ. Vui lòng liên hệ Admin để kiểm tra dữ liệu trước khi đăng nhập.')
  }
  const teacherDoc = teacherDocsById.values().next().value || null

  if (!teacherDoc) {
    throw new Error('Mã gia sư không tồn tại')
  }

  const teacherId = teacherDoc.id
  const teacherData = teacherDoc.data()
  if (teacherData.status === 'resigned') {
    throw new Error('Tài khoản gia sư đã nghỉ dạy và bị khóa. Vui lòng liên hệ trung tâm nếu cần hỗ trợ.')
  }
  const matchedCode = teacherData.code
  const fallbackEmail = String(matchedCode).includes('@')
    ? String(matchedCode)
    : `${matchedCode}@edutrackpro.app`
  const canonicalLoginUid = typeof teacherData.loginAccountUid === 'string'
    ? teacherData.loginAccountUid
    : ''

  const userQuery = query(
    collection(db, 'users'),
    where('teacherId', '==', teacherId),
    where('role', '==', 'teacher')
  )
  const userSnapshot = await getDocsFromServer(userQuery)
  const identitySelection = selectTeacherLoginIdentity(
    userSnapshot.docs.map(userDoc => ({
      id: userDoc.id,
      email: userDoc.data().email,
      username: userDoc.data().username,
    })),
    canonicalLoginUid,
    String(matchedCode),
    fallbackEmail,
  )
  if (identitySelection.error === 'canonical_missing') {
    throw new Error('Liên kết tài khoản gia sư chưa đồng bộ. Vui lòng liên hệ Admin để khôi phục đăng nhập.')
  }
  if (identitySelection.error === 'duplicate_current_identity') {
    throw new Error('Hồ sơ gia sư có nhiều tài khoản đăng nhập trùng nhau. Vui lòng liên hệ Admin để khôi phục đăng nhập.')
  }
  if (identitySelection.error === 'ambiguous_identity') {
    throw new Error('Hồ sơ gia sư có nhiều tài khoản đăng nhập chưa xác định được tài khoản chính. Vui lòng liên hệ Admin để khôi phục đăng nhập.')
  }

  const existingUserDoc = identitySelection.identity
    ? userSnapshot.docs.find(userDoc => userDoc.id === identitySelection.identity?.id)
    : undefined

  const storedEmail = existingUserDoc?.data()?.email
  // Khi đã chọn được UID an toàn, thử đúng email đang gắn với UID đó trước.
  // Việc thử fallback trước có thể đăng nhập nhầm một Auth UID cũ cùng hồ sơ.
  const candidateEmails = Array.from(new Set([storedEmail, fallbackEmail].filter(Boolean))) as string[]

  // Chỉ đăng nhập những tài khoản đã được Admin khởi tạo trước.
  for (const email of candidateEmails) {
    let credential: UserCredential
    try {
      credential = await signInWithEmailAndPassword(auth, email, password)
    } catch (error: unknown) {
      const firebaseErr = toFirebaseError(error)
      const code = firebaseErr.code

      if (code === 'auth/user-disabled') {
        throw errorWithCause('Tài khoản gia sư đã bị khóa', error)
      }

      if (code === 'auth/invalid-email') {
        if (email !== fallbackEmail && candidateEmails.length > 1) continue
        throw errorWithCause('Email gia sư không hợp lệ', error)
      }

      // Modern Firebase returns invalid-credential for both user-not-found and
      // wrong-password when email enumeration protection is enabled.
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/wrong-password'
      ) {
        continue
      }

      // Chỉ lỗi credential mới được thử email kế tiếp. Lỗi mạng/hệ thống là lỗi
      // cuối cùng, tránh tạo hoặc chuyển sang một danh tính khác ngoài ý muốn.
      console.error('Firebase auth error:', code, firebaseErr.message)
      throw firebaseErr
    }

    if (existingUserDoc && credential.user.uid !== existingUserDoc.id) {
      await firebaseSignOut(auth)
      throw new Error('Tài khoản xác thực không khớp UID hồ sơ gia sư. Vui lòng liên hệ Admin để khôi phục đăng nhập.')
    }
    if (canonicalLoginUid && credential.user.uid !== canonicalLoginUid) {
      await firebaseSignOut(auth)
      throw new Error('Tài khoản xác thực không phải tài khoản đăng nhập hiện hành của gia sư. Vui lòng liên hệ Admin để khôi phục đăng nhập.')
    }

    try {
      await ensureTeacherUserDocument(credential.user.uid, email, matchedCode, teacherId)
    } catch (error: unknown) {
      const profileError = toFirebaseError(error)
      await firebaseSignOut(auth)
      if (profileError?.message === 'LOGIN_ROLE_LOCKED') {
        throw errorWithCause('Tài khoản gia sư đang bị khóa quyền truy cập. Vui lòng liên hệ trung tâm để Admin bấm "Khôi phục đăng nhập" cho bạn.', error)
      }
      if (profileError?.message === 'LOGIN_TEACHER_MISMATCH') {
        throw errorWithCause('Tài khoản gia sư không khớp hồ sơ. Vui lòng liên hệ Admin để kiểm tra lại.', error)
      }
      if (profileError?.message === 'LOGIN_PROFILE_MISSING') {
        throw errorWithCause('Tài khoản gia sư chưa được khởi tạo đầy đủ. Vui lòng liên hệ Admin và chọn "Khôi phục đăng nhập".', error)
      }
      throw errorWithCause('Không thể đồng bộ quyền truy cập gia sư. Vui lòng kiểm tra kết nối và thử lại.', error)
    }

    return {
      user: credential.user,
      role: 'teacher' as const,
      teacherId,
      accessScope: null,
    }
  }

  throw new Error('Tài khoản gia sư chưa sẵn sàng hoặc mật khẩu không đúng. Vui lòng liên hệ Admin để chọn "Khôi phục đăng nhập".')
}

export async function resetTeacherPassword(teacherId: string) {
  try {
    const userQuery = query(collection(db, 'users'), where('teacherId', '==', teacherId))
    const userSnapshot = await getDocsFromServer(userQuery)

    const teacherRef = doc(db, 'teachers', teacherId)
    const teacherDocSnap = await getDocFromServer(teacherRef)
    if (teacherDocSnap.exists() && teacherDocSnap.data().status === 'resigned') {
      throw new Error('Gia sư đã nghỉ dạy; không thể khôi phục tài khoản khi chưa cấp nickname mới và kích hoạt lại.')
    }
    const teacherData = teacherDocSnap.exists() ? teacherDocSnap.data() : null
    const teacherCode = typeof teacherData?.code === 'string' ? teacherData.code.trim() : ''

    if (!teacherCode) {
      throw new Error('Không tìm thấy thông tin gia sư')
    }
    const fallbackEmail = teacherCode.includes('@')
      ? teacherCode
      : teacherCode.toLowerCase().startsWith('gv')
        ? `${teacherCode.toUpperCase()}@edutrackpro.app`
        : `${teacherCode}@edutrackpro.app`
    const canonicalLoginUid = typeof teacherData?.loginAccountUid === 'string'
      ? teacherData.loginAccountUid
      : ''

    const normalizedTeacherCode = teacherCode.trim().toLowerCase()
    const normalizedFallbackEmail = fallbackEmail.trim().toLowerCase()
    const matchesCurrentTeacherCode = (userDoc: QueryDocumentSnapshot<DocumentData>) => {
      const userData = userDoc.data()
      const email = typeof userData.email === 'string' ? userData.email.trim().toLowerCase() : ''
      const username = typeof userData.username === 'string' ? userData.username.trim().toLowerCase() : ''
      return email === normalizedFallbackEmail || username === normalizedTeacherCode
    }

    const activeUsers = userSnapshot.docs.filter(userDoc => userDoc.data().role === 'teacher')
    const matchingActiveUsers = activeUsers.filter(matchesCurrentTeacherCode)
    const exactEmailActiveUsers = matchingActiveUsers.filter(userDoc => {
      const email = userDoc.data().email
      return typeof email === 'string' && email.trim().toLowerCase() === normalizedFallbackEmail
    })

    // Dữ liệu cũ có thể còn nhiều UID sau khi đổi nickname. Chỉ tự chọn khi có
    // đúng một danh tính hiện hành rõ ràng; trường hợp mơ hồ phải dừng để tránh
    // kích hoạt nhầm tài khoản của gia sư.
    let preferredUserDoc: QueryDocumentSnapshot<DocumentData> | undefined
    const canonicalUserDoc = canonicalLoginUid
      ? userSnapshot.docs.find(userDoc => userDoc.id === canonicalLoginUid)
      : undefined
    if (canonicalUserDoc) {
      preferredUserDoc = canonicalUserDoc
    } else if (exactEmailActiveUsers.length === 1) {
      preferredUserDoc = exactEmailActiveUsers[0]
    } else if (exactEmailActiveUsers.length > 1 || matchingActiveUsers.length > 1) {
      throw new Error('Hồ sơ gia sư đang có nhiều tài khoản đăng nhập trùng nhau. Vui lòng kiểm tra dữ liệu tài khoản trước khi khôi phục.')
    } else if (matchingActiveUsers.length === 1) {
      preferredUserDoc = matchingActiveUsers[0]
    } else {
      const matchingInactiveUsers = userSnapshot.docs.filter(userDoc =>
        userDoc.data().role === 'inactive_teacher' && matchesCurrentTeacherCode(userDoc),
      )
      if (matchingInactiveUsers.length === 1) {
        preferredUserDoc = matchingInactiveUsers[0]
      } else if (matchingInactiveUsers.length > 1 || activeUsers.length > 1) {
        throw new Error('Hồ sơ gia sư đang có nhiều tài khoản đăng nhập không xác định được tài khoản chính. Vui lòng kiểm tra dữ liệu trước khi khôi phục.')
      } else if (activeUsers.length === 1) {
        preferredUserDoc = activeUsers[0]
      }
    }

    const preferredUserData = preferredUserDoc?.data()
    const storedEmail = typeof preferredUserData?.email === 'string' ? preferredUserData.email : ''
    // Ưu tiên địa chỉ được suy ra từ mã gia sư hiện tại. Nếu Auth cũ vẫn dùng
    // email trước khi đổi nickname thì mới thử địa chỉ đang lưu trong hồ sơ.
    const candidateEmails = Array.from(new Set([fallbackEmail, storedEmail].filter(Boolean))) as string[]
    let recoveredUid = ''
    let recoveredEmail = ''

    for (const email of candidateEmails) {
      try {
        const credential = await signInWithEmailAndPassword(secondaryAuth, email, TEACHER_FIXED_PASSWORD)
        recoveredUid = credential.user.uid
        recoveredEmail = email
        break
      } catch (error: unknown) {
        const signInError = toFirebaseError(error)
        if (signInError.code === 'auth/user-disabled') {
          throw errorWithCause('Tài khoản xác thực đang bị khóa trong Firebase Auth', error)
        }
        if (
          signInError.code !== 'auth/user-not-found'
          && signInError.code !== 'auth/invalid-credential'
          && signInError.code !== 'auth/invalid-login-credentials'
          && signInError.code !== 'auth/wrong-password'
        ) {
          throw signInError
        }

        try {
          const created = await createUserWithEmailAndPassword(secondaryAuth, email, TEACHER_FIXED_PASSWORD)
          recoveredUid = created.user.uid
          recoveredEmail = email
          break
        } catch (createUnknown: unknown) {
          const createError = toFirebaseError(createUnknown)
          // Email đã tồn tại nhưng không dùng mật khẩu chuẩn: thử email fallback
          // kế tiếp. Client Firebase không có quyền đổi mật khẩu Auth hiện hữu.
          if (createError.code === 'auth/email-already-in-use') continue
          throw createError
        }
      }
    }

    if (!recoveredUid || !recoveredEmail) {
      throw new Error('Không thể khôi phục tài khoản bằng mật khẩu chuẩn. Cần kiểm tra Firebase Auth bằng quyền quản trị.')
    }

    try {
      // Primary app vẫn giữ phiên Admin; chỉ Admin mới ghi/khôi phục hồ sơ quyền.
      const recoveredUserRef = doc(db, 'users', recoveredUid)
      const recoveredUserSnap = await getDocFromServer(recoveredUserRef)
      const recoveredUser = recoveredUserSnap.exists() ? recoveredUserSnap.data() : null
      if (recoveredUserSnap.exists()) {
        const belongsToAnotherTeacher = recoveredUser?.teacherId
          && recoveredUser.teacherId !== teacherId
        const isUnrelatedRole = recoveredUser?.role !== 'teacher'
          && recoveredUser?.role !== 'inactive_teacher'
        if (belongsToAnotherTeacher || isUnrelatedRole) {
          throw new Error('Tài khoản xác thực đang liên kết với một hồ sơ khác; đã dừng khôi phục để bảo vệ dữ liệu.')
        }
      }

      // Khóa quyền sở hữu UID bằng transaction. Nếu một Admin khác đổi nickname
      // hoặc liên kết UID trong lúc khôi phục, Firestore sẽ chạy lại phần đọc và
      // dừng thay vì để thao tác ghi sau cùng chiếm tài khoản.
      const latestUserSnapshot = await getDocsFromServer(userQuery)
      const linkedUserRefs = latestUserSnapshot.docs
        .filter(userDoc => userDoc.id !== recoveredUid)
        .map(userDoc => userDoc.ref)

      await runTransaction(db, async transaction => {
        const currentTeacherSnap = await transaction.get(teacherRef)

        if (!currentTeacherSnap.exists()
          || currentTeacherSnap.data().status === 'resigned'
          || currentTeacherSnap.data().code !== teacherCode) {
          throw new Error('Hồ sơ gia sư đã thay đổi trong lúc khôi phục. Vui lòng tải lại và thử lại.')
        }

        const currentCanonicalUid = typeof currentTeacherSnap.data().loginAccountUid === 'string'
          ? currentTeacherSnap.data().loginAccountUid
          : ''
        const linkedRefsById = new Map(linkedUserRefs.map(userRef => [userRef.id, userRef]))
        if (currentCanonicalUid && currentCanonicalUid !== recoveredUid) {
          linkedRefsById.set(currentCanonicalUid, doc(db, 'users', currentCanonicalUid))
        }
        const currentLinkedUserRefs = Array.from(linkedRefsById.values())
        const [currentRecoveredSnap, linkedUserSnaps] = await Promise.all([
          transaction.get(recoveredUserRef),
          Promise.all(currentLinkedUserRefs.map(userRef => transaction.get(userRef))),
        ])

        const currentRecoveredUser = currentRecoveredSnap.exists() ? currentRecoveredSnap.data() : null
        const belongsToAnotherTeacher = currentRecoveredUser?.teacherId
          && currentRecoveredUser.teacherId !== teacherId
        const isUnrelatedRole = currentRecoveredUser
          && currentRecoveredUser.role !== 'teacher'
          && currentRecoveredUser.role !== 'inactive_teacher'
        if (belongsToAnotherTeacher || isUnrelatedRole) {
          throw new Error('Tài khoản xác thực vừa được liên kết với một hồ sơ khác; đã dừng khôi phục để bảo vệ dữ liệu.')
        }

        linkedUserSnaps.forEach(linkedUserSnap => {
          if (!linkedUserSnap.exists()) return
          const linkedUser = linkedUserSnap.data()
          const isCurrentCanonical = linkedUserSnap.id === currentCanonicalUid
          const belongsToAnotherTeacher = linkedUser.teacherId
            && linkedUser.teacherId !== teacherId
          const isUnrelatedRole = linkedUser.role !== 'teacher'
            && linkedUser.role !== 'inactive_teacher'
          if (belongsToAnotherTeacher
            || isUnrelatedRole
            || (!linkedUser.teacherId && !isCurrentCanonical)) {
            throw new Error('Dữ liệu tài khoản gia sư đã thay đổi trong lúc khôi phục. Vui lòng thử lại.')
          }
        })

        linkedUserSnaps.forEach(linkedUserSnap => {
          if (!linkedUserSnap.exists()) return
          transaction.set(linkedUserSnap.ref, {
            role: 'inactive_teacher',
            loginDisabledAt: serverTimestamp(),
            loginDisabledReason: 'replaced_by_account_recovery',
            updatedAt: serverTimestamp(),
          }, { merge: true })
        })

        transaction.set(recoveredUserRef, {
          uid: recoveredUid,
          email: recoveredEmail,
          username: teacherCode,
          role: 'teacher',
          teacherId,
          createdAt: currentRecoveredUser?.createdAt || preferredUserData?.createdAt || serverTimestamp(),
          loginDisabledAt: null,
          loginDisabledReason: '',
          resetPasswordAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
        transaction.set(teacherRef, {
          loginAccountUid: recoveredUid,
          loginAccountUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      })
    } finally {
      await secondaryAuth.signOut()
    }

    return { success: true, uid: recoveredUid }
  } catch (error: unknown) {
    const err = toFirebaseError(error)
    if (err.code === 'auth/email-already-in-use') {
      throw errorWithCause('Email này đã tồn tại trong hệ thống', error)
    }
    throw err
  }
}

export async function signOut() {
  await firebaseSignOut(auth)
}
