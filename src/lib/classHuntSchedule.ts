/**
 * Browser mirror of the Class Hunting weekly-slot plan in
 * functions/src/classHunting.ts. It only drives the live preview; the server
 * rebuilds the same sessions and stays authoritative when publishing.
 */
export type ClassHuntSlotDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type ClassHuntTeacherType = 'vn' | 'ph' | 'native'
export type ClassHuntTeacherGender = 'any' | 'female' | 'male'

export interface ClassHuntWeeklySlot {
  day: ClassHuntSlotDay
  start: string
}

export interface ClassHuntTeacherRequirements {
  teacherTypes: ClassHuntTeacherType[]
  gender: ClassHuntTeacherGender
}

export interface ClassHuntPlannedSession {
  date: string
  weekday: ClassHuntSlotDay
  start: string
  end: string
  minutes: number
}

export const CLASS_HUNT_SLOT_MINUTES = 25
export const CLASS_HUNT_MAX_SESSIONS = 120
export const CLASS_HUNT_SESSION_HORIZON_DAYS = 366
export const CLASS_HUNT_DAY_ORDER: ClassHuntSlotDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const CLASS_HUNT_TEACHER_TYPES: ClassHuntTeacherType[] = ['vn', 'ph', 'native']

export const CLASS_HUNT_DAY_LABELS: Record<ClassHuntSlotDay, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
}

export const CLASS_HUNT_TEACHER_TYPE_LABELS: Record<ClassHuntTeacherType, string> = {
  vn: 'Giáo viên Việt Nam',
  ph: 'Giáo viên Philippines',
  native: 'Giáo viên bản ngữ',
}

export const CLASS_HUNT_GENDER_LABELS: Record<ClassHuntTeacherGender, string> = {
  any: 'Không yêu cầu',
  female: 'Giáo viên nữ',
  male: 'Giáo viên nam',
}

export function defaultClassHuntTeacherRequirements(): ClassHuntTeacherRequirements {
  return { teacherTypes: [...CLASS_HUNT_TEACHER_TYPES], gender: 'any' }
}

/** Short Vietnamese summary; empty when the offer has no requirement. */
export function describeClassHuntTeacherRequirements(requirements: ClassHuntTeacherRequirements | undefined): string {
  if (!requirements) return ''
  const parts: string[] = []
  if (requirements.teacherTypes.length > 0 && requirements.teacherTypes.length < CLASS_HUNT_TEACHER_TYPES.length) {
    parts.push(requirements.teacherTypes.map((type) => CLASS_HUNT_TEACHER_TYPE_LABELS[type]).join(' / '))
  }
  if (requirements.gender !== 'any') parts.push(CLASS_HUNT_GENDER_LABELS[requirements.gender])
  return parts.join(' · ')
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function classHuntSlotKey(slot: ClassHuntWeeklySlot): string {
  return `${slot.day}|${slot.start}`
}

export function sortClassHuntWeeklySlots(slots: ClassHuntWeeklySlot[]): ClassHuntWeeklySlot[] {
  return [...slots].sort((left, right) => CLASS_HUNT_DAY_ORDER.indexOf(left.day) - CLASS_HUNT_DAY_ORDER.indexOf(right.day)
    || timeToMinutes(left.start) - timeToMinutes(right.start))
}

/** Grid rows: every 30 minutes, each slot ending before midnight. */
export function classHuntSlotTimes(firstHour = 6, lastStart = '23:30'): string[] {
  const times: string[] = []
  for (let minute = firstHour * 60; minute <= timeToMinutes(lastStart); minute += 30) {
    if (minute + CLASS_HUNT_SLOT_MINUTES <= 24 * 60) times.push(minutesToTime(minute))
  }
  return times
}

function parseDate(dateISO: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null
  const [year, month, day] = dateISO.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function dayOf(date: Date): ClassHuntSlotDay {
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[date.getUTCDay()]
}

export function vietnamNowParts(nowMs: number): { dateISO: string; minuteOfDay: number } {
  const vietnam = new Date(nowMs + 7 * 60 * 60 * 1000)
  return {
    dateISO: formatDate(vietnam),
    minuteOfDay: vietnam.getUTCHours() * 60 + vietnam.getUTCMinutes(),
  }
}

/**
 * Up to `limit` future lessons from the start date. Returns fewer when the
 * one-year horizon runs out, so callers can explain the shortfall.
 */
export function planClassHuntSlotSessions(input: {
  startDate: string
  weeklySlots: ClassHuntWeeklySlot[]
  limit: number
  nowMs: number
}): ClassHuntPlannedSession[] {
  const start = parseDate(input.startDate)
  const limit = Math.max(0, Math.floor(input.limit))
  if (!start || input.weeklySlots.length === 0 || limit === 0) return []
  const now = vietnamNowParts(input.nowMs)
  if (formatDate(start) < now.dateISO) return []
  const slots = sortClassHuntWeeklySlots(input.weeklySlots)
  const sessions: ClassHuntPlannedSession[] = []
  for (let offset = 0; sessions.length < limit && offset <= CLASS_HUNT_SESSION_HORIZON_DAYS; offset += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset))
    const dateISO = formatDate(date)
    const weekday = dayOf(date)
    for (const slot of slots) {
      if (slot.day !== weekday) continue
      const startMinute = timeToMinutes(slot.start)
      if (dateISO === now.dateISO && startMinute <= now.minuteOfDay) continue
      sessions.push({
        date: dateISO,
        weekday,
        start: slot.start,
        end: minutesToTime(startMinute + CLASS_HUNT_SLOT_MINUTES),
        minutes: CLASS_HUNT_SLOT_MINUTES,
      })
      if (sessions.length === limit) break
    }
  }
  return sessions
}
