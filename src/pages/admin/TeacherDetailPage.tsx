import { useEffect, useState, useMemo } from 'react'
import { doc, getDoc, getDocs, collection, query, where, onSnapshot, updateDoc, serverTimestamp, addDoc, runTransaction, documentId, deleteDoc } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Teacher, Lesson, Student, TeacherAvailability, DayOfWeek, Payroll, Subject } from '@/types'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { TeacherFormModal } from '@/components/teachers/TeacherFormModal'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { ArrowLeft, Calendar, BookOpen, Clock, DollarSign, GraduationCap, Pencil, Search, Eye, Download, Check, X, MoreVertical, Info, Hourglass, Wallet, ChevronDown, CheckCircle2 } from 'lucide-react'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5',
  fri: 'Thứ 6', sat: 'Thứ 7', sun: 'CN'
}

type AttendanceStatus = 'present' | 'with_permission' | 'without_permission'

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Có mặt',
  with_permission: 'Vắng có phép',
  without_permission: 'Vắng không phép',
}

const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  with_permission: 'bg-amber-100 text-amber-700',
  without_permission: 'bg-rose-100 text-rose-700',
}

export function TeacherDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)

  // Lesson history filters
  const [lessonSearch, setLessonSearch] = useState('')
  const [lessonMonth, setLessonMonth] = useState(getCurrentMonth())
  const [lessonDateFilter, setLessonDateFilter] = useState('')
  const [lessonStatusFilter, setLessonStatusFilter] = useState('')

  // Tab and Class filters
  const [activeTab, setActiveTab] = useState<'all' | 'approved' | 'pending' | 'paid'>('all')
  const [classFilter, setClassFilter] = useState('')

  // Inline status dropdown and approvals
  const [activeDropdownLessonId, setActiveDropdownLessonId] = useState<string | null>(null)
  const [approvingLesson, setApprovingLesson] = useState<Lesson | null>(null)
  const [rejectingLesson, setRejectingLesson] = useState<Lesson | null>(null)
  const [revertingLesson, setRevertingLesson] = useState<Lesson | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reverting, setReverting] = useState(false)

  useEffect(() => {
    setLessonDateFilter('')
    setClassFilter('')
  }, [lessonMonth])

  // Attendance status override
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('present')
  const [savingStatus, setSavingStatus] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('')
  const [savingStudentSubjectId, setSavingStudentSubjectId] = useState<string | null>(null)
  const [subjectSearch, setSubjectSearch] = useState('')
  const [showSubjectsList, setShowSubjectsList] = useState(false)
  const [isSubjectSearching, setIsSubjectSearching] = useState(false)

  useEffect(() => {
    if (!id) return

    getDoc(doc(db, 'teachers', id)).then((snap) => {
      if (snap.exists()) setTeacher({ id: snap.id, ...snap.data() } as Teacher)
      setLoading(false)
    })

    getDoc(doc(db, 'teacherAvailability', id)).then((snap) => {
      if (snap.exists()) setAvailability({ id: snap.id, ...snap.data() } as TeacherAvailability)
    })

    const lessonQ = query(collection(db, 'lessons'), where('teacherId', '==', id))
    const unsubLessons = onSnapshot(lessonQ, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
      docs.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
      setLessons(docs)
    })

    const payrollQ = query(collection(db, 'payroll'), where('teacherId', '==', id))
    const unsubPayrolls = onSnapshot(payrollQ, (snap) => {
      setPayrolls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payroll)))
    })

    getDocs(collection(db, 'subjects')).then((snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    }).catch(console.error)

    return () => {
      unsubLessons()
      unsubPayrolls()
    }
  }, [id])

  // Get unique student IDs from lessons taught by this teacher as a stable string dependency
  const studentIdsStr = useMemo(() => {
    const ids = new Set(lessons.filter(l => l.status !== 'rejected').map(l => l.studentId))
    return Array.from(ids).sort().join(',')
  }, [lessons])

  // Fetch/Subscribe only to those students' documents
  useEffect(() => {
    if (!studentIdsStr) {
      setStudents([])
      return
    }

    const chunkIds = studentIdsStr.split(',')
    // Firestore 'in' query supports up to 30 items
    const chunks: string[][] = []
    for (let i = 0; i < chunkIds.length; i += 30) {
      chunks.push(chunkIds.slice(i, i + 30))
    }

    const unsubs = chunks.map((chunk) => {
      const q = query(
        collection(db, 'students'),
        where(documentId(), 'in', chunk),
        where('status', '==', 'active')
      )
      return onSnapshot(q, (snap) => {
        const chunkStudents = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student))
        setStudents((prev) => {
          // Merge new chunk data with previous data, keeping it unique and filtering out removed/status changed docs
          const otherStudents = prev.filter((s) => !chunk.includes(s.id))
          return [...otherStudents, ...chunkStudents]
        })
      })
    })

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [studentIdsStr])

  const handleSaveStudentSubject = async (studentId: string) => {
    const newSubject = subjects.find(sub => sub.id === selectedSubjectId)
    if (!newSubject) {
      toast.error('Không tìm thấy môn học đã chọn')
      return
    }

    setSavingStudentSubjectId(studentId)
    try {
      // 1. Update Student Setup in Firestore
      await updateDoc(doc(db, 'students', studentId), {
        subjectId: selectedSubjectId,
        subjectName: newSubject.name,
        updatedAt: serverTimestamp(),
      })

      // 2. Query and propagate correct subject details and rate to all lessons in parallel
      const lessonsQ = query(collection(db, 'lessons'), where('studentId', '==', studentId))
      const [lessonsSnap, teachersSnap] = await Promise.all([
        getDocs(lessonsQ),
        getDocs(collection(db, 'teachers')),
      ])
      const teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      const newRate = newSubject.pricePerMinute || 0

      const lessonUpdates: Promise<any>[] = [];
      const payrollQueries: Promise<any>[] = [];
      const lessonNewSalaries: Record<string, number> = {};
      const lessonRates: Record<string, number> = {};

      lessonsSnap.docs.forEach(lessonDoc => {
        const lessonId = lessonDoc.id
        const lesson = lessonDoc.data()
        const lessonRate = newRate

        const minutes = Number(lesson.minutes) || 0
        const teacherLevel = Number(lesson.teacherLevel) || 1
        const newSalary = lesson.status === 'approved' ? calculateSalary(minutes, lessonRate, teacherLevel) : 0

        lessonNewSalaries[lessonId] = newSalary
        lessonRates[lessonId] = lessonRate

        lessonUpdates.push(
          updateDoc(doc(db, 'lessons', lessonId), {
            subjectId: selectedSubjectId,
            subjectName: newSubject.name,
            pricePerMinute: lessonRate,
            salary: newSalary,
            updatedAt: serverTimestamp(),
          })
        )

        if (lesson.status === 'approved') {
          lessonUpdates.push(
            updateDoc(doc(db, 'publicLessons', lessonId), {
              subjectId: selectedSubjectId,
              subjectName: newSubject.name,
              updatedAt: serverTimestamp(),
            }).catch(() => {})
          )
        }

        payrollQueries.push(
          getDocs(query(collection(db, 'payroll'), where('lessonId', '==', lessonId)))
        )
      })

      const [, ...payrollSnaps] = await Promise.all([
        Promise.all(lessonUpdates),
        ...payrollQueries
      ])

      const payrollUpdates: Promise<any>[] = []
      payrollSnaps.forEach((payrollSnap, index) => {
        const lessonId = lessonsSnap.docs[index].id
        const newSalary = lessonNewSalaries[lessonId]
        const lessonRate = lessonRates[lessonId]

        payrollSnap.docs.forEach((pDoc: any) => {
          const payroll = pDoc.data()
          if (!payroll.paid && !payroll.voided) {
            payrollUpdates.push(
              updateDoc(doc(db, 'payroll', pDoc.id), {
                amount: newSalary,
                pricePerMinute: lessonRate,
                recalculatedAt: serverTimestamp(),
              })
            )
          }
        })
      })

      if (payrollUpdates.length > 0) {
        await Promise.all(payrollUpdates)
      }

      toast.success('Đã cập nhật môn học và đồng bộ dữ liệu thành công!')
      setEditingStudentId(null)
    } catch (err) {
      console.error(err)
      toast.error('Có lỗi xảy ra khi cập nhật môn học')
    } finally {
      setSavingStudentSubjectId(null)
    }
  }

  const handleSaveAttendanceStatus = async () => {
    if (!editingLesson) return
    setSavingStatus(true)
    try {
      await updateDoc(doc(db, 'lessons', editingLesson.id), {
        attendanceStatus: selectedStatus,
      })
      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'UPDATE_ATTENDANCE_STATUS',
        targetType: 'lesson',
        targetId: editingLesson.id,
        changes: {
          attendanceStatus: {
            from: editingLesson.attendanceStatus || null,
            to: selectedStatus,
          },
        },
        createdAt: serverTimestamp(),
      })
      toast.success('Đã cập nhật tình trạng')
      setEditingLesson(null)
    } catch {
      toast.error('Cập nhật thất bại')
    } finally {
      setSavingStatus(false)
    }
  }

  const handleUpdateLessonStatus = async (
    lesson: Lesson,
    targetStatus: 'approved' | 'pending' | 'rejected',
    customRejectReason?: string
  ) => {
    const currentStatus = lesson.status
    if (currentStatus === targetStatus) return

    if (targetStatus === 'approved') {
      setApproving(true)
    } else if (targetStatus === 'rejected') {
      setRejecting(true)
    } else if (currentStatus === 'approved' && targetStatus === 'pending') {
      setReverting(true)
    }

    try {
      if (targetStatus === 'approved') {
        // Luồng Duyệt buổi học (pending/rejected -> approved)
        await runTransaction(db, async (tx) => {
          const lessonRef = doc(db, 'lessons', lesson.id)
          const studentRef = doc(db, 'students', lesson.studentId)

          const [lessonSnap, studentSnap] = await Promise.all([
            tx.get(lessonRef),
            tx.get(studentRef),
          ])

          if (!lessonSnap.exists()) throw new Error('LESSON_NOT_FOUND')
          if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

          const lessonNow = lessonSnap.data() as any
          if (lessonNow.status === 'approved') throw new Error('LESSON_ALREADY_PROCESSED')

          const student = studentSnap.data() as any

          const [teacherSnap, subjectSnap] = await Promise.all([
            tx.get(doc(db, 'teachers', lesson.teacherId)),
            tx.get(doc(db, 'subjects', student.subjectId)),
          ])

          const teacherData = teacherSnap.data()
          const teacherLevel = (lesson.teacherLevel ?? teacherData?.level ?? 1) || 1
          const pricePerMinute = subjectSnap.data()?.pricePerMinute ?? 0
          const subjectId = student.subjectId
          const subjectName = student.subjectName || subjectSnap.data()?.name || ''

          const lessonMinutes = Number(lesson.minutes) || 0
          const salary = calculateSalary(lessonMinutes, pricePerMinute, teacherLevel)
          const month = (lesson.date || '').slice(0, 7)

          const mps = Number(student.minutesPerSession) || 50
          const totalSessionsNum = Number(student.totalSessions) || 0
          const usedSessionsNum = Number(student.usedSessions) || 0
          const remainingSessionsNum = Number(student.remainingSessions ?? (totalSessionsNum - usedSessionsNum)) || 0

          const totalMinutes = Number(student.totalMinutes ?? totalSessionsNum * mps) || 0
          const prevUsedMinutes = Number(student.usedMinutes ?? usedSessionsNum * mps) || 0
          const prevRemainingMinutes = Number(student.remainingMinutes ?? (totalMinutes - prevUsedMinutes)) || 0
          const prevHeldMinutes = Number(student.reservedMinutes ?? student.heldMinutes ?? 0) || 0

          const newUsedMinutes = prevUsedMinutes + lessonMinutes
          const newRemainingMinutes = totalMinutes - newUsedMinutes
          const newHeldMinutes = Math.max(0, prevHeldMinutes - lessonMinutes)
          const newRemainingSessions = Math.floor(newRemainingMinutes / mps)
          const newUsedSessionsRaw = newUsedMinutes / mps
          const newUsedSessions =
            Math.abs(newUsedSessionsRaw - Math.round(newUsedSessionsRaw)) < 0.001
              ? Math.round(newUsedSessionsRaw)
              : Math.round(newUsedSessionsRaw * 100) / 100

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid ?? '',
            salary,
            teacherLevel,
            pricePerMinute,
            subjectId,
            subjectName,
            sessionsBeforeApproval: remainingSessionsNum,
            sessionsAfterApproval: newRemainingSessions,
            minutesBeforeApproval: prevRemainingMinutes,
            minutesAfterApproval: newRemainingMinutes,
            rejectedReason: null, // Xoá lý do từ chối cũ nếu có
          })

          tx.update(studentRef, {
            usedMinutes: newUsedMinutes,
            remainingMinutes: newRemainingMinutes,
            totalMinutes,
            minutesPerSession: mps,
            usedSessions: newUsedSessions,
            remainingSessions: newRemainingSessions,
            reservedMinutes: newHeldMinutes,
            heldMinutes: newHeldMinutes,
            status: newRemainingMinutes <= 0 ? 'expired' : 'active',
            updatedAt: serverTimestamp(),
          })

          const publicLessonRef = doc(db, 'publicLessons', lesson.id)
          tx.set(publicLessonRef, {
            id: lesson.id,
            studentId: lesson.studentId,
            studentCode: lesson.studentCode,
            studentName: lesson.studentName,
            teacherId: lesson.teacherId,
            teacherCode: lesson.teacherCode ?? '',
            teacherName: lesson.teacherName ?? '',
            subjectId,
            subjectName,
            date: lesson.date,
            minutes: lessonMinutes,
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
            teacherName: lesson.teacherName ?? '',
            lessonId: lesson.id,
            amount: salary,
            minutes: lessonMinutes,
            pricePerMinute,
            level: teacherLevel,
            month,
            paid: false,
            createdAt: serverTimestamp(),
          })

          const logRef = doc(collection(db, 'adminLogs'))
          tx.set(logRef, {
            adminId: user?.uid ?? '',
            action: 'APPROVE_LESSON',
            targetType: 'lesson',
            targetId: lesson.id,
            changes: {
              status: { from: currentStatus, to: 'approved' },
              salary,
              minutesDeducted: lessonMinutes,
              minutesBefore: prevRemainingMinutes,
              minutesAfter: newRemainingMinutes,
              heldMinutesBefore: prevHeldMinutes,
              heldMinutesAfter: newHeldMinutes,
            },
            createdAt: serverTimestamp(),
          })
        })

        toast.success('Đã duyệt buổi dạy thành công')
        setApprovingLesson(null)
      } else if (currentStatus === 'approved') {
        // Luồng hoàn tác duyệt (approved -> pending hoặc approved -> rejected)
        const payrollSnap = await getDocs(
          query(collection(db, 'payroll'), where('lessonId', '==', lesson.id))
        )
        const payrollIds = payrollSnap.docs.map((d) => d.id)

        await runTransaction(db, async (tx) => {
          const studentRef = doc(db, 'students', lesson.studentId)
          const lessonRef = doc(db, 'lessons', lesson.id)

          const [lessonSnap, studentSnap] = await Promise.all([
            tx.get(lessonRef),
            tx.get(studentRef),
          ])

          if (!lessonSnap.exists()) throw new Error('LESSON_NOT_FOUND')

          const hasStudent = studentSnap.exists()

          tx.update(lessonRef, {
            status: targetStatus,
            rejectedReason: targetStatus === 'rejected' ? (customRejectReason || 'Admin huỷ duyệt sau khi đã duyệt') : null,
            sessionsBeforeApproval: 0,
            sessionsAfterApproval: 0,
            minutesBeforeApproval: 0,
            minutesAfterApproval: 0,
            salary: 0,
            updatedAt: serverTimestamp(),
          })

          if (hasStudent) {
            const s = studentSnap.data()!
            const lessonMinutes = Number(lesson.minutes) || 0

            const sMps = s.minutesPerSession || 50
            const sTotal = s.totalMinutes ?? s.totalSessions * sMps
            const sPrevUsed = s.usedMinutes ?? (s.usedSessions || 0) * sMps
            const newUsed = Math.max(0, sPrevUsed - lessonMinutes)
            const newRemaining = sTotal - newUsed
            const newRemainingSessions = Math.floor(newRemaining / sMps)
            const rawSessions = newUsed / sMps
            const newUsedSessions =
              Math.abs(rawSessions - Math.round(rawSessions)) < 0.001
                ? Math.round(rawSessions)
                : Math.round(rawSessions * 100) / 100

            tx.update(studentRef, {
              usedMinutes: newUsed,
              remainingMinutes: newRemaining,
              totalMinutes: sTotal,
              minutesPerSession: sMps,
              usedSessions: newUsedSessions,
              remainingSessions: newRemainingSessions,
              status: newRemaining <= 0 ? 'expired' : 'active',
              updatedAt: serverTimestamp(),
            })
          }

          const publicLessonRef = doc(db, 'publicLessons', lesson.id)
          tx.delete(publicLessonRef)

          for (const pid of payrollIds) {
            tx.update(doc(db, 'payroll', pid), {
              voided: true,
              amount: 0,
              voidedAt: serverTimestamp(),
              voidedBy: user?.uid || '',
            })
          }
        })

        await addDoc(collection(db, 'adminLogs'), {
          adminId: user?.uid || '',
          action: 'REVERSE_APPROVAL',
          targetType: 'lesson',
          targetId: lesson.id,
          changes: {
            status: { from: 'approved', to: targetStatus },
            lessonDate: lesson.date,
            restoredMinutes: lesson.minutes,
            voidedPayrolls: payrollIds.length,
            voidedSalary: lesson.salary || 0,
          },
          createdAt: serverTimestamp(),
        })

        toast.success(`Đã huỷ duyệt, trả lại ${lesson.minutes} phút cho học viên`)
        setRevertingLesson(null)
        setRejectingLesson(null)
        setRejectReason('')
      } else {
        // Luồng đổi trạng thái đơn giản giữa pending <-> rejected
        const lessonRef = doc(db, 'lessons', lesson.id)
        await updateDoc(lessonRef, {
          status: targetStatus,
          rejectedReason: targetStatus === 'rejected' ? (customRejectReason || 'Admin chuyển trạng thái') : null,
          updatedAt: serverTimestamp(),
        })
        await deleteDoc(doc(db, 'publicLessons', lesson.id)).catch(() => {})
        toast.success(`Đã cập nhật trạng thái về ${targetStatus === 'pending' ? 'Chờ duyệt' : 'Từ chối'}`)
        setRejectingLesson(null)
        setRejectReason('')
      }
    } catch (err: any) {
      console.error('[update-lesson-status]', err)
      const code = err?.code || ''
      const message = err?.message || ''
      if (message === 'LESSON_NOT_FOUND') {
        toast.error('Buổi dạy không tồn tại, có thể đã bị xóa')
      } else if (message === 'STUDENT_NOT_FOUND') {
        toast.error('Học viên không tồn tại')
      } else if (message === 'LESSON_ALREADY_PROCESSED') {
        toast.warning('Buổi dạy đã được xử lý trước đó')
      } else if (code === 'permission-denied') {
        toast.error('Bạn không có quyền cập nhật trạng thái buổi dạy này')
      } else {
        toast.error(`Cập nhật thất bại: ${code || message || 'Lỗi không xác định'}`)
      }
    } finally {
      setApproving(false)
      setRejecting(false)
      setReverting(false)
    }
  }

  const handleApprove = async () => {
    if (!approvingLesson) return
    await handleUpdateLessonStatus(approvingLesson, 'approved')
  }

  const handleReject = async () => {
    if (!rejectingLesson || !rejectReason.trim()) {
      toast.warning('Vui lòng nhập lý do từ chối')
      return
    }
    await handleUpdateLessonStatus(rejectingLesson, 'rejected', rejectReason)
  }

  const handleRevertToPending = async () => {
    if (!revertingLesson) return
    await handleUpdateLessonStatus(revertingLesson, 'pending')
  }

  if (loading) return <LoadingSpinner />
  if (!teacher) return <p className="text-slate-500 text-center py-20">Không tìm thấy giáo viên</p>

  const getMonthOptions = () => {
    const months = new Set<string>()
    const now = new Date()
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    months.add(currentMonthStr)

    lessons.forEach((l) => {
      if (l.date && l.date.length >= 7) {
        months.add(l.date.substring(0, 7))
      }
    })

    const sortedMonths = Array.from(months).sort((a, b) => b.localeCompare(a))

    return sortedMonths.map((m) => {
      const [year, month] = m.split('-')
      return {
        value: m,
        label: `Tháng ${Number(month)}/${year}`,
      }
    })
  }

  const handlePrevMonth = () => {
    if (!lessonMonth) return
    const [year, month] = lessonMonth.split('-').map(Number)
    const prevDate = new Date(year, month - 2, 1)
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    setLessonMonth(prevMonthStr)
  }

  const handleNextMonth = () => {
    if (!lessonMonth) return
    const [year, month] = lessonMonth.split('-').map(Number)
    const nextDate = new Date(year, month, 1)
    const nextMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
    setLessonMonth(nextMonthStr)
  }

  const uniqueDatesInMonth = Array.from(
    new Set(
      lessons
        .filter((l) => !lessonMonth || l.date.startsWith(lessonMonth))
        .map((l) => l.date)
    )
  ).sort((a, b) => b.localeCompare(a))

  const approvedLessons = lessons.filter((l) => l.status === 'approved')
  const totalLessons = approvedLessons.length
  const totalMinutes = approvedLessons.reduce((acc, l) => acc + l.minutes, 0)
  const totalSalary = approvedLessons.reduce((acc, l) => acc + (l.salary || 0), 0)

  const studentIdSet = new Set(lessons.filter(l => l.status !== 'rejected').map(l => l.studentId))
  const activeStudents = students.filter(s => studentIdSet.has(s.id))

  // Stats for the selected month
  const lessonsInMonth = lessons.filter((l) => lessonMonth ? l.date.startsWith(lessonMonth) : true)
  const approvedInMonth = lessonsInMonth.filter((l) => l.status === 'approved')
  const pendingInMonth = lessonsInMonth.filter((l) => l.status === 'pending')

  const approvedSalaryMonth = approvedInMonth.reduce((acc, l) => acc + (l.salary || 0), 0)
  const pendingSalaryMonth = pendingInMonth.reduce((acc, l) => acc + calculateSalary(l.minutes, l.pricePerMinute || 0, l.teacherLevel ?? teacher?.level ?? 1), 0)
  const totalSalaryMonth = approvedSalaryMonth + pendingSalaryMonth

  // Monthly paid/unpaid payroll stats
  const paidPayrollMonth = payrolls.filter(p => !p.voided && p.paid && (lessonMonth ? p.month === lessonMonth : true)).reduce((sum, p) => sum + p.amount, 0)
  const unpaidPayrollMonth = payrolls.filter(p => !p.voided && !p.paid && (lessonMonth ? p.month === lessonMonth : true)).reduce((sum, p) => sum + p.amount, 0)

  const [mYear, mMon] = lessonMonth ? lessonMonth.split('-') : ['', '']
  const monthDisplayLabel = lessonMonth ? `${Number(mMon)}/${mYear}` : 'tất cả'

  const exportPayrollCSV = () => {
    if (!teacher) return
    const rows = [
      ['Ngày', 'Học viên', 'Mã học viên', 'Môn học', 'Số phút', 'Đơn giá/phút', 'Lương tạm tính', 'Trạng thái duyệt', 'Thanh toán'],
      ...lessonsInMonth.map((l) => {
        const p = payrolls.find((pay) => pay.lessonId === l.id && !pay.voided)
        const paymentStatus = p ? (p.paid ? 'Đã thanh toán' : 'Chưa thanh toán') : '—'
        const estSalary = l.status === 'approved' && l.salary != null ? l.salary : calculateSalary(l.minutes, l.pricePerMinute || 0, l.teacherLevel ?? teacher?.level ?? 1)
        return [
          l.date,
          l.studentName,
          l.studentCode,
          l.subjectName,
          `${l.minutes}'`,
          l.pricePerMinute,
          estSalary,
          l.status === 'approved' ? 'Đã duyệt' : l.status === 'pending' ? 'Chờ duyệt' : 'Từ chối',
          paymentStatus
        ]
      }),
    ]
    const csv = rows.map((r) => r.map(v => typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BangLuong_${teacher.name.replace(/\s+/g, '_')}_Thang_${monthDisplayLabel.replace('/', '_')}.csv`
    a.click()
    toast.success('Đã xuất bảng lương thành công!')
  }

  const filteredLessons = lessons.filter((l) => {
    const matchMonth = lessonMonth ? l.date.startsWith(lessonMonth) : true
    const matchSearch = lessonSearch.trim()
      ? l.studentName.toLowerCase().includes(lessonSearch.toLowerCase()) ||
        l.studentCode.toLowerCase().includes(lessonSearch.toLowerCase())
      : true
    const matchDate = lessonDateFilter ? l.date === lessonDateFilter : true
    const matchClass = classFilter ? l.subjectName === classFilter : true
    
    // Tab filter
    let matchTab = true
    if (activeTab === 'approved') {
      matchTab = l.status === 'approved'
    } else if (activeTab === 'pending') {
      matchTab = l.status === 'pending'
    } else if (activeTab === 'paid') {
      const p = payrolls.find((pay) => pay.lessonId === l.id && !pay.voided)
      matchTab = p?.paid === true
    }
    
    return matchMonth && matchSearch && matchDate && matchClass && matchTab
  })

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{teacher.name}</h1>
          <p className="text-sm text-slate-500">Chi tiết giáo viên</p>
        </div>
      </div>

      {/* Profile Card */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {teacher.photoURL ? (
              <img src={teacher.photoURL} alt={teacher.name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 shadow-md" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3BB8EB] to-[#2b8fb8] flex items-center justify-center text-2xl font-bold text-white flex-shrink-0 shadow-md">
                {teacher.name[0]}
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-lg font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                  {teacher.code}
                </span>
                <StatusBadge status={teacher.status} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm mt-2">
                <div>
                  <span className="text-slate-500">Họ tên: </span>
                  <span className="text-slate-800 font-medium">{teacher.name}</span>
                </div>
                <div>
                  <span className="text-slate-500">Môn dạy: </span>
                  <span className="text-slate-800">
                    {(teacher.subjectNames || []).join(', ') || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Level: </span>
                  <span className="text-slate-800 font-semibold">×{teacher.level}</span>
                </div>
                {teacher.bio && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Giới thiệu: </span>
                    <span className="text-slate-600 italic">{teacher.bio}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Sửa</Button>
        </div>
      </Card>

      {/* Interview Profile Card */}
      {teacher && (teacher.yob || teacher.university || teacher.ielts || teacher.teachingYears || (teacher.strengths && teacher.strengths.length > 0)) && (
        <Card>
          <div className="border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-base font-semibold text-slate-900">Hồ sơ năng lực & Thông tin phỏng vấn</h3>
          </div>
          <div className="space-y-6">
            {/* Grid 1: Thông tin cá nhân & Học văn */}
            <div>
              <h4 className="text-sm font-semibold text-indigo-600 mb-3 uppercase tracking-wider">1. Thông tin cá nhân & Trình độ học vấn</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {teacher.yob && (
                  <div>
                    <span className="text-slate-500 font-medium">Năm sinh: </span>
                    <span className="text-slate-800">{teacher.yob}</span>
                  </div>
                )}
                {teacher.livingArea && (
                  <div>
                    <span className="text-slate-500 font-medium">Khu vực sinh sống: </span>
                    <span className="text-slate-800">{teacher.livingArea}</span>
                  </div>
                )}
                {teacher.degreeType && (
                  <div>
                    <span className="text-slate-500 font-medium">Học vị / Học hàm: </span>
                    <span className="text-slate-800">{teacher.degreeType}</span>
                  </div>
                )}
                {teacher.university && (
                  <div>
                    <span className="text-slate-500 font-medium">Trường ĐH/CĐ: </span>
                    <span className="text-slate-800">{teacher.university}</span>
                  </div>
                )}
                {teacher.major && (
                  <div>
                    <span className="text-slate-500 font-medium">Chuyên ngành: </span>
                    <span className="text-slate-800">{teacher.major}</span>
                  </div>
                )}
                {teacher.gradYear && (
                  <div>
                    <span className="text-slate-500 font-medium">Năm học / Tốt nghiệp: </span>
                    <span className="text-slate-800">{teacher.gradYear}</span>
                  </div>
                )}
                {teacher.gpa && (
                  <div>
                    <span className="text-slate-500 font-medium">GPA: </span>
                    <span className="text-slate-800">{teacher.gpa}</span>
                  </div>
                )}
                {teacher.scholarship && (
                  <div>
                    <span className="text-slate-500 font-medium">Học bổng: </span>
                    <span className="text-slate-800">{teacher.scholarship}</span>
                  </div>
                )}
                {teacher.academicAwards && (
                  <div className="md:col-span-3">
                    <span className="text-slate-500 font-medium">Thành tích học tập nổi bật: </span>
                    <span className="text-slate-700">{teacher.academicAwards}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Grid 2: Chứng chỉ */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-sm font-semibold text-indigo-600 mb-3 uppercase tracking-wider">2. Chứng chỉ</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {teacher.ielts && (
                  <div>
                    <span className="text-slate-500 font-medium">IELTS: </span>
                    <span className="text-slate-800">{teacher.ielts}</span>
                  </div>
                )}
                {teacher.toeic && (
                  <div>
                    <span className="text-slate-500 font-medium">TOEIC: </span>
                    <span className="text-slate-800">{teacher.toeic}</span>
                  </div>
                )}
                {teacher.toefl && (
                  <div>
                    <span className="text-slate-500 font-medium">TOEFL: </span>
                    <span className="text-slate-800">{teacher.toefl}</span>
                  </div>
                )}
                {teacher.tesolTefl && (
                  <div>
                    <span className="text-slate-500 font-medium">TESOL / TEFL: </span>
                    <span className="text-slate-800">{teacher.tesolTefl}</span>
                  </div>
                )}
                {teacher.pedagogicalCert && (
                  <div>
                    <span className="text-slate-500 font-medium">Chứng chỉ sư phạm: </span>
                    <span className="text-slate-800">{teacher.pedagogicalCert}</span>
                  </div>
                )}
                {teacher.cefr && teacher.cefr.length > 0 && (
                  <div>
                    <span className="text-slate-500 font-medium">Khung CEFR: </span>
                    <span className="text-slate-800">{teacher.cefr.join(', ')}</span>
                  </div>
                )}
                {teacher.otherCerts && (
                  <div className="md:col-span-3">
                    <span className="text-slate-500 font-medium">Chứng chỉ khác: </span>
                    <span className="text-slate-700">{teacher.otherCerts}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Lĩnh vực & Môn học giảng dạy */}
            {((teacher.languagesTaught && teacher.languagesTaught.length > 0) || (teacher.academicSubjectsTaught && teacher.academicSubjectsTaught.length > 0)) && (
              <div className="border-t border-slate-100 pt-4 space-y-4">
                {teacher.languagesTaught && teacher.languagesTaught.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-600 mb-2 uppercase tracking-wider">Ngoại ngữ có thể giảng dạy</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {teacher.languagesTaught.map(lang => (
                        <span key={lang} className="inline-block bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs border border-indigo-100 font-medium">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {teacher.academicSubjectsTaught && teacher.academicSubjectsTaught.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-600 mb-2 uppercase tracking-wider">Gia sư Văn Hóa & Học Thuật</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {teacher.academicSubjectsTaught.map(subj => (
                        <span key={subj} className="inline-block bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs border border-emerald-100 font-medium">
                          {subj}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Grid 3: Kinh nghiệm & Ưu điểm */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-sm font-semibold text-indigo-600 mb-3 uppercase tracking-wider">3. Kinh nghiệm giảng dạy & Ưu điểm</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {teacher.teachingYears !== undefined && teacher.teachingYears !== null && (
                  <div>
                    <span className="text-slate-500 font-medium">Số năm kinh nghiệm: </span>
                    <span className="text-slate-800">{teacher.teachingYears} năm</span>
                  </div>
                )}
                {teacher.studentsTaughtCount !== undefined && teacher.studentsTaughtCount !== null && (
                  <div>
                    <span className="text-slate-500 font-medium">Số học viên đã dạy: </span>
                    <span className="text-slate-800">{teacher.studentsTaughtCount} học viên</span>
                  </div>
                )}
                {teacher.studentAgesTaught && (
                  <div>
                    <span className="text-slate-500 font-medium">Độ tuổi HS từng dạy: </span>
                    <span className="text-slate-800">{teacher.studentAgesTaught}</span>
                  </div>
                )}
                {teacher.teachingFormats && teacher.teachingFormats.length > 0 && (
                  <div>
                    <span className="text-slate-500 font-medium">Hình thức dạy chính: </span>
                    <span className="text-slate-800">
                      {teacher.teachingFormats.map(f => f === 'online' ? 'Online' : f === 'offline' ? 'Offline' : f).join(', ')}
                    </span>
                  </div>
                )}
                {teacher.studentResults && (
                  <div className="md:col-span-3">
                    <span className="text-slate-500 font-medium">Thành tích học viên đạt được: </span>
                    <span className="text-slate-700">{teacher.studentResults}</span>
                  </div>
                )}
                {teacher.strengths && teacher.strengths.length > 0 && (
                  <div className="md:col-span-3">
                    <span className="text-slate-500 font-medium">Ưu điểm nổi bật: </span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {teacher.strengths.map((str) => {
                        const labelMap: Record<string, string> = {
                          pronunciation: 'Phát âm chuẩn',
                          patience: 'Kiên nhẫn',
                          lesson_plans: 'Có giáo án riêng',
                          close_followup: 'Theo sát học viên',
                          progress_reports: 'Báo cáo tiến độ định kỳ',
                          tools_proficiency: 'Sử dụng Zoom/Meet thành thạo'
                        };
                        return (
                          <span key={str} className="inline-block bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full text-xs border border-sky-100 font-medium">
                            {labelMap[str] || str}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {teacher.otherStrengths && (
                  <div className="md:col-span-3">
                    <span className="text-slate-500 font-medium">Ưu điểm khác: </span>
                    <span className="text-slate-700">{teacher.otherStrengths}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Tổng số buổi - all-time, không đổi theo bộ lọc tháng */}
        <Card className="flex items-center p-4 relative overflow-hidden border-slate-200/80 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center mr-4 flex-shrink-0">
            <Calendar className="w-6 h-6 text-sky-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-sky-600">{totalLessons}</p>
            <p className="text-xs font-semibold text-slate-700 mt-1">Buổi đã dạy</p>
            <p className="text-[11px] text-slate-400 mt-0.5">/ {lessons.length} buổi</p>
          </div>
        </Card>

        {/* Card 2: Tổng phút - all-time, không đổi theo bộ lọc tháng */}
        <Card className="flex items-center p-4 relative overflow-hidden border-slate-200/80 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center mr-4 flex-shrink-0">
            <Clock className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-violet-600">{totalMinutes}'</p>
            <p className="text-xs font-semibold text-slate-700 mt-1">Tổng phút</p>
            <p className="text-[11px] text-slate-400 mt-0.5">(từ trước tới giờ)</p>
          </div>
        </Card>

        {/* Card 3: Tổng lương */}
        <Card className="flex items-center p-4 relative overflow-hidden border-slate-200/80 shadow-sm justify-between">
          <div className="flex items-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mr-4 flex-shrink-0">
              <Wallet className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              {totalSalary > 2000000 ? (
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-400 font-medium">Trước trừ: <span className="line-through">{formatVND(totalSalary)}</span></p>
                  <p className="text-lg font-bold text-emerald-600">Thực nhận: {formatVND(totalSalary * 0.9)}</p>
                  <p className="text-[10px] text-rose-500 italic font-medium">(-10% thuế TNCN)</p>
                </div>
              ) : (
                <p className="text-2xl font-bold text-emerald-600">{formatVND(totalSalary)}</p>
              )}
              <p className="text-xs font-semibold text-slate-700 mt-1">Tổng lương</p>
              <p className="text-[11px] text-slate-400 mt-0.5">(từ trước tới giờ)</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-sm flex-shrink-0">
            $
          </div>
        </Card>
      </div>

      {/* Weekly Availability */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-[#3BB8EB]" />
          <h3 className="text-base font-semibold text-slate-900">Lịch rảnh</h3>
        </div>
        {!availability ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400 italic">Chưa cập nhật</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day) => {
                const slot = availability.slots?.[day]
                const isAvailable = slot?.available
                return (
                  <div
                    key={day}
                    className={`rounded-xl p-3 text-center transition-all border ${
                      isAvailable
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <p className={`text-xs font-bold mb-2 ${isAvailable ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {DAY_LABELS[day]}
                    </p>
                    {isAvailable && slot.timeRanges?.length > 0 ? (
                      <div className="space-y-1">
                        {slot.timeRanges.map((tr, i) => (
                          <span
                            key={i}
                            className="inline-block text-[10px] lg:text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full whitespace-nowrap"
                          >
                            {tr.start}–{tr.end}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-300">—</span>
                    )}
                  </div>
                )
              })}
            </div>
            {availability.note && (
              <p className="text-sm text-slate-500 mt-3 italic border-t border-slate-100 pt-3">
                📝 {availability.note}
              </p>
            )}
          </>
        )}
      </Card>

      {/* Active Classes */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-[#3BB8EB]" />
          <h3 className="text-base font-semibold text-slate-900">Lớp đang dạy</h3>
          <span className="ml-auto text-xs text-slate-400">{activeStudents.length} học viên</span>
        </div>
        {activeStudents.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Chưa có lớp nào</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {['Học viên', 'Mã HV', 'Môn', 'Sách học', 'Tổng buổi', 'Đã học', 'Còn lại', 'Lương chưa trả'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeStudents.map((s) => {
                  const studentLessons = lessons.filter((l) => l.studentId === s.id && l.status === 'approved')
                  const unpaidLessons = studentLessons.filter((l) => {
                    const p = payrolls.find((pay) => pay.lessonId === l.id && !pay.voided)
                    return !p || !p.paid
                  })
                  const unpaidMin = unpaidLessons.reduce((sum, l) => sum + l.minutes, 0)
                  const unpaidSalary = unpaidLessons.reduce((sum, l) => sum + (l.salary || 0), 0)

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => navigate(`/admin/students/${s.id}`)}>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{s.code}</span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {editingStudentId === s.id ? (
                          savingStudentSubjectId === s.id ? (
                            <span className="text-xs text-slate-400 animate-pulse font-medium">Đang đồng bộ...</span>
                          ) : (
                            <div className="flex items-center gap-1.5 relative min-w-[200px]">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  placeholder="Tìm môn..."
                                  value={subjectSearch}
                                  onChange={(e) => {
                                    setSubjectSearch(e.target.value)
                                    setIsSubjectSearching(true)
                                    setShowSubjectsList(true)
                                  }}
                                  onFocus={() => {
                                    setShowSubjectsList(true)
                                    setIsSubjectSearching(false)
                                  }}
                                  className="rounded-lg bg-white border border-slate-300 text-xs px-2 py-1 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-400 w-full pr-6"
                                />
                                {subjectSearch && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubjectSearch('')
                                      setSelectedSubjectId('')
                                      setIsSubjectSearching(true)
                                      setShowSubjectsList(true)
                                    }}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                    title="Xóa tìm kiếm"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                                
                                {showSubjectsList && (() => {
                                  const displayedSubjects = isSubjectSearching
                                    ? subjects.filter(sub => sub.name.toLowerCase().includes(subjectSearch.toLowerCase()))
                                    : subjects;
                                  return (
                                    <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
                                      {displayedSubjects.map(sub => (
                                        <button
                                          key={sub.id}
                                          type="button"
                                          onClick={() => {
                                            setSelectedSubjectId(sub.id)
                                            setSubjectSearch(sub.name)
                                            setShowSubjectsList(false)
                                            setIsSubjectSearching(false)
                                          }}
                                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors truncate block
                                            ${selectedSubjectId === sub.id ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-slate-700'}`}
                                        >
                                          {sub.name}
                                        </button>
                                      ))}
                                      {displayedSubjects.length === 0 && (
                                        <p className="text-[10px] text-slate-400 text-center py-2">Không thấy môn học</p>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSaveStudentSubject(s.id)
                                  setShowSubjectsList(false)
                                }}
                                className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition-colors shadow-sm h-7 w-7 flex items-center justify-center flex-shrink-0"
                                title="Lưu thay đổi"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStudentId(null)
                                  setShowSubjectsList(false)
                                }}
                                className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition-colors shadow-sm h-7 w-7 flex items-center justify-center flex-shrink-0"
                                title="Hủy bỏ"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudentId(s.id)
                              setSelectedSubjectId(s.subjectId)
                              setSubjectSearch(s.subjectName || '')
                              setIsSubjectSearching(false)
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100/80 transition-all border border-sky-100 cursor-pointer shadow-sm"
                            title="Bấm để sửa nhanh môn học cho học viên"
                          >
                            <span>{s.subjectName || '—'}</span>
                            <Pencil className="w-2.5 h-2.5 text-sky-400" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 italic max-w-[150px] truncate">
                        {(() => {
                          const studentAllLessons = lessons.filter((l) => l.studentId === s.id)
                          const latestLesson = studentAllLessons.sort((a, b) => b.date.localeCompare(a.date))[0]
                          const bookTitle = latestLesson?.book || '—'
                          return (
                            <span title={latestLesson?.book || ''}>{bookTitle}</span>
                          )
                        })()}
                      </td>
                      {(() => {
                        const mps = s.minutesPerSession || 50
                        const totalMin = s.totalMinutes ?? s.totalSessions * mps
                        const usedMin = s.usedMinutes ?? s.usedSessions * mps
                        const remainingMin = s.remainingMinutes ?? s.remainingSessions * mps
                        return (
                          <>
                            <td className="px-4 py-3 text-slate-600">
                              <div>{s.totalSessions}</div>
                              <div className="text-[11px] text-slate-400">{totalMin}'</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <div>{s.usedSessions}</div>
                              <div className="text-[11px] text-slate-400">{usedMin}'</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className={`font-semibold ${s.remainingSessions <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {s.remainingSessions}
                              </div>
                              <div className={`text-[11px] ${remainingMin <= 0 ? 'text-rose-400' : 'text-slate-400'}`}>{remainingMin}'</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className={`font-semibold ${unpaidSalary > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {unpaidSalary > 0 ? formatVND(unpaidSalary) : '0đ'}
                              </div>
                              <div className="text-[11px] text-slate-400">{unpaidMin}'</div>
                            </td>
                          </>
                        )
                      })()}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Lesson History */}
      <Card padding="none" className="border-slate-200/80 shadow-sm overflow-visible">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-violet-500" />
            <h3 className="text-base font-semibold text-slate-900 uppercase tracking-wider">
              Lịch sử buổi dạy
            </h3>
            <span className="ml-auto text-xs text-slate-400 font-medium">
              {filteredLessons.length}/{lessonsInMonth.length} buổi tháng {Number(mMon) || ''}
            </span>
          </div>

          {/* CHI TIẾT LƯƠNG Grid Card */}
          <Card className="mt-4 border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
              CHI TIẾT LƯƠNG THÁNG {monthDisplayLabel}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Đã duyệt</p>
                {approvedSalaryMonth > 2000000 ? (
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-slate-400 font-medium">Trước trừ: <span className="line-through">{formatVND(approvedSalaryMonth)}</span></p>
                    <p className="text-lg font-bold text-emerald-600">Thực nhận: {formatVND(approvedSalaryMonth * 0.9)}</p>
                    <p className="text-[10px] text-rose-500 italic font-medium">(-10% thuế TNCN)</p>
                  </div>
                ) : (
                  <p className="text-xl font-bold text-emerald-600">{formatVND(approvedSalaryMonth)}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">({approvedInMonth.length} buổi)</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Chờ duyệt</p>
                <p className="text-xl font-bold text-amber-500">{formatVND(pendingSalaryMonth)}</p>
                <p className="text-xs text-slate-400 mt-0.5">({pendingInMonth.length} buổi)</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Tổng lương tháng {Number(mMon) || ''}</p>
                {totalSalaryMonth > 2000000 ? (
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-slate-400 font-medium">Trước trừ: <span className="line-through">{formatVND(totalSalaryMonth)}</span></p>
                    <p className="text-lg font-bold text-emerald-600">Dự kiến sau trừ: {formatVND(totalSalaryMonth * 0.9)}</p>
                    <p className="text-[10px] text-rose-500 italic font-medium">(-10% thuế TNCN)</p>
                  </div>
                ) : (
                  <p className="text-xl font-bold text-emerald-600">{formatVND(totalSalaryMonth)}</p>
                )}
              </div>
              <div className="flex justify-start md:justify-end">
                {(() => {
                  const approvedPercent = lessonsInMonth.length > 0 ? Math.round((approvedInMonth.length / lessonsInMonth.length) * 100) : 0
                  const radius = 20
                  const strokeWidth = 4
                  const circumference = 2 * Math.PI * radius
                  const strokeDashoffset = circumference - (approvedPercent / 100) * circumference
                  return (
                    <div className="flex items-center gap-3">
                      <div className="relative w-14 h-14 flex items-center justify-center">
                        <svg className="w-14 h-14 transform -rotate-90">
                          <circle
                            cx="28"
                            cy="28"
                            r={radius}
                            className="stroke-slate-100"
                            strokeWidth={strokeWidth}
                            fill="transparent"
                          />
                          <circle
                            cx="28"
                            cy="28"
                            r={radius}
                            className="stroke-emerald-500 transition-all duration-500 ease-out"
                            strokeWidth={strokeWidth}
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute text-xs font-bold text-slate-800">{approvedPercent}%</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">Đã duyệt</p>
                        <p className="text-[11px] text-slate-400 font-medium">{approvedInMonth.length} / {lessonsInMonth.length} buổi</p>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="border-t border-slate-100 my-4 pt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-start gap-1.5 text-xs text-slate-500">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p>Lương tháng chỉ tính các buổi đã duyệt.</p>
                  <p className="text-[11px] text-slate-500 italic">
                    * Đối với giáo viên có tổng lương tháng trên 2.000.000 đ, hệ thống tự động khấu trừ 10% thuế TNCN theo quy định.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 w-full sm:w-auto justify-end">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowBreakdown(true)} 
                  className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 py-1.5 h-8 font-semibold rounded-lg"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Xem chi tiết
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportPayrollCSV} 
                  className="flex items-center gap-1.5 text-xs text-emerald-600 border border-emerald-500/20 bg-emerald-50/5 hover:bg-emerald-50/15 py-1.5 h-8 font-semibold rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  Xuất bảng lương
                </Button>
              </div>
            </div>
          </Card>

          {/* Tab Navigation Row */}
          <div className="flex border-b border-slate-200 mt-6 gap-6 overflow-x-auto scrollbar-none">
            {[
              { id: 'all', label: 'Tất cả', count: lessonsInMonth.length, badgeBg: 'bg-violet-100 text-violet-700' },
              { id: 'approved', label: 'Đã duyệt', count: approvedInMonth.length, badgeBg: 'bg-emerald-100 text-emerald-700' },
              { id: 'pending', label: 'Chờ duyệt', count: pendingInMonth.length, badgeBg: 'bg-amber-100 text-amber-700' },
              { id: 'paid', label: 'Đã thanh toán', count: lessonsInMonth.filter(l => {
                  const p = payrolls.find(pay => pay.lessonId === l.id && !pay.voided);
                  return p?.paid === true;
                }).length, badgeBg: 'bg-blue-100 text-blue-700' }
            ].map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setActiveTab(tabItem.id as any)}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-all relative whitespace-nowrap ${
                  activeTab === tabItem.id 
                    ? 'text-violet-600 border-b-2 border-violet-600' 
                    : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'
                }`}
              >
                <span>{tabItem.label}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tabItem.badgeBg}`}>
                  {tabItem.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4 items-center justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm học viên..."
                value={lessonSearch}
                onChange={(e) => setLessonSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            
            <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center">
              {/* Month Selector */}
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={lessonMonth}
                  onChange={(e) => setLessonMonth(e.target.value)}
                  className="pl-9 pr-8 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 cursor-pointer shadow-sm appearance-none min-w-[170px]"
                >
                  {getMonthOptions().map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Date Selector */}
              <div className="relative">
                <select
                  value={lessonDateFilter}
                  onChange={(e) => setLessonDateFilter(e.target.value)}
                  className="pr-8 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 cursor-pointer min-w-[130px] appearance-none"
                >
                  <option value="">Tất cả ngày</option>
                  {uniqueDatesInMonth.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Class/Subject Selector */}
              <div className="relative">
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="pr-8 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 cursor-pointer min-w-[150px] appearance-none"
                >
                  <option value="">Tất cả lớp học</option>
                  {Array.from(new Set(lessonsInMonth.map(l => l.subjectName).filter(Boolean))).map(className => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {filteredLessons.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Không có buổi dạy nào</p>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {['NGÀY', 'HỌC VIÊN', 'MÔN', 'SÁCH', 'PHÚT', 'LƯƠNG TẠM TÍNH', 'TRẠNG THÁI DUYỆT', 'THANH TOÁN', 'THAO TÁC'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLessons.map((l, index) => {
                  const p = payrolls.find((pay) => pay.lessonId === l.id && !pay.voided);
                  const isPaid = p?.paid === true;
                  const hasPayroll = !!p;
                  const estSalary = l.status === 'approved' && l.salary != null ? l.salary : calculateSalary(l.minutes, l.pricePerMinute || 0, l.teacherLevel ?? teacher?.level ?? 1);
                  const isNearBottom = filteredLessons.length - index <= 2;

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{l.date}</td>
                      <td className="px-4 py-3">
                        <p className="text-slate-800 font-semibold">{l.studentName}</p>
                        <p className="text-xs text-emerald-600 font-mono bg-emerald-50/50 px-1.5 py-0.5 rounded w-max mt-0.5">{l.studentCode}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{l.subjectName || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 italic max-w-[150px] truncate" title={l.book || ''}>{l.book || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{l.minutes}'</td>
                      <td className="px-4 py-3 text-slate-700 font-bold whitespace-nowrap">
                        {formatVND(estSalary)}
                      </td>
                      
                      {/* Interactive Status Selector Dropdown */}
                      <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeDropdownLessonId === l.id) {
                              setActiveDropdownLessonId(null)
                            } else {
                              setActiveDropdownLessonId(l.id)
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-sm
                            ${l.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70'
                              : l.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/70'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/70'
                            }`}
                        >
                          {l.status === 'approved' && <Check className="w-3 h-3 text-emerald-600" />}
                          {l.status === 'pending' && <Hourglass className="w-3 h-3 text-amber-600" />}
                          {l.status === 'rejected' && <X className="w-3 h-3 text-rose-600" />}
                          <span>
                            {l.status === 'approved' ? 'Đã duyệt' : l.status === 'pending' ? 'Chờ duyệt' : 'Từ chối'}
                          </span>
                          <ChevronDown className="w-3 h-3 text-slate-400" />
                        </button>

                        {activeDropdownLessonId === l.id && (
                          <>
                            {/* Backdrop to close dropdown on click outside */}
                            <div className="fixed inset-0 z-40" onClick={() => setActiveDropdownLessonId(null)} />
                            
                            <div className={`absolute left-4 w-32 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 animate-fade-in divide-y divide-slate-50 ${
                              isNearBottom ? 'bottom-full mb-1' : 'top-full mt-1'
                            }`}>
                              {/* Option 1: Approved */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownLessonId(null)
                                  if (l.status === 'approved') return
                                  setApprovingLesson(l)
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 hover:text-emerald-700 transition-colors"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                Đã duyệt
                              </button>

                              {/* Option 2: Pending */}
                              <button
                                type="button"
                                onClick={async () => {
                                  setActiveDropdownLessonId(null)
                                  if (l.status === 'pending') return
                                  if (l.status === 'approved') {
                                    setRevertingLesson(l)
                                    return
                                  }
                                  // Moving from rejected back to pending is safe
                                  await handleUpdateLessonStatus(l, 'pending')
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 hover:text-amber-700 transition-colors"
                              >
                                <Hourglass className="w-3.5 h-3.5 text-amber-600" />
                                Chờ duyệt
                              </button>

                              {/* Option 3: Rejected */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownLessonId(null)
                                  if (l.status === 'rejected') return
                                  // Moving to rejected is allowed for both pending and approved lessons
                                  setRejectingLesson(l)
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 hover:text-rose-700 transition-colors"
                              >
                                <X className="w-3.5 h-3.5 text-rose-600" />
                                Từ chối
                              </button>
                            </div>
                          </>
                        )}
                      </td>

                      {/* Payment Status Badges */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {hasPayroll ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isPaid 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* More actions: three dots trigger attendance status edit */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          title="Sửa tình trạng"
                          onClick={() => {
                            setSelectedStatus(l.attendanceStatus || 'present')
                            setEditingLesson(l)
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-500 hover:bg-violet-50 transition-colors cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Attendance Status Modal */}
      {editingLesson && (
        <Modal
          open
          onClose={() => setEditingLesson(null)}
          title="Sửa tình trạng buổi học"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setEditingLesson(null)}>Hủy</Button>
              <Button variant="primary" onClick={handleSaveAttendanceStatus} loading={savingStatus}>Lưu</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Buổi dạy ngày <span className="font-medium text-slate-700">{editingLesson.date}</span> với học viên{' '}
              <span className="font-medium text-slate-700">{editingLesson.studentName}</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ATTENDANCE_STATUS_LABELS) as [AttendanceStatus, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedStatus(key)}
                  className={`py-3 px-2 rounded-xl text-sm font-semibold transition-all
                    ${selectedStatus === key
                      ? key === 'present'
                        ? 'bg-emerald-500 text-white shadow-md scale-105'
                        : key === 'with_permission'
                        ? 'bg-amber-500 text-white shadow-md scale-105'
                        : 'bg-rose-500 text-white shadow-md scale-105'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Detailed Salary Breakdown Modal */}
      {showBreakdown && (
        <Modal
          open
          onClose={() => setShowBreakdown(false)}
          title={`Chi tiết lương tháng ${monthDisplayLabel}`}
          footer={
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setShowBreakdown(false)}>Đóng</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3 shadow-inner">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Giáo viên:</span>
                <span className="font-semibold text-slate-700">{teacher?.name}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5">
                <span className="text-slate-500">Tổng số buổi dạy:</span>
                <span className="font-semibold text-slate-700">{lessonsInMonth.length} buổi</span>
              </div>
              <div className="flex justify-between text-sm pl-4">
                <span className="text-slate-400">— Đã duyệt:</span>
                <span className="font-medium text-slate-600">{approvedInMonth.length} buổi</span>
              </div>
              <div className="flex justify-between text-sm pl-4">
                <span className="text-slate-400">— Chờ duyệt:</span>
                <span className="font-medium text-slate-600">{pendingInMonth.length} buổi</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5">
                <span className="text-slate-500">Tổng số phút học:</span>
                <span className="font-semibold text-slate-700">{lessonsInMonth.reduce((acc, l) => acc + l.minutes, 0)} phút</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5">
                <span className="text-slate-500">Lương chưa trừ thuế:</span>
                <span className="font-bold text-slate-700">{formatVND(approvedSalaryMonth)}</span>
              </div>
              {approvedSalaryMonth > 2000000 ? (
                <>
                  <div className="flex justify-between text-sm text-rose-500 font-medium">
                    <span>Thuế TNCN khấu trừ (10%):</span>
                    <span>-{formatVND(approvedSalaryMonth * 0.1)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5 font-semibold">
                    <span className="text-slate-700">Lương thực nhận sau thuế (Net):</span>
                    <span className="font-bold text-emerald-600">{formatVND(approvedSalaryMonth * 0.9)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5">
                <span className="text-slate-500">Đã thanh toán (Gross):</span>
                <span className="font-bold text-emerald-600">{formatVND(paidPayrollMonth)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5">
                <span className="text-slate-500">Chưa thanh toán (Chờ trả - Gross):</span>
                <span className="font-bold text-amber-500">{formatVND(unpaidPayrollMonth)}</span>
              </div>
              {approvedSalaryMonth > 2000000 && (
                <div className="text-[10px] text-slate-400 italic border-t border-slate-200/30 pt-2 text-right">
                  * Lương thực nhận của tháng sẽ khấu trừ 10% do tổng thu nhập vượt quá 2.000.000đ.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Bottom Salary Summary Cards */}
      <Card className="border-slate-200/80 shadow-sm p-4 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          {/* Summary Box 1: Total Salary */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">Tổng lương tháng {Number(mMon) || ''}</p>
              {totalSalaryMonth > 2000000 ? (
                <>
                  <p className="text-[11px] text-slate-400 line-through leading-none mt-0.5">{formatVND(totalSalaryMonth)}</p>
                  <p className="text-base font-extrabold text-slate-800 leading-tight">{formatVND(totalSalaryMonth * 0.9)}</p>
                  <p className="text-[9px] text-rose-500 italic font-semibold leading-none mt-0.5">(-10% thuế TNCN)</p>
                </>
              ) : (
                <>
                  <p className="text-base font-extrabold text-slate-800 mt-0.5">{formatVND(totalSalaryMonth)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">(Tính từ các buổi đã duyệt)</p>
                </>
              )}
            </div>
          </div>

          {/* Summary Box 2: Approved */}
          <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">Đã duyệt</p>
              <p className="text-base font-extrabold text-emerald-600 mt-0.5">{approvedInMonth.length} buổi</p>
              {approvedSalaryMonth > 2000000 ? (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  <span className="line-through">{formatVND(approvedSalaryMonth)}</span>
                  <span className="text-emerald-600 font-semibold ml-1">→ {formatVND(approvedSalaryMonth * 0.9)}</span>
                </p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-0.5">{formatVND(approvedSalaryMonth)}</p>
              )}
            </div>
          </div>

          {/* Summary Box 3: Pending */}
          <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 flex-shrink-0">
              <Hourglass className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">Chờ duyệt</p>
              <p className="text-base font-extrabold text-amber-500 mt-0.5">{pendingInMonth.length} buổi</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{formatVND(pendingSalaryMonth)}</p>
            </div>
          </div>

          {/* Summary Box 4: Blue Callout */}
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 flex items-start gap-2 h-full justify-center flex-col">
            <div className="flex items-center gap-1.5 text-sky-700">
              <Info className="w-4 h-4 text-sky-500 flex-shrink-0" />
              <span className="text-xs font-semibold">Lương tháng {Number(mMon) || ''} chỉ tính các buổi đã duyệt.</span>
            </div>
            <div className="text-[10px] text-slate-500 italic mt-1 leading-normal">
              * Giáo viên có tổng lương tháng trên 2.000.000 đ sẽ bị khấu trừ 10% thuế TNCN.
            </div>
          </div>
        </div>
      </Card>

      {/* Approve Confirm Dialog */}
      {approvingLesson && (
        <ConfirmDialog
          open
          onClose={() => setApprovingLesson(null)}
          onConfirm={handleApprove}
          title="Xác nhận duyệt buổi dạy?"
          confirmLabel="Duyệt buổi dạy"
          loading={approving}
        >
          <div className="bg-white rounded-xl p-4 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Học viên</span>
              <span className="text-slate-700">{approvingLesson.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Thời lượng buổi này</span>
              <span className="text-slate-700 font-medium">{approvingLesson.minutes} phút</span>
            </div>
            {approvingLesson.pricePerMinute != null && (
              <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1">
                <span className="text-slate-500">Lương giáo viên</span>
                <span className="text-emerald-500 font-semibold">
                  +{formatVND(
                    calculateSalary(approvingLesson.minutes, approvingLesson.pricePerMinute, approvingLesson.teacherLevel ?? teacher?.level ?? 1)
                  )}
                </span>
              </div>
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Revert Confirm Dialog */}
      {revertingLesson && (
        <ConfirmDialog
          open
          onClose={() => setRevertingLesson(null)}
          onConfirm={handleRevertToPending}
          title="Xác nhận hoàn tác duyệt?"
          confirmLabel="Hoàn tác về Chờ duyệt"
          loading={reverting}
        >
          <div className="bg-white rounded-xl p-4 text-sm space-y-1.5">
            <p className="text-slate-500 mb-2 leading-relaxed">
              Hành động này sẽ **trả lại {revertingLesson.minutes} phút học** cho học viên <span className="text-slate-700 font-semibold">{revertingLesson.studentName}</span> và **vô hiệu hóa** bản ghi lương liên quan của giáo viên.
            </p>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-500">Học viên</span>
              <span className="text-slate-700">{revertingLesson.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Khôi phục số phút</span>
              <span className="text-emerald-600 font-medium font-mono">+{revertingLesson.minutes} phút</span>
            </div>
            {revertingLesson.salary != null && (
              <div className="flex justify-between border-t border-slate-100 pt-1.5 mt-1">
                <span className="text-slate-500">Thu hồi lương giáo viên</span>
                <span className="text-rose-500 font-semibold">
                  -{formatVND(revertingLesson.salary)}
                </span>
              </div>
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Reject Modal */}
      {rejectingLesson && (
        <Modal
          open
          onClose={() => setRejectingLesson(null)}
          title="Từ chối buổi dạy"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setRejectingLesson(null)}>Hủy</Button>
              <Button variant="danger" onClick={handleReject} loading={rejecting}>Xác nhận từ chối</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Từ chối buổi của <span className="text-slate-700 font-medium">{rejectingLesson.studentName}</span> với{' '}
              <span className="text-slate-700">{rejectingLesson.teacherName}</span>
            </p>
            <Textarea
              label="Lý do từ chối *"
              placeholder="Nhập lý do từ chối..."
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {showEdit && <TeacherFormModal teacher={teacher} onClose={() => setShowEdit(false)} />}
    </div>
  )
}
