import { Timestamp } from 'firebase/firestore'

export interface Student {
  id: string
  code: string
  name: string
  parentPhone: string
  subjectId: string
  subjectName?: string
  branchId?: string
  branchName?: string
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  minutesPerSession: number
  totalMinutes?: number
  usedMinutes?: number
  remainingMinutes?: number
  status: 'active' | 'inactive' | 'expired'
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Teacher {
  id: string
  code: string
  name: string
  subjectIds: string[]
  subjectNames?: string[]
  level: number
  bio: string
  photoURL: string
  status: 'active' | 'inactive'
  teacherGrade?: 'A' | 'B' | 'C' | 'PH' | 'SA'
  contractAccepted?: boolean
  createdAt: Timestamp
}

export interface Subject {
  id: string
  name: string
  pricePerMinute: number
  status: 'active' | 'inactive'
  createdAt: Timestamp
}

export interface Lesson {
  id: string
  studentId: string
  studentCode: string
  studentName: string
  teacherId: string
  teacherCode: string
  teacherName: string
  subjectId: string
  subjectName: string
  date: string
  minutes: 25 | 50 | 75 | 100
  comment: string
  homework: string
  book?: string
  imageURLs: string[]
  status: 'pending' | 'approved' | 'rejected'
  attendanceStatus?: 'present' | 'with_permission' | 'without_permission'
  rejectedReason?: string
  sessionsBeforeApproval: number
  sessionsAfterApproval: number
  minutesBeforeApproval?: number
  minutesAfterApproval?: number
  teacherLevel?: number
  pricePerMinute?: number
  salary: number
  createdAt: Timestamp
  approvedAt?: Timestamp
  approvedBy?: string
}

export interface Payroll {
  id: string
  teacherId: string
  teacherName: string
  lessonId: string
  amount: number
  minutes: number
  pricePerMinute: number
  level: number
  month: string
  paid?: boolean
  paidAt?: Timestamp
  voided?: boolean
  voidedAt?: Timestamp
  voidedBy?: string
  createdAt: Timestamp
}

export interface AdminLog {
  id: string
  adminId: string
  adminName?: string
  action: string
  targetType: string
  targetId: string
  changes: Record<string, unknown>
  createdAt: Timestamp
}

export interface UserDoc {
  uid: string
  email: string
  role: 'admin' | 'teacher'
  teacherId?: string
  displayName?: string
  createdAt: Timestamp
}

export interface TimeRange {
  start: string  // e.g. '08:00'
  end: string    // e.g. '12:00'
}

export interface DayAvailability {
  available: boolean
  timeRanges: TimeRange[]
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface TeacherAvailability {
  id: string              // = teacherId
  teacherId: string
  slots: Record<DayOfWeek, DayAvailability>
  note: string
  updatedAt: Timestamp
}

export type LessonStatus = 'pending' | 'approved' | 'rejected'
export type StudentStatus = 'active' | 'inactive' | 'expired'
export type TeacherStatus = 'active' | 'inactive'
export type MinutePreset = 25 | 50 | 75 | 100
