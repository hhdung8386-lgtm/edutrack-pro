import { Timestamp } from 'firebase/firestore'
import type { Teacher, TeacherCertificate } from '@/types'

export interface PublicTeacherCertificate {
  category: TeacherCertificate['category']
  title: string
  description: string
  score: string
  fileURL: string
}

/**
 * Whitelist dữ liệu hồ sơ được phép gửi cho phụ huynh.
 * Không sao chép nguyên document `teachers` để tránh lộ tài khoản, ngân hàng,
 * đơn giá hoặc các trường vận hành được bổ sung trong tương lai.
 */
export interface PublicTeacherProfile {
  code: string
  releasedNickname: string
  name: string
  subjectIds: string[]
  subjectNames: string[]
  level: number
  bio: string
  photoURL: string
  status: 'active'
  country: string
  totalApprovedMinutes: number
  yob: number | null
  livingArea: string
  trainedAt123English: boolean
  degreeType: string
  university: string
  major: string
  gradYear: string
  gpa: string
  academicAwards: string
  scholarship: string
  ielts: string
  toeic: string
  toefl: string
  cefr: string[]
  tesolTefl: string
  pedagogicalCert: string
  otherCerts: string
  certificates: PublicTeacherCertificate[]
  teachingYears: number | null
  studentsTaughtCount: number | null
  studentAgesTaught: string
  teachingFormats: string[]
  studentResults: string
  strengths: string[]
  otherStrengths: string
  languagesTaught: string[]
  academicSubjectsTaught: string[]
  isPublished: true
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const unique = new Set<string>()
  value.forEach((entry) => {
    const normalized = safeString(entry)
    if (normalized) unique.add(normalized)
  })
  return [...unique]
}

function safeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function safeNonNegativeNumber(value: unknown, fallback = 0): number {
  const parsed = safeNumber(value)
  return parsed === null ? fallback : Math.max(0, parsed)
}

function safeUrl(value: unknown): string {
  const candidate = safeString(value)
  if (!candidate) return ''

  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return ''
  }
}

const MAX_INLINE_IMAGE_LENGTH = 900_000

function safeImageSource(value: unknown): string {
  const candidate = safeString(value)
  if (!candidate) return ''

  if (
    candidate.length <= MAX_INLINE_IMAGE_LENGTH
    && /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(candidate)
  ) {
    return candidate
  }

  return safeUrl(candidate)
}

function safeCertificateCategory(value: unknown): TeacherCertificate['category'] {
  if (value === 'foreign_language' || value === 'pedagogical' || value === 'other') return value
  return 'other'
}

function publicCertificates(certificates: TeacherCertificate[] | undefined): PublicTeacherCertificate[] {
  if (!Array.isArray(certificates)) return []

  return certificates
    .filter((certificate) => certificate?.status === 'approved' && certificate.voided !== true)
    .map((certificate) => ({
      category: safeCertificateCategory(certificate.category),
      title: safeString(certificate.title),
      description: safeString(certificate.description),
      score: safeString(certificate.score),
      fileURL: safeImageSource(certificate.fileURL),
    }))
}

export function buildPublicTeacherProfile(teacher: Teacher): PublicTeacherProfile {
  if (teacher.status !== 'active' || teacher.isTester === true) {
    throw new Error('Chỉ có thể công khai hồ sơ của gia sư đang giảng dạy chính thức')
  }

  return {
    code: safeString(teacher.code),
    releasedNickname: safeString(teacher.releasedNickname),
    name: safeString(teacher.name),
    subjectIds: safeStringArray(teacher.subjectIds),
    subjectNames: safeStringArray(teacher.subjectNames),
    level: safeNonNegativeNumber(teacher.level, 1) || 1,
    bio: safeString(teacher.bio),
    photoURL: safeImageSource(teacher.photoURL),
    status: 'active',
    country: safeString(teacher.country),
    totalApprovedMinutes: safeNonNegativeNumber(teacher.totalApprovedMinutes),
    yob: safeNumber(teacher.yob),
    livingArea: safeString(teacher.livingArea),
    trainedAt123English: teacher.trainedAt123English === true,
    degreeType: safeString(teacher.degreeType),
    university: safeString(teacher.university),
    major: safeString(teacher.major),
    gradYear: safeString(teacher.gradYear),
    gpa: safeString(teacher.gpa),
    academicAwards: safeString(teacher.academicAwards),
    scholarship: safeString(teacher.scholarship),
    ielts: safeString(teacher.ielts),
    toeic: safeString(teacher.toeic),
    toefl: safeString(teacher.toefl),
    cefr: safeStringArray(teacher.cefr),
    tesolTefl: safeString(teacher.tesolTefl),
    pedagogicalCert: safeString(teacher.pedagogicalCert),
    otherCerts: safeString(teacher.otherCerts),
    certificates: publicCertificates(teacher.certificates),
    teachingYears: safeNumber(teacher.teachingYears),
    studentsTaughtCount: safeNumber(teacher.studentsTaughtCount),
    studentAgesTaught: safeString(teacher.studentAgesTaught),
    teachingFormats: safeStringArray(teacher.teachingFormats),
    studentResults: safeString(teacher.studentResults),
    strengths: safeStringArray(teacher.strengths),
    otherStrengths: safeString(teacher.otherStrengths),
    languagesTaught: safeStringArray(teacher.languagesTaught),
    academicSubjectsTaught: safeStringArray(teacher.academicSubjectsTaught),
    isPublished: true,
  }
}

/** Chuyển DTO công khai về shape Teacher chỉ để tái sử dụng UI hiển thị. */
export function publicProfileAsTeacher(id: string, profile: PublicTeacherProfile): Teacher {
  if (profile.isPublished !== true || profile.status !== 'active') {
    throw new Error('Hồ sơ gia sư chưa được công khai')
  }

  return {
    id: safeString(id),
    code: safeString(profile.code),
    releasedNickname: safeString(profile.releasedNickname),
    name: safeString(profile.name),
    subjectIds: safeStringArray(profile.subjectIds),
    subjectNames: safeStringArray(profile.subjectNames),
    level: safeNonNegativeNumber(profile.level, 1) || 1,
    bio: safeString(profile.bio),
    photoURL: safeImageSource(profile.photoURL),
    status: 'active',
    country: safeString(profile.country),
    totalApprovedMinutes: safeNonNegativeNumber(profile.totalApprovedMinutes),
    yob: safeNumber(profile.yob) ?? undefined,
    livingArea: safeString(profile.livingArea),
    trainedAt123English: profile.trainedAt123English === true,
    degreeType: safeString(profile.degreeType),
    university: safeString(profile.university),
    major: safeString(profile.major),
    gradYear: safeString(profile.gradYear),
    gpa: safeString(profile.gpa),
    academicAwards: safeString(profile.academicAwards),
    scholarship: safeString(profile.scholarship),
    ielts: safeString(profile.ielts),
    toeic: safeString(profile.toeic),
    toefl: safeString(profile.toefl),
    cefr: safeStringArray(profile.cefr),
    tesolTefl: safeString(profile.tesolTefl),
    pedagogicalCert: safeString(profile.pedagogicalCert),
    otherCerts: safeString(profile.otherCerts),
    certificates: (Array.isArray(profile.certificates) ? profile.certificates : []).map((certificate) => ({
      category: safeCertificateCategory(certificate.category),
      title: safeString(certificate.title),
      description: safeString(certificate.description),
      score: safeString(certificate.score),
      fileURL: safeImageSource(certificate.fileURL),
      status: 'approved',
      voided: false,
    })),
    teachingYears: safeNumber(profile.teachingYears) ?? undefined,
    studentsTaughtCount: safeNumber(profile.studentsTaughtCount) ?? undefined,
    studentAgesTaught: safeString(profile.studentAgesTaught),
    teachingFormats: safeStringArray(profile.teachingFormats),
    studentResults: safeString(profile.studentResults),
    strengths: safeStringArray(profile.strengths),
    otherStrengths: safeString(profile.otherStrengths),
    languagesTaught: safeStringArray(profile.languagesTaught),
    academicSubjectsTaught: safeStringArray(profile.academicSubjectsTaught),
    createdAt: Timestamp.now(),
  }
}
