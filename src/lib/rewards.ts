import type { Lesson } from '@/types'

export function lessonRewardPoints(lesson: Lesson): number {
  if (lesson.attendanceStatus === 'present' || !lesson.attendanceStatus) {
    return Math.floor((Number(lesson.minutes) || 0) / 25)
  }
  return 0
}

export function rewardMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function selectTopRewardStudents<T extends {
  id: string
  status?: string
  rewardPoints?: number
}>(students: T[], count = 3): T[] {
  return [...students]
    .filter((student) => student.status !== 'reserved' && Number(student.rewardPoints || 0) > 0)
    .sort((left, right) => Number(right.rewardPoints || 0) - Number(left.rewardPoints || 0) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, count))
}
