import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

const projectId = process.env.GCLOUD_PROJECT || 'demo-auth-flicker'
const firebaseConfig = {
  apiKey: 'demo-key',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  appId: 'demo-app',
}

const primaryApp = initializeApp(firebaseConfig, `Primary-${Date.now()}`)
const secondaryApp = initializeApp(firebaseConfig, `Secondary-${Date.now()}`)
const primaryAuth = getAuth(primaryApp)
const secondaryAuth = getAuth(secondaryApp)
const primaryDb = initializeFirestore(primaryApp, {})
const secondaryDb = initializeFirestore(secondaryApp, {})

connectAuthEmulator(primaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFirestoreEmulator(primaryDb, '127.0.0.1', 8080)
connectFirestoreEmulator(secondaryDb, '127.0.0.1', 8080)

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const email = `first-login-${suffix}@example.test`
const password = 'emulator-test-password'
const teacherId = `teacher-${suffix}`
const snapshots = []
let unsubscribeAuth = () => {}
let unsubscribeProfile = () => {}

try {
  const created = await createUserWithEmailAndPassword(secondaryAuth, email, password)
  await setDoc(doc(secondaryDb, 'users', created.user.uid), {
    uid: created.user.uid,
    email,
    username: `Teacher-${suffix}`,
    role: 'teacher',
    teacherId,
    createdAt: serverTimestamp(),
  })
  await signOut(secondaryAuth)

  const profileReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for the user profile')), 10_000)

    unsubscribeAuth = onAuthStateChanged(primaryAuth, (user) => {
      if (!user) return
      unsubscribeProfile()
      unsubscribeProfile = onSnapshot(
        doc(primaryDb, 'users', user.uid),
        { includeMetadataChanges: true },
        (snapshot) => {
          snapshots.push({ exists: snapshot.exists(), fromCache: snapshot.metadata.fromCache })
          // Mirrors authStore: cached permissions never authorize a route.
          if (snapshot.metadata.fromCache) return
          if (!snapshot.exists()) return

          const data = snapshot.data()
          if (data.role !== 'teacher' || data.teacherId !== teacherId) {
            clearTimeout(timeout)
            reject(new Error('The authenticated profile is incomplete'))
            return
          }

          clearTimeout(timeout)
          resolve(data)
        },
        (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      )
    }, reject)
  })

  await signInWithEmailAndPassword(primaryAuth, email, password)
  await profileReady

  if (snapshots.some((snapshot) => !snapshot.exists && !snapshot.fromCache)) {
    throw new Error('Server reported a missing user profile during first login')
  }

  console.log('PASS first-login auth/profile synchronization', JSON.stringify(snapshots))
} finally {
  unsubscribeProfile()
  unsubscribeAuth()
  await Promise.allSettled([
    signOut(primaryAuth),
    signOut(secondaryAuth),
  ])
  await Promise.allSettled([
    deleteApp(primaryApp),
    deleteApp(secondaryApp),
  ])
}
