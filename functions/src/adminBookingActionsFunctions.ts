import { Firestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { absenceMinutes, laterSameDayAbsenceBookings, type AbsenceBooking } from './adminAbsencePolicy'

const db = new Firestore()
type BookingRow = AbsenceBooking & { ref: DocumentReference; subjectName?: string; currency?: string }

function fail(reason: string, message: string): never {
  throw new HttpsError('failed-precondition', message, { reason })
}

/**
 * Giáo vụ ghi nhận học viên vắng từ một ca đã xếp. Việc trừ quỹ và tính lương
 * vẫn đi qua màn duyệt buổi hiện có; giao dịch này chỉ tạo buổi chờ duyệt và
 * gắn lessonId để giáo viên/admin không thể điểm danh trùng cùng ca.
 */
export const adminMarkStudentAbsent = onCall({ region: 'asia-southeast1' }, async (request) => {
  const actorUid = request.auth?.uid
  if (!actorUid) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập lại.')
  const actor = await db.collection('users').doc(actorUid).get()
  if (!['admin', 'student_manager', 'teacher_manager'].includes(String(actor.data()?.role || ''))) {
    throw new HttpsError('permission-denied', 'Chỉ giáo vụ được điểm danh từ lịch đã đặt.')
  }

  const bookingId = typeof request.data?.bookingId === 'string' ? request.data.bookingId.trim() : ''
  const absenceType = request.data?.absenceType
  const note = typeof request.data?.note === 'string' ? request.data.note.trim() : ''
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(bookingId)
    || !['with_permission', 'without_permission'].includes(absenceType)
    || note.length < 5 || note.length > 500) {
    throw new HttpsError('invalid-argument', 'Chọn loại vắng và ghi lý do từ 5 đến 500 ký tự.')
  }

  const bookingRef = db.collection('bookingRequests').doc(bookingId)
  const result = await db.runTransaction(async (tx) => {
    const bookingSnap = await tx.get(bookingRef)
    if (!bookingSnap.exists) fail('BOOKING_NOT_FOUND', 'Không tìm thấy ca học. Vui lòng tải lại trang.')
    const booking = bookingSnap.data() || {}
    if (booking.status !== 'confirmed' || booking.lessonId) {
      fail('BOOKING_ALREADY_PROCESSED', 'Ca đã được điểm danh hoặc đã thay đổi. Vui lòng tải lại trang.')
    }
    if (booking.groupClassId || (Array.isArray(booking.groupClassMemberIds) && booking.groupClassMemberIds.length > 1)) {
      fail('GROUP_BOOKING', 'Ca lớp nhóm cần được xử lý ở màn điểm danh lớp nhóm.')
    }
    const date = String(booking.requestedDate || '')
    const start = String(booking.requestedStart || '')
    const startsAt = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(start)
      ? Date.parse(`${date}T${start}:00+07:00`) : NaN
    if (!Number.isFinite(startsAt)
      || new Date(startsAt + 7 * 60 * 60_000).toISOString().slice(0, 10) !== date
      || Date.now() < startsAt) {
      fail('BOOKING_NOT_STARTED', 'Chỉ đánh dấu vắng khi ca đã bắt đầu.')
    }
    const studentId = String(booking.studentId || '')
    const teacherId = String(booking.teacherId || '')
    const subjectId = String(booking.subjectId || '')
    if (!studentId || !teacherId || !subjectId) {
      fail('BOOKING_INCOMPLETE', 'Ca thiếu học viên, giáo viên hoặc môn học. Vui lòng kiểm tra lịch.')
    }
    const studentRef = db.collection('students').doc(studentId)
    const teacherRef = db.collection('teachers').doc(teacherId)
    const sameDayQuery = db.collection('bookingRequests')
      .where('status', '==', 'confirmed')
      .where('teacherId', '==', teacherId)
      .where('requestedDate', '==', date)
    const [studentSnap, teacherSnap, sameDaySnap] = await Promise.all([
      tx.get(studentRef), tx.get(teacherRef), tx.get(sameDayQuery),
    ])
    if (!studentSnap.exists || !teacherSnap.exists) {
      fail('PROFILE_NOT_FOUND', 'Không tìm thấy hồ sơ học viên hoặc giáo viên.')
    }
    const student = studentSnap.data() || {}
    const teacher = teacherSnap.data() || {}
    const rate = Number(teacher.pointsPer25Minutes)
    const pointsPer25Minutes = Number.isFinite(rate) && rate > 0 ? Math.round(rate) : 25
    const minutes = absenceMinutes(absenceType, 0)
    const remaining = Number(student.remainingMinutes ?? (Number(student.remainingSessions || 0) * Number(student.minutesPerSession || 50)))
    const subjectPackages = Array.isArray(student.subjects) && student.subjects.length > 0
      ? student.subjects.filter((item: { subjectId?: string }) => item.subjectId === subjectId)
      : (student.subjectId === subjectId ? [student] : [])
    const subject = subjectPackages[0]
    if (subjectPackages.length === 0) {
      fail('SUBJECT_NOT_FOUND', 'Học viên không còn gói môn của ca này.')
    }
    const subjectRemaining = Math.max(...subjectPackages.map((item: { remainingMinutes?: number; remainingSessions?: number; minutesPerSession?: number }) =>
      Number(item.remainingMinutes ?? (Number(item.remainingSessions || 0) * Number(item.minutesPerSession || 50)))))
    if (student.status === 'reserved' || student.status === 'expired'
      || !Number.isFinite(subjectRemaining) || subjectRemaining <= 0
      || subjectRemaining < (absenceType === 'without_permission' ? pointsPer25Minutes : 0)) {
      fail('STUDENT_QUOTA_UNAVAILABLE', 'Quỹ môn học không còn đủ để ghi nhận buổi vắng.')
    }

    // Giống luồng điểm danh của gia sư: các ca sau cùng ngày/cùng lớp cũng vắng,
    // nhưng chỉ ca đầu được tính 25 phút khi vắng không phép.
    const currentRow: BookingRow = { ...booking, id: bookingId, ref: bookingRef }
    const earlierUnmarked = sameDaySnap.docs.some((snapshot) => {
      const item = snapshot.data()
      return snapshot.id !== bookingId
        && !item.lessonId
        && item.studentId === studentId
        && (!item.studentCode || !booking.studentCode || item.studentCode === booking.studentCode)
        && item.subjectId === subjectId
        && (item.classHuntId || '') === (booking.classHuntId || '')
        && !item.groupClassId
        && String(item.requestedStart || '') < start
    })
    if (earlierUnmarked) fail('EARLIER_SLOT_UNMARKED', 'Hãy đánh dấu ca sớm nhất chưa điểm danh trong ngày để không tính phí vắng hai lần.')
    const laterBookings = laterSameDayAbsenceBookings(
      currentRow,
      sameDaySnap.docs.map((snapshot): BookingRow => ({ ...snapshot.data(), id: snapshot.id, ref: snapshot.ref })),
    )
    if (laterBookings.length > 20) fail('TOO_MANY_BOOKINGS', 'Có quá nhiều ca sau trong ngày. Vui lòng xử lý thủ công.')
    const targetBookings = [currentRow, ...laterBookings]
    const lessonRefs = targetBookings.map((item) => db.collection('lessons').doc(`admin-absence-${item.id}`))
    const existingLessons = await Promise.all(lessonRefs.map((ref) => tx.get(ref)))
    if (existingLessons.some((snapshot) => snapshot.exists)) {
      fail('BOOKING_ALREADY_PROCESSED', 'Một ca trong ngày đã được xử lý. Vui lòng tải lại trang.')
    }
    targetBookings.forEach((item, index) => {
      const lessonRef = lessonRefs[index]
      const slot = item
      tx.create(lessonRef, {
      studentId,
      studentCode: student.code || booking.studentCode || '',
      studentName: student.name || booking.studentName || '',
      teacherId,
      teacherCode: teacher.code || booking.teacherCode || '',
      teacherName: teacher.name || booking.teacherName || '',
      subjectId,
      subjectName: slot.subjectName || subject?.subjectName || '',
      date,
      minutes: absenceMinutes(absenceType, index),
      comment: index === 0 ? `Giáo vụ ghi nhận học viên ${absenceType === 'with_permission' ? 'vắng có phép' : 'vắng không phép'}: ${note}` : '',
      homework: '',
      book: 'Học viên vắng',
      pages: '',
      report: null,
      rating: null,
      ...(absenceType === 'without_permission' && index === 0 ? { absenceReport: { advice: note } } : {}),
      imageURLs: [],
      attendanceStatus: absenceType,
      pointsPer25Minutes,
      status: 'pending',
      sessionsBeforeApproval: Number(student.remainingSessions || 0),
      sessionsAfterApproval: Number(student.remainingSessions || 0),
      minutesBeforeApproval: remaining,
      minutesAfterApproval: remaining,
      teacherLevel: Number(teacher.level || 1),
      pricePerMinute: 0,
      currency: slot.currency || booking.currency || 'VND',
      salary: 0,
      bookingRequestId: item.id,
      ...(index > 0 ? { absenceFollowUpOf: lessonRefs[0].id } : {}),
      adminMarkedAbsence: true,
      adminMarkedBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
    })
      tx.update(item.ref, { lessonId: lessonRef.id })
    })
    tx.create(db.collection('adminLogs').doc(), {
      adminId: actorUid,
      action: 'ADMIN_MARK_STUDENT_ABSENT',
      targetType: 'bookingRequest',
      targetId: bookingId,
      changes: { lessonId: lessonRefs[0].id, lessonIds: lessonRefs.map((ref) => ref.id), bookingIds: targetBookings.map((item) => item.id), studentId, teacherId, absenceType, note, minutes },
      createdAt: FieldValue.serverTimestamp(),
    })
    return { lessonId: lessonRefs[0].id, lessonCount: lessonRefs.length }
  })
  return result
})
