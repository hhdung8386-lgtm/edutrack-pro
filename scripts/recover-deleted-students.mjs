import process from 'node:process'

const projectId = process.env.FIRESTORE_PROJECT_ID || 'edutrack-pro-78f59'
const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)'
const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim()
const apply = process.argv.includes('--apply')
const baseName = `projects/${projectId}/databases/${databaseId}/documents`
const baseUrl = `https://firestore.googleapis.com/v1/${baseName}`

if (!token) throw new Error('GOOGLE_OAUTH_ACCESS_TOKEN is required; the script never selects a gcloud account implicitly.')

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('referenceValue' in value) return value.referenceValue
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {})
  return null
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]))
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot encode non-finite number: ${value}`)
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } }
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } }
  throw new Error(`Unsupported Firestore value type: ${typeof value}`)
}

function encodeFields(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]))
}

async function fetchCollection(collectionId) {
  const rows = []
  let pageToken = ''
  do {
    const url = new URL(`${baseUrl}/${collectionId}`)
    url.searchParams.set('pageSize', '1000')
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

function groupBy(rows, keyFor) {
  const grouped = new Map()
  for (const row of rows) {
    const key = keyFor(row)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }
  return grouped
}

function finite(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function firstNonEmpty(rows, keys) {
  for (const row of rows) {
    for (const key of keys) {
      if (typeof row[key] === 'string' && row[key].trim()) return row[key].trim()
    }
  }
  return ''
}

function mostFrequentNonEmpty(rows, keys) {
  const counts = new Map()
  for (const row of rows) {
    for (const key of keys) {
      const value = typeof row[key] === 'string' ? row[key].trim() : ''
      if (value) counts.set(value, (counts.get(value) || 0) + 1)
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || ''
}

function eventTime(row) {
  const raw = row.approvedAt || row.date || row.createdAt || row.createTime || ''
  const timestamp = Date.parse(raw)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function lessonQuota(lesson) {
  const explicit = finite(lesson.points, -1)
  if (explicit >= 0) return explicit
  const requestedPoints = finite(lesson.requestedPoints, -1)
  if (requestedPoints >= 0) return requestedPoints
  return Math.max(0, finite(lesson.minutes ?? lesson.requestedMinutes))
}

function inferSubjectPackage(subjectId, subjectBookings, subjectLessons, subject) {
  const approvedLessons = subjectLessons
    .filter((lesson) => lesson.status === 'approved' || !lesson.status)
    .sort((left, right) => eventTime(left) - eventTime(right))
  let usedMinutes = 0
  let inferredTotal = 0

  for (const lesson of approvedLessons) {
    const before = finite(lesson.minutesBeforeApproval, -1)
    const after = finite(lesson.minutesAfterApproval, -1)
    if (before >= 0) inferredTotal = Math.max(inferredTotal, before + usedMinutes)
    const deducted = before >= 0 && after >= 0 && before >= after ? before - after : lessonQuota(lesson)
    usedMinutes += Math.max(0, deducted)
    if (after >= 0) inferredTotal = Math.max(inferredTotal, after + usedMinutes)
  }

  const heldCandidates = subjectBookings.flatMap((booking) => [
    booking.heldMinutesAfterConfirm,
    booking.heldPointsAfterConfirm,
    booking.reservedMinutesAfterConfirm,
    booking.studentRemainingMinutesBeforeConfirm,
    booking.minutesBeforeConfirm,
  ]).map((value) => finite(value, -1)).filter((value) => value >= 0)
  inferredTotal = Math.max(inferredTotal, usedMinutes, ...heldCandidates)

  const totalMinutes = Math.round(inferredTotal * 100) / 100
  const normalizedUsed = Math.min(totalMinutes, Math.round(usedMinutes * 100) / 100)
  const remainingMinutes = Math.max(0, Math.round((totalMinutes - normalizedUsed) * 100) / 100)
  const minutesPerSession = 25
  const earliestDate = [...subjectBookings, ...subjectLessons]
    .map((row) => row.createTime || row.createdAt || row.date)
    .filter(Boolean)
    .sort()[0]
  const created = earliestDate ? new Date(earliestDate) : new Date()
  const createdAt = Number.isNaN(created.getTime())
    ? new Date().toLocaleDateString('en-GB')
    : created.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok' })
  const curriculumFromHistory = mostFrequentNonEmpty([...subjectLessons, ...subjectBookings], [
    'curriculumLink',
    'textbookURL',
    'bookLink',
  ])

  return {
    subjectId,
    subjectName: subject?.name || firstNonEmpty([...subjectBookings, ...subjectLessons], ['subjectName']) || 'Môn học đã khôi phục',
    totalSessions: totalMinutes / minutesPerSession,
    usedSessions: normalizedUsed / minutesPerSession,
    remainingSessions: remainingMinutes / minutesPerSession,
    minutesPerSession,
    totalMinutes,
    usedMinutes: normalizedUsed,
    remainingMinutes,
    pricePerMinute: finite(subject?.pricePerMinute),
    pricePerMinuteVN: finite(subject?.pricePerMinuteVN, undefined),
    pricePerMinutePH: finite(subject?.pricePerMinutePH, undefined),
    pricePerMinuteNative: finite(subject?.pricePerMinuteNative, undefined),
    currency: subject?.currency || 'VND',
    countryPrices: subject?.countryPrices || {},
    batches: [{
      id: 'recovery-1',
      createdAt,
      totalSessions: totalMinutes / minutesPerSession,
      kind: 'payment',
      learningMinutes: totalMinutes,
      diamonds: totalMinutes,
      content: 'Quyền học được khôi phục',
      paymentDate: createdAt,
      note: 'Khôi phục từ lịch sử lịch học sau khi hồ sơ bị xóa.',
    }],
    curriculumLink: curriculumFromHistory,
    supplementaryCurriculumLink: '',
    timetableNote: '',
    studentRequests: [],
    focusSkills: [],
  }
}

const [students, subjects, bookings, lessons] = await Promise.all([
  fetchCollection('students'),
  fetchCollection('subjects'),
  fetchCollection('bookingRequests'),
  fetchCollection('lessons'),
])
const studentsById = new Map(students.map((row) => [row.id, row]))
const studentByCode = new Map(students.map((row) => [String(row.code || '').toUpperCase(), row]))
const subjectsById = new Map(subjects.map((row) => [row.id, row]))
const bookingsByStudent = groupBy(bookings, (row) => row.studentId || '')
const lessonsByStudent = groupBy(lessons, (row) => row.studentId || '')
const deletedEvidence = bookings.filter((booking) => booking.releasedBy === 'system:student-deleted' && booking.studentId)
const deletedStudentIds = [...new Set(deletedEvidence.map((booking) => booking.studentId))]
  .filter((studentId) => !studentsById.has(studentId))

const recoveryRows = []
for (const studentId of deletedStudentIds) {
  const studentBookings = bookingsByStudent.get(studentId) || []
  const studentLessons = lessonsByStudent.get(studentId) || []
  const evidence = [...studentBookings, ...studentLessons]
  const code = mostFrequentNonEmpty(evidence, ['studentCode']).toUpperCase()
  const name = mostFrequentNonEmpty(evidence, ['studentName'])
  if (!code || !name) continue
  if (studentByCode.has(code)) {
    console.warn(`SKIP ${studentId}: code ${code} already belongs to ${studentByCode.get(code).id}`)
    continue
  }

  const subjectIds = [...new Set(evidence.map((row) => row.subjectId).filter(Boolean))]
  const packages = subjectIds.map((subjectId) => inferSubjectPackage(
    subjectId,
    studentBookings.filter((row) => row.subjectId === subjectId),
    studentLessons.filter((row) => row.subjectId === subjectId),
    subjectsById.get(subjectId),
  )).filter((pkg) => pkg.totalMinutes > 0)
  const primary = packages.find((pkg) => pkg.remainingMinutes > 0) || packages[0]
  if (!primary) {
    console.warn(`SKIP ${studentId} (${code}): no recoverable quota evidence`)
    continue
  }

  if (code === 'HSNGEA4J' && !primary.curriculumLink) {
    primary.curriculumLink = 'https://drive.google.com/drive/folders/1IyRfK47Pl3SAvTpmYuO-Slt-Hv-WgVmc'
  }

  const totalMinutes = packages.reduce((sum, pkg) => sum + pkg.totalMinutes, 0)
  const usedMinutes = packages.reduce((sum, pkg) => sum + pkg.usedMinutes, 0)
  const remainingMinutes = packages.reduce((sum, pkg) => sum + pkg.remainingMinutes, 0)
  const sourceTimes = evidence.map((row) => row.createTime).filter(Boolean).sort()
  const createdAt = sourceTimes[0] ? new Date(sourceTimes[0]) : new Date()
  const now = new Date()
  const studentData = {
    code,
    name,
    recordType: 'individual',
    parentPhone: '',
    email: code === 'HSNGEA4J' ? 'phamquan20022007@gmail.com' : '',
    subjectId: primary.subjectId,
    subjectName: primary.subjectName,
    learningScheduleType: 'fixed',
    totalSessions: totalMinutes / 25,
    usedSessions: usedMinutes / 25,
    remainingSessions: remainingMinutes / 25,
    minutesPerSession: 25,
    totalMinutes,
    usedMinutes,
    remainingMinutes,
    reservedMinutes: 0,
    heldMinutes: 0,
    status: remainingMinutes > 0 ? 'active' : 'expired',
    subjects: packages,
    classroomURL: mostFrequentNonEmpty(studentBookings, ['classroomURL', 'classroomUrl']),
    createdAt,
    updatedAt: now,
    recoverySource: 'released-bookings-and-approved-lessons-v1',
    recoveredAt: now,
  }
  recoveryRows.push({
    studentId,
    code,
    name,
    bookingEvidence: studentBookings.length,
    approvedLessons: studentLessons.filter((lesson) => lesson.status === 'approved' || !lesson.status).length,
    totalMinutes,
    usedMinutes,
    remainingMinutes,
    subjects: packages.map((pkg) => ({ id: pkg.subjectId, name: pkg.subjectName, curriculumLink: pkg.curriculumLink || '' })),
    studentData,
  })
}

console.table(recoveryRows.map(({ studentId, code, name, bookingEvidence, approvedLessons, totalMinutes, usedMinutes, remainingMinutes }) => ({
  studentId,
  code,
  name,
  bookingEvidence,
  approvedLessons,
  totalMinutes,
  usedMinutes,
  remainingMinutes,
})))

if (!apply) {
  console.log(`DRY RUN: ${recoveryRows.length} hồ sơ có thể khôi phục. Chạy lại với --apply sau khi rà soát.`)
  process.exit(0)
}

if (!recoveryRows.some((row) => row.code === 'HSNGEA4J')) throw new Error('Safety check failed: HSNGEA4J is not in the recovery set.')
if (recoveryRows.length !== deletedStudentIds.length) {
  throw new Error(`Safety check failed: prepared ${recoveryRows.length}/${deletedStudentIds.length} deleted student records.`)
}

const writes = recoveryRows.flatMap((row) => {
  const logId = `recovery_${row.studentId}_${Date.now()}`
  return [
    {
      update: {
        name: `${baseName}/students/${row.studentId}`,
        fields: encodeFields(row.studentData),
      },
      currentDocument: { exists: false },
    },
    {
      update: {
        name: `${baseName}/adminLogs/${logId}`,
        fields: encodeFields({
          action: 'RECOVER_DELETED_STUDENT',
          targetType: 'student',
          targetId: row.studentId,
          targetCode: row.code,
          targetName: row.name,
          sourceBookingCount: row.bookingEvidence,
          sourceApprovedLessonCount: row.approvedLessons,
          recoveredTotalMinutes: row.totalMinutes,
          recoveredUsedMinutes: row.usedMinutes,
          recoveredRemainingMinutes: row.remainingMinutes,
          source: 'recover-deleted-students.mjs-v1',
          createdAt: new Date(),
        }),
      },
      currentDocument: { exists: false },
    },
  ]
})

const commitResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:commit`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ writes }),
})
if (!commitResponse.ok) throw new Error(`Commit failed: ${commitResponse.status} ${await commitResponse.text()}`)
const commit = await commitResponse.json()
console.log(`APPLIED: restored ${recoveryRows.length} students atomically at ${commit.commitTime || 'unknown time'}.`)
