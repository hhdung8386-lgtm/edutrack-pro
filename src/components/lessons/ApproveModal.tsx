import { useEffect, useState } from 'react'
import { runTransaction, doc, collection, serverTimestamp, getDoc } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Lesson, Student, StudentSubject } from '@/types'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { formatVND, formatMoney, formatPricePerMinute } from '@/lib/constants'
import { useAuthStore } from '@/stores/authStore'

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
            }
          }))

          setApproveStudentSubjects(resolvedSubjects)
          
          const hasLessonSub = resolvedSubjects.some(sub => sub.subjectId === lesson.subjectId)
          if (hasLessonSub) {
            setApproveSubjectId(lesson.subjectId)
          } else {
            const firstWithBalance = resolvedSubjects.find(sub => sub.remainingMinutes > 0)
            setApproveSubjectId(firstWithBalance?.subjectId || resolvedSubjects[0]?.subjectId || '')
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

          const teacherSnap = await tx.get(doc(db, 'teachers', lesson.teacherId))
          const teacherData = teacherSnap.data()
          const teacherLevel = (lesson.teacherLevel ?? teacherData?.level ?? 1) || 1

          const teacherCountry = teacherData?.country || 'VN'
          let pricePerMinute = chosenSubjectPkg.pricePerMinute || 0
          if (teacherCountry === 'VN') {
            pricePerMinute = chosenSubjectPkg.pricePerMinuteVN || chosenSubjectPkg.pricePerMinute || 0
          } else if (teacherCountry === 'PH') {
            pricePerMinute = chosenSubjectPkg.pricePerMinutePH || chosenSubjectPkg.pricePerMinute || 0
          } else {
            pricePerMinute = chosenSubjectPkg.pricePerMinuteNative || chosenSubjectPkg.pricePerMinute || 0
          }

          const currency = chosenSubjectPkg.currency || 'VND'
          const salary = calculateSalary(lesson.minutes, pricePerMinute, teacherLevel, currency)
          const month = lesson.date.slice(0, 7)

          // Initialize subjects array for backward compatibility if needed
          let updatedSubjects = studentData.subjects && studentData.subjects.length > 0
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
                  pricePerMinute: pricePerMinute,
                  pricePerMinuteVN: chosenSubjectPkg.pricePerMinuteVN || pricePerMinute,
                  pricePerMinutePH: chosenSubjectPkg.pricePerMinutePH || pricePerMinute,
                  pricePerMinuteNative: chosenSubjectPkg.pricePerMinuteNative || pricePerMinute,
                  currency: chosenSubjectPkg.currency || 'VND',
                }]
              : []

          // Deduct from the selected subject package
          const sIdx = updatedSubjects.findIndex(sub => sub.subjectId === approveSubjectId)
          if (sIdx === -1) {
            throw new Error(`Không tìm thấy gói môn học ${chosenSubjectPkg.subjectName}`)
          }

          const subPkg = updatedSubjects[sIdx]
          const newSubUsedMinutes = subPkg.usedMinutes + lesson.minutes
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
          const newHeldMinutes = Math.max(0, prevHeldMinutes - lesson.minutes)

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid,
            salary,
            teacherLevel,
            pricePerMinute,
            currency,
            subjectId: chosenSubjectPkg.subjectId,
            subjectName: chosenSubjectPkg.subjectName,
            sessionsBeforeApproval: subPkg.remainingSessions,
            sessionsAfterApproval: newSubRemainingSessions,
            minutesBeforeApproval: subPkg.remainingMinutes,
            minutesAfterApproval: newSubRemainingMinutes,
            updatedAt: serverTimestamp(),
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

          const publicLessonRef = doc(db, 'publicLessons', lesson.id)
          tx.set(publicLessonRef, {
            id: lesson.id,
            studentId: lesson.studentId,
            studentCode: lesson.studentCode,
            studentName: lesson.studentName,
            teacherId: lesson.teacherId,
            teacherCode: lesson.teacherCode,
            teacherName: lesson.teacherName,
            subjectId: chosenSubjectPkg.subjectId,
            subjectName: chosenSubjectPkg.subjectName,
            date: lesson.date,
            minutes: lesson.minutes,
            comment: lesson.comment || '',
            homework: lesson.homework || '',
            book: lesson.book || '',
            imageURLs: lesson.imageURLs || [],
            status: 'approved',
            createdAt: lesson.createdAt || serverTimestamp(),
            approvedAt: serverTimestamp(),
          })

          const payrollRef = doc(collection(db, 'payroll'))
          tx.set(payrollRef, {
            teacherId: lesson.teacherId,
            teacherName: lesson.teacherName,
            lessonId: lesson.id,
            amount: salary,
            minutes: lesson.minutes,
            pricePerMinute,
            level: teacherLevel,
            month,
            paid: false,
            createdAt: serverTimestamp(),
          })

          const logRef = doc(collection(db, 'adminLogs'))
          tx.set(logRef, {
            adminId: user?.uid || '',
            action: 'APPROVE_LESSON',
            targetType: 'lesson',
            targetId: lesson.id,
            changes: {
              status: { from: 'pending', to: 'approved' },
              salary,
              minutesDeducted: lesson.minutes,
              subjectId: chosenSubjectPkg.subjectId,
              subjectName: chosenSubjectPkg.subjectName,
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
      if (code === 'resource-exhausted' || code === 'unavailable') {
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
    >
      <div className="bg-white rounded-xl p-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Học viên</span>
          <span className="text-slate-700 font-semibold">{lesson.studentName} ({lesson.studentCode})</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Giáo viên</span>
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
        {lesson.book && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 flex-shrink-0">Sách học</span>
            <span className="text-[#3BB8EB] font-bold truncate max-w-[150px]" title={lesson.book}>{lesson.book}</span>
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
              className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {approveStudentSubjects.map((sub) => {
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
                <span className="text-slate-500">Lương giáo viên (tính theo môn chọn)</span>
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
