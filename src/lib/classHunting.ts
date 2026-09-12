import { getFunctions, httpsCallable } from 'firebase/functions'
import type { DayOfWeek } from '@/types'
import app from '@/lib/firebase'
import {
  CLASS_HUNT_TEACHER_TYPES,
  defaultClassHuntTeacherRequirements,
  type ClassHuntTeacherRequirements,
  type ClassHuntTeacherType,
  type ClassHuntWeeklySlot,
} from '@/lib/classHuntSchedule'

/**
 * CLASS HUNTING only talks to callable Functions. The browser must never read
 * or write the raw hunt documents because an open offer contains student and
 * scheduling data that is not appropriate for every teacher.
 */

export type ClassHuntStatus = 'open' | 'claimed' | 'cancelled' | 'expired'
export type ClassHuntMinutes = 25 | 50 | 75 | 100
export type ClassHuntSessionSelectionMode = 'all_remaining' | 'specific'

/** Mirrors the backend: a hunt has no tutor yet, so it is sized at 25 kim cương / 25 phút. */
export const CLASS_HUNT_STANDARD_POINTS_PER_25_MINUTES = 25

/**
 * Number of lessons the spendable diamonds cover. The server resolves the
 * same figure again when publishing; the legacy session counter is not used.
 */
export function classHuntAffordableSessions(availablePoints: number, minutes: number): number {
  const pointsPerLesson = Math.round((minutes / 25) * CLASS_HUNT_STANDARD_POINTS_PER_25_MINUTES * 100) / 100
  if (!Number.isFinite(availablePoints) || availablePoints <= 0 || !(pointsPerLesson > 0)) return 0
  return Math.floor((availablePoints + 1e-6) / pointsPerLesson)
}

/** Immutable teacher-pay snapshot supplied only by the Class Hunting backend. */
export interface ClassHuntCompensation {
  version: 1
  ratePerMinute: number
  currency: 'VND'
  formula: 'flat_per_minute'
}

/**
 * Display-only subject price for offers without a class snapshot. Payroll
 * resolves it again at approval: subject price x tutor level.
 */
export interface ClassHuntSubjectRate {
  pricePerMinute: number
  currency: string
  /** Present only on the tutor feed, for the signed-in tutor. */
  teacherLevel?: number
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
  /** Active calendar rows or unrebooked holds for this package. */
  heldBookingCount?: number
  heldPoints?: number
  /** Conservative spendable balance after subject and aggregate holds. */
  availablePoints?: number
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
  /** Nickname (teachers.code); admins see it first. */
  code?: string
  name: string
  photoURL?: string
}

/** Mirrors CLASS_HUNT_NOTE_MAX_LENGTH in functions/src/classHunting.ts. */
export const CLASS_HUNT_NOTE_MAX_LENGTH = 500

export interface ClassHunt {
  id: string
  status: ClassHuntStatus
  subject: ClassHuntSubject
  slots: ClassHuntSlot[]
  minutes: ClassHuntMinutes
  sessionCount: number
  sessionSelectionMode?: ClassHuntSessionSelectionMode
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
  subjectRate?: ClassHuntSubjectRate
  teacherRequirements?: ClassHuntTeacherRequirements
  weeklySlots?: ClassHuntWeeklySlot[]
  activeTeacherCount?: number
  /** Teacher feed only: false when this tutor does not meet the stated requirement. */
  requirementMatch?: boolean
  /** Operator note shown to tutors before they claim (subject, level, learner needs). */
  note?: string
}

/** The teacher endpoint deliberately does not include a student object. */
export type TeacherClassHunt = Omit<ClassHunt, 'student' | 'eligibleTeachers'> & {
  /** Recently taken offers only: the claiming tutor's public nickname. */
  claimedTeacherCode?: string
  claimedByMe?: boolean
}

export interface TeacherClassHuntFeed {
  open: TeacherClassHunt[]
  /** Offers claimed in the last few days (empty on an older backend). */
  claimed: TeacherClassHunt[]
}

export interface ClassHuntLookupInput {
  studentCode: string
}

export interface ClassHuntDraftInput extends ClassHuntLookupInput {
  /** Exact document selected by the preceding server lookup. */
  studentId: string
  subjectId: string
  startDate: string
  /** Weekly timetable cells; every generated lesson is 25 minutes. */
  weeklySlots: ClassHuntWeeklySlot[]
  sessionCount: number
  /** `all_remaining` is resolved by the server from the current package ledger. */
  sessionSelectionMode: ClassHuntSessionSelectionMode
  teacherRequirements: ClassHuntTeacherRequirements
  /** Omit when empty so a note-less publish keeps its original retry identity. */
  note?: string
  // No `compensationRatePerMinute`: tutor pay follows the subject price. The
  // key must be absent (not undefined/null) or the server treats it as a rate.
}

export interface ClassHuntPreview {
  student?: ClassHuntStudent
  subjects: ClassHuntSubject[]
  subject?: ClassHuntSubject
  slots: ClassHuntSlot[]
  eligibleTeachers: ClassHuntTeacherMatch[]
  eligibleTeacherCount?: number
  matchingTeacherCount?: number
  activeTeacherCount?: number
  teacherRequirements?: ClassHuntTeacherRequirements
  note?: string
  warnings?: string[]
  classHuntCompensation?: ClassHuntCompensation
  subjectRate?: ClassHuntSubjectRate
}

/** Structured reason attached by claimClassHunt so the tutor sees exactly why it failed. */
export interface ClassHuntErrorDetails {
  reason: string
  message: string
  conflicts: Array<{ date: string; start: string; end: string }>
  requiredPoints?: number
  availablePoints?: number
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
const archiveCallable = httpsCallable<{ huntId: string }, unknown>(functions, 'archiveClassHunt')
const updateCallable = httpsCallable<{ huntId: string; note: string; teacherRequirements: ClassHuntTeacherRequirements }, unknown>(functions, 'updateClassHunt')
const claimCallable = httpsCallable<{ huntId: string; clientRequestId: string }, unknown>(functions, 'claimClassHunt')
const markTeacherNotificationsReadCallable = httpsCallable<{ notificationIds: string[] }, unknown>(
  functions,
  'markTeacherNotificationsRead',
)

const CLASS_HUNT_PREVIEW_MAX_ATTEMPTS = 3
const CLASS_HUNT_PREVIEW_RETRY_DELAYS_MS = [500, 1_500]

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function callableErrorCode(error: unknown): string {
  const data = asRecord(error)
  const code = data.code
  return typeof code === 'string' ? code.replace(/^functions\//, '').toLowerCase() : ''
}

/**
 * A lookup is read-only, so a short bounded retry is safe when Cloud Run is
 * briefly cold-starting or returns a transient capacity error. Permanent
 * validation and permission errors are surfaced immediately.
 */
function isTransientClassHuntPreviewError(error: unknown): boolean {
  return ['aborted', 'deadline-exceeded', 'internal', 'resource-exhausted', 'unavailable']
    .includes(callableErrorCode(error))
}

async function invokePreviewCallable(input: ClassHuntLookupInput | ClassHuntDraftInput) {
  let lastError: unknown
  for (let attempt = 0; attempt < CLASS_HUNT_PREVIEW_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await previewCallable(input)
    } catch (error) {
      lastError = error
      if (!isTransientClassHuntPreviewError(error) || attempt === CLASS_HUNT_PREVIEW_MAX_ATTEMPTS - 1) {
        throw error
      }
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, CLASS_HUNT_PREVIEW_RETRY_DELAYS_MS[attempt] || 1_500)
      })
    }
  }
  throw lastError
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Keeps the operator's line breaks; the server already normalized it. */
function noteFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, CLASS_HUNT_NOTE_MAX_LENGTH)
    : undefined
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

function subjectRateFrom(value: unknown): ClassHuntSubjectRate | undefined {
  const data = asRecord(value)
  const pricePerMinute = numberValue(data.pricePerMinute)
  if (pricePerMinute === undefined || pricePerMinute <= 0) return undefined
  const teacherLevel = numberValue(data.teacherLevel)
  return {
    pricePerMinute,
    currency: text(data.currency) || 'VND',
    ...(teacherLevel !== undefined && teacherLevel > 0 ? { teacherLevel } : {}),
  }
}

function minutesFrom(value: unknown): ClassHuntMinutes {
  const minutes = numberValue(value)
  return minutes === 25 || minutes === 50 || minutes === 75 || minutes === 100 ? minutes : 50
}

function statusFrom(value: unknown): ClassHuntStatus {
  return value === 'claimed' || value === 'cancelled' || value === 'expired' ? value : 'open'
}

function sessionSelectionModeFrom(value: unknown): ClassHuntSessionSelectionMode | undefined {
  return value === 'all_remaining' || value === 'specific' ? value : undefined
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
    ...(numberValue(data.heldBookingCount) !== undefined ? { heldBookingCount: numberValue(data.heldBookingCount) } : {}),
    ...(numberValue(data.heldPoints) !== undefined ? { heldPoints: numberValue(data.heldPoints) } : {}),
    ...(numberValue(data.availablePoints) !== undefined ? { availablePoints: numberValue(data.availablePoints) } : {}),
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

function teacherRequirementsFrom(value: unknown): ClassHuntTeacherRequirements {
  const data = asRecord(value)
  const types = asArray(data.teacherTypes).filter((type): type is ClassHuntTeacherType => (
    CLASS_HUNT_TEACHER_TYPES.includes(type as ClassHuntTeacherType)
  ))
  const gender = data.gender === 'female' || data.gender === 'male' ? data.gender : 'any'
  return types.length > 0
    ? { teacherTypes: CLASS_HUNT_TEACHER_TYPES.filter((type) => types.includes(type)), gender }
    : { ...defaultClassHuntTeacherRequirements(), gender }
}

function weeklySlotsFrom(value: unknown): ClassHuntWeeklySlot[] | undefined {
  if (!Array.isArray(value)) return undefined
  const slots = value
    .map(asRecord)
    .filter((slot) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(String(slot.day)) && typeof slot.start === 'string')
    .map((slot) => ({ day: slot.day as ClassHuntWeeklySlot['day'], start: String(slot.start) }))
  return slots.length > 0 ? slots : undefined
}

function previewFrom(value: unknown): ClassHuntPreview {
  const root = asRecord(value)
  const data = asRecord(root.preview ?? value)
  const eligibleTeachers = teachersFrom(data.eligibleTeachers)
  const subject = subjectFrom(data.subject)
  const classHuntCompensation = classHuntCompensationFrom(data.classHuntCompensation)
  const subjectRate = subjectRateFrom(data.subjectRate)
  return {
    ...(subjectRate ? { subjectRate } : {}),
    ...(typeof data.activeTeacherCount === 'number' ? { activeTeacherCount: data.activeTeacherCount } : {}),
    ...(data.teacherRequirements ? { teacherRequirements: teacherRequirementsFrom(data.teacherRequirements) } : {}),
    ...(noteFrom(data.note) ? { note: noteFrom(data.note) } : {}),
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
    ...(typeof data.matchingTeacherCount === 'number'
      ? { matchingTeacherCount: data.matchingTeacherCount }
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
    ...(sessionSelectionModeFrom(data.sessionSelectionMode) ? { sessionSelectionMode: sessionSelectionModeFrom(data.sessionSelectionMode) } : {}),
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
    teacherRequirements: teacherRequirementsFrom(data.teacherRequirements),
    ...(noteFrom(data.note) ? { note: noteFrom(data.note) } : {}),
    ...(weeklySlotsFrom(data.weeklySlots) ? { weeklySlots: weeklySlotsFrom(data.weeklySlots) } : {}),
    ...(numberValue(data.activeTeacherCount) !== undefined ? { activeTeacherCount: numberValue(data.activeTeacherCount) } : {}),
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
    ...(sessionSelectionModeFrom(data.sessionSelectionMode) ? { sessionSelectionMode: sessionSelectionModeFrom(data.sessionSelectionMode) } : {}),
    ...(dateFrom(data.expiresAt ?? data.expiresAtMs) ? { expiresAt: dateFrom(data.expiresAt ?? data.expiresAtMs) } : {}),
    ...(classHuntCompensation ? { classHuntCompensation } : {}),
    ...(!classHuntCompensation && subjectRateFrom(data.subjectRate) ? { subjectRate: subjectRateFrom(data.subjectRate) } : {}),
    teacherRequirements: teacherRequirementsFrom(data.teacherRequirements),
    ...(typeof data.requirementMatch === 'boolean' ? { requirementMatch: data.requirementMatch } : {}),
    ...(noteFrom(data.note) ? { note: noteFrom(data.note) } : {}),
    ...(dateFrom(data.claimedAt ?? data.claimedAtMs) ? { claimedAt: dateFrom(data.claimedAt ?? data.claimedAtMs) } : {}),
    ...(text(data.claimedTeacherCode) ? { claimedTeacherCode: text(data.claimedTeacherCode) } : {}),
    ...(typeof data.claimedByMe === 'boolean' ? { claimedByMe: data.claimedByMe } : {}),
  }
}

export async function previewClassHunt(input: ClassHuntLookupInput | ClassHuntDraftInput): Promise<ClassHuntPreview> {
  const result = await invokePreviewCallable(input)
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

export async function listTeacherClassHunts(): Promise<TeacherClassHuntFeed> {
  const result = await listCallable({ scope: 'teacher', status: 'open' })
  const root = asRecord(result.data)
  const open = asArray(root.hunts ?? result.data).map(teacherHuntFrom).filter((hunt) => Boolean(hunt.id))
  const openIds = new Set(open.map((hunt) => hunt.id))
  return {
    open,
    claimed: asArray(root.claimedHunts)
      .map(teacherHuntFrom)
      .filter((hunt) => Boolean(hunt.id) && !openIds.has(hunt.id))
      .map((hunt) => ({ ...hunt, status: 'claimed' as const })),
  }
}

export async function cancelClassHunt(huntId: string): Promise<ClassHunt> {
  const result = await cancelCallable({ huntId })
  const root = asRecord(result.data)
  return huntFrom(root.hunt ?? result.data)
}

/** Hide a cancelled/expired offer from the operator list (soft delete). */
export async function archiveClassHunt(huntId: string): Promise<ClassHunt> {
  const result = await archiveCallable({ huntId })
  const root = asRecord(result.data)
  return huntFrom(root.hunt ?? result.data)
}

/** Edit an open offer's note and teacher requirement; schedule and pay stay locked. */
export async function updateClassHunt(
  huntId: string,
  changes: { note: string; teacherRequirements: ClassHuntTeacherRequirements },
): Promise<ClassHunt> {
  const result = await updateCallable({ huntId, note: changes.note, teacherRequirements: changes.teacherRequirements })
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

export async function markTeacherNotificationsRead(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return
  await markTeacherNotificationsReadCallable({ notificationIds })
}

export function classHuntErrorReason(error: unknown): string {
  const data = asRecord(error)
  const details = asRecord(data.details)
  const reason = details.reason ?? data.reason ?? data.code
  return typeof reason === 'string' ? reason.replace(/^functions\//, '').toUpperCase() : ''
}

export function classHuntErrorDetails(error: unknown): ClassHuntErrorDetails {
  const data = asRecord(error)
  const details = asRecord(data.details)
  const conflicts = asArray(details.conflicts)
    .map(asRecord)
    .filter((conflict) => typeof conflict.date === 'string' && typeof conflict.start === 'string')
    .map((conflict) => ({ date: String(conflict.date), start: String(conflict.start), end: String(conflict.end || '') }))
  return {
    reason: classHuntErrorReason(error),
    message: typeof data.message === 'string' ? data.message : '',
    conflicts,
    ...(numberValue(details.requiredPoints) !== undefined ? { requiredPoints: numberValue(details.requiredPoints) } : {}),
    ...(numberValue(details.availablePoints) !== undefined ? { availablePoints: numberValue(details.availablePoints) } : {}),
  }
}

export function isClassHuntTaken(error: unknown): boolean {
  const reason = classHuntErrorReason(error)
  return reason === 'HUNT_TAKEN'
    || reason === 'ALREADY_CLAIMED'
    || reason === 'HUNT_ALREADY_CLAIMED'
    || reason === 'CLASS_HUNT_ALREADY_CLAIMED'
}
