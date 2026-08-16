export type SubjectFundInput = {
  subjectId?: string
  subjectName?: string
  totalSessions?: number
  usedSessions?: number
  minutesPerSession?: number
  totalMinutes?: number | null
  usedMinutes?: number | null
}

export type StudentFundInput = SubjectFundInput & {
  subjects?: SubjectFundInput[]
}

export type SubjectMinuteFund = {
  key: string
  subjectId: string
  subjectName: string
  totalMinutes: number
  usedMinutes: number
  remainingMinutes: number
}

const LEGACY_KEY = '__legacy__'

function finiteOrFallback(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return Math.max(0, fallback)
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : Math.max(0, fallback)
}

function toFund(subject: SubjectFundInput, fallbackKey: string): SubjectMinuteFund {
  const minutesPerSession = finiteOrFallback(subject.minutesPerSession, 50) || 50
  const totalMinutes = finiteOrFallback(
    subject.totalMinutes,
    finiteOrFallback(subject.totalSessions, 0) * minutesPerSession,
  )
  const usedMinutes = finiteOrFallback(
    subject.usedMinutes,
    finiteOrFallback(subject.usedSessions, 0) * minutesPerSession,
  )
  const subjectId = String(subject.subjectId || '').trim()

  return {
    key: subjectId || fallbackKey,
    subjectId,
    subjectName: String(subject.subjectName || '').trim(),
    totalMinutes,
    usedMinutes,
    remainingMinutes: Math.max(0, totalMinutes - usedMinutes),
  }
}

/**
 * Mỗi môn là một quỹ độc lập. Một gói cũ bị dùng vượt không được phép ăn vào
 * số dư của môn/gói khác. Các bản ghi trùng subjectId được cộng phần dương còn
 * lại của từng gói để vẫn tương thích dữ liệu nạp nhiều đợt.
 */
export function getStudentSubjectMinuteFunds(student: StudentFundInput): SubjectMinuteFund[] {
  const subjects = student.subjects || []
  const rawFunds = subjects.length > 0
    ? subjects.map((subject, index) => toFund(subject, `__missing_subject_${index}__`))
    : [toFund(student, LEGACY_KEY)]

  const grouped = new Map<string, SubjectMinuteFund>()
  rawFunds.forEach((fund) => {
    const current = grouped.get(fund.key)
    if (!current) {
      grouped.set(fund.key, { ...fund })
      return
    }
    current.totalMinutes += fund.totalMinutes
    current.usedMinutes += fund.usedMinutes
    current.remainingMinutes += fund.remainingMinutes
    if (!current.subjectName && fund.subjectName) current.subjectName = fund.subjectName
  })
  return Array.from(grouped.values())
}

export function getStudentMinuteSummaryCore(student: StudentFundInput) {
  return getStudentSubjectMinuteFunds(student).reduce(
    (summary, fund) => ({
      totalMinutes: summary.totalMinutes + fund.totalMinutes,
      usedMinutes: summary.usedMinutes + fund.usedMinutes,
      remainingMinutes: summary.remainingMinutes + fund.remainingMinutes,
    }),
    { totalMinutes: 0, usedMinutes: 0, remainingMinutes: 0 },
  )
}

export function resolveStudentSubjectFund(student: StudentFundInput, subjectId?: string): SubjectMinuteFund | undefined {
  const funds = getStudentSubjectMinuteFunds(student)
  const normalizedSubjectId = String(subjectId || '').trim()
  if (normalizedSubjectId) {
    const exact = funds.find((fund) => fund.subjectId === normalizedSubjectId)
    return exact
  }
  // Dữ liệu cũ có thể thiếu subjectId ở booking; chỉ suy luận khi hồ sơ có đúng một quỹ.
  return funds.length === 1 ? funds[0] : undefined
}
