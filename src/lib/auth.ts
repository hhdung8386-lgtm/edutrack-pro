import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  const userDoc = await getDoc(doc(db, 'users', credential.user.uid))
  if (!userDoc.exists()) throw new Error('Tài khoản không có quyền truy cập')
  const data = userDoc.data()
  return { user: credential.user, role: data.role as 'admin' | 'teacher', teacherId: data.teacherId }
}

export async function signOut() {
  await firebaseSignOut(auth)
}
