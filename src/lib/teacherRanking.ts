import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type TeacherRankingRow = {
  teacherId: string
  displayName: string
  sortName: string
  code: string
  photoURL?: string
  country?: string
  minutes: number
  lessons: number
}

type TeacherRankingResponse = {
  rows: TeacherRankingRow[]
  cached: boolean
}

const functions = getFunctions(app, 'asia-southeast1')
const getTeacherRanking = httpsCallable<{ month: string; refresh: boolean }, TeacherRankingResponse>(
  functions,
  'getTeacherRanking',
)

export async function loadTeacherRanking(month: string, refresh = false): Promise<TeacherRankingRow[]> {
  const response = await getTeacherRanking({ month, refresh })
  return Array.isArray(response.data.rows) ? response.data.rows : []
}
