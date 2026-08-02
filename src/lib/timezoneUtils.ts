import type { DayAvailability, DayOfWeek, TimeRange } from '@/types'

export const DAYS_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const MINUTES_PER_DAY = 24 * 60
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY
const MAX_UI_CLOCK_HOUR = 25
const MAX_RANGE_DURATION = (MAX_UI_CLOCK_HOUR + 1) * 60 - 1
// Carry only the tail needed by a 23:30-00:20 class. Exposing 24:00/24:30 in
// the previous day would alias 00:00/00:30 in the next day and could let the
// same physical time be booked twice under two requestedDate values.
const MAX_CROSS_DAY_EXTENSION_MINUTES = 20

function parseTimeMinutes(time: unknown, maxHour = MAX_UI_CLOCK_HOUR): number | null {
  if (typeof time !== 'string') return null

  const match = /^(\d{1,2}):([0-5]\d)$/.exec(time)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || hours < 0 || hours > maxHour) return null

  return hours * 60 + minutes
}

function timeToMinutes(time: string): number {
  return parseTimeMinutes(time) ?? Number.NaN
}

function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function normalizedTeacherOffset(teacherOffset: number): number {
  return Number.isFinite(teacherOffset) ? teacherOffset : 7
}

function cloneSlots(slots: Record<DayOfWeek, DayAvailability>): Record<DayOfWeek, DayAvailability> {
  const res = {} as Record<DayOfWeek, DayAvailability>
  for (const k of DAYS_ORDER) {
    const sourceDay = slots?.[k]
    const sourceRanges = Array.isArray(sourceDay?.timeRanges) ? sourceDay.timeRanges : []
    res[k] = {
      available: sourceDay?.available ?? false,
      timeRanges: sourceRanges.map((r) => ({ ...r })),
    }
  }
  return res
}

function emptySlots(): Record<DayOfWeek, DayAvailability> {
  const EMPTY_DAY: DayAvailability = { available: false, timeRanges: [] }
  return {
    mon: { ...EMPTY_DAY, timeRanges: [] },
    tue: { ...EMPTY_DAY, timeRanges: [] },
    wed: { ...EMPTY_DAY, timeRanges: [] },
    thu: { ...EMPTY_DAY, timeRanges: [] },
    fri: { ...EMPTY_DAY, timeRanges: [] },
    sat: { ...EMPTY_DAY, timeRanges: [] },
    sun: { ...EMPTY_DAY, timeRanges: [] },
  }
}

// Convert database slot (Vietnam Time) to teacher local slot
export function convertVnSlotToTeacher(vnDay: DayOfWeek, vnTime: string, teacherOffset: number): { day: DayOfWeek, time: string } {
  const diff = teacherOffset - 7 // offset difference (in hours)
  const vnStartMins = timeToMinutes(vnTime)
  
  let targetMins = vnStartMins + diff * 60
  let targetDayIdx = DAYS_ORDER.indexOf(vnDay)
  
  if (targetMins < 0) {
    targetMins += 1440
    targetDayIdx = (targetDayIdx - 1 + 7) % 7
  } else if (targetMins >= 1440) {
    targetMins -= 1440
    targetDayIdx = (targetDayIdx + 1) % 7
  }
  
  return {
    day: DAYS_ORDER[targetDayIdx],
    time: minutesToTime(targetMins)
  }
}

// Convert teacher local slot to database slot (Vietnam Time)
export function convertTeacherSlotToVn(tDay: DayOfWeek, tTime: string, teacherOffset: number): { day: DayOfWeek, time: string } {
  const diff = teacherOffset - 7 // offset difference
  const tStartMins = timeToMinutes(tTime)
  
  let targetMins = tStartMins - diff * 60
  let targetDayIdx = DAYS_ORDER.indexOf(tDay)
  
  if (targetMins < 0) {
    targetMins += 1440
    targetDayIdx = (targetDayIdx - 1 + 7) % 7
  } else if (targetMins >= 1440) {
    targetMins -= 1440
    targetDayIdx = (targetDayIdx + 1) % 7
  }
  
  return {
    day: DAYS_ORDER[targetDayIdx],
    time: minutesToTime(targetMins)
  }
}

// Convert a specific date & time between Vietnam (GMT+7) and teacher local timezone
export function convertVnDateTimeToTeacher(dateISO: string, timeStr: string, teacherOffset: number): { dateISO: string, timeStr: string } {
  const shiftMinutes = Math.round((normalizedTeacherOffset(teacherOffset) - 7) * 60)
  if (shiftMinutes === 0) return { dateISO, timeStr }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO)
  const sourceTime = parseTimeMinutes(timeStr, MAX_UI_CLOCK_HOUR)
  if (!dateMatch || sourceTime === null) return { dateISO, timeStr }

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const sourceDateMs = Date.UTC(year, month - 1, day)
  const sourceDate = new Date(sourceDateMs)
  if (
    sourceDate.getUTCFullYear() !== year
    || sourceDate.getUTCMonth() !== month - 1
    || sourceDate.getUTCDate() !== day
  ) {
    return { dateISO, timeStr }
  }

  // Use UTC arithmetic on this fixed-offset wall-clock value. Local Date /
  // setHours depends on the browser timezone and truncates fractional offsets.
  const targetDate = new Date(sourceDateMs + (sourceTime + shiftMinutes) * 60_000)
  const targetYear = targetDate.getUTCFullYear()
  const targetMonth = String(targetDate.getUTCMonth() + 1).padStart(2, '0')
  const targetDay = String(targetDate.getUTCDate()).padStart(2, '0')
  const targetTime = `${String(targetDate.getUTCHours()).padStart(2, '0')}:${String(targetDate.getUTCMinutes()).padStart(2, '0')}`
  
  return {
    dateISO: `${targetYear}-${targetMonth}-${targetDay}`,
    timeStr: targetTime
  }
}

export function mergeTimeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
  const merged: TimeRange[] = []
  
  let current = { ...sorted[0] }
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]
    const currentEndMins = timeToMinutes(current.end)
    const nextStartMins = timeToMinutes(next.start)
    
    if (nextStartMins <= currentEndMins) {
      const nextEndMins = timeToMinutes(next.end)
      if (nextEndMins > currentEndMins) {
        current = { ...current, end: next.end }
      }
    } else {
      merged.push(current)
      current = next
    }
  }
  merged.push(current)
  return merged
}

function rangeDurationMinutes(range: unknown): number | null {
  if (!range || typeof range !== 'object') return null

  const candidate = range as Partial<TimeRange>
  const start = parseTimeMinutes(candidate.start, MAX_UI_CLOCK_HOUR)
  const end = parseTimeMinutes(candidate.end, MAX_UI_CLOCK_HOUR)
  if (start === null || end === null) return null

  let duration = end - start
  // Legacy ranges may encode a midnight crossing as 23:30-00:20. The current
  // UI also supports extended clock values such as 24:20, which already yield
  // the correct positive duration and must be preserved.
  if (duration < 0) duration += MINUTES_PER_DAY

  // Equal endpoints are treated as an empty range, not an ambiguous full day.
  if (duration <= 0 || duration > MAX_RANGE_DURATION) return null
  return duration
}

function translateSlotRanges(
  source: Record<DayOfWeek, DayAvailability>,
  shiftMinutes: number,
): Record<DayOfWeek, DayAvailability> {
  if (shiftMinutes === 0) return cloneSlots(source)

  const sourceCoverage = new Uint8Array(MINUTES_PER_WEEK)

  DAYS_ORDER.forEach((sourceDay, sourceDayIndex) => {
    const sourceRanges = source?.[sourceDay]?.timeRanges
    const ranges: unknown[] = Array.isArray(sourceRanges) ? sourceRanges : []

    ranges.forEach((range) => {
      if (!range || typeof range !== 'object') return
      const sourceStart = parseTimeMinutes((range as Partial<TimeRange>).start, MAX_UI_CLOCK_HOUR)
      const duration = rangeDurationMinutes(range)
      if (sourceStart === null || duration === null) return

      const absoluteStart = sourceDayIndex * MINUTES_PER_DAY + sourceStart
      for (let minute = 0; minute < duration; minute++) {
        sourceCoverage[modulo(absoluteStart + minute, MINUTES_PER_WEEK)] = 1
      }
    })
  })

  const shiftedCoverage = new Uint8Array(MINUTES_PER_WEEK)
  for (let minute = 0; minute < MINUTES_PER_WEEK; minute++) {
    if (sourceCoverage[minute]) {
      shiftedCoverage[modulo(minute + shiftMinutes, MINUTES_PER_WEEK)] = 1
    }
  }

  const target = emptySlots()
  DAYS_ORDER.forEach((day, dayIndex) => {
    const dayStart = dayIndex * MINUTES_PER_DAY
    const timeRanges: TimeRange[] = []
    let cursor = 0

    while (cursor < MINUTES_PER_DAY) {
      if (!shiftedCoverage[dayStart + cursor]) {
        cursor++
        continue
      }

      const rangeStart = cursor
      while (cursor < MINUTES_PER_DAY && shiftedCoverage[dayStart + cursor]) cursor++
      let rangeEnd = cursor

      if (rangeEnd === MINUTES_PER_DAY) {
        let extension = 0
        while (
          extension < MAX_CROSS_DAY_EXTENSION_MINUTES
          && shiftedCoverage[modulo(dayStart + MINUTES_PER_DAY + extension, MINUTES_PER_WEEK)]
        ) {
          extension++
        }
        rangeEnd += extension
      }

      timeRanges.push({
        start: minutesToTime(rangeStart),
        end: minutesToTime(rangeEnd),
      })
    }

    target[day] = {
      available: timeRanges.length > 0,
      timeRanges,
    }
  })

  return target
}

export function translateVnSlotsToTeacher(vnSlots: Record<DayOfWeek, DayAvailability>, teacherOffset: number): Record<DayOfWeek, DayAvailability> {
  const shiftMinutes = Math.round((normalizedTeacherOffset(teacherOffset) - 7) * 60)
  return translateSlotRanges(vnSlots, shiftMinutes)
}

export function translateTeacherSlotsToVn(tSlots: Record<DayOfWeek, DayAvailability>, teacherOffset: number): Record<DayOfWeek, DayAvailability> {
  const shiftMinutes = Math.round((7 - normalizedTeacherOffset(teacherOffset)) * 60)
  return translateSlotRanges(tSlots, shiftMinutes)
}
