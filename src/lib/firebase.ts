import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const secondaryApp = initializeApp(firebaseConfig, "Secondary")

export const auth = getAuth(app)
export const secondaryAuth = getAuth(secondaryApp)
export const db = getFirestore(app)
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function randomCode(len: number): string {
  let result = ''
  for (let i = 0; i < len; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length))
  }
  return result
}

export function generateStudentCode(): string {
  return 'HS' + randomCode(6)
}

export function generateTeacherCode(): string {
  return 'GV' + randomCode(6)
}

export async function generateUniqueCode(type: 'student' | 'teacher'): Promise<string> {
  const prefix = type === 'student' ? 'HS' : 'GV'
  const fallbackCode = prefix + randomCode(6)
  
  try {
    let attempts = 0
    const maxAttempts = 10

    while (attempts < maxAttempts) {
      const code = prefix + randomCode(6)

      const studentSnap = await getDocs(query(collection(db, 'students'), where('code', '==', code)))
      if (!studentSnap.empty) {
        attempts++
        continue
      }

      const teacherSnap = await getDocs(query(collection(db, 'teachers'), where('code', '==', code)))
      if (!teacherSnap.empty) {
        attempts++
        continue
      }

      return code
    }
  } catch (error) {
    console.warn("Failed to check code uniqueness against Firestore due to permissions, using local fallback code:", error)
  }

  return fallbackCode
}

export function calculateSalary(
  minutes: number,
  pricePerMinute: number,
  level: number
): number {
  return Math.round(minutes * pricePerMinute * level)
}

export default app
