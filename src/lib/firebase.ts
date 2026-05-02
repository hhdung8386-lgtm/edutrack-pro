import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
import { getStorage } from 'firebase/storage'
export const storage = getStorage(app)
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

export function calculateSalary(
  minutes: number,
  pricePerMinute: number,
  level: number
): number {
  return Math.round(minutes * pricePerMinute * level)
}

export default app
