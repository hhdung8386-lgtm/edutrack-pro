import { Lesson } from '@/types'

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
