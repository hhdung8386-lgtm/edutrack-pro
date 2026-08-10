import { execFileSync } from 'node:child_process'

const projectId = process.env.FIRESTORE_PROJECT_ID || 'edutrack-pro-78f59'
const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)'
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`

function accessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
}

const token = accessToken()

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('referenceValue' in value) return value.referenceValue
  if ('geoPointValue' in value) return value.geoPointValue
  if ('bytesValue' in value) return value.bytesValue
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {})
  return null
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]))
}

async function fetchCollection(collectionId) {
  const rows = []
  let pageToken = ''
  do {
    const url = new URL(`${baseUrl}/${collectionId}`)
    url.searchParams.set('pageSize', '1000')
    url.searchParams.set('showMissing', 'false')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`${collectionId}: ${response.status} ${await response.text()}`)
    const payload = await response.json()
    for (const document of payload.documents || []) {
      rows.push({
        id: document.name.slice(document.name.lastIndexOf('/') + 1),
        createTime: document.createTime,
        updateTime: document.updateTime,
        ...decodeFields(document.fields),
      })
    }
    pageToken = payload.nextPageToken || ''
  } while (pageToken)
  return rows
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function calculatePoints(durationMinutes, pointsPer25Minutes = 25) {
  const duration = finiteNumber(durationMinutes)
  const rate = finiteNumber(pointsPer25Minutes, 25) > 0 ? Math.round(finiteNumber(pointsPer25Minutes, 25)) : 25
  if (duration <= 0) return 0
  return Math.round(((duration / 25) * rate) * 100) / 100
}

function bookingPoints(booking, teacher) {
  if (booking.pointsPer25Minutes !== null && booking.pointsPer25Minutes !== undefined && finiteNumber(booking.pointsPer25Minutes) > 0) {
    return calculatePoints(booking.requestedMinutes, booking.pointsPer25Minutes)
  }
  if (booking.requestedPoints !== null && booking.requestedPoints !== undefined && finiteNumber(booking.requestedPoints, -1) >= 0) {
    return finiteNumber(booking.requestedPoints)
  }
  return calculatePoints(booking.requestedMinutes, teacher?.pointsPer25Minutes)
}

function lessonPoints(lesson, teacher) {
  if (lesson.pointsPer25Minutes !== null && lesson.pointsPer25Minutes !== undefined && finiteNumber(lesson.pointsPer25Minutes) > 0) {
    return calculatePoints(lesson.minutes, lesson.pointsPer25Minutes)
  }
  if (lesson.points !== null && lesson.points !== undefined && finiteNumber(lesson.points, -1) >= 0) {
    return finiteNumber(lesson.points)
  }
  return calculatePoints(lesson.minutes, teacher?.pointsPer25Minutes)
}

function studentPackages(student) {
  if (Array.isArray(student.subjects) && student.subjects.length > 0) return student.subjects
  if (!student.subjectId) return []
  const minutesPerSession = finiteNumber(student.minutesPerSession, 50) || 50
  return [{
    subjectId: student.subjectId,
    subjectName: student.subjectName,
    totalMinutes: student.totalMinutes ?? finiteNumber(student.totalSessions) * minutesPerSession,
    usedMinutes: student.usedMinutes ?? finiteNumber(student.usedSessions) * minutesPerSession,
    minutesPerSession,
  }]
}

function packageSummary(student) {
  const packages = studentPackages(student)
  const totalMinutes = packages.reduce((sum, item) => {
    const mps = finiteNumber(item.minutesPerSession, 50) || 50
    const total = item.totalMinutes === null || item.totalMinutes === undefined
      ? finiteNumber(item.totalSessions) * mps
      : finiteNumber(item.totalMinutes)
    return sum + total
  }, 0)
  const usedMinutes = packages.reduce((sum, item) => {
    const mps = finiteNumber(item.minutesPerSession, 50) || 50
    const used = item.usedMinutes === null || item.usedMinutes === undefined
      ? finiteNumber(item.usedSessions) * mps
      : finiteNumber(item.usedMinutes)
    return sum + used
  }, 0)
  return { totalMinutes, usedMinutes, remainingMinutes: Math.max(0, totalMinutes - usedMinutes) }
}

function statusCounts(rows) {
  const result = {}
  for (const row of rows) result[row.status || '(missing)'] = (result[row.status || '(missing)'] || 0) + 1
  return Object.fromEntries(Object.entries(result).sort((left, right) => right[1] - left[1]))
}

function sampleIds(rows, limit = 20) {
  return rows.slice(0, limit).map((row) => row.id)
}

function groupBy(rows, keyFor) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyFor(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return groups
}

const collectionIds = [
  'students',
  'teachers',
  'subjects',
  'bookingRequests',
  'lessons',
  'publicLessons',
  'payroll',
  'users',
]

const values = await Promise.all(collectionIds.map(fetchCollection))
const data = Object.fromEntries(collectionIds.map((id, index) => [id, values[index]]))

const students = new Map(data.students.map((row) => [row.id, row]))
const teachers = new Map(data.teachers.map((row) => [row.id, row]))
const subjects = new Map(data.subjects.map((row) => [row.id, row]))
const lessons = new Map(data.lessons.map((row) => [row.id, row]))
const publicLessons = new Map(data.publicLessons.map((row) => [row.id, row]))

const holdingBookings = data.bookingRequests.filter((row) =>
  (row.status === 'pending' || row.status === 'confirmed') && !row.lessonId,
)
const activeWithLesson = data.bookingRequests.filter((row) =>
  (row.status === 'pending' || row.status === 'confirmed') && Boolean(row.lessonId),
)
const bookingsByStudent = groupBy(holdingBookings, (row) => row.studentId || '(missing)')

const bookingOrphanStudents = data.bookingRequests.filter((row) => row.studentId && !students.has(row.studentId))
const bookingOrphanTeachers = data.bookingRequests.filter((row) => row.teacherId && !teachers.has(row.teacherId))
const bookingOrphanSubjects = data.bookingRequests.filter((row) => row.subjectId && !subjects.has(row.subjectId))
const invalidHoldingBookings = holdingBookings.filter((row) =>
  !row.studentId || !row.teacherId || !row.requestedDate || !row.requestedStart || finiteNumber(row.requestedMinutes) <= 0 || bookingPoints(row, teachers.get(row.teacherId)) <= 0,
)
const unmatchedHoldingSubjects = holdingBookings.filter((row) => {
  const student = students.get(row.studentId)
  if (!student || !row.subjectId) return false
  return !studentPackages(student).some((item) => item.subjectId === row.subjectId)
})

const balanceDrifts = []
for (const student of data.students) {
  const bookings = bookingsByStudent.get(student.id) || []
  const actualHeld = bookings.reduce((sum, row) => sum + bookingPoints(row, teachers.get(row.teacherId)), 0)
  const storedHeld = finiteNumber(student.reservedMinutes ?? student.heldMinutes)
  const remaining = packageSummary(student).remainingMinutes
  const drift = Math.round((storedHeld - actualHeld) * 100) / 100
  if (Math.abs(drift) > 0.001 || actualHeld > remaining) {
    balanceDrifts.push({ id: student.id, storedHeld, actualHeld, drift, remaining, overbookedBy: Math.max(0, actualHeld - remaining) })
  }
}

const approvedLessons = data.lessons.filter((row) => row.status === 'approved')
const lessonOrphanStudents = data.lessons.filter((row) => row.studentId && !students.has(row.studentId))
const lessonOrphanTeachers = data.lessons.filter((row) => row.teacherId && !teachers.has(row.teacherId))
const lessonOrphanSubjects = data.lessons.filter((row) => row.subjectId && !subjects.has(row.subjectId))
const approvedMissingPublicMirror = approvedLessons.filter((row) => !publicLessons.has(row.id))
const publicMirrorOrphans = data.publicLessons.filter((row) => !lessons.has(row.id))
const publicMirrorMismatches = approvedLessons.filter((row) => {
  const mirror = publicLessons.get(row.id)
  if (!mirror) return false
  return ['studentId', 'teacherId', 'subjectId', 'date', 'minutes', 'status'].some((field) => String(row[field] ?? '') !== String(mirror[field] ?? ''))
})

const activePayroll = data.payroll.filter((row) => row.lessonId && !row.voided)
const payrollByLesson = groupBy(activePayroll, (row) => row.lessonId)
const approvedMissingPayroll = approvedLessons.filter((row) => !(payrollByLesson.get(row.id) || []).length)
const duplicateActivePayroll = Array.from(payrollByLesson.entries())
  .filter(([, rows]) => rows.length > 1)
  .map(([lessonId, rows]) => ({ lessonId, count: rows.length, payrollIds: rows.map((row) => row.id) }))
const payrollOrphanLessons = activePayroll.filter((row) => !lessons.has(row.lessonId))
const payrollAmountMismatches = activePayroll.filter((row) => {
  const lesson = lessons.get(row.lessonId)
  if (!lesson || lesson.status !== 'approved') return false
  return Math.abs(finiteNumber(row.amount) - finiteNumber(lesson.salary)) > 0.01
})

const approvedPointsByTeacher = new Map()
for (const lesson of approvedLessons) {
  approvedPointsByTeacher.set(lesson.teacherId, (approvedPointsByTeacher.get(lesson.teacherId) || 0) + finiteNumber(lesson.minutes))
}
const teacherMinuteDrifts = data.teachers
  .map((teacher) => {
    const stored = finiteNumber(teacher.totalApprovedMinutes)
    const actual = approvedPointsByTeacher.get(teacher.id) || 0
    return { id: teacher.id, stored, actual, drift: stored - actual }
  })
  .filter((row) => row.drift !== 0)

const approvedPointsByStudent = new Map()
for (const lesson of approvedLessons) {
  approvedPointsByStudent.set(
    lesson.studentId,
    (approvedPointsByStudent.get(lesson.studentId) || 0) + lessonPoints(lesson, teachers.get(lesson.teacherId)),
  )
}
const studentUsedDrifts = data.students
  .map((student) => {
    const stored = packageSummary(student).usedMinutes
    const actual = approvedPointsByStudent.get(student.id) || 0
    return { id: student.id, stored, actual, drift: Math.round((stored - actual) * 100) / 100 }
  })
  .filter((row) => Math.abs(row.drift) > 0.001)

const result = {
  generatedAt: new Date().toISOString(),
  projectId,
  readOnly: true,
  collectionCounts: Object.fromEntries(collectionIds.map((id) => [id, data[id].length])),
  statusCounts: {
    bookingRequests: statusCounts(data.bookingRequests),
    lessons: statusCounts(data.lessons),
    payroll: statusCounts(data.payroll),
  },
  bookings: {
    holding: holdingBookings.length,
    activeWithLesson: activeWithLesson.length,
    orphanStudents: bookingOrphanStudents.length,
    orphanTeachers: bookingOrphanTeachers.length,
    orphanSubjects: bookingOrphanSubjects.length,
    invalidHolding: invalidHoldingBookings.length,
    unmatchedHoldingSubjects: unmatchedHoldingSubjects.length,
    balanceDriftStudents: balanceDrifts.length,
    balanceDriftPositive: balanceDrifts.filter((row) => row.drift > 0).length,
    balanceDriftNegative: balanceDrifts.filter((row) => row.drift < 0).length,
    overbookedStudents: balanceDrifts.filter((row) => row.overbookedBy > 0).length,
    totalAbsoluteDrift: Math.round(balanceDrifts.reduce((sum, row) => sum + Math.abs(row.drift), 0) * 100) / 100,
    samples: {
      activeWithLesson: sampleIds(activeWithLesson),
      orphanStudents: sampleIds(bookingOrphanStudents),
      orphanTeachers: sampleIds(bookingOrphanTeachers),
      orphanSubjects: sampleIds(bookingOrphanSubjects),
      invalidHolding: sampleIds(invalidHoldingBookings),
      unmatchedHoldingSubjects: sampleIds(unmatchedHoldingSubjects),
      balanceDrifts: balanceDrifts.slice(0, 20),
    },
  },
  lessonsAndMirrors: {
    approvedLessons: approvedLessons.length,
    orphanStudents: lessonOrphanStudents.length,
    orphanTeachers: lessonOrphanTeachers.length,
    orphanSubjects: lessonOrphanSubjects.length,
    approvedMissingPublicMirror: approvedMissingPublicMirror.length,
    publicMirrorOrphans: publicMirrorOrphans.length,
    publicMirrorMismatches: publicMirrorMismatches.length,
    samples: {
      approvedMissingPublicMirror: sampleIds(approvedMissingPublicMirror),
      publicMirrorOrphans: sampleIds(publicMirrorOrphans),
      publicMirrorMismatches: sampleIds(publicMirrorMismatches),
    },
  },
  payrollIntegrity: {
    activeLessonPayrollRows: activePayroll.length,
    approvedMissingPayroll: approvedMissingPayroll.length,
    duplicateActivePayrollLessons: duplicateActivePayroll.length,
    orphanLessons: payrollOrphanLessons.length,
    amountMismatches: payrollAmountMismatches.length,
    samples: {
      approvedMissingPayroll: sampleIds(approvedMissingPayroll),
      duplicateActivePayroll: duplicateActivePayroll.slice(0, 20),
      orphanLessons: sampleIds(payrollOrphanLessons),
      amountMismatches: sampleIds(payrollAmountMismatches),
    },
  },
  aggregates: {
    teacherMinuteDrifts: teacherMinuteDrifts.length,
    studentUsedPointDrifts: studentUsedDrifts.length,
    samples: {
      teacherMinuteDrifts: teacherMinuteDrifts.slice(0, 20),
      studentUsedPointDrifts: studentUsedDrifts.slice(0, 20),
    },
  },
}

console.log(JSON.stringify(result, null, 2))
