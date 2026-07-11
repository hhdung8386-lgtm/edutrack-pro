import { Timestamp } from 'firebase/firestore'

export interface TopUpBatch {
  id: string
  createdAt: string // format DD/MM/YYYY
  totalSessions: number
}

export interface CountryPriceInfo {
  price: number
  currency: string
  isDefault?: boolean
}

export interface StudentSubject {
  subjectId: string
  subjectName: string
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  minutesPerSession: number
  totalMinutes: number
  usedMinutes: number
  remainingMinutes: number
  pricePerMinute: number
  pricePerMinuteVN?: number
  pricePerMinutePH?: number
  pricePerMinuteNative?: number
  batches?: TopUpBatch[]
  curriculumLink?: string
  supplementaryCurriculumLink?: string
  timetableNote?: string
  studentRequests?: string[]
  otherCountriesPrices?: Record<string, number>
  countryPrices?: Record<string, CountryPriceInfo>
  currency?: string
  focusSkills?: string[]
}

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
  reservedMinutes?: number
  heldMinutes?: number
  status: 'active' | 'inactive' | 'expired' | 'reserved'
  subjects?: StudentSubject[]
  classroomURL?: string
  textbookURL?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Teacher {
  id: string
  code: string
  name: string
  subjectIds: string[]
  subjectNames?: string[]
  subjectRates?: Record<string, number>
  branchId?: string
  branchName?: string
  level: number
  bio: string
  photoURL: string
  status: 'active' | 'inactive'
  gender?: 'male' | 'female'
  teacherGrade?: 'A' | 'B' | 'C' | 'PH' | 'SA'
  contractAccepted?: boolean
  country?: string
  timezoneOffset?: number
  // Interview fields
  yob?: number
  livingArea?: string
  degreeType?: string
  university?: string
  major?: string
  gradYear?: string
  gpa?: string
  academicAwards?: string
  scholarship?: string
  ielts?: string
  toeic?: string
  toefl?: string
  cefr?: string[]
  tesolTefl?: string
  pedagogicalCert?: string
  otherCerts?: string
  teachingYears?: number
  studentsTaughtCount?: number
  studentAgesTaught?: string
  teachingFormats?: string[]
  studentResults?: string
  strengths?: string[]
  otherStrengths?: string
  languagesTaught?: string[]
  academicSubjectsTaught?: string[]
  certificates?: TeacherCertificate[]
  bankName?: string
  bankAccountNo?: string
  bankAccountName?: string
  youtubeLink?: string
  createdAt: Timestamp
}

export interface TeacherCertificate {
  category: 'foreign_language' | 'pedagogical' | 'other'
  title: string
  description?: string
  score: string
  fileURL?: string
  verified?: boolean
  verifiedBy?: string
  verifiedAt?: Timestamp
  voided?: boolean
  voidedBy?: string
  status: 'approved' | 'pending' | 'rejected'
  createdAt?: Timestamp
}

export interface Subject {
  id: string
  name: string
  pricePerMinute: number
  pricePerMinuteVN?: number
  pricePerMinutePH?: number
  pricePerMinuteNative?: number
  otherCountriesPrices?: Record<string, number>
  countryPrices?: Record<string, CountryPriceInfo>
  status: 'active' | 'inactive'
  createdAt: Timestamp
  currency?: string
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
  salary?: number
  teacherRate?: number
  approvedAt?: Timestamp
  approvedBy?: string
  bookingRequestId?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  currency?: string
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
  currency?: string
}

export interface BookingRequest {
  id: string
  status: 'pending' | 'confirmed' | 'rejected' | 'released'
  teacherId: string
  teacherCode: string
  teacherName: string
  teacherPhotoURL?: string
  studentId: string
  studentCode: string
  studentName: string
  subjectId?: string
  subjectName?: string
  requestedDay: DayOfWeek
  requestedDate?: string
  requestedWeekStart?: string
  requestedStart: string
  requestedEnd: string
  requestedMinutes: 25 | 50 | 75 | 100
  availableMinutesAtRequest?: number
  heldMinutesAtRequest?: number
  note?: string
  adminNote?: string
  classroomURL?: string
  createdAt: Timestamp
  confirmedAt?: Timestamp
  confirmedBy?: string
  rejectedAt?: Timestamp
  rejectedBy?: string
  releasedAt?: Timestamp
  releasedBy?: string
  lessonId?: string
  currency?: string
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
  weekOverrides?: Record<string, {
    slots: Record<DayOfWeek, DayAvailability>
    note?: string
    updatedAt?: string
  }>
  note: string
  updatedAt: Timestamp
}

export type LessonStatus = 'pending' | 'approved' | 'rejected'
export type StudentStatus = 'active' | 'inactive' | 'expired'
export type TeacherStatus = 'active' | 'inactive'
export type MinutePreset = 25 | 50 | 75 | 100

export interface SystemNotification {
  id: string
  title: string
  content: string
  color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky'
  iconName: 'Bell' | 'Calendar' | 'ClipboardList' | 'ShieldAlert' | 'Clock' | 'MessageSquare'
  targetType: 'teachers' | 'students' | 'managers'
  targetIds: string[] // Empty means "all" in that targetType
  senderId: string
  senderName: string
  createdAt: Timestamp
  readBy?: string[] // array of user/student/teacher IDs
}
