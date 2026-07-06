import { DayAvailability, DayOfWeek, TimeRange } from '@/types'

export const DAYS_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function timeToMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function rangeCovers(range: TimeRange, start: number, end: number): boolean {
  return timeToMinutes(range.start) <= start && timeToMinutes(range.end) >= end
}

function cloneSlots(slots: Record<DayOfWeek, DayAvailability>): Record<DayOfWeek, DayAvailability> {
  const res = {} as Record<DayOfWeek, DayAvailability>
  for (const k of DAYS_ORDER) {
    res[k] = {
      available: slots[k].available,
      timeRanges: slots[k].timeRanges.map((r) => ({ ...r })),
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
  const diff = teacherOffset - 7
  if (diff === 0) return { dateISO, timeStr }
  
  const [year, month, day] = dateISO.split('-').map(Number)
  const [hours, minutes] = timeStr.split(':').map(Number)
  
  const date = new Date(year, month - 1, day, hours, minutes)
  date.setHours(date.getHours() + diff)
  
  const targetYear = date.getFullYear()
  const targetMonth = String(date.getMonth() + 1).padStart(2, '0')
  const targetDay = String(date.getDate()).padStart(2, '0')
  const targetTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  
  return {
    dateISO: `${targetYear}-${targetMonth}-${targetDay}`,
    timeStr: targetTime
  }
}

export function mergeTimeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
  const merged: TimeRange[] = []
  
  let current = sorted[0]
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

export function translateVnSlotsToTeacher(vnSlots: Record<DayOfWeek, DayAvailability>, teacherOffset: number): Record<DayOfWeek, DayAvailability> {
  const diff = teacherOffset - 7
  if (diff === 0) return cloneSlots(vnSlots)
  
  const target = emptySlots()
  
  for (const day of DAYS_ORDER) {
    const ranges = vnSlots[day].timeRanges
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const cellStart = h * 60 + m
        const cellEnd = cellStart + 30
        
        const isAvail = ranges.some(r => rangeCovers(r, cellStart, cellEnd))
        if (isAvail) {
          const projected = convertVnSlotToTeacher(day, timeStr, teacherOffset)
          const projStartMins = timeToMinutes(projected.time)
          const projEndMins = projStartMins + 30
          
          target[projected.day].available = true
          target[projected.day].timeRanges.push({ start: projected.time, end: minutesToTime(projEndMins) })
        }
      }
    }
  }
  
  for (const day of DAYS_ORDER) {
    target[day].timeRanges = mergeTimeRanges(target[day].timeRanges)
  }
  
  return target
}

export function translateTeacherSlotsToVn(tSlots: Record<DayOfWeek, DayAvailability>, teacherOffset: number): Record<DayOfWeek, DayAvailability> {
  const diff = teacherOffset - 7
  if (diff === 0) return cloneSlots(tSlots)
  
  const target = emptySlots()
  
  for (const day of DAYS_ORDER) {
    const ranges = tSlots[day].timeRanges
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const cellStart = h * 60 + m
        const cellEnd = cellStart + 30
        
        const isAvail = ranges.some(r => rangeCovers(r, cellStart, cellEnd))
        if (isAvail) {
          const projected = convertTeacherSlotToVn(day, timeStr, teacherOffset)
          const projStartMins = timeToMinutes(projected.time)
          const projEndMins = projStartMins + 30
          
          target[projected.day].available = true
          target[projected.day].timeRanges.push({ start: projected.time, end: minutesToTime(projEndMins) })
        }
      }
    }
  }
  
  for (const day of DAYS_ORDER) {
    target[day].timeRanges = mergeTimeRanges(target[day].timeRanges)
  }
  
  return target
}
