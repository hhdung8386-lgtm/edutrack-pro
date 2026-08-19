import type { DayOfWeek } from '../types'

export type RecurringScheduleMode = 'all' | 'custom'

export type RecurringSlot = {
  day: DayOfWeek
  dateISO: string
  time: string
}

function parseDateISO(dateISO: string): Date {
  const [year, month, day] = dateISO.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function recurringSessionTarget(
  mode: RecurringScheduleMode,
  requestedSessions: number,
  availableSessions: number,
): number {
  const safeAvailable = Math.max(0, Math.floor(availableSessions))
  if (mode === 'all') return safeAvailable
  return Math.min(safeAvailable, Math.max(0, Math.floor(requestedSessions)))
}

export function estimateRecurringWeeks(sessionCount: number, slotsPerWeek: number): number {
  if (sessionCount <= 0) return 0
  return Math.ceil(sessionCount / Math.max(1, Math.floor(slotsPerWeek)))
}

export function buildFutureRecurringSlots(
  baseSlots: RecurringSlot[],
  maxSessions: number,
  todayISO: string,
  currentTime: string,
): RecurringSlot[] {
  if (baseSlots.length === 0 || maxSessions <= 0) return []

  const uniqueBaseSlots = [...new Map(baseSlots.map((slot) => [`${slot.dateISO}|${slot.time}`, slot])).values()]
    .sort((left, right) => `${left.dateISO}|${left.time}`.localeCompare(`${right.dateISO}|${right.time}`))
  const slots: RecurringSlot[] = []
  let weekIndex = 0

  while (slots.length < maxSessions) {
    for (const baseSlot of uniqueBaseSlots) {
      if (slots.length >= maxSessions) break
      const dateISO = formatDateISO(addDays(parseDateISO(baseSlot.dateISO), weekIndex * 7))
      const isPast = dateISO < todayISO || (dateISO === todayISO && baseSlot.time < currentTime)
      if (!isPast) slots.push({ ...baseSlot, dateISO })
    }
    weekIndex += 1
  }

  return slots
}
