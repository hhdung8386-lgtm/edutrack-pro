import { getFunctions, httpsCallable } from 'firebase/functions'
import type { DayOfWeek } from '@/types'
import app from '@/lib/firebase'

/**
 * CLASS HUNTING only talks to callable Functions. The browser must never read
 * or write the raw hunt documents because an open offer contains student and
 * scheduling data that is not appropriate for every teacher.
 */

export type ClassHuntStatus = 'open' | 'claimed' | 'cancelled' | 'expired'
export type ClassHuntMinutes = 25 | 50 | 75 | 100

/** Immutable teacher-pay snapshot supplied only by the Class Hunting backend. */
export interface ClassHuntCompensation {
  version: 1
  ratePerMinute: number
  currency: 'VND'
  formula: 'flat_per_minute'
}

export interface ClassHuntStudent {
  id?: string
  code: string
  name: string
  status?: string
  learningScheduleType?: string
  deliveryMode?: string
  eligibleForHunt?: boolean
}

export interface ClassHuntSubject {
  id: string
  name: string
  remainingPoints?: number
  remainingSessions?: number
  minutesPerSession?: number
  eligibleForHunt?: boolean
}

export interface ClassHuntSlot {
  date: string
  weekday: DayOfWeek
  start: string
  end: string
  minutes: ClassHuntMinutes
}

export interface ClassHuntTeacherMatch {
  id: string
  code?: string
  name: string
  photoURL?: string
  matchedSlots?: number
  availabilitySummary?: string
}

export interface ClassHuntClaimedTeacher {
  id: string
  code?: string
  name: string
  photoURL?: string
}

export interface ClassHunt {
  id: string
  status: ClassHuntStatus
  subject: ClassHuntSubject
  slots: ClassHuntSlot[]
  minutes: ClassHuntMinutes
  sessionCount: number
  createdAt?: string
  expiresAt?: string
  cancelledAt?: string
  claimedAt?: string
  student?: ClassHuntStudent
  eligibleTeacherCount?: number
  eligibleTeachers?: ClassHuntTeacherMatch[]
  claimedTeacher?: ClassHuntClaimedTeacher
  bookingIds?: string[]
  classHuntCompensation?: ClassHuntCompensation
}

/** The teacher endpoint deliberately does not include a student object. */
export type TeacherClassHunt = Omit<ClassHunt, 'student' | 'eligibleTeachers'>

export interface ClassHuntLookupInput {
  studentCode: string
}

export interface ClassHuntDraftInput extends ClassHuntLookupInput {
  /** Exact document selected by the preceding server lookup. */
  studentId: string
  subjectId: string
  startDate: string
  weekdays: DayOfWeek[]
  startTime: string
  minutes: ClassHuntMinutes
  sessionCount: number
  /** Positive whole-VND rate. New UI always sends this; legacy stored hunts
   * without a snapshot stay readable and claimable. */
  compensationRatePerMinute: number
}

export interface ClassHuntPreview {
  student?: ClassHuntStudent
  subjects: ClassHuntSubject[]
  subject?: ClassHuntSubject
  slots: ClassHuntSlot[]
  eligibleTeachers: ClassHuntTeacherMatch[]
  eligibleTeacherCount?: number
  warnings?: string[]
  classHuntCompensation?: ClassHuntCompensation
}

export interface ClaimClassHuntResult {
  outcome?: 'claimed' | 'taken'
  status?: 'claimed' | 'taken'
  hunt?: TeacherClassHunt
  bookingIds?: string[]
}

export interface ClassHuntPublishInput extends ClassHuntDraftInput {
  /** Idempotency key generated once for one logical publish action. */
  clientRequestId: string
}

type UnknownRecord = Record<string, unknown>

const functions = getFunctions(app, 'asia-southeast1')

const previewCallable = httpsCallable<ClassHuntLookupInput | ClassHuntDraftInput, unknown>(
  functions,
  'previewClassHunt',
)
const publishCallable = httpsCallable<ClassHuntPublishInput, unknown>(functions, 'publishClassHunt')
const listCallable = httpsCallable<{ scope: 'admin' | 'teacher'; status?: ClassHuntStatus }, unknown>(functions, 'listClassHunts')
const cancelCallable = httpsCallable<{ huntId: string }, unknown>(functions, 'cancelClassHunt')
const claimCallable = httpsCallable<{ huntId: string; clientRequestId: string }, unknown>(functions, 'claimClassHunt')

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function classHuntCompensationFrom(value: unknown): ClassHuntCompensation | undefined {
  const data = asRecord(value)
  const ratePerMinute = numberValue(data.ratePerMinute)
  if (data.version !== 1
    || ratePerMinute === undefined
    || !Number.isSafeInteger(ratePerMinute)
    || ratePerMinute <= 0
    || data.currency !== 'VND'
    || data.formula !== 'flat_per_minute') return undefined
  return {
    version: 1,
    ratePerMinute,
    currency: 'VND',
    formula: 'flat_per_minute',
  }
}

function minutesFrom(value: unknown): ClassHuntMinutes {
  const minutes = numberValue(value)
  return minutes === 25 || minutes === 50 || minutes === 75 || minutes === 100 ? minutes : 50
}

function statusFrom(value: unknown): ClassHuntStatus {
  return value === 'claimed' || value === 'cancelled' || value === 'expired' ? value : 'open'
}

function studentFrom(value: unknown): ClassHuntStudent | undefined {
  const data = asRecord(value)
  const code = text(data.code)
  const name = text(data.name)
  if (!code && !name) return undefined
  return {
    ...(text(data.id) ? { id: text(data.id) } : {}),
    code: code || '',
    name: name || 'Học viên',
    ...(text(data.status) ? { status: text(data.status) } : {}),
    ...(text(data.learningScheduleType) ? { learningScheduleType: text(data.learningScheduleType) } : {}),
    ...(text(data.deliveryMode) || text(data.classDeliveryMode) ? { deliveryMode: text(data.deliveryMode) || text(data.classDeliveryMode) } : {}),
    ...(typeof data.eligibleForHunt === 'boolean' ? { eligibleForHunt: data.eligibleForHunt } : {}),
  }
}

function subjectFrom(value: unknown): ClassHuntSubject | undefined {
  const data = asRecord(value)
  const id = text(data.id) || text(data.subjectId)
  const name = text(data.name) || text(data.subjectName)
  if (!id && !name) return undefined
  return {
    id: id || '',
    name: name || 'Gói học',
    ...(numberValue(data.remainingPoints ?? data.remainingMinutes) !== undefined
      ? { remainingPoints: numberValue(data.remainingPoints ?? data.remainingMinutes) }
      : {}),
    ...(numberValue(data.remainingSessions) !== undefined ? { remainingSessions: numberValue(data.remainingSessions) } : {}),
    ...(numberValue(data.minutesPerSession) !== undefined ? { minutesPerSession: numberValue(data.minutesPerSession) } : {}),
    ...(typeof data.eligibleForHunt === 'boolean' ? { eligibleForHunt: data.eligibleForHunt } : {}),
  }
}

function slotFrom(value: unknown): ClassHuntSlot | undefined {
  const data = asRecord(value)
  const date = text(data.date) || text(data.dateISO)
  const weekday = data.weekday || data.day
  const start = text(data.start) || text(data.requestedStart)
  const end = text(data.end) || text(data.requestedEnd)
  if (!date || !start || !end || !['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(String(weekday))) return undefined
  return {
    date,
    weekday: weekday as DayOfWeek,
    start,
    end,
    minutes: minutesFrom(data.minutes ?? data.requestedMinutes),
  }
}

function slotsFrom(value: unknown): ClassHuntSlot[] {
  return asArray(value)
    .map(slotFrom)
    .filter((slot): slot is ClassHuntSlot => Boolean(slot))
}

function teacherFrom(value: unknown): ClassHuntTeacherMatch | undefined {
  const data = asRecord(value)
  const id = text(data.id)
  const name = text(data.name)
  if (!id || !name) return undefined
  return {
    id,
    name,
    ...(text(data.code) ? { code: text(data.code) } : {}),
    ...(text(data.photoURL) ? { photoURL: text(data.photoURL) } : {}),
    ...(numberValue(data.matchedSlots) !== undefined ? { matchedSlots: numberValue(data.matchedSlots) } : {}),
    ...(text(data.availabilitySummary) ? { availabilitySummary: text(data.availabilitySummary) } : {}),
  }
}

function teachersFrom(value: unknown): ClassHuntTeacherMatch[] {
  return asArray(value)
    .map(teacherFrom)
    .filter((teacher): teacher is ClassHuntTeacherMatch => Boolean(teacher))
}

function dateFrom(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const milliseconds = numberValue(value)
  return milliseconds !== undefined ? new Date(milliseconds).toISOString() : undefined
}

function previewFrom(value: unknown): ClassHuntPreview {
  const root = asRecord(value)
  const data = asRecord(root.preview ?? value)
  const eligibleTeachers = teachersFrom(data.eligibleTeachers)
  const subject = subjectFrom(data.subject)
  const classHuntCompensation = classHuntCompensationFrom(data.classHuntCompensation)
  return {
    student: studentFrom(data.student),
    subjects: asArray(data.subjects ?? data.packages)
      .map(subjectFrom)
      .filter((item): item is ClassHuntSubject => Boolean(item)),
    subject,
    slots: slotsFrom(data.slots ?? data.sessions),
    eligibleTeachers,
    ...(typeof data.eligibleTeacherCount === 'number'
      ? { eligibleTeacherCount: data.eligibleTeacherCount }
      : {}),
    ...(classHuntCompensation ? { classHuntCompensation } : {}),
    warnings: asArray(data.warnings).filter((warning): warning is string => typeof warning === 'string'),
  }
}

function huntFrom(value: unknown): ClassHunt {
  const data = asRecord(value)
  const slots = slotsFrom(data.slots ?? data.sessions)
  const subject = subjectFrom(data.subject) || subjectFrom({ id: data.subjectId, name: data.subjectName }) || { id: '', name: 'Gói học' }
  const claimedTeacherData = asRecord(data.claimedTeacher)
  const claimedTeacherName = text(claimedTeacherData.name) || text(data.claimedTeacherName)
  const claimedTeacherId = text(claimedTeacherData.id) || text(data.claimedByTeacherId)
  const classHuntCompensation = classHuntCompensationFrom(data.classHuntCompensation)
  return {
    id: text(data.id) || '',
    status: statusFrom(data.status),
    subject,
    slots,
    minutes: minutesFrom(data.minutes ?? data.requestedMinutes),
    sessionCount: numberValue(data.sessionCount) || slots.length,
    ...(dateFrom(data.createdAt ?? data.createdAtMs) ? { createdAt: dateFrom(data.createdAt ?? data.createdAtMs) } : {}),
    ...(dateFrom(data.expiresAt ?? data.expiresAtMs) ? { expiresAt: dateFrom(data.expiresAt ?? data.expiresAtMs) } : {}),
    ...(dateFrom(data.cancelledAt ?? data.cancelledAtMs) ? { cancelledAt: dateFrom(data.cancelledAt ?? data.cancelledAtMs) } : {}),
    ...(dateFrom(data.claimedAt ?? data.claimedAtMs) ? { claimedAt: dateFrom(data.claimedAt ?? data.claimedAtMs) } : {}),
    ...(studentFrom(data.student) ? { student: studentFrom(data.student) } : {}),
    ...(numberValue(data.eligibleTeacherCount) !== undefined ? { eligibleTeacherCount: numberValue(data.eligibleTeacherCount) } : {}),
    ...(data.eligibleTeachers ? { eligibleTeachers: teachersFrom(data.eligibleTeachers) } : {}),
    ...(claimedTeacherName ? {
      claimedTeacher: {
        id: claimedTeacherId || '',
        name: claimedTeacherName,
        ...(text(claimedTeacherData.code) ? { code: text(claimedTeacherData.code) } : {}),
        ...(text(claimedTeacherData.photoURL) ? { photoURL: text(claimedTeacherData.photoURL) } : {}),
      },
    } : {}),
    ...(Array.isArray(data.bookingIds) ? { bookingIds: data.bookingIds.filter((id): id is string => typeof id === 'string') } : {}),
    ...(classHuntCompensation ? { classHuntCompensation } : {}),
  }
}

function teacherHuntFrom(value: unknown): TeacherClassHunt {
  const data = asRecord(value)
  const slots = slotsFrom(data.slots ?? data.sessions)
  const classHuntCompensation = classHuntCompensationFrom(data.classHuntCompensation)
  return {
    id: text(data.id) || '',
    status: statusFrom(data.status),
    subject: subjectFrom(data.subject) || subjectFrom({ id: data.subjectId, name: data.subjectName }) || { id: '', name: 'Gói học' },
    slots,
    minutes: minutesFrom(data.minutes ?? data.requestedMinutes),
    sessionCount: numberValue(data.sessionCount) || slots.length,
    ...(dateFrom(data.expiresAt ?? data.expiresAtMs) ? { expiresAt: dateFrom(data.expiresAt ?? data.expiresAtMs) } : {}),
    ...(classHuntCompensation ? { classHuntCompensation } : {}),
  }
}

export async function previewClassHunt(input: ClassHuntLookupInput | ClassHuntDraftInput): Promise<ClassHuntPreview> {
  const result = await previewCallable(input)
  return previewFrom(result.data)
}

export async function publishClassHunt(input: ClassHuntDraftInput, clientRequestId: string): Promise<ClassHunt> {
  const result = await publishCallable({ ...input, clientRequestId })
  const root = asRecord(result.data)
  return huntFrom(root.hunt ?? result.data)
}

export async function listAdminClassHunts(status?: ClassHuntStatus): Promise<ClassHunt[]> {
  const result = await listCallable({ scope: 'admin', ...(status ? { status } : {}) })
  const root = asRecord(result.data)
  return asArray(root.hunts ?? result.data).map(huntFrom).filter((hunt) => Boolean(hunt.id))
}

export async function listTeacherClassHunts(): Promise<TeacherClassHunt[]> {
  const result = await listCallable({ scope: 'teacher', status: 'open' })
  const root = asRecord(result.data)
  return asArray(root.hunts ?? result.data).map(teacherHuntFrom).filter((hunt) => Boolean(hunt.id))
}

export async function cancelClassHunt(huntId: string): Promise<ClassHunt> {
  const result = await cancelCallable({ huntId })
  const root = asRecord(result.data)
  return huntFrom(root.hunt ?? result.data)
}

export async function claimClassHunt(huntId: string, clientRequestId: string): Promise<ClaimClassHuntResult> {
  const result = await claimCallable({ huntId, clientRequestId })
  const data = asRecord(result.data)
  const outcome = data.outcome === 'claimed' || data.outcome === 'taken' ? data.outcome : undefined
  const status = data.status === 'claimed' || data.status === 'taken' ? data.status : undefined
  return {
    ...(outcome ? { outcome } : {}),
    ...(status ? { status } : {}),
    ...(data.hunt ? { hunt: teacherHuntFrom(data.hunt) } : {}),
    ...(Array.isArray(data.bookingIds) ? { bookingIds: data.bookingIds.filter((id): id is string => typeof id === 'string') } : {}),
  }
}

export function classHuntErrorReason(error: unknown): string {
  const data = asRecord(error)
  const details = asRecord(data.details)
  const reason = details.reason ?? data.reason ?? data.code
  return typeof reason === 'string' ? reason.replace(/^functions\//, '').toUpperCase() : ''
}

export function isClassHuntTaken(error: unknown): boolean {
  const reason = classHuntErrorReason(error)
  return reason === 'HUNT_TAKEN'
    || reason === 'ALREADY_CLAIMED'
    || reason === 'HUNT_ALREADY_CLAIMED'
    || reason === 'CLASS_HUNT_ALREADY_CLAIMED'
}
