import { useEffect, useState, useMemo } from 'react'
import { doc, getDoc, getDocs, collection, query, where, onSnapshot, updateDoc, serverTimestamp, addDoc, runTransaction, documentId, deleteDoc, deleteField, setDoc, writeBatch } from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { BookingRequest, Teacher, Lesson, Student, StudentSubject, TeacherAvailability, DayOfWeek, Payroll, Subject, PaymentSettings } from '@/types'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { TeacherFormModal } from '@/components/teachers/TeacherFormModal'
import { ApproveModal } from '@/components/lessons/ApproveModal'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { ArrowLeft, Calendar, BookOpen, Clock, DollarSign, GraduationCap, Pencil, Search, Eye, Download, Check, X, MoreVertical, Info, Hourglass, Wallet, ChevronDown, CheckCircle2, ExternalLink } from 'lucide-react'
import { formatMoney, formatMoneyTotals, getCurrentMonth, LOW_SESSION_THRESHOLD } from '@/lib/constants'
import { normalizePayrollTaxPolicy, calculatePayrollTax } from '@/lib/payrollTax'
import { COUNTRY_CURRENCY_MAP, getCountryRate } from '@/lib/countryPricing'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ImageLightbox } from '@/components/shared/ImageLightbox'
import { lessonRewardPoints } from '@/lib/rewards'
import { bookingHoldMinutes, resolveLessonBookings } from '@/lib/lessonBooking'
import { getBookingPoints, getLessonPoints } from '@/lib/points'
import { retireTeacherAccount } from '@/lib/teacherAccount'
import { recoverTeacherLoginAccount } from '@/lib/teacherLoginRecovery'
import { buildPublicTeacherProfile } from '@/lib/publicTeacherProfile'
import { offlineTeachingAreaLabels } from '@/lib/offlineTeachingAreas'
import { teacherSubjectLabels } from '@/lib/teacherSubjects'
import { buildPayrollApprovalFields } from '@/lib/payrollReapproval'

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
  const [certImageView, setCertImageView] = useState<string | null>(null)
  const [restoringLogin, setRestoringLogin] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [toggleLoading, setToggleLoading] = useState(false)
  const [showRetireConfirm, setShowRetireConfirm] = useState(false)
  const [retiring, setRetiring] = useState(false)
  const [publishingProfile, setPublishingProfile] = useState(false)
  const [lessonsLoaded, setLessonsLoaded] = useState(false)
  const [lessonLoadFailed, setLessonLoadFailed] = useState(false)
  const [subjectsLoaded, setSubjectsLoaded] = useState(false)
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null)
  const payrollTaxPolicy = normalizePayrollTaxPolicy(paymentSettings)

  useEffect(() => onSnapshot(doc(db, 'paymentSettings', 'main'), (snapshot) => {
    setPaymentSettings(snapshot.exists() ? snapshot.data() as PaymentSettings : null)
  }), [])

  // Khôi phục quyền đăng nhập cho GV bị 403: luồng đổi nickname có thể để lại
  // users doc với role 'inactive_teacher' trong khi teacher vẫn active — GV đăng
  // nhập Auth thành công nhưng app đọc role sai nên bị chặn. Chỉ admin sửa được
  // (rules không cho GV tự đổi role).
  const handleRestoreLoginRole = async () => {
    if (!teacher) return
    if (teacher.status === 'resigned') {
      toast.error('Gia sư đã nghỉ dạy. Cần cấp nickname mới và kích hoạt lại trước khi khôi phục đăng nhập.')
      return
    }
    setRestoringLogin(true)
    try {
      const result = await recoverTeacherLoginAccount(teacher.id)
      toast.success(result.reclaimedOrphan
        ? 'Đã sửa liên kết tài khoản cũ và khôi phục đăng nhập thành công.'
        : 'Đã khôi phục tài khoản đăng nhập. Gia sư có thể đăng nhập lại ngay bằng mã hiện tại.')
    } catch (err) {
      console.error('Restore login role failed:', err)
      const message = err instanceof Error ? err.message.replace(/^FirebaseError:\s*/i, '') : ''
      toast.error(message || 'Không thể khôi phục quyền đăng nhập, vui lòng thử lại')
    } finally {
      setRestoringLogin(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!teacher) return
    // Hồ sơ nghỉ dạy luôn phải đi qua modal để đồng bộ lại nickname, users/{uid}
    // và tài khoản đăng nhập; chỉ đổi status sẽ tạo trạng thái kích hoạt dở dang.
    if (teacher.status === 'resigned') {
      setShowEdit(true)
      return
    }
    if (teacher.status !== 'active' && !(teacher.code || '').trim()) {
      toast.error('Hãy cấp nickname đăng nhập mới trước khi kích hoạt lại gia sư')
      setShowEdit(true)
      return
    }
    setToggleLoading(true)
    try {
      const nextStatus = teacher.status === 'active' ? 'inactive' : 'active'
      const batch = writeBatch(db)
      batch.update(doc(db, 'teachers', teacher.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      })
      if (nextStatus === 'inactive') {
        batch.set(doc(db, 'publicTeacherProfiles', teacher.id), {
          isPublished: false,
          unpublishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }
      await batch.commit()
      setTeacher(prev => prev ? { ...prev, status: nextStatus } : null)
      toast.success(nextStatus === 'inactive' ? 'Đã chuyển gia sư sang tạm dừng dạy' : 'Đã kích hoạt lại gia sư')
    } catch (err) {
      console.error(err)
      toast.error('Cập nhật trạng thái thất bại')
    } finally {
      setToggleLoading(false)
    }
  }

  const handleRetireTeacher = async () => {
    if (!teacher) return
    setRetiring(true)
    try {
      const nickname = teacher.code || teacher.releasedNickname || ''
      await retireTeacherAccount({
        teacherId: teacher.id,
        teacherName: teacher.name,
        nickname,
        adminId: user?.uid,
      })
      setTeacher((current) => current ? {
        ...current,
        status: 'resigned',
        code: '',
        releasedNickname: nickname,
      } : current)
      setShowRetireConfirm(false)
      toast.success('Đã khóa tài khoản và thu hồi nickname đăng nhập')
    } catch (error) {
      console.error('Retire teacher failed:', error)
      toast.error('Không thể khóa tài khoản gia sư. Dữ liệu chưa bị thay đổi.')
    } finally {
      setRetiring(false)
    }
  }

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

  // Chọn hàng loạt buổi dạy để đổi "Đã duyệt" -> "Chờ duyệt"
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set())
  const [showBulkRevert, setShowBulkRevert] = useState(false)
  const [showBulkApprove, setShowBulkApprove] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkReverting, setBulkReverting] = useState(false)

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

    const unsubTeacher = onSnapshot(doc(db, 'teachers', id), (snap) => {
      if (snap.exists()) setTeacher({ id: snap.id, ...snap.data() } as Teacher)
      setLoading(false)
    }, (error) => {
      console.error('Subscribe teacher profile failed:', error)
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
      setLessonLoadFailed(false)
      setLessonsLoaded(true)
    }, (error) => {
      console.error('Subscribe teacher lessons failed:', error)
      setLessonLoadFailed(true)
      setLessonsLoaded(true)
    })

    const payrollQ = query(collection(db, 'payroll'), where('teacherId', '==', id))
    const unsubPayrolls = onSnapshot(payrollQ, (snap) => {
      setPayrolls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payroll)))
    })

    getDocs(collection(db, 'subjects')).then((snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    }).catch((error) => {
      console.error('Load subjects for teacher profile failed:', error)
    }).finally(() => {
      setSubjectsLoaded(true)
    })

    return () => {
      unsubTeacher()
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
      const teachersMap = new Map(teachers.map((item: any) => [item.id, item]))

      // Fetch all payrolls first to check paid status
      const payrollQueries = lessonsSnap.docs.map(lessonDoc =>
        getDocs(query(collection(db, 'payroll'), where('lessonId', '==', lessonDoc.id)))
      )
      
      const payrollSnaps = await Promise.all(payrollQueries)

      const lessonUpdates: Promise<any>[] = []
      const payrollUpdates: Promise<any>[] = []

      lessonsSnap.docs.forEach((lessonDoc, index) => {
        const lessonId = lessonDoc.id
        const lesson = lessonDoc.data()
        const payrollSnap = payrollSnaps[index]
        
        const isPaid = payrollSnap.docs.some((pDoc: any) => pDoc.data().paid === true)
        if (isPaid) {
          // Protect paid lessons from rate change propagation
          return
        }

        const lessonTeacher = teachersMap.get(lesson.teacherId) as any
        const { price: lessonRate, currency: lessonCurrency } = getCountryRate(
          newSubject,
          lessonTeacher?.country || 'VN',
        )
        const minutes = Number(lesson.minutes) || 0
        const teacherLevel = Number(lesson.teacherLevel) || 1
        const newSalary = lesson.status === 'approved'
          ? calculateSalary(minutes, lessonRate, teacherLevel, lessonCurrency)
          : 0

        lessonUpdates.push(
          updateDoc(doc(db, 'lessons', lessonId), {
            subjectId: selectedSubjectId,
            subjectName: newSubject.name,
            pricePerMinute: lessonRate,
            salary: newSalary,
            currency: lessonCurrency,
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

        payrollSnap.docs.forEach((pDoc: any) => {
          const payroll = pDoc.data()
          if (!payroll.paid && !payroll.voided) {
            payrollUpdates.push(
              updateDoc(doc(db, 'payroll', pDoc.id), {
                amount: newSalary,
                pricePerMinute: lessonRate,
                currency: lessonCurrency,
                recalculatedAt: serverTimestamp(),
              })
            )
          }
        })
      })

      await Promise.all([
        Promise.all(lessonUpdates),
        Promise.all(payrollUpdates),
      ])

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
    customRejectReason?: string,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    const currentStatus = lesson.status
    if (currentStatus === targetStatus) return true

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
        })
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
          if (lessonNow.status !== 'pending' && lessonNow.status !== 'rejected') throw new Error('LESSON_ALREADY_PROCESSED')

          const student = studentSnap.data() as Student
          const subjectId = lessonNow.subjectId || lesson.subjectId || student.subjectId || student.subjects?.[0]?.subjectId
          if (!subjectId) throw new Error('SUBJECT_NOT_FOUND')

          const bookingRefs = matchedBookings.map((booking) => doc(db, 'bookingRequests', booking.id))
          const rewardRef = doc(db, 'rewardTransactions', lesson.id)
          const [teacherSnap, subjectSnap, rewardSnap, ...bookingSnaps] = await Promise.all([
            tx.get(doc(db, 'teachers', lesson.teacherId)),
            tx.get(doc(db, 'subjects', subjectId)),
            tx.get(rewardRef),
            ...bookingRefs.map((bookingRef) => tx.get(bookingRef)),
          ])

          const teacherData = teacherSnap.data()
          const teacherLevel = (lesson.teacherLevel ?? teacherData?.level ?? 1) || 1
          const lessonMinutes = Number(lesson.minutes) || 0
          const bookingNows = bookingSnaps
            .filter((snap) => snap.exists())
            .map((snap) => ({ id: snap.id, ...snap.data() } as BookingRequest))
          const bookingNow = bookingNows[0] || null
          const isAbsenceLesson = lessonNow.attendanceStatus === 'with_permission' || lessonNow.attendanceStatus === 'without_permission'
          const lessonPoints = isAbsenceLesson
            ? getLessonPoints(lessonNow, teacherData)
            : bookingNows.length > 1
              ? bookingNows.reduce((sum, booking) => sum + getBookingPoints(booking, teacherData), 0)
              : bookingNow
                ? getBookingPoints(bookingNow, teacherData)
              : getLessonPoints(lessonNow, teacherData)

          let updatedSubjects: StudentSubject[] = student.subjects && student.subjects.length > 0
            ? student.subjects.map((item) => ({ ...item }))
            : student.subjectId
              ? [{
                  subjectId: student.subjectId,
                  subjectName: student.subjectName || subjectSnap.data()?.name || 'Chưa rõ',
                  totalSessions: Number(student.totalSessions) || 0,
                  usedSessions: Number(student.usedSessions) || 0,
                  remainingSessions: Number(student.remainingSessions) || 0,
                  minutesPerSession: Number(student.minutesPerSession) || 50,
                  totalMinutes: Number(student.totalMinutes ?? (student.totalSessions * (student.minutesPerSession || 50))) || 0,
                  usedMinutes: Number(student.usedMinutes ?? ((student.usedSessions || 0) * (student.minutesPerSession || 50))) || 0,
                  remainingMinutes: Number(student.remainingMinutes ?? ((student.remainingSessions || 0) * (student.minutesPerSession || 50))) || 0,
                  pricePerMinute: Number(subjectSnap.data()?.pricePerMinute) || 0,
                }]
              : []

          const subjectIndex = updatedSubjects.findIndex((item) => item.subjectId === subjectId)
          if (subjectIndex < 0) throw new Error('STUDENT_SUBJECT_PACKAGE_NOT_FOUND')
          const subjectPackage = updatedSubjects[subjectIndex]
          if (Number(subjectPackage.remainingMinutes || 0) < lessonPoints) {
            throw new Error('NOT_ENOUGH_POINTS')
          }
          const { price: pricePerMinute, currency } = getCountryRate(subjectPackage, teacherData?.country || 'VN')
          const salary = calculateSalary(lessonMinutes, pricePerMinute, teacherLevel, currency)
          const month = (lesson.date || '').slice(0, 7)
          const newSubjectUsedMinutes = Number(subjectPackage.usedMinutes || 0) + lessonPoints
          const newSubjectRemainingMinutes = Math.max(0, Number(subjectPackage.totalMinutes || 0) - newSubjectUsedMinutes)
          const subjectMps = Number(subjectPackage.minutesPerSession) || 50
          const usedSessionsRaw = subjectMps > 0 ? newSubjectUsedMinutes / subjectMps : 0
          const newSubjectUsedSessions = Math.abs(usedSessionsRaw - Math.round(usedSessionsRaw)) < 0.001
            ? Math.round(usedSessionsRaw)
            : Math.round(usedSessionsRaw * 100) / 100
          const newSubjectRemainingSessions = Math.floor(newSubjectRemainingMinutes / subjectMps)
          updatedSubjects[subjectIndex] = {
            ...subjectPackage,
            usedMinutes: newSubjectUsedMinutes,
            remainingMinutes: newSubjectRemainingMinutes,
            usedSessions: newSubjectUsedSessions,
            remainingSessions: newSubjectRemainingSessions,
          }

          const totalSessions = updatedSubjects.reduce((sum, item) => sum + Number(item.totalSessions || 0), 0)
          const usedSessions = updatedSubjects.reduce((sum, item) => sum + Number(item.usedSessions || 0), 0)
          const remainingSessions = updatedSubjects.reduce((sum, item) => sum + Number(item.remainingSessions || 0), 0)
          const totalMinutes = updatedSubjects.reduce((sum, item) => sum + Number(item.totalMinutes || 0), 0)
          const usedMinutes = updatedSubjects.reduce((sum, item) => sum + Number(item.usedMinutes || 0), 0)
          const remainingMinutes = updatedSubjects.reduce((sum, item) => sum + Number(item.remainingMinutes || 0), 0)
          const primarySubject = updatedSubjects[0]

          const prevHeldMinutes = Number(student.reservedMinutes ?? student.heldMinutes ?? 0) || 0
          const heldMinutesToRelease = lessonNow.bookingHoldConsumed === true
            ? 0
            : bookingNows.reduce((sum, booking) => sum + bookingHoldMinutes(booking, teacherData), 0)
          const newHeldMinutes = Math.max(0, prevHeldMinutes - heldMinutesToRelease)
          const earnedPoints = lessonRewardPoints(lessonNow as Lesson)
          const shouldAwardPoints = earnedPoints > 0 && !rewardSnap.exists()
          const subjectName = subjectPackage.subjectName || subjectSnap.data()?.name || ''

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid ?? '',
            salary,
            teacherLevel,
            pricePerMinute,
            currency,
            points: lessonPoints,
            pointsPer25Minutes: Number(bookingNow?.pointsPer25Minutes ?? lessonNow.pointsPer25Minutes ?? teacherData?.pointsPer25Minutes) || 25,
            subjectId,
            subjectName,
            sessionsBeforeApproval: subjectPackage.remainingSessions,
            sessionsAfterApproval: newSubjectRemainingSessions,
            minutesBeforeApproval: subjectPackage.remainingMinutes,
            minutesAfterApproval: newSubjectRemainingMinutes,
            ...(bookingNow ? {
              bookingRequestId: bookingNow.id,
              ...(bookingNows.length > 1 ? { bookingRequestIds: bookingNows.map((booking) => booking.id) } : {}),
            } : {}),
            bookingHoldConsumed: lessonNow.bookingHoldConsumed === true || heldMinutesToRelease > 0,
            rejectedReason: null, // Xoá lý do từ chối cũ nếu có
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
            usedMinutes,
            remainingMinutes,
            totalMinutes,
            totalSessions,
            minutesPerSession: primarySubject?.minutesPerSession || 50,
            usedSessions,
            remainingSessions,
            reservedMinutes: newHeldMinutes,
            heldMinutes: newHeldMinutes,
            subjectId: primarySubject?.subjectId || '',
            subjectName: primarySubject?.subjectName || '',
            status: remainingMinutes <= 0 ? 'expired' : 'active',
            ...(shouldAwardPoints ? {
              rewardPoints: Number(student.rewardPoints || 0) + earnedPoints,
              lifetimeRewardPoints: Number(student.lifetimeRewardPoints || 0) + earnedPoints,
            } : {}),
            updatedAt: serverTimestamp(),
          })

          if (shouldAwardPoints) {
            tx.set(rewardRef, {
              type: 'lesson_rating',
              studentId: lesson.studentId,
              lessonId: lesson.id,
              points: earnedPoints,
              rating: earnedPoints,
              createdAt: serverTimestamp(),
              createdBy: user?.uid || '',
            })
          }

          tx.update(doc(db, 'teachers', lesson.teacherId), {
            totalApprovedMinutes: Number(teacherData?.totalApprovedMinutes || 0) + lessonMinutes,
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

          const payrollRef = doc(db, 'payroll', lesson.id)
          tx.set(payrollRef, {
            teacherId: lesson.teacherId,
            teacherName: lesson.teacherName ?? '',
            lessonId: lesson.id,
            minutes: lessonMinutes,
            pricePerMinute,
            level: teacherLevel,
            month,
            ...buildPayrollApprovalFields(lessonNow, salary, currency),
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
              pointsDeducted: lessonPoints,
              minutesBefore: subjectPackage.remainingMinutes,
              minutesAfter: newSubjectRemainingMinutes,
              heldMinutesBefore: prevHeldMinutes,
              heldMinutesAfter: newHeldMinutes,
              heldMinutesReleased: heldMinutesToRelease,
              bookingRequestId: bookingNow?.id || null,
            },
            createdAt: serverTimestamp(),
          })
        })

        toast.success('Đã duyệt buổi dạy thành công')
        setApprovingLesson(null)
      } else if (currentStatus === 'approved') {
        // Luồng hoàn tác duyệt (approved -> pending hoặc approved -> rejected)
        const lessonPointsToRestore = getLessonPoints(lesson, teacher)
        const bookingsToReopen = targetStatus === 'pending'
          ? await resolveLessonBookings({
              id: lesson.id,
              bookingRequestId: lesson.bookingRequestId,
              bookingRequestIds: lesson.bookingRequestIds,
              scheduleCheck: lesson.scheduleCheck,
              studentId: lesson.studentId,
              teacherId: lesson.teacherId,
              date: lesson.date,
              minutes: lesson.minutes,
              subjectId: lesson.subjectId,
            })
          : []
        const payrollSnap = await getDocs(
          query(collection(db, 'payroll'), where('lessonId', '==', lesson.id))
        )
        const payrollIds = payrollSnap.docs.map((d) => d.id)
        const payrollRefs = payrollIds.map((payrollId) => doc(db, 'payroll', payrollId))

        const restoredHeldPoints = await runTransaction(db, async (tx) => {
          const studentRef = doc(db, 'students', lesson.studentId)
          const lessonRef = doc(db, 'lessons', lesson.id)
          const bookingRefsToReopen = bookingsToReopen.map((booking) => doc(db, 'bookingRequests', booking.id))

          const reads = await Promise.all([
            tx.get(lessonRef),
            tx.get(studentRef),
            ...bookingRefsToReopen.map((bookingRef) => tx.get(bookingRef)),
            ...payrollRefs.map((payrollRef) => tx.get(payrollRef)),
          ])
          const [lessonSnap, studentSnap] = reads
          const bookingSnapsToReopen = reads.slice(2, 2 + bookingRefsToReopen.length)
          const payrollSnaps = reads.slice(2 + bookingRefsToReopen.length)

          if (!lessonSnap.exists()) throw new Error('LESSON_NOT_FOUND')
          if (lessonSnap.data().status !== 'approved') throw new Error('LESSON_ALREADY_PROCESSED')
          const paidPayroll = payrollSnaps.find(
            (payroll) => payroll.exists() && payroll.data().paid === true && !payroll.data().voided,
          )
          const paidPayrollData = paidPayroll?.data()

          const hasStudent = studentSnap.exists()
          if (targetStatus === 'pending' && !hasStudent) throw new Error('STUDENT_NOT_FOUND')
          const lessonCurrent = lessonSnap.data() as Lesson
          const bookingsEligibleToReopen = bookingSnapsToReopen.flatMap((bookingSnap) => {
            if (!bookingSnap.exists()) return []
            const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
            return booking.status === 'completed' && booking.lessonId === lesson.id ? [booking] : []
          })
          const heldPointsToRestore = targetStatus === 'pending' && lessonCurrent.bookingHoldConsumed === true
            ? bookingsEligibleToReopen.reduce((sum, booking) => sum + getBookingPoints(booking, teacher), 0)
            : 0

          tx.update(lessonRef, {
            status: targetStatus,
            rejectedReason: targetStatus === 'rejected' ? (customRejectReason || 'Admin huỷ duyệt sau khi đã duyệt') : null,
            sessionsBeforeApproval: 0,
            sessionsAfterApproval: 0,
            minutesBeforeApproval: 0,
            minutesAfterApproval: 0,
            salary: 0,
            ...(paidPayrollData ? {
              payrollPaidBeforeReopen: true,
              payrollPaidAmount: Number(paidPayrollData.amount || 0),
              payrollPaidCurrency: String(paidPayrollData.currency || lessonCurrent.currency || 'VND'),
              ...(paidPayrollData.paidAt ? { payrollPaidAt: paidPayrollData.paidAt } : {}),
            } : {}),
            ...(targetStatus === 'pending' ? { bookingHoldConsumed: false } : {}),
            updatedAt: serverTimestamp(),
          })

          bookingSnapsToReopen.forEach((bookingSnap) => {
            if (!bookingSnap.exists()) return
            const booking = { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
            if (booking.status !== 'completed' || booking.lessonId !== lesson.id) return
            tx.update(bookingSnap.ref, {
              status: 'confirmed',
              lessonId: deleteField(),
              completedAt: deleteField(),
              updatedAt: serverTimestamp(),
            })
          })

          if (hasStudent) {
            const s = studentSnap.data()!
            // Initialize subjects array for backward compatibility if needed
            let updatedSubjects = s.subjects && s.subjects.length > 0
              ? [...s.subjects]
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
                    pricePerMinute: lesson.pricePerMinute || 0,
                  }]
                : []

            // Find the matching subject package
            const sIdx = updatedSubjects.findIndex(sub => sub.subjectId === lesson.subjectId)
            if (sIdx !== -1) {
              const subPkg = updatedSubjects[sIdx]
              const subUsedMinutes = Math.max(0, subPkg.usedMinutes - lessonPointsToRestore)
              const subRemainingMinutes = subPkg.totalMinutes - subUsedMinutes
              const subMps = subPkg.minutesPerSession || 50
              const subUsedSessionsRaw = subMps > 0 ? subUsedMinutes / subMps : 0
              const subUsedSessions = Math.abs(subUsedSessionsRaw - Math.round(subUsedSessionsRaw)) < 0.001
                ? Math.round(subUsedSessionsRaw)
                : Math.round(subUsedSessionsRaw * 100) / 100
              const subRemainingSessions = Math.floor(subRemainingMinutes / subMps)

              updatedSubjects[sIdx] = {
                ...subPkg,
                usedMinutes: subUsedMinutes,
                remainingMinutes: subRemainingMinutes,
                usedSessions: subUsedSessions,
                remainingSessions: subRemainingSessions
              }
            }

            // Recalculate aggregates
            const aggTotalSessions = updatedSubjects.reduce((sum, sub) => sum + sub.totalSessions, 0)
            const aggUsedSessions = updatedSubjects.reduce((sum, sub) => sum + sub.usedSessions, 0)
            const aggRemainingSessions = updatedSubjects.reduce((sum, sub) => sum + sub.remainingSessions, 0)
            const aggTotalMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.totalMinutes, 0)
            const aggUsedMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.usedMinutes, 0)
            const aggRemainingMinutes = updatedSubjects.reduce((sum, sub) => sum + sub.remainingMinutes, 0)

            const primarySubject = updatedSubjects[0] || null
            const currentHeldMinutes = Number(s.reservedMinutes ?? s.heldMinutes ?? 0) || 0
            const nextHeldMinutes = currentHeldMinutes + heldPointsToRestore
            if (nextHeldMinutes > aggRemainingMinutes) throw new Error('RESTORED_HOLD_EXCEEDS_REMAINING')

            tx.update(studentRef, {
              subjects: updatedSubjects,
              totalSessions: aggTotalSessions,
              usedSessions: aggUsedSessions,
              remainingSessions: aggRemainingSessions,
              totalMinutes: aggTotalMinutes,
              usedMinutes: aggUsedMinutes,
              remainingMinutes: aggRemainingMinutes,
              reservedMinutes: nextHeldMinutes,
              heldMinutes: nextHeldMinutes,
              // Legacy compatibility
              subjectId: primarySubject ? primarySubject.subjectId : '',
              subjectName: primarySubject ? primarySubject.subjectName : '',
              minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 50,
              status: aggRemainingMinutes <= 0 ? 'expired' : 'active',
              updatedAt: serverTimestamp(),
            })
          }

          const publicLessonRef = doc(db, 'publicLessons', lesson.id)
          tx.delete(publicLessonRef)

          for (const payroll of payrollSnaps) {
            if (!payroll.exists()) continue
            if (payroll.data().paid === true && !payroll.data().voided) {
              tx.update(payroll.ref, {
                lessonReviewReopened: true,
                lessonReviewReopenedAt: serverTimestamp(),
                lessonReviewReopenedBy: user?.uid || '',
              })
            } else {
              tx.update(payroll.ref, {
                voided: true,
                amount: 0,
                voidedAt: serverTimestamp(),
                voidedBy: user?.uid || '',
              })
            }
          }
          return heldPointsToRestore
        })

        await addDoc(collection(db, 'adminLogs'), {
          adminId: user?.uid || '',
          action: 'REVERSE_APPROVAL',
          targetType: 'lesson',
          targetId: lesson.id,
          changes: {
            status: { from: 'approved', to: targetStatus },
            lessonDate: lesson.date,
            restoredPoints: lessonPointsToRestore,
            restoredHeldPoints,
            voidedPayrolls: payrollIds.length,
            voidedSalary: lesson.salary || 0,
          },
          createdAt: serverTimestamp(),
        })

        if (!options?.silent) toast.success(`Đã huỷ duyệt, trả lại ${lessonPointsToRestore} kim cương cho học viên`)
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
        if (!options?.silent) toast.success(`Đã cập nhật trạng thái về ${targetStatus === 'pending' ? 'Chờ duyệt' : 'Từ chối'}`)
        setRejectingLesson(null)
        setRejectReason('')
      }
      return true
    } catch (err: any) {
      console.error('[update-lesson-status]', err)
      const code = err?.code || ''
      const message = err?.message || ''
      if (options?.silent) return false
      if (message === 'LESSON_NOT_FOUND') {
        toast.error('Buổi dạy không tồn tại, có thể đã bị xóa')
      } else if (message === 'STUDENT_NOT_FOUND') {
        toast.error('Học viên không tồn tại')
      } else if (message === 'LESSON_ALREADY_PROCESSED') {
        toast.warning('Buổi dạy đã được xử lý trước đó')
      } else if (message === 'BOOKING_MATCH_AMBIGUOUS' || message === 'BOOKING_REFERENCE_INVALID') {
        toast.error('Lịch đặt không khớp rõ ràng với buổi điểm danh. Hãy kiểm tra ngày, gia sư và thời lượng trước khi xử lý.')
      } else if (message === 'RESTORED_HOLD_EXCEEDS_REMAINING') {
        toast.error('Không thể mở lại lịch vì phần kim cương cần giữ vượt quỹ còn lại. Hãy đối soát quỹ học viên trước.')
      } else if (message === 'NOT_ENOUGH_POINTS') {
        toast.error('Học viên không đủ kim cương khả dụng để duyệt buổi học này')
      } else if (code === 'permission-denied') {
        toast.error('Bạn không có quyền cập nhật trạng thái buổi dạy này')
      } else {
        toast.error(`Cập nhật thất bại: ${code || message || 'Lỗi không xác định'}`)
      }
      return false
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

  // Đổi hàng loạt "Đã duyệt" -> "Chờ duyệt": chạy TUẦN TỰ từng buổi qua đúng
  // luồng hoàn tác an toàn (trả phút cho học viên, vô hiệu bản ghi lương, gỡ
  // buổi công khai, ghi admin log) để không lệch dữ liệu.
  const handleBulkRevertToPending = async () => {
    const targets = lessons.filter((l) => selectedLessonIds.has(l.id) && l.status === 'approved')
    if (targets.length === 0) {
      toast.warning('Không có buổi "Đã duyệt" nào trong số đã chọn')
      setShowBulkRevert(false)
      return
    }
    setBulkReverting(true)
    let ok = 0
    let failed = 0
    try {
      for (const lesson of targets) {
        const success = await handleUpdateLessonStatus(lesson, 'pending', undefined, { silent: true })
        if (success) ok++
        else failed++
      }
      if (failed === 0) toast.success(`Đã chuyển ${ok} buổi về "Chờ duyệt"`)
      else toast.warning(`Đã chuyển ${ok} buổi; ${failed} buổi lỗi — vui lòng kiểm tra lại`)
      setSelectedLessonIds(new Set())
    } finally {
      setBulkReverting(false)
      setShowBulkRevert(false)
    }
  }

  // Duyệt hàng loạt: chạy TUẦN TỰ qua đúng luồng duyệt an toàn (trừ phút học viên,
  // ghi bản ghi lương, cộng điểm thưởng…). Chỉ áp dụng buổi Chờ duyệt/Từ chối.
  const handleBulkApprove = async () => {
    const targets = lessons.filter((l) => selectedLessonIds.has(l.id) && (l.status === 'pending' || l.status === 'rejected'))
    if (targets.length === 0) {
      toast.warning('Không có buổi "Chờ duyệt" nào trong số đã chọn')
      setShowBulkApprove(false)
      return
    }
    setBulkApproving(true)
    let ok = 0
    let failed = 0
    try {
      for (const lesson of targets) {
        const success = await handleUpdateLessonStatus(lesson, 'approved', undefined, { silent: true })
        if (success) ok++
        else failed++
      }
      if (failed === 0) toast.success(`Đã duyệt ${ok} buổi dạy`)
      else toast.warning(`Đã duyệt ${ok} buổi; ${failed} buổi lỗi (có thể học viên hết buổi) — vui lòng kiểm tra lại`)
      setSelectedLessonIds(new Set())
    } finally {
      setBulkApproving(false)
      setShowBulkApprove(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (!teacher) return <p className="text-slate-500 text-center py-20">Không tìm thấy gia sư</p>

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

  const handleOpenPublicProfile = async () => {
    if (teacher.status !== 'active' || teacher.isTester) {
      toast.error('Chỉ có thể công khai hồ sơ gia sư đang giảng dạy chính thức')
      return
    }
    if (!lessonsLoaded || !subjectsLoaded) {
      toast.info('Đang tải đủ dữ liệu hồ sơ, vui lòng thử lại sau ít giây')
      return
    }

    const profileUrl = `${window.location.origin}/giao-vien/${teacher.id}`
    // Mở tab rỗng ngay trong thao tác click để trình duyệt không chặn popup sau khi chờ Firestore.
    const profileWindow = window.open('about:blank', '_blank')
    if (profileWindow) profileWindow.opener = null
    setPublishingProfile(true)

    try {
      const publicProfile = buildPublicTeacherProfile({
        ...teacher,
        subjectNames: teacherSubjectLabels(teacher, subjects),
        totalApprovedMinutes: lessonLoadFailed
          ? Math.max(0, Number(teacher.totalApprovedMinutes) || 0)
          : totalMinutes,
      })

      // Ghi thay thế bằng DTO whitelist để không giữ lại trường nhạy cảm ngoài ý muốn.
      await setDoc(doc(db, 'publicTeacherProfiles', teacher.id), {
        ...publicProfile,
        publishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      let copied = false
      try {
        await navigator.clipboard?.writeText(profileUrl)
        copied = true
      } catch (clipboardError) {
        console.warn('Could not copy public teacher profile link:', clipboardError)
      }

      if (profileWindow) profileWindow.location.replace(profileUrl)
      toast.success(copied
        ? 'Đã cập nhật, mở và sao chép link hồ sơ cho phụ huynh'
        : 'Đã cập nhật và mở hồ sơ; trình duyệt chưa cho phép sao chép tự động')
    } catch (error) {
      profileWindow?.close()
      console.error('Publish teacher profile failed:', error)
      toast.error('Không thể tạo link hồ sơ. Dữ liệu gia sư không bị thay đổi.')
    } finally {
      setPublishingProfile(false)
    }
  }

  const totalSalary = approvedLessons.reduce((acc, l) => acc + (l.salary || 0), 0)
  const fallbackCurrency = COUNTRY_CURRENCY_MAP[teacher.country || 'VN'] || 'VND'
  const totalSalaryLabel = formatMoneyTotals(
    approvedLessons.map((lesson) => ({ amount: lesson.salary || 0, currency: lesson.currency })),
    fallbackCurrency,
  )
  const approvedCurrencies = new Set(approvedLessons.map((lesson) => (lesson.currency || fallbackCurrency).toUpperCase()))
  const isVndOnly = approvedCurrencies.size <= 1 && (approvedCurrencies.size === 0 || approvedCurrencies.has('VND'))
  const totalSalaryTaxSummary = calculatePayrollTax(totalSalary, fallbackCurrency, payrollTaxPolicy)

  const studentIdSet = new Set(lessons.filter(l => l.status !== 'rejected').map(l => l.studentId))
  const activeStudents = students.filter(s => studentIdSet.has(s.id))

  // Stats for the selected month
  const lessonsInMonth = lessons.filter((l) => lessonMonth ? l.date.startsWith(lessonMonth) : true)
  const approvedInMonth = lessonsInMonth.filter((l) => l.status === 'approved')
  const pendingInMonth = lessonsInMonth.filter((l) => l.status === 'pending')
  const monthCurrency = approvedInMonth.find((lesson) => lesson.currency)?.currency
    || pendingInMonth.find((lesson) => lesson.currency)?.currency
    || fallbackCurrency
  const monthCurrencies = new Set(lessonsInMonth.map((lesson) => (lesson.currency || monthCurrency).toUpperCase()))
  const isVndMonth = monthCurrencies.size <= 1 && (monthCurrencies.size === 0 || monthCurrencies.has('VND'))

  const approvedSalaryMonth = approvedInMonth.reduce((acc, l) => acc + (l.salary || 0), 0)
  const pendingSalaryMonth = pendingInMonth.reduce((acc, l) => acc + calculateSalary(l.minutes, l.pricePerMinute || 0, l.teacherLevel ?? teacher?.level ?? 1, l.currency || monthCurrency), 0)
  const totalSalaryMonth = approvedSalaryMonth + pendingSalaryMonth
  const approvedSalaryMonthTaxSummary = calculatePayrollTax(approvedSalaryMonth, monthCurrency, payrollTaxPolicy, lessonMonth || undefined)
  const totalSalaryMonthTaxSummary = calculatePayrollTax(totalSalaryMonth, monthCurrency, payrollTaxPolicy, lessonMonth || undefined)
  const approvedSalaryMonthLabel = formatMoneyTotals(
    approvedInMonth.map((lesson) => ({ amount: lesson.salary || 0, currency: lesson.currency })),
    monthCurrency,
  )
  const pendingSalaryMonthLabel = formatMoneyTotals(
    pendingInMonth.map((lesson) => ({
      amount: calculateSalary(lesson.minutes, lesson.pricePerMinute || 0, lesson.teacherLevel ?? teacher?.level ?? 1, lesson.currency || monthCurrency),
      currency: lesson.currency || monthCurrency,
    })),
    monthCurrency,
  )
  const totalSalaryMonthLabel = formatMoneyTotals([
    ...approvedInMonth.map((lesson) => ({ amount: lesson.salary || 0, currency: lesson.currency })),
    ...pendingInMonth.map((lesson) => ({
      amount: calculateSalary(lesson.minutes, lesson.pricePerMinute || 0, lesson.teacherLevel ?? teacher?.level ?? 1, lesson.currency || monthCurrency),
      currency: lesson.currency || monthCurrency,
    })),
  ], monthCurrency)

  // Monthly paid/unpaid payroll stats
  const paidPayrollList = payrolls.filter(p => !p.voided && p.paid && (lessonMonth ? p.month === lessonMonth : true))
  const unpaidPayrollList = payrolls.filter(p => !p.voided && !p.paid && (lessonMonth ? p.month === lessonMonth : true))
  const paidPayrollMonth = paidPayrollList.reduce((sum, p) => sum + p.amount, 0)
  const unpaidPayrollMonth = unpaidPayrollList.reduce((sum, p) => sum + p.amount, 0)
  // Gộp theo từng loại tiền tệ để gia sư nước ngoài không bị hiển thị nhầm ký hiệu "đ"
  const paidPayrollMonthLabel = formatMoneyTotals(paidPayrollList.map(p => ({ amount: p.amount, currency: p.currency })), fallbackCurrency)
  const unpaidPayrollMonthLabel = formatMoneyTotals(unpaidPayrollList.map(p => ({ amount: p.amount, currency: p.currency })), fallbackCurrency)

  const [mYear, mMon] = lessonMonth ? lessonMonth.split('-') : ['', '']
  const monthDisplayLabel = lessonMonth ? `${Number(mMon)}/${mYear}` : 'tất cả'

  const exportPayrollCSV = () => {
    if (!teacher) return
    const rows = [
      ['Ngày', 'Học viên', 'Mã học viên', 'Môn học', 'Số phút', 'Đơn giá/phút', 'Lương tạm tính', 'Trạng thái duyệt', 'Thanh toán'],
      ...lessonsInMonth.map((l) => {
        const p = payrolls.find((pay) => pay.lessonId === l.id && !pay.voided)
        const paymentStatus = p ? (p.paid ? 'Đã thanh toán' : 'Chưa thanh toán') : '—'
        const estSalary = l.status === 'approved' && l.salary != null ? l.salary : calculateSalary(l.minutes, l.pricePerMinute || 0, l.teacherLevel ?? teacher?.level ?? 1, l.currency || monthCurrency)
        return [
          l.date,
          l.studentName,
          l.studentCode,
          l.subjectName,
          `${l.minutes}'`,
          l.pricePerMinute,
          estSalary,
          l.status === 'approved' ? 'Đã duyệt' : l.status === 'pending' ? 'Chờ duyệt' : l.status === 'cancelled' ? 'Gia sư đã huỷ' : 'Từ chối',
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

  // Chọn hàng loạt: có thể chọn buổi ở mọi trạng thái. Nút "Duyệt" chỉ tác động
  // buổi Chờ duyệt/Từ chối, nút "Chuyển về Chờ duyệt" chỉ tác động buổi Đã duyệt.
  const selectableLessons = filteredLessons
  const allSelectableSelected = selectableLessons.length > 0 && selectableLessons.every((l) => selectedLessonIds.has(l.id))
  const selectedApprovedCount = lessons.filter((l) => selectedLessonIds.has(l.id) && l.status === 'approved').length
  const selectedPendingCount = lessons.filter((l) => selectedLessonIds.has(l.id) && (l.status === 'pending' || l.status === 'rejected')).length

  const toggleLessonSelection = (lessonId: string) => {
    setSelectedLessonIds((current) => {
      const next = new Set(current)
      if (next.has(lessonId)) next.delete(lessonId)
      else next.add(lessonId)
      return next
    })
  }

  const toggleAllApprovedLessons = () => {
    setSelectedLessonIds((current) => {
      const next = new Set(current)
      if (allSelectableSelected) selectableLessons.forEach((l) => next.delete(l.id))
      else selectableLessons.forEach((l) => next.add(l.id))
      return next
    })
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{teacher.name}</h1>
          <p className="text-sm text-slate-500">Chi tiết gia sư</p>
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
                <span
                  className={`font-mono text-lg font-bold px-3 py-1 rounded-lg border ${
                    teacher.status === 'resigned'
                      ? 'text-rose-600 bg-rose-50 border-rose-200'
                      : 'text-emerald-600 bg-emerald-50 border-emerald-200'
                  }`}
                >
                  {teacher.code || teacher.releasedNickname || 'Đã thu hồi'}
                </span>
                 <StatusBadge status={teacher.status} type="teacher" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm mt-2">
                <div>
                  <span className="text-slate-500">Họ tên: </span>
                  <span className="text-slate-800 font-medium">{teacher.name}</span>
                </div>
                <div>
                  <span className="text-slate-500">Level: </span>
                  <span className="text-slate-800 font-semibold">×{teacher.level}</span>
                </div>
                <div>
                  <span className="text-slate-500">Tên đăng nhập: </span>
                  <span className="text-indigo-600 font-bold font-mono">
                    {teacher.code || teacher.releasedNickname || 'Đã thu hồi'}
                  </span>
                  {teacher.status === 'resigned' && (
                    <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                      Nickname đã thu hồi
                    </span>
                  )}
                </div>
                {/* Câu giới thiệu — admin điền trực tiếp, phụ huynh sẽ thấy ở cổng phụ huynh */}
                <InlineBioEditor teacherId={teacher.id} bio={teacher.bio || ''} onSaved={(bio) => setTeacher(prev => prev ? { ...prev, bio } : prev)} />
                {teacher.bankAccountNo && (
                  <div className="sm:col-span-2 bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thông tin thanh toán / Bank Account</span>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-emerald-700 font-bold font-mono text-sm">{teacher.bankAccountNo}</span>
                        <span className="text-slate-350">·</span>
                        <span className="text-slate-700 font-bold text-xs uppercase">{teacher.bankName}</span>
                        <span className="text-slate-350">·</span>
                        <span className="text-slate-700 font-semibold text-xs uppercase">{teacher.bankAccountName}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {teacher.status === 'active' && !teacher.isTester && (
              <Button
                size="sm"
                variant="outline"
                loading={publishingProfile}
                disabled={!lessonsLoaded || !subjectsLoaded}
                onClick={handleOpenPublicProfile}
                title="Cập nhật, mở và sao chép link hồ sơ để gửi phụ huynh"
                className="whitespace-nowrap border-amber-300 bg-amber-50 font-bold text-amber-800 hover:bg-amber-100 hover:text-amber-900 focus:ring-amber-400"
              >
                <ExternalLink className="h-4 w-4" />
                Link hồ sơ
              </Button>
            )}
            <Button
              size="sm"
              variant={teacher.status === 'active' ? 'danger' : 'primary'}
              loading={toggleLoading}
              onClick={handleToggleStatus}
            >
              {teacher.status === 'active'
                ? 'Tạm dừng dạy'
                : teacher.status === 'resigned'
                  ? teacher.code
                    ? 'Kích hoạt lại & đồng bộ đăng nhập'
                    : 'Cấp nickname để dạy lại'
                  : 'Kích hoạt dạy'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Sửa</Button>
            {teacher.status !== 'resigned' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  loading={restoringLogin}
                  onClick={handleRestoreLoginRole}
                  title="Sửa lỗi gia sư đăng nhập bị 403 do tài khoản bị khóa quyền sau khi đổi nickname"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  Khôi phục đăng nhập
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setShowRetireConfirm(true)}
                >
                  Nghỉ dạy
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Interview Profile Card */}
      {teacher && (teacher.yob || teacher.livingArea || teacher.university || teacher.ielts || teacher.teachingYears || (teacher.strengths && teacher.strengths.length > 0)) && (
        <Card>
          <div className="border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-base font-semibold text-slate-900">Hồ sơ năng lực & Thông tin phỏng vấn</h3>
          </div>
          <div className="space-y-6">
            {/* Grid 1: Thông tin cá nhân & Học vấn */}
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
                    <span className="text-slate-500 font-medium">Tỉnh/Thành phố sinh sống: </span>
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
                {teacher.academicAwards && (
                  <div className="md:col-span-3">
                    <span className="text-slate-500 font-medium">Thành tích học tập nổi bật: </span>
                    <span className="text-slate-700">{teacher.academicAwards}</span>
                  </div>
                )}
                {teacher.trainedAt123English !== false && (
                  <div className="md:col-span-3">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Đã hoàn thành Chương trình Đào tạo Gia sư tại Nội Bộ Trung Tâm (60 giờ)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Grid 2: Chứng chỉ */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="text-sm font-semibold text-indigo-600 mb-2 uppercase tracking-wider">2. Chứng chỉ</h4>
              {teacher.certificates && teacher.certificates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teacher.certificates.map((cert, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                            {cert.category === 'foreign_language' ? 'Năng lực chuyên môn' : cert.category === 'pedagogical' ? 'Sư phạm' : 'Khác'}
                          </span>
                          <h5 className="font-bold text-slate-800 text-sm mt-2">{cert.title || 'Chưa đặt tên'}</h5>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cert.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                          {cert.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold pt-2 border-t border-slate-200/60">
                        <span className="text-slate-500">Điểm số: <span className="text-slate-800 font-bold">{cert.score || '—'}</span></span>
                        {cert.fileURL && (
                          <button
                            type="button"
                            onClick={() => setCertImageView(cert.fileURL || null)}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 hover:underline font-semibold"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Xem ảnh
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Chưa cập nhật chứng chỉ.</p>
              )}
            </div>

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
                {teacher.teachingFormats?.includes('offline') && (
                  <div className="md:col-span-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                    <span className="text-slate-600 font-semibold">Khu vực có thể nhận lớp Offline</span>
                    {offlineTeachingAreaLabels(teacher.offlineTeachingAreas).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {offlineTeachingAreaLabels(teacher.offlineTeachingAreas).map((area) => (
                          <span key={area} className="inline-flex rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                            {area}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm italic text-slate-500">Chưa cập nhật khu vực nhận lớp.</p>
                    )}
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
              {isVndOnly && totalSalaryTaxSummary.applies ? (
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-400 font-medium">Trước trừ: <span className="line-through">{formatMoney(totalSalaryTaxSummary.gross, fallbackCurrency)}</span></p>
                  <p className="text-lg font-bold text-emerald-600">Thực nhận: {formatMoney(totalSalaryTaxSummary.net, fallbackCurrency)}</p>
                  <p className="text-[10px] text-rose-500 italic font-medium">(-{totalSalaryTaxSummary.policy.ratePercent}% thuế TNCN)</p>
                </div>
              ) : (
                <p className="text-2xl font-bold text-emerald-600">{totalSalaryLabel}</p>
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
                  // Mỗi học viên có thể học môn tính giá theo quốc gia khác nhau (VD môn
                  // "Gia Sư Philippines" trả bằng PHP). Phải lấy tiền tệ theo chính buổi
                  // dạy của học viên đó, KHÔNG dùng chung tiền tệ của tháng đang lọc — nếu
                  // không, lương PHP/USD sẽ bị hiển thị nhầm ký hiệu "đ".
                  const unpaidLabel = formatMoneyTotals(
                    unpaidLessons.map((l) => ({ amount: l.salary || 0, currency: l.currency })),
                    studentLessons.find((l) => l.currency)?.currency || fallbackCurrency
                  )

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
                              <div className={`font-semibold ${s.remainingSessions <= LOW_SESSION_THRESHOLD ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {s.remainingSessions}
                              </div>
                              <div className={`text-[11px] ${remainingMin <= 0 ? 'text-rose-400' : 'text-slate-400'}`}>{remainingMin}'</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className={`font-semibold ${unpaidSalary > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {unpaidLabel}
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
                {approvedSalaryMonthTaxSummary.applies ? (
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-slate-400 font-medium">Trước trừ: <span className="line-through">{formatMoney(approvedSalaryMonthTaxSummary.gross, monthCurrency)}</span></p>
                    <p className="text-lg font-bold text-emerald-600">Thực nhận: {formatMoney(approvedSalaryMonthTaxSummary.net, monthCurrency)}</p>
                    <p className="text-[10px] text-rose-500 italic font-medium">(-{approvedSalaryMonthTaxSummary.policy.ratePercent}% thuế TNCN)</p>
                  </div>
                ) : (
                  <p className="text-xl font-bold text-emerald-600">{approvedSalaryMonthLabel}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">({approvedInMonth.length} buổi)</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Chờ duyệt</p>
                <p className="text-xl font-bold text-amber-500">{pendingSalaryMonthLabel}</p>
                <p className="text-xs text-slate-400 mt-0.5">({pendingInMonth.length} buổi)</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Tổng lương tháng {Number(mMon) || ''}</p>
                {totalSalaryMonthTaxSummary.applies ? (
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-slate-400 font-medium">Trước trừ: <span className="line-through">{formatMoney(totalSalaryMonthTaxSummary.gross, monthCurrency)}</span></p>
                    <p className="text-lg font-bold text-emerald-600">Dự kiến sau trừ: {formatMoney(totalSalaryMonthTaxSummary.net, monthCurrency)}</p>
                    <p className="text-[10px] text-rose-500 italic font-medium">(-{totalSalaryMonthTaxSummary.policy.ratePercent}% thuế TNCN)</p>
                  </div>
                ) : (
                  <p className="text-xl font-bold text-emerald-600">{totalSalaryMonthLabel}</p>
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
                    {payrollTaxPolicy.enabled
                      ? `* Thuế ${payrollTaxPolicy.ratePercent}% áp dụng khi tổng lương vượt ${formatMoney(payrollTaxPolicy.thresholdAmount, payrollTaxPolicy.currency)}.`
                      : '* Khấu trừ thuế TNCN hiện đang tắt trong Cài đặt.'}
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

        {selectedLessonIds.size > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <CheckCircle2 className="h-5 w-5 text-amber-600" />
              Đã chọn {selectedLessonIds.size} buổi ({selectedPendingCount} chờ duyệt · {selectedApprovedCount} đã duyệt)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setShowBulkApprove(true)}
                loading={bulkApproving}
                disabled={selectedPendingCount === 0}
                className="min-h-[40px] bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-300"
              >
                <Check className="mr-1.5 h-4 w-4" />
                Duyệt đã chọn
              </Button>
              <Button
                onClick={() => setShowBulkRevert(true)}
                loading={bulkReverting}
                disabled={selectedApprovedCount === 0}
                className="min-h-[40px] bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-300"
              >
                <Hourglass className="mr-1.5 h-4 w-4" />
                Chuyển về "Chờ duyệt"
              </Button>
              <button
                type="button"
                onClick={() => setSelectedLessonIds(new Set())}
                className="min-h-[40px] rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
              >
                Bỏ chọn
              </button>
            </div>
          </div>
        )}

        {filteredLessons.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Không có buổi dạy nào</p>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="w-11 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      ref={(element) => { if (element) element.indeterminate = !allSelectableSelected && selectedLessonIds.size > 0 }}
                      onChange={toggleAllApprovedLessons}
                      aria-label="Chọn tất cả buổi đang hiển thị"
                      className="h-4 w-4 accent-amber-500"
                      disabled={selectableLessons.length === 0}
                    />
                  </th>
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
                  const estSalary = l.status === 'approved' && l.salary != null ? l.salary : calculateSalary(l.minutes, l.pricePerMinute || 0, l.teacherLevel ?? teacher?.level ?? 1, l.currency || monthCurrency);
                  const isNearBottom = filteredLessons.length - index <= 2;

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedLessonIds.has(l.id)}
                          onChange={() => toggleLessonSelection(l.id)}
                          aria-label={`Chọn buổi dạy ngày ${l.date} của ${l.studentName}`}
                          className="h-4 w-4 accent-amber-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{l.date}</td>
                      <td className="px-4 py-3">
                        <p className="text-slate-800 font-semibold">{l.studentName}</p>
                        <p className="text-xs text-emerald-600 font-mono bg-emerald-50/50 px-1.5 py-0.5 rounded w-max mt-0.5">{l.studentCode}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{l.subjectName || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 italic max-w-[150px] truncate" title={l.book || ''}>{l.book || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{l.minutes}'</td>
                      <td className="px-4 py-3 text-slate-700 font-bold whitespace-nowrap">
                        {formatMoney(estSalary, l.currency || monthCurrency)}
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
                              : l.status === 'cancelled'
                              ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/70'
                            }`}
                        >
                          {l.status === 'approved' && <Check className="w-3 h-3 text-emerald-600" />}
                          {l.status === 'pending' && <Hourglass className="w-3 h-3 text-amber-600" />}
                          {l.status === 'rejected' && <X className="w-3 h-3 text-rose-600" />}
                          {l.status === 'cancelled' && <X className="w-3 h-3 text-slate-500" />}
                          <span>
                            {l.status === 'approved' ? 'Đã duyệt' : l.status === 'pending' ? 'Chờ duyệt' : l.status === 'cancelled' ? 'Gia sư đã huỷ' : 'Từ chối'}
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
                <span className="text-slate-500">Gia sư:</span>
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
                <span className="font-bold text-slate-700">{approvedSalaryMonthLabel}</span>
              </div>
              {approvedSalaryMonthTaxSummary.applies ? (
                <>
                  <div className="flex justify-between text-sm text-rose-500 font-medium">
                    <span>Thuế TNCN khấu trừ ({approvedSalaryMonthTaxSummary.policy.ratePercent}%):</span>
                    <span>-{formatMoney(approvedSalaryMonthTaxSummary.tax, monthCurrency)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5 font-semibold">
                    <span className="text-slate-700">Lương thực nhận sau thuế (Net):</span>
                    <span className="font-bold text-emerald-600">{formatMoney(approvedSalaryMonthTaxSummary.net, monthCurrency)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5">
                <span className="text-slate-500">Đã thanh toán (Gross):</span>
                <span className="font-bold text-emerald-600">{paidPayrollMonthLabel}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200/50 pt-2.5">
                <span className="text-slate-500">Chưa thanh toán (Chờ trả - Gross):</span>
                <span className="font-bold text-amber-500">{unpaidPayrollMonthLabel}</span>
              </div>
              {approvedSalaryMonthTaxSummary.applies && (
                <div className="text-[10px] text-slate-400 italic border-t border-slate-200/30 pt-2 text-right">
                  * Lương thực nhận của tháng áp dụng policy thuế hiện tại.
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
              {totalSalaryMonthTaxSummary.applies ? (
                <>
                  <p className="text-[11px] text-slate-400 line-through leading-none mt-0.5">{formatMoney(totalSalaryMonthTaxSummary.gross, monthCurrency)}</p>
                  <p className="text-base font-extrabold text-slate-800 leading-tight">{formatMoney(totalSalaryMonthTaxSummary.net, monthCurrency)}</p>
                  <p className="text-[9px] text-rose-500 italic font-semibold leading-none mt-0.5">(-{totalSalaryMonthTaxSummary.policy.ratePercent}% thuế TNCN)</p>
                </>
              ) : (
                <>
                  <p className="text-base font-extrabold text-slate-800 mt-0.5">{totalSalaryMonthLabel}</p>
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
              {approvedSalaryMonthTaxSummary.applies ? (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  <span className="line-through">{formatMoney(approvedSalaryMonthTaxSummary.gross, monthCurrency)}</span>
                  <span className="text-emerald-600 font-semibold ml-1">→ {formatMoney(approvedSalaryMonthTaxSummary.net, monthCurrency)}</span>
                </p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-0.5">{approvedSalaryMonthLabel}</p>
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
              <p className="text-[10px] text-slate-400 mt-0.5">{pendingSalaryMonthLabel}</p>
            </div>
          </div>

          {/* Summary Box 4: Blue Callout */}
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 flex items-start gap-2 h-full justify-center flex-col">
            <div className="flex items-center gap-1.5 text-sky-700">
              <Info className="w-4 h-4 text-sky-500 flex-shrink-0" />
              <span className="text-xs font-semibold">Lương tháng {Number(mMon) || ''} chỉ tính các buổi đã duyệt.</span>
            </div>
            <div className="text-[10px] text-slate-500 italic mt-1 leading-normal">
              {payrollTaxPolicy.enabled
                ? `* Thuế ${payrollTaxPolicy.ratePercent}% áp dụng khi tổng lương vượt ${formatMoney(payrollTaxPolicy.thresholdAmount, payrollTaxPolicy.currency)}.`
                : '* Khấu trừ thuế TNCN hiện đang tắt trong Cài đặt.'}
            </div>
          </div>
        </div>
      </Card>

      {/* Approve Confirm Dialog */}
      {approvingLesson && (
        <ApproveModal
          lesson={approvingLesson}
          onClose={() => setApprovingLesson(null)}
        />
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
              Hành động này sẽ **trả lại {revertingLesson.minutes} phút học** cho học viên <span className="text-slate-700 font-semibold">{revertingLesson.studentName}</span> và **vô hiệu hóa** bản ghi lương liên quan của gia sư.
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
                <span className="text-slate-500">Thu hồi lương gia sư</span>
                <span className="text-rose-500 font-semibold">
                  -{formatMoney(revertingLesson.salary, revertingLesson.currency)}
                </span>
              </div>
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Bulk approve confirm */}
      {showBulkApprove && (
        <ConfirmDialog
          open
          onClose={() => !bulkApproving && setShowBulkApprove(false)}
          onConfirm={handleBulkApprove}
          title={`Duyệt ${selectedPendingCount} buổi dạy đã chọn?`}
          confirmLabel={`Duyệt ${selectedPendingCount} buổi`}
          loading={bulkApproving}
        >
          <div className="bg-white rounded-xl p-4 text-sm space-y-1.5">
            <p className="text-slate-500 leading-relaxed">
              Từng buổi sẽ được duyệt qua đúng quy trình: <span className="font-semibold text-slate-700">trừ số phút học</span> của học viên tương ứng và <span className="font-semibold text-slate-700">ghi nhận lương</span> cho gia sư. Các buổi đã duyệt trong lựa chọn sẽ được bỏ qua.
            </p>
            <p className="border-t border-slate-100 pt-2 text-xs text-slate-400">
              Hệ thống xử lý lần lượt từng buổi để đảm bảo dữ liệu chính xác; buổi nào học viên đã hết phút sẽ bị bỏ qua và báo lại. Vui lòng không đóng trang khi đang chạy.
            </p>
          </div>
        </ConfirmDialog>
      )}

      {/* Bulk revert confirm */}
      {showBulkRevert && (
        <ConfirmDialog
          open
          onClose={() => !bulkReverting && setShowBulkRevert(false)}
          onConfirm={handleBulkRevertToPending}
          title={`Chuyển ${selectedApprovedCount} buổi về "Chờ duyệt"?`}
          confirmLabel={`Chuyển ${selectedApprovedCount} buổi`}
          loading={bulkReverting}
        >
          <div className="bg-white rounded-xl p-4 text-sm space-y-1.5">
            <p className="text-slate-500 leading-relaxed">
              Từng buổi sẽ được hoàn tác duyệt: <span className="font-semibold text-slate-700">trả lại số phút học</span> cho học viên tương ứng và <span className="font-semibold text-slate-700">vô hiệu hoá bản ghi lương</span> của gia sư. Các buổi chưa duyệt trong số đã chọn sẽ được bỏ qua.
            </p>
            <p className="border-t border-slate-100 pt-2 text-xs text-slate-400">
              Hệ thống xử lý lần lượt từng buổi để đảm bảo dữ liệu chính xác — vui lòng không đóng trang khi đang chạy.
            </p>
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

      {showRetireConfirm && (
        <ConfirmDialog
          open
          onClose={() => !retiring && setShowRetireConfirm(false)}
          onConfirm={handleRetireTeacher}
          title="Xác nhận gia sư nghỉ dạy?"
          description={`Hồ sơ và toàn bộ lịch sử của ${teacher?.name || 'gia sư'} vẫn được giữ nguyên.`}
          consequence="Tài khoản bị khóa ngay và nickname đăng nhập được thu hồi để có thể cấp cho gia sư khác."
          confirmLabel="Khóa và thu hồi nickname"
          confirmVariant="danger"
          loading={retiring}
        />
      )}

      {showEdit && <TeacherFormModal teacher={teacher} onClose={() => setShowEdit(false)} />}
      {certImageView && <ImageLightbox src={certImageView} onClose={() => setCertImageView(null)} alt="Ảnh chứng chỉ" />}
    </div>
  )
}

// Ô sửa nhanh "Câu giới thiệu" ngay trên trang chi tiết — không cần mở modal Sửa.
// Nội dung này hiển thị cho phụ huynh ở cổng phụ huynh (kèm nickname gia sư).
function InlineBioEditor({ teacherId, bio, onSaved }: { teacherId: string; bio: string; onSaved: (bio: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(bio)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'teachers', teacherId), { bio: draft.trim(), updatedAt: serverTimestamp() })
      onSaved(draft.trim())
      toast.success('Đã lưu câu giới thiệu')
      setEditing(false)
    } catch (err) {
      console.error(err)
      toast.error('Không thể lưu câu giới thiệu')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="sm:col-span-2 flex items-start gap-2">
        <div className="min-w-0">
          <span className="text-slate-500">Giới thiệu: </span>
          {bio
            ? <span className="text-slate-600 italic">"{bio}"</span>
            : <span className="text-slate-400 italic">Chưa có câu giới thiệu (phụ huynh sẽ thấy phần này)</span>}
        </div>
        <button
          type="button"
          onClick={() => { setDraft(bio); setEditing(true) }}
          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline flex-shrink-0 mt-0.5"
        >
          {bio ? 'Sửa' : 'Thêm'}
        </button>
      </div>
    )
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Câu giới thiệu (phụ huynh thấy được)</label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        maxLength={300}
        placeholder="VD: Cô Mirabelle có 5 năm kinh nghiệm luyện phát âm cho trẻ em, phong cách vui vẻ, kiên nhẫn..."
        className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : 'Lưu giới thiệu'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setEditing(false)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
        >
          Hủy
        </button>
        <span className="text-[10px] text-slate-400 ml-auto">{draft.length}/300</span>
      </div>
    </div>
  )
}
