import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { doc, getDoc, collection, query, where, getDocs, updateDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { auth, db, secondaryAuth } from './firebase'

const TEACHER_FIXED_PASSWORD = '1234560'

export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  const userDoc = await getDoc(doc(db, 'users', credential.user.uid))
  if (!userDoc.exists()) throw new Error('Tài khoản không có quyền truy cập')
  const data = userDoc.data()
  return { user: credential.user, role: data.role as 'admin' | 'teacher' | 'student_manager' | 'teacher_manager' | 'guest', teacherId: data.teacherId }
}

export async function signInTeacher(teacherCode: string, password: string) {
  // Validate fixed password
  if (password !== TEACHER_FIXED_PASSWORD) {
    throw new Error('Mật khẩu không đúng')
  }

  const exact = teacherCode.trim()
  const capitalized = exact.charAt(0).toUpperCase() + exact.slice(1).toLowerCase()
  const upper = exact.toUpperCase()
  const searchCodes = Array.from(new Set([exact, capitalized, upper]))

  let teacherDoc: any = null
  for (const c of searchCodes) {
    const q = query(collection(db, 'teachers'), where('code', '==', c))
    const snap = await getDocs(q)
    if (!snap.empty) {
      teacherDoc = snap.docs[0]
      break
    }
  }

  if (!teacherDoc) {
    throw new Error('Mã giáo viên không tồn tại')
  }

  const teacherId = teacherDoc.id
  const matchedCode = teacherDoc.data().code
  const fallbackEmail = `${matchedCode}@edutrackpro.app`

  const userQuery = query(
    collection(db, 'users'),
    where('teacherId', '==', teacherId),
    where('role', '==', 'teacher')
  )
  const userSnapshot = await getDocs(userQuery)

  const existingUserDoc = userSnapshot.docs[0]
  const storedEmail = existingUserDoc?.data()?.email
  const candidateEmails = Array.from(new Set([storedEmail, fallbackEmail].filter(Boolean))) as string[]

  // Try sign-in with each candidate email; if none work, try to provision an auth account
  for (const email of candidateEmails) {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, TEACHER_FIXED_PASSWORD)
      // Sign-in successful: ensure user doc is in sync with auth uid
      try {
        const userDocRef = doc(db, 'users', credential.user.uid)
        const userDocSnap = await getDoc(userDocRef)
        if (!userDocSnap.exists()) {
          await setDoc(userDocRef, {
            uid: credential.user.uid,
            email,
            username: matchedCode,
            role: 'teacher',
            teacherId,
            createdAt: serverTimestamp(),
          })
        } else if (existingUserDoc && existingUserDoc.data().email !== email) {
          await updateDoc(existingUserDoc.ref, { email })
        }
      } catch (syncErr) {
        console.warn('Failed to sync user doc on sign-in (expected if not admin):', syncErr)
      }
      return {
        user: credential.user,
        role: 'teacher' as const,
        teacherId,
      }
    } catch (firebaseErr: any) {
      const code = firebaseErr.code

      if (code === 'auth/user-disabled') {
        throw new Error('Tài khoản giáo viên đã bị khóa')
      }

      if (code === 'auth/invalid-email') {
        if (email !== fallbackEmail && candidateEmails.length > 1) continue
        throw new Error('Email giáo viên không hợp lệ')
      }

      // Modern Firebase returns 'auth/invalid-credential' for both user-not-found AND wrong-password
      // (when email enumeration protection is enabled). We must disambiguate by trying to create.
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/wrong-password'
      ) {
        // Try to create the auth account (assume user doesn't exist yet)
        try {
          const created = await createUserWithEmailAndPassword(secondaryAuth, email, TEACHER_FIXED_PASSWORD)
          await secondaryAuth.signOut()
          // Delete old user document if it has a different uid/document id to prevent duplicates
          if (existingUserDoc && existingUserDoc.id !== created.user.uid) {
            try {
              await deleteDoc(existingUserDoc.ref)
            } catch (delErr) {
              console.warn('Failed to delete old user doc:', delErr)
            }
          }
          try {
            await setDoc(doc(db, 'users', created.user.uid), {
              uid: created.user.uid,
              email,
              username: matchedCode,
              role: 'teacher',
              teacherId,
              createdAt: serverTimestamp(),
            })
          } catch (syncErr) {
            console.warn('Failed to sync user doc on fallback registration:', syncErr)
          }
          const credential = await signInWithEmailAndPassword(auth, email, TEACHER_FIXED_PASSWORD)
          return {
            user: credential.user,
            role: 'teacher' as const,
            teacherId,
          }
        } catch (createErr: any) {
          // If email already in use, the auth account exists but password is wrong
          if (createErr.code === 'auth/email-already-in-use') {
            // Try the next candidate email if any
            if (email !== fallbackEmail && candidateEmails.length > 1) continue
            throw new Error('Mật khẩu không đúng - Vui lòng liên hệ admin để reset')
          }
          if (createErr.code === 'auth/invalid-email') {
            if (email !== fallbackEmail && candidateEmails.length > 1) continue
            throw new Error('Email giáo viên không hợp lệ')
          }
          if (email !== fallbackEmail && candidateEmails.length > 1) continue
          console.error('Firebase create error:', createErr.code, createErr.message)
          throw new Error('Không thể tạo tài khoản giáo viên: ' + (createErr.code || createErr.message || ''))
        }
      }

      // Unknown error – try next email if any, otherwise rethrow
      console.error('Firebase auth error:', code, firebaseErr.message)
      if (email !== fallbackEmail && candidateEmails.length > 1) continue
      throw firebaseErr
    }
  }

  throw new Error('Không thể đăng nhập giáo viên. Vui lòng liên hệ admin.')
}

export async function resetTeacherPassword(teacherId: string) {
  try {
    const userQuery = query(collection(db, 'users'), where('teacherId', '==', teacherId))
    const userSnapshot = await getDocs(userQuery)

    const teacherDocSnap = await getDoc(doc(db, 'teachers', teacherId))
    const teacherCode = teacherDocSnap.exists() ? teacherDocSnap.data().code : ''
    const fallbackEmail = teacherCode.toLowerCase().startsWith('gv')
      ? `${teacherCode.toUpperCase()}@edutrackpro.app`
      : `${teacherCode}@edutrackpro.app`

    if (!userSnapshot.empty) {
      const userDoc = userSnapshot.docs[0]
      const userData = userDoc.data()
      const email = userData.email || fallbackEmail
      try {
        const credential = await signInWithEmailAndPassword(auth, email, TEACHER_FIXED_PASSWORD)
        return { success: true, uid: credential.user.uid }
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          const created = await createUserWithEmailAndPassword(secondaryAuth, email, TEACHER_FIXED_PASSWORD)
          await secondaryAuth.signOut()
          await setDoc(doc(db, 'users', created.user.uid), {
            uid: created.user.uid,
            email,
            username: userData.username || teacherCode,
            role: 'teacher',
            teacherId,
            createdAt: userData.createdAt || serverTimestamp(),
            resetPasswordAt: serverTimestamp(),
          })
          return { success: true, uid: created.user.uid }
        }
        if (err.code === 'auth/wrong-password') {
          throw new Error('Mật khẩu hiện tại không đúng; không thể reset từ client')
        }
        throw err
      }
    }

    if (!teacherCode) {
      throw new Error('Không tìm thấy thông tin giáo viên')
    }

    const created = await createUserWithEmailAndPassword(secondaryAuth, fallbackEmail, TEACHER_FIXED_PASSWORD)
    await secondaryAuth.signOut()
    await setDoc(doc(db, 'users', created.user.uid), {
      uid: created.user.uid,
      email: fallbackEmail,
      username: teacherCode,
      role: 'teacher',
      teacherId,
      createdAt: serverTimestamp(),
      resetPasswordAt: serverTimestamp(),
    })
    return { success: true, uid: created.user.uid }
  } catch (err: any) {
    if (err.code === 'auth/email-already-in-use') {
      throw new Error('Email này đã tồn tại trong hệ thống')
    }
    throw err
  }
}

export async function signOut() {
  await firebaseSignOut(auth)
}
