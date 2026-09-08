import { useCallback, useEffect, useState } from 'react'
import { runTransaction, doc, collection, serverTimestamp, getDoc } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { BookingRequest, Lesson, Student, StudentSubject, Subject } from '@/types'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { formatMoney, formatPricePerMinute } from '@/lib/constants'
import { useAuthStore } from '@/stores/authStore'
import { assertBookingsAvailableForApproval, assertBookingsMatchLessonForApproval, assertBookingTimeRangeIntegrity, bookingHoldMinutes, resolveLessonBookings } from '@/lib/lessonBooking'
import { getBookingPoints, getLessonPoints } from '@/lib/points'
import { isZeroMinuteExcusedAbsence } from '@/lib/lessonAttendance'
import { getCountryRate } from '@/lib/countryPricing'
import { buildPayrollApprovalFields } from '@/lib/payrollReapproval'
import {
  SubjectMismatchReconciliationPanel,
  type SubjectMismatchReconciliationState,
} from '@/components/lessons/SubjectMismatchReconciliationPanel'

interface ApproveModalProps {
  lesson: Lesson
  onClose: () => void
}

export function ApproveModal({ lesson, onClose }: ApproveModalProps) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [approveSubjectId, setApproveSubjectId] = useState<string>('')
  const [approveStudentSubjects, setApproveStudentSubjects] = useState<StudentSubject[]>([])
  const [loadingStudent, setLoadingStudent] = useState(true)
  const [reconciliation, setReconciliation] = useState<SubjectMismatchReconciliationState>({
    candidateAvailable: false,
    required: false,
    draft: null,
  })
  const handleReconciliationStateChange = useCallback((next: SubjectMismatchReconciliationState) => {
    setReconciliation(next)
  }, [])
  const lessonSubjectPackages = approveStudentSubjects.filter((subject) => subject.subjectId === lesson.subjectId)
  const hasUniqueLessonSubjectPackage = lessonSubjectPackages.length === 1

  useEffect(() => {
    const fetchStudentSubjects = async () => {
      try {
        const studentSnap = await getDoc(doc(db, 'students', lesson.studentId))
        if (studentSnap.exists()) {
          const s = studentSnap.data() as Student
          const subjects = s.subjects && s.subjects.length > 0
            ? s.subjects
            : s.subjectId
              ? [{
                  subjectId: s.subjectId,
                  subjectName: s.subjectName || 'Chưa rõ',
                  totalSessions: s.totalSessions || 0,
                  usedSessions: s.usedSessions || 0,
                  remainingSessions: s.remainingSessions || 0,
                  minutesPerSession: s.minutesPerSession || 50,
                  totalMinutes: s.totalMinutes ?? (s.totalSessions * (s.minutesPerSession || 50)),
                  usedMinutes: s.usedMinutes ?? ((s.usedSessions || 0) * (s.minutesPerSession || 50)),
                  remainingMinutes: s.remainingMinutes ?? ((s.remainingSessions || 0) * (s.minutesPerSession || 50)),
                  pricePerMinute: 0,
                }]
              : []

          const resolvedSubjects = await Promise.all(subjects.map(async (sub) => {
            const subjSnap = await getDoc(doc(db, 'subjects', sub.subjectId))
            const data = subjSnap.exists() ? subjSnap.data() : null
            return {
              ...sub,
              pricePerMinute: data?.pricePerMinute ?? sub.pricePerMinute ?? 0,
              pricePerMinuteVN: data?.pricePerMinuteVN ?? sub.pricePerMinuteVN ?? data?.pricePerMinute ?? sub.pricePerMinute ?? 0,
              pricePerMinutePH: data?.pricePerMinutePH ?? sub.pricePerMinutePH ?? data?.pricePerMinute ?? sub.pricePerMinute ?? 0,
              pricePerMinuteNative: data?.pricePerMinuteNative ?? sub.pricePerMinuteNative ?? data?.pricePerMinute ?? sub.pricePerMinute ?? 0,
              otherCountriesPrices: data?.otherCountriesPrices ?? sub.otherCountriesPrices ?? {},
              countryPrices: data?.countryPrices ?? sub.countryPrices ?? null,
            }
          }))

          setApproveStudentSubjects(resolvedSubjects)
          
          const matchingLessonPackages = resolvedSubjects.filter(sub => sub.subjectId === lesson.subjectId)
          if (matchingLessonPackages.length === 1) {
            setApproveSubjectId(lesson.subjectId)
          } else {
            // A different course may still have sessions, but it must never be
            // selected automatically to pay for a historical mismatched booking.
            setApproveSubjectId('')
          }
        }
      } catch (err) {
        console.error('Error fetching student packages:', err)
      } finally {
        setLoadingStudent(false)
      }
    }
    fetchStudentSubjects()
  }, [lesson])

  const handleApprove = async () => {
    if (!approveSubjectId) return
    setLoading(true)
    try {
      const chosenSubjectPkg = approveStudentSubjects.find(s => s.subjectId === approveSubjectId)
      if (!chosenSubjectPkg) {
        toast.error('Môn học được chọn không hợp lệ')
        return
      }
      const reconciliationDraft = reconciliation.required ? reconciliation.draft : null
      if (reconciliation.required && !reconciliationDraft) {
        toast.error('Vui lòng hoàn tất lý do và xác nhận đối soát môn lịch cũ trước khi duyệt.')
        return
      }
      if (reconciliationDraft && reconciliationDraft.settlementSubjectId !== approveSubjectId) {
        toast.error('Gói hạch toán vừa thay đổi. Vui lòng xác nhận lại phần đối soát.')
        return
      }
      if (approveSubjectId !== lesson.subjectId) {
        toast.error('Chỉ được hạch toán vào đúng gói môn của buổi điểm danh. Không thể chọn một gói khác.')
        return
      }

      const zeroMinuteExcusedAbsence = isZeroMinuteExcusedAbsence(lesson)
      const matchedBookings = await resolveLessonBookings({
        id: lesson.id,
        bookingRequestId: lesson.bookingRequestId,
        bookingRequestIds: lesson.bookingRequestIds,
        scheduleCheck: lesson.scheduleCheck,
        studentId: lesson.studentId,
        teacherId: lesson.teacherId,
        date: lesson.date,
        minutes: lesson.minutes,
        subjectId: lesson.subjectId,
        subjectName: lesson.subjectName,
        groupClassId: lesson.groupClassId,
        isZeroMinuteExcusedAbsence: zeroMinuteExcusedAbsence,
      }, { subjectMismatchReconciliation: reconciliationDraft })
      if (!zeroMinuteExcusedAbsence) assertBookingTimeRangeIntegrity(matchedBookings)

      await runTransaction(
        db,
        async (tx) => {
          const studentRef = doc(db, 'students', lesson.studentId)
          const lessonRef = doc(db, 'lessons', lesson.id)

          const [lessonSnap, studentSnap] = await Promise.all([
            tx.get(lessonRef),
            tx.get(studentRef),
          ])

          if (!lessonSnap.exists()) throw new Error('Buổi dạy không tồn tại')
          if (!studentSnap.exists()) throw new Error('Học viên không tồn tại')

          const studentData = studentSnap.data() as Student
          const lessonNow = lessonSnap.data() as Lesson
          if (lessonNow.status !== 'pending' && lessonNow.status !== 'rejected') throw new Error('LESSON_ALREADY_PROCESSED')
          if (
            lessonNow.studentId !== lesson.studentId
            || lessonNow.teacherId !== lesson.teacherId
            || lessonNow.date !== lesson.date
            || Number(lessonNow.minutes) !== Number(lesson.minutes)
            || (lessonNow.groupClassId || '') !== (lesson.groupClassId || '')
          ) throw new Error('BOOKING_STATE_CHANGED')
          if (approveSubjectId !== lessonNow.subjectId) {
            throw new Error('BOOKING_SUBJECT_MISMATCH')
          }
          if (reconciliationDraft && reconciliationDraft.settlementSubjectId !== approveSubjectId) {
            throw new Error('BOOKING_RECONCILIATION_INVALID')
          }
          const bookingRefs = matchedBookings.map((booking) => doc(db, 'bookingRequests', booking.id))
          const [teacherSnap, subjectCatalogSnap, ...bookingSnaps] = await Promise.all([
            tx.get(doc(db, 'teachers', lesson.teacherId)),
            tx.get(doc(db, 'subjects', approveSubjectId)),
            ...bookingRefs.map((bookingRef) => tx.get(bookingRef)),
          ])
          const teacherData = teacherSnap.data()
          const subjectCatalogData = subjectCatalogSnap.exists()
            ? subjectCatalogSnap.data() as Subject
            : null
          const bookingNows = bookingSnaps
            .filter((snap) => snap.exists())
            .map((snap) => ({ id: snap.id, ...snap.data() } as BookingRequest))
          if (bookingNows.length !== matchedBookings.length) throw new Error('BOOKING_STATE_CHANGED')
          assertBookingsAvailableForApproval(bookingNows, lesson.id)
          const zeroMinuteExcusedAbsenceNow = isZeroMinuteExcusedAbsence(lessonNow)
          assertBookingsMatchLessonForApproval(bookingNows, {
            id: lesson.id,
            bookingRequestId: lessonNow.bookingRequestId,
            bookingRequestIds: lessonNow.bookingRequestIds,
            scheduleCheck: lessonNow.scheduleCheck,
            studentId: lessonNow.studentId,
            teacherId: lessonNow.teacherId,
            date: lessonNow.date,
            minutes: lessonNow.minutes,
            subjectId: lessonNow.subjectId,
            subjectName: lessonNow.subjectName,
            groupClassId: lessonNow.groupClassId,
            isZeroMinuteExcusedAbsence: zeroMinuteExcusedAbsenceNow,
          }, reconciliationDraft)
          if (!zeroMinuteExcusedAbsenceNow) assertBookingTimeRangeIntegrity(bookingNows)
          const bookingNow = bookingNows[0] || null
          const teacherLevel = (lessonNow.teacherLevel ?? teacherData?.level ?? 1) || 1

          const isAbsenceLesson = lessonNow.attendanceStatus === 'with_permission'
            || lessonNow.attendanceStatus === 'without_permission'
            || zeroMinuteExcusedAbsenceNow
          const lessonPoints = isAbsenceLesson
            ? getLessonPoints(lessonNow, teacherData)
            : bookingNows.length > 1
              ? bookingNows.reduce((sum, booking) => sum + getBookingPoints(booking, teacherData), 0)
              : bookingNow
                ? getBookingPoints(bookingNow, teacherData)
              : getLessonPoints(lessonNow, teacherData)

          // Initialize subjects array for backward compatibility if needed
          const updatedSubjects: StudentSubject[] = studentData.subjects && studentData.subjects.length > 0
            ? [...studentData.subjects]
            : studentData.subjectId
              ? [{
                  subjectId: studentData.subjectId,
                  subjectName: studentData.subjectName || 'Chưa rõ',
                  totalSessions: studentData.totalSessions || 0,
                  usedSessions: studentData.usedSessions || 0,
                  remainingSessions: studentData.remainingSessions || 0,
                  minutesPerSession: studentData.minutesPerSession || 50,
                  totalMinutes: studentData.totalMinutes ?? (studentData.totalSessions * (studentData.minutesPerSession || 50)),
                  usedMinutes: studentData.usedMinutes ?? ((studentData.usedSessions || 0) * (studentData.minutesPerSession || 50)),
                  remainingMinutes: studentData.remainingMinutes ?? ((studentData.remainingSessions || 0) * (studentData.minutesPerSession || 50)),
                  pricePerMinute: subjectCatalogData?.pricePerMinute ?? chosenSubjectPkg.pricePerMinute ?? 0,
                  pricePerMinuteVN: subjectCatalogData?.pricePerMinuteVN ?? chosenSubjectPkg.pricePerMinuteVN ?? 0,
                  pricePerMinutePH: subjectCatalogData?.pricePerMinutePH ?? chosenSubjectPkg.pricePerMinutePH ?? 0,
                  pricePerMinuteNative: subjectCatalogData?.pricePerMinuteNative ?? chosenSubjectPkg.pricePerMinuteNative ?? 0,
                  currency: subjectCatalogData?.currency || chosenSubjectPkg.currency || 'VND',
                  ...(chosenSubjectPkg.curriculumLink ? { curriculumLink: chosenSubjectPkg.curriculumLink } : {}),
                }]
              : []

          // Deduct from the selected subject package
          const matchingSubjectIndexes = updatedSubjects.flatMap((sub, index) => (
            sub.subjectId === approveSubjectId ? [index] : []
          ))
          if (matchingSubjectIndexes.length !== 1) throw new Error('BOOKING_SUBJECT_PACKAGE_AMBIGUOUS')
          const sIdx = matchingSubjectIndexes[0] ?? -1
          if (sIdx === -1) {
            throw new Error(`Không tìm thấy gói môn học ${chosenSubjectPkg.subjectName}`)
          }

          const subPkg = updatedSubjects[sIdx]
          if (Number(subPkg.remainingMinutes || 0) < lessonPoints) {
            throw new Error('NOT_ENOUGH_POINTS')
          }
          const freshSubjectPkg = subPkg
          const { price: pricePerMinute, currency } = getCountryRate(
            freshSubjectPkg,
            teacherData?.country || 'VN',
          )
          const salary = calculateSalary(lessonNow.minutes, pricePerMinute, teacherLevel, currency)
          const month = lessonNow.date.slice(0, 7)
          const newSubUsedMinutes = subPkg.usedMinutes + lessonPoints
          const newSubRemainingMinutes = subPkg.totalMinutes - newSubUsedMinutes
          const subMps = subPkg.minutesPerSession || 50
          const subUsedSessionsRaw = subMps > 0 ? newSubUsedMinutes / subMps : 0
          const newSubUsedSessions = Math.abs(subUsedSessionsRaw - Math.round(subUsedSessionsRaw)) < 0.001
            ? Math.round(subUsedSessionsRaw)
            : Math.round(subUsedSessionsRaw * 100) / 100
          const newSubRemainingSessions = Math.floor(newSubRemainingMinutes / subMps)

          updatedSubjects[sIdx] = {
            ...subPkg,
            usedMinutes: newSubUsedMinutes,
            remainingMinutes: newSubRemainingMinutes,
            usedSessions: newSubUsedSessions,
            remainingSessions: newSubRemainingSessions
          }

          // Recalculate aggregates
          const aggTotalSessions = updatedSubjects.reduce((sum, sub) => sum + sub.totalSessions, 0)
          const aggUsedSessions = updatedSubjects.reduce((sum, sub) => sum + sub.usedSessions, 0)
          const aggRemainingSessions = updatedSubjects.reduce((sum, sub) => sum + sub.remainingSessions, 0)
          const aggTotalMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.totalMinutes, 0)
          const aggUsedMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.usedMinutes, 0)
          const aggRemainingMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.remainingMinutes, 0)

          const primarySubject = updatedSubjects[0] || null

          // Deduct heldMinutes (previously reservedMinutes or heldMinutes)
          const prevHeldMinutes = Number(studentData.reservedMinutes ?? studentData.heldMinutes ?? 0) || 0
          const heldPointsToRelease = lessonNow.bookingHoldConsumed === true
            ? 0
            : bookingNows.reduce((sum, booking) => sum + bookingHoldMinutes(booking, teacherData), 0)
          const newHeldMinutes = Math.max(0, prevHeldMinutes - heldPointsToRelease)

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid,
            salary,
            teacherLevel,
            pricePerMinute,
            currency,
            points: lessonPoints,
            pointsPer25Minutes: Number(bookingNow?.pointsPer25Minutes ?? lessonNow.pointsPer25Minutes ?? teacherData?.pointsPer25Minutes) || 25,
            subjectId: freshSubjectPkg.subjectId,
            subjectName: freshSubjectPkg.subjectName,
            ...(freshSubjectPkg.curriculumLink || bookingNow?.curriculumLink ? {
              curriculumLink: freshSubjectPkg.curriculumLink || bookingNow?.curriculumLink,
            } : {}),
            ...(bookingNow?.groupClassId || lessonNow.groupClassId ? {
              groupClassId: bookingNow?.groupClassId || lessonNow.groupClassId,
              groupClassCode: bookingNow?.groupClassCode || lessonNow.groupClassCode || lessonNow.studentCode,
              groupClassName: bookingNow?.groupClassName || lessonNow.groupClassName || lessonNow.studentName,
              groupClassMemberIds: bookingNow?.groupClassMemberIds || lessonNow.groupClassMemberIds || [],
            } : {}),
            sessionsBeforeApproval: subPkg.remainingSessions,
            sessionsAfterApproval: newSubRemainingSessions,
            minutesBeforeApproval: subPkg.remainingMinutes,
            minutesAfterApproval: newSubRemainingMinutes,
            ...(bookingNow ? {
              bookingRequestId: bookingNow.id,
              ...(bookingNows.length > 1 ? { bookingRequestIds: bookingNows.map((booking) => booking.id) } : {}),
            } : {}),
            bookingHoldConsumed: lessonNow.bookingHoldConsumed === true || heldPointsToRelease > 0,
            ...(reconciliationDraft ? {
              bookingSubjectReconciliation: {
                kind: reconciliationDraft.kind,
                bookingIds: bookingNows.map((booking) => booking.id),
                bookingSubjectId: bookingNow?.subjectId || '',
                bookingSubjectName: bookingNow?.subjectName || '',
                reportedSubjectId: lessonNow.subjectId || '',
                reportedSubjectName: lessonNow.subjectName || '',
                settlementSubjectId: freshSubjectPkg.subjectId,
                settlementSubjectName: freshSubjectPkg.subjectName,
                reconciledAt: serverTimestamp(),
              },
            } : {}),
            updatedAt: serverTimestamp(),
          })

          bookingSnaps.forEach((bookingSnap) => {
            if (!bookingSnap.exists()) return
            const status = bookingSnap.data().status
            if (status !== 'pending' && status !== 'confirmed') return
            tx.update(bookingSnap.ref, {
              lessonId: lesson.id,
              status: 'completed',
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          })

          tx.update(studentRef, {
            subjects: updatedSubjects,
            totalSessions: aggTotalSessions,
            usedSessions: aggUsedSessions,
            remainingSessions: aggRemainingSessions,
            totalMinutes: aggTotalMinutes,
            usedMinutes: aggUsedMinutes,
            remainingMinutes: aggRemainingMinutes,
            reservedMinutes: newHeldMinutes,
            heldMinutes: newHeldMinutes,
            // Legacy compatibility
            subjectId: primarySubject ? primarySubject.subjectId : '',
            subjectName: primarySubject ? primarySubject.subjectName : '',
            minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 50,
            status: aggRemainingMinutes <= 0 ? 'expired' : 'active',
            updatedAt: serverTimestamp(),
          })

          const currentMins = Number(teacherData?.totalApprovedMinutes) || 0
          tx.update(doc(db, 'teachers', lesson.teacherId), {
            totalApprovedMinutes: currentMins + Number(lessonNow.minutes || 0)
          })

          const publicLessonRef = doc(db, 'publicLessons', lesson.id)
          tx.set(publicLessonRef, {
            id: lesson.id,
            studentId: lesson.studentId,
            studentCode: lesson.studentCode,
            studentName: lesson.studentName,
            teacherId: lesson.teacherId,
            teacherCode: lesson.teacherCode,
            teacherName: lesson.teacherName,
            subjectId: freshSubjectPkg.subjectId,
            subjectName: freshSubjectPkg.subjectName,
            ...(freshSubjectPkg.curriculumLink || bookingNow?.curriculumLink || lessonNow.curriculumLink ? {
              curriculumLink: freshSubjectPkg.curriculumLink || bookingNow?.curriculumLink || lessonNow.curriculumLink,
            } : {}),
            ...(bookingNow?.groupClassId || lessonNow.groupClassId ? {
              groupClassId: bookingNow?.groupClassId || lessonNow.groupClassId,
              groupClassCode: bookingNow?.groupClassCode || lessonNow.groupClassCode || lessonNow.studentCode,
              groupClassName: bookingNow?.groupClassName || lessonNow.groupClassName || lessonNow.studentName,
              groupClassMemberIds: bookingNow?.groupClassMemberIds || lessonNow.groupClassMemberIds || [],
            } : {}),
            date: lesson.date,
            minutes: lesson.minutes,
            points: lessonPoints,
            pointsPer25Minutes: Number(bookingNow?.pointsPer25Minutes ?? lessonNow.pointsPer25Minutes ?? teacherData?.pointsPer25Minutes) || 25,
            comment: lesson.comment || '',
            homework: lesson.homework || '',
            homeworkItems: lesson.homeworkItems || [],
            book: lesson.book || '',
            pages: lesson.pages || '',
            report: lesson.report || null,
            rating: lesson.rating ?? null,
            imageURLs: lesson.imageURLs || [],
            ...(lessonNow.attendanceStatus ? { attendanceStatus: lessonNow.attendanceStatus } : {}),
            ...(lessonNow.absenceFollowUpOf ? { absenceFollowUpOf: lessonNow.absenceFollowUpOf } : {}),
            status: 'approved',
            createdAt: lesson.createdAt || serverTimestamp(),
            approvedAt: serverTimestamp(),
          })

          // Một buổi học chỉ có một dòng lương chuẩn. ID cố định chặn việc
          // nhấn duyệt lặp/concurrent tạo nhiều dòng lương cho cùng buổi.
          const payrollRef = doc(db, 'payroll', lesson.id)
          tx.set(payrollRef, {
            teacherId: lesson.teacherId,
            teacherName: lesson.teacherName,
            lessonId: lesson.id,
            minutes: lesson.minutes,
            pricePerMinute,
            level: teacherLevel,
            month,
            ...buildPayrollApprovalFields(lessonNow, salary, currency),
            createdAt: serverTimestamp(),
          })

          const logRef = doc(collection(db, 'adminLogs'))
          tx.set(logRef, {
            adminId: user?.uid || '',
            action: 'APPROVE_LESSON',
            targetType: 'lesson',
            targetId: lesson.id,
            changes: {
              status: { from: lessonNow.status, to: 'approved' },
              salary,
              minutesDeducted: lesson.minutes,
              pointsDeducted: lessonPoints,
              zeroMinuteExcusedAbsence: zeroMinuteExcusedAbsenceNow,
              heldPointsReleased: heldPointsToRelease,
              subjectId: freshSubjectPkg.subjectId,
              subjectName: freshSubjectPkg.subjectName,
              ...(reconciliationDraft ? {
                bookingSubjectReconciliation: {
                  bookingIds: bookingNows.map((booking) => booking.id),
                  bookingSubjectId: bookingNow?.subjectId || '',
                  bookingSubjectName: bookingNow?.subjectName || '',
                  reportedSubjectId: lessonNow.subjectId || '',
                  reportedSubjectName: lessonNow.subjectName || '',
                  settlementSubjectId: freshSubjectPkg.subjectId,
                  settlementSubjectName: freshSubjectPkg.subjectName,
                  reason: reconciliationDraft.reason,
                },
              } : {}),
            },
            createdAt: serverTimestamp(),
          })
        },
        { maxAttempts: 3 },
      )

      toast.success(`Đã duyệt buổi dạy môn ${chosenSubjectPkg.subjectName} thành công`)
      onClose()
    } catch (err: any) {
      console.error(err)
      const code = err?.code || ''
      if (err?.message === 'LESSON_ALREADY_PROCESSED') {
        toast.warning('Buổi dạy đã được xử lý trước đó')
      } else if (err?.message === 'BOOKING_TIME_RANGE_INVALID') {
        toast.error('Giờ bắt đầu/kết thúc của lịch không khớp số phút. Hãy sửa lịch trước khi duyệt.')
      } else if (err?.message === 'BOOKING_STATE_CHANGED') {
        toast.error('Lịch đã thay đổi hoặc đã được gắn với buổi khác. Hãy mở lại để đối chiếu.')
      } else if (err?.message === 'BOOKING_SUBJECT_MISMATCH') {
        toast.error('Môn của lịch đặt khác môn buổi điểm danh. Không tự trừ sang gói còn buổi khác; cần xác nhận chuyển môn/lịch sử trước.')
      } else if (err?.message === 'BOOKING_RECONCILIATION_INVALID') {
        toast.error('Dữ liệu lịch hoặc gói môn vừa thay đổi. Đối soát chưa được ghi; vui lòng mở lại và kiểm tra.')
      } else if (err?.message === 'BOOKING_SUBJECT_PACKAGE_AMBIGUOUS') {
        toast.error('Không xác định duy nhất gói môn cần trừ. Chưa thay đổi dữ liệu; vui lòng đối soát hồ sơ học viên.')
      } else if (err?.message === 'BOOKING_MATCH_AMBIGUOUS' || err?.message === 'BOOKING_REFERENCE_INVALID') {
        toast.error('Lịch đặt không khớp rõ ràng với buổi điểm danh. Vui lòng kiểm tra ngày, gia sư và thời lượng trước khi duyệt.')
      } else if (err?.message === 'NOT_ENOUGH_POINTS') {
        toast.error('Học viên không đủ kim cương khả dụng để duyệt buổi học này')
      } else if (code === 'resource-exhausted' || code === 'unavailable') {
        toast.error('Hệ thống đang bận, vui lòng thử lại sau ít giây')
      } else {
        toast.error('Duyệt thất bại, vui lòng thử lại')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={handleApprove}
      title="Xác nhận duyệt buổi dạy"
      confirmLabel="Duyệt buổi dạy"
      loading={loading}
      confirmDisabled={loadingStudent || !approveSubjectId || (reconciliation.required && !reconciliation.draft)}
    >
      <div className="bg-white rounded-xl p-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Học viên</span>
          <span className="text-slate-700 font-semibold">{lesson.studentName} ({lesson.studentCode})</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Gia sư</span>
          <span className="text-slate-700">{lesson.teacherName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Ngày</span>
          <span className="text-slate-700">{lesson.date}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Thời lượng</span>
          <span className="text-slate-700 font-medium">{lesson.minutes} phút</span>
        </div>
        {isZeroMinuteExcusedAbsence(lesson) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-bold">Học viên vắng có phép · 0 phút</p>
            <p className="mt-0.5">Duyệt để chốt lịch và nhả phần kim cương đang giữ; không trừ quỹ học, không cộng giờ hay lương gia sư.</p>
          </div>
        )}
        {lesson.book && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 flex-shrink-0">Sách học</span>
            <span className="text-[#3BB8EB] font-bold truncate max-w-[150px]" title={lesson.book}>{lesson.book}</span>
          </div>
        )}
        {lesson.pages && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 flex-shrink-0">Trang học</span>
            <span className="text-slate-700 font-medium truncate max-w-[180px]" title={lesson.pages}>{lesson.pages}</span>
          </div>
        )}
        {typeof lesson.rating === 'number' && lesson.rating > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 flex-shrink-0">Chấm điểm buổi học</span>
            <span className="text-amber-500 font-bold">{'★'.repeat(lesson.rating)}{'☆'.repeat(Math.max(0, 5 - lesson.rating))} ({lesson.rating}/5)</span>
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600">Chọn môn học áp dụng *</label>
          {loadingStudent ? (
            <div className="text-xs text-slate-400">Đang tải các gói môn học...</div>
          ) : (
            <select
              value={approveSubjectId}
              onChange={(e) => setApproveSubjectId(e.target.value)}
              disabled={loadingStudent || !hasUniqueLessonSubjectPackage}
              className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">
                {hasUniqueLessonSubjectPackage
                  ? 'Chọn đúng gói môn của buổi điểm danh'
                  : 'Không xác định duy nhất gói môn của buổi điểm danh'}
              </option>
              {lessonSubjectPackages.length === 1 && lessonSubjectPackages.map((sub) => {
                const isOutOfSessions = sub.remainingMinutes <= 0 || sub.remainingSessions <= 0
                return (
                  <option key={sub.subjectId} value={sub.subjectId}>
                    {sub.subjectName} {isOutOfSessions ? '(Hết buổi)' : `(Còn ${sub.remainingSessions}b / ${sub.remainingMinutes}m)`} - {formatPricePerMinute(sub.pricePerMinute ?? 0, sub.currency)}
                  </option>
                )
              })}
            </select>
          )}
        </div>

        {!loadingStudent && !hasUniqueLessonSubjectPackage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <p className="font-bold">Không tự trừ vào gói còn buổi khác</p>
            <p className="mt-0.5">Buổi điểm danh không có đúng một gói môn tương ứng. Cần đối soát hồ sơ hoặc lịch sử chuyển môn trước khi có thể duyệt an toàn.</p>
          </div>
        )}

        {!loadingStudent && (
          <SubjectMismatchReconciliationPanel
            lesson={lesson}
            selectedSubject={approveStudentSubjects.find((subject) => subject.subjectId === approveSubjectId) || null}
            forceRequired={!hasUniqueLessonSubjectPackage}
            onStateChange={handleReconciliationStateChange}
          />
        )}

        {(() => {
          const chosen = approveStudentSubjects.find(s => s.subjectId === approveSubjectId)
          if (!chosen) return null
          const isOutOfSessions = chosen.remainingMinutes <= 0 || chosen.remainingSessions <= 0
          return (
            <div className="border-t border-slate-200 pt-2 mt-2 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Số phút môn này còn lại</span>
                <span className={`font-semibold ${isOutOfSessions ? 'text-rose-500 font-bold' : 'text-slate-700'}`}>
                  {chosen.remainingMinutes} → {chosen.remainingMinutes - lesson.minutes} phút
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lương gia sư (tính theo môn chọn)</span>
                <span className="text-emerald-500 font-semibold">
                  + {formatMoney(calculateSalary(lesson.minutes, chosen.pricePerMinute || 0, lesson.teacherLevel ?? 1, chosen.currency || 'VND'), chosen.currency || 'VND')}
                </span>
              </div>
            </div>
          )
        })()}
      </div>
    </ConfirmDialog>
  )
}
