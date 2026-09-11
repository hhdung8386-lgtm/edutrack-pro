import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  RefreshCw,
  Search,
  Send,
  Target,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { db } from '@/lib/firebase'
import { isGroupClass } from '@/lib/groupClasses'
import {
  cancelClassHunt,
  classHuntAffordableSessions,
  classHuntErrorReason,
  listAdminClassHunts,
  previewClassHunt,
  publishClassHunt,
  type ClassHunt,
  type ClassHuntDraftInput,
  type ClassHuntPreview,
  type ClassHuntStatus,
} from '@/lib/classHunting'
import {
  CLASS_HUNT_DAY_LABELS,
  CLASS_HUNT_DAY_ORDER,
  CLASS_HUNT_GENDER_LABELS,
  CLASS_HUNT_MAX_SESSIONS,
  CLASS_HUNT_SLOT_MINUTES,
  CLASS_HUNT_TEACHER_TYPE_LABELS,
  CLASS_HUNT_TEACHER_TYPES,
  classHuntSlotKey,
  classHuntSlotTimes,
  describeClassHuntTeacherRequirements,
  planClassHuntSlotSessions,
  sortClassHuntWeeklySlots,
  type ClassHuntSlotDay,
  type ClassHuntTeacherGender,
  type ClassHuntTeacherType,
  type ClassHuntWeeklySlot,
} from '@/lib/classHuntSchedule'
import type { Student } from '@/types'

type StatusFilter = 'all' | ClassHuntStatus
type SessionMode = 'all_remaining' | 'specific'

const SLOT_TIMES = classHuntSlotTimes()
const SEARCH_RESULT_LIMIT = 20

function todayInVietnam() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function formatDate(date?: string) {
  if (!date) return 'Chưa xác định ngày'
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : date
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount)
}

function number(value: number) {
  return Math.round(value).toLocaleString('vi-VN')
}

function huntStatusMeta(status: ClassHuntStatus) {
  if (status === 'claimed') return { label: 'Đã có gia sư nhận', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (status === 'cancelled') return { label: 'Đã hủy', className: 'border-slate-200 bg-slate-100 text-slate-600' }
  if (status === 'expired') return { label: 'Đã hết hạn', className: 'border-amber-200 bg-amber-50 text-amber-800' }
  return { label: 'Đang mở', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' }
}

function formatSlots(hunt: Pick<ClassHunt, 'slots'>, compact = false) {
  const visible = compact ? hunt.slots.slice(0, 3) : hunt.slots
  const labels = visible.map((slot) => `${CLASS_HUNT_DAY_LABELS[slot.weekday]} ${formatDate(slot.date)} ${slot.start}-${slot.end}`)
  if (compact && hunt.slots.length > visible.length) labels.push(`+${hunt.slots.length - visible.length} buổi`)
  return labels.join(', ')
}

/** Online 1-1 profiles only: group classes and offline learners cannot be hunted. */
function isHuntableStudent(student: Student) {
  return !isGroupClass(student)
    && student.classDeliveryMode !== 'offline'
    && student.learningScheduleType !== 'offline'
}

function createPublishRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `class_hunt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
}

function StepTitle({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-700 ring-1 ring-inset ring-blue-100">{step}</span>
      <div className="min-w-0">
        <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  )
}

const FIELD = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

export function ClassHuntingPage() {
  const role = useAuthStore((state) => state.role)
  // Pay figures are admin-only; any operator may publish (no class rate).
  const isAdmin = role === 'admin'

  const [students, setStudents] = useState<Student[]>([])
  const [studentsLoading, setStudentsLoading] = useState(true)
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [lookup, setLookup] = useState<ClassHuntPreview | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [subjectId, setSubjectId] = useState('')
  const [startDate, setStartDate] = useState(todayInVietnam())
  const [weeklySlots, setWeeklySlots] = useState<ClassHuntWeeklySlot[]>([])
  const [sessionMode, setSessionMode] = useState<SessionMode>('all_remaining')
  const [sessionCount, setSessionCount] = useState(1)
  const [teacherTypes, setTeacherTypes] = useState<ClassHuntTeacherType[]>([...CLASS_HUNT_TEACHER_TYPES])
  const [gender, setGender] = useState<ClassHuntTeacherGender>('any')
  const [nowMs, setNowMs] = useState(() => Date.now())

  const [checking, setChecking] = useState(false)
  const [confirm, setConfirm] = useState<{ draft: ClassHuntDraftInput; preview: ClassHuntPreview } | null>(null)
  const [publishing, setPublishing] = useState(false)

  const [huntsLoading, setHuntsLoading] = useState(true)
  const [huntsError, setHuntsError] = useState('')
  const [hunts, setHunts] = useState<ClassHunt[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [cancelTarget, setCancelTarget] = useState<ClassHunt | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const lookupRequestRef = useRef(0)
  const publishRequestIdsRef = useRef<Record<string, string>>({})
  const gridRef = useRef<HTMLDivElement>(null)
  const gridScrolledRef = useRef(false)

  useEffect(() => {
    let active = true
    // One read on open; the search itself is local so typing costs no reads.
    getDocs(query(collection(db, 'students'), where('status', '==', 'active')))
      .then((snapshot) => {
        if (!active) return
        setStudents(snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() } as Student))
          .filter(isHuntableStudent))
      })
      .catch((error) => {
        console.error('Load class hunt students failed:', error)
        if (active) toast.error('Chưa tải được danh sách học viên. Vui lòng tải lại trang.')
      })
      .finally(() => { if (active) setStudentsLoading(false) })
    return () => { active = false }
  }, [])

  // Keep "slot đã qua hôm nay" accurate while the page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (gridScrolledRef.current || !gridRef.current) return
    const row = gridRef.current.querySelector<HTMLElement>('[data-slot-time="15:00"]')
    if (row) {
      gridRef.current.scrollTop = row.offsetTop - 40
      gridScrolledRef.current = true
    }
  })

  const loadHunts = useCallback(async () => {
    setHuntsError('')
    setHuntsLoading(true)
    try {
      setHunts(await listAdminClassHunts())
    } catch (error) {
      console.error('Load class hunts failed:', error)
      setHuntsError('Chưa tải được danh sách CLASS HUNTING. Vui lòng thử lại.')
    } finally {
      setHuntsLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadHunts() }, 0)
    return () => window.clearTimeout(initialLoad)
  }, [loadHunts])

  const searchMatches = useMemo(() => {
    const keyword = normalizeSearch(studentSearch)
    const digits = studentSearch.replace(/\D/g, '')
    if (!keyword) return []
    return students
      .filter((student) => normalizeSearch(`${student.name} ${student.code}`).includes(keyword)
        || (digits.length >= 3 && (student.parentPhone || '').replace(/\D/g, '').includes(digits)))
      .slice(0, SEARCH_RESULT_LIMIT)
  }, [studentSearch, students])

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null
  const selectableStudents = selectedStudent && !searchMatches.some((student) => student.id === selectedStudent.id)
    ? [selectedStudent, ...searchMatches]
    : searchMatches
  const lookupStudent = lookup?.student
  const subjects = lookup?.subjects || []
  const selectedSubject = subjects.find((subject) => subject.id === subjectId)
  const availablePoints = selectedSubject?.availablePoints
  const affordableSessions = availablePoints !== undefined ? classHuntAffordableSessions(availablePoints, CLASS_HUNT_SLOT_MINUTES) : null
  const requestedSessions = sessionMode === 'all_remaining'
    ? Math.min(affordableSessions ?? 0, CLASS_HUNT_MAX_SESSIONS)
    : Math.max(1, Math.min(CLASS_HUNT_MAX_SESSIONS, Math.floor(sessionCount) || 1))

  const sortedSlots = useMemo(() => sortClassHuntWeeklySlots(weeklySlots), [weeklySlots])
  const selectedSlotKeys = useMemo(() => new Set(weeklySlots.map(classHuntSlotKey)), [weeklySlots])
  const plan = useMemo(() => planClassHuntSlotSessions({
    startDate,
    weeklySlots: sortedSlots,
    limit: requestedSessions,
    nowMs,
  }), [nowMs, requestedSessions, sortedSlots, startDate])
  const plannedDiamonds = plan.length * CLASS_HUNT_SLOT_MINUTES
  const remainingAfter = availablePoints !== undefined ? availablePoints - plannedDiamonds : null

  const issues = useMemo(() => {
    const list: string[] = []
    if (!selectedStudent) list.push('Chọn học viên cần xếp lớp.')
    else if (lookupStudent && lookupStudent.eligibleForHunt === false) list.push('Học viên này không đủ điều kiện mở CLASS HUNTING (cần học viên 1 kèm 1 online đang học và còn gói).')
    if (selectedStudent && !lookingUp && lookupStudent && !selectedSubject) list.push('Chọn gói học cần xếp.')
    if (weeklySlots.length === 0) list.push('Chọn ít nhất một slot học trong bảng.')
    if (!startDate || startDate < todayInVietnam()) list.push('Ngày bắt đầu phải từ hôm nay trở đi.')
    if (selectedSubject && affordableSessions !== null) {
      if (affordableSessions < 1) {
        list.push(`Gói chỉ còn ${number(availablePoints || 0)} kim cương khả dụng, chưa đủ 1 buổi ${CLASS_HUNT_SLOT_MINUTES} phút.`)
      } else if (sessionMode === 'all_remaining' && affordableSessions > CLASS_HUNT_MAX_SESSIONS) {
        list.push(`Kim cương đủ cho ${affordableSessions} buổi, vượt giới hạn ${CLASS_HUNT_MAX_SESSIONS} buổi/lần đăng. Hãy chọn "Xếp số buổi nhất định".`)
      } else if (sessionMode === 'specific' && requestedSessions > affordableSessions) {
        list.push(`Kim cương khả dụng chỉ đủ ${affordableSessions} buổi. Hãy giảm số buổi.`)
      }
    }
    if (weeklySlots.length > 0 && requestedSessions > 0 && plan.length < requestedSessions && startDate >= todayInVietnam()) {
      list.push(`Trong 1 năm tới các slot đã chọn chỉ tạo được ${plan.length} buổi. Hãy chọn thêm slot hoặc giảm số buổi.`)
    }
    if (teacherTypes.length === 0) list.push('Chọn ít nhất một loại giáo viên.')
    return list
  }, [affordableSessions, availablePoints, lookingUp, lookupStudent, plan.length, requestedSessions, selectedStudent, selectedSubject, sessionMode, startDate, teacherTypes.length, weeklySlots.length])

  const selectStudent = async (student: Student | null) => {
    const requestId = lookupRequestRef.current + 1
    lookupRequestRef.current = requestId
    setSelectedStudentId(student?.id || '')
    setLookup(null)
    setSubjectId('')
    if (!student) {
      setLookingUp(false)
      return
    }
    setLookingUp(true)
    try {
      const result = await previewClassHunt({ studentCode: student.code })
      if (requestId !== lookupRequestRef.current) return
      setLookup(result)
      const eligible = result.subjects.filter((subject) => subject.eligibleForHunt !== false)
      if (eligible.length === 1) setSubjectId(eligible[0].id)
      if (result.student?.eligibleForHunt === false) {
        toast.warning(result.warnings?.[0] || 'Học viên này chưa đủ điều kiện mở CLASS HUNTING.')
      }
    } catch (error) {
      if (requestId !== lookupRequestRef.current) return
      console.error('Class hunt lookup failed:', error)
      const reason = classHuntErrorReason(error)
      toast.error(reason === 'CLASS_HUNT_STUDENT_CODE_AMBIGUOUS'
        ? 'Mã học viên đang bị trùng dữ liệu. Hãy xử lý hồ sơ trước khi đăng lớp.'
        : 'Chưa kiểm tra được gói học của học viên. Vui lòng thử lại.')
    } finally {
      if (requestId === lookupRequestRef.current) setLookingUp(false)
    }
  }

  const toggleSlot = (day: ClassHuntSlotDay, start: string) => {
    const key = `${day}|${start}`
    setWeeklySlots((current) => current.some((slot) => classHuntSlotKey(slot) === key)
      ? current.filter((slot) => classHuntSlotKey(slot) !== key)
      : [...current, { day, start }])
  }

  const toggleTeacherType = (type: ClassHuntTeacherType) => {
    setTeacherTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])
  }

  const buildDraft = (): ClassHuntDraftInput | null => {
    if (!selectedStudent || !lookupStudent?.id || !selectedSubject) return null
    return {
      studentCode: selectedStudent.code.trim().toUpperCase(),
      studentId: lookupStudent.id,
      subjectId: selectedSubject.id,
      startDate,
      weeklySlots: sortedSlots,
      sessionCount: Math.max(1, requestedSessions),
      sessionSelectionMode: sessionMode,
      teacherRequirements: {
        teacherTypes: CLASS_HUNT_TEACHER_TYPES.filter((type) => teacherTypes.includes(type)),
        gender,
      },
    }
  }

  const serverMessage = (error: unknown, fallback: string) => {
    const reason = classHuntErrorReason(error)
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : ''
    return reason.startsWith('CLASS_HUNT_') && message ? message : fallback
  }

  const handleCheck = async () => {
    const draft = buildDraft()
    if (issues.length > 0 || !draft) {
      toast.error(issues[0] || 'Hãy hoàn tất thông tin trước khi đăng.')
      return
    }
    setChecking(true)
    try {
      // The server rebuilds the plan and re-checks funds and the student's calendar.
      const preview = await previewClassHunt(draft)
      if ((preview.matchingTeacherCount ?? 0) <= 0) {
        toast.error(preview.warnings?.[0] || 'Không có gia sư nào phù hợp yêu cầu đã chọn.')
        return
      }
      setConfirm({ draft, preview })
    } catch (error) {
      console.error('Class hunt preview failed:', error)
      toast.error(serverMessage(error, 'Chưa kiểm tra được lịch lớp. Dữ liệu chưa được tạo.'))
    } finally {
      setChecking(false)
    }
  }

  const handlePublish = async () => {
    if (!confirm) return
    const key = JSON.stringify(confirm.draft)
    const clientRequestId = publishRequestIdsRef.current[key] || createPublishRequestId()
    publishRequestIdsRef.current[key] = clientRequestId
    setPublishing(true)
    try {
      await publishClassHunt(confirm.draft, clientRequestId)
      delete publishRequestIdsRef.current[key]
      setConfirm(null)
      setWeeklySlots([])
      toast.success(`Đã đăng CLASS HUNTING. Toàn bộ ${confirm.preview.activeTeacherCount ?? ''} gia sư đang hoạt động đều thấy lớp.`)
      await Promise.all([loadHunts(), selectedStudent ? selectStudent(selectedStudent) : Promise.resolve()])
    } catch (error) {
      console.error('Publish class hunt failed:', error)
      toast.error(serverMessage(error, 'Chưa đăng được CLASS HUNTING. Dữ liệu chưa bị trừ.'))
    } finally {
      setPublishing(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelClassHunt(cancelTarget.id)
      toast.success('Đã hủy CLASS HUNTING đang mở.')
      setCancelTarget(null)
      await loadHunts()
    } catch (error) {
      console.error('Cancel class hunt failed:', error)
      toast.error('Không thể hủy yêu cầu này vì trạng thái vừa thay đổi. Danh sách đã được giữ nguyên.')
      await loadHunts()
    } finally {
      setCancelling(false)
    }
  }

  const filteredHunts = useMemo(
    () => statusFilter === 'all' ? hunts : hunts.filter((hunt) => hunt.status === statusFilter),
    [hunts, statusFilter],
  )
  const counts = useMemo(() => ({
    all: hunts.length,
    open: hunts.filter((hunt) => hunt.status === 'open').length,
    claimed: hunts.filter((hunt) => hunt.status === 'claimed').length,
    cancelled: hunts.filter((hunt) => hunt.status === 'cancelled').length,
    expired: hunts.filter((hunt) => hunt.status === 'expired').length,
  }), [hunts])

  const confirmSlots = confirm?.preview.slots || []
  const requirementsText = describeClassHuntTeacherRequirements({ teacherTypes, gender })

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            <Target className="h-7 w-7 text-blue-700" />CLASS HUNTING
          </h1>
          <p className="mt-1 text-sm text-slate-600">Lớp đăng lên hiển thị cho mọi gia sư đang hoạt động, không lọc môn hay lịch rảnh. Gia sư tự nhận; trùng giờ thì hệ thống báo không thành công.</p>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Card className="space-y-4">
            <StepTitle step={1} title="Chọn học viên và gói học" />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Tìm học viên</span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    className={`${FIELD} pl-9`}
                    placeholder={studentsLoading ? 'Đang tải học viên...' : 'Nhập tên, số điện thoại hoặc mã học viên'}
                    autoComplete="off"
                    disabled={studentsLoading}
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Học viên đã chọn</span>
                <select
                  value={selectedStudentId}
                  onChange={(event) => void selectStudent(students.find((student) => student.id === event.target.value) || null)}
                  className={FIELD}
                  disabled={selectableStudents.length === 0}
                >
                  <option value="">{studentSearch.trim() ? (searchMatches.length ? `Chọn trong ${searchMatches.length} kết quả` : 'Không tìm thấy học viên') : 'Gõ ô tìm kiếm để chọn'}</option>
                  {selectableStudents.map((student) => (
                    <option key={student.id} value={student.id}>{student.name} - {student.code}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Gói học cần xếp</span>
                <select
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  className={FIELD}
                  disabled={!lookup || lookingUp || subjects.length === 0}
                >
                  <option value="">{lookingUp ? 'Đang kiểm tra gói học...' : subjects.length ? 'Chọn gói học' : selectedStudent ? 'Không có gói còn hiệu lực' : 'Chọn học viên trước'}</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id} disabled={subject.eligibleForHunt === false}>
                      {subject.name}{subject.availablePoints !== undefined ? ` – Khả dụng ${number(subject.availablePoints)} kim cương` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedSubject && (selectedSubject.heldBookingCount || 0) > 0 && (
              <p className="text-xs leading-5 text-slate-500">
                Gói còn {number(selectedSubject.remainingPoints || 0)} kim cương, đang giữ {selectedSubject.heldBookingCount} ca / {number(selectedSubject.heldPoints || 0)} kim cương nên khả dụng {number(selectedSubject.availablePoints || 0)} kim cương.
              </p>
            )}
          </Card>

          <Card className="space-y-4">
            <StepTitle step={2} title="Thiết lập lịch học" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="block sm:w-56">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Ngày bắt đầu</span>
                <input type="date" min={todayInVietnam()} value={startDate} onChange={(event) => setStartDate(event.target.value)} className={FIELD} />
              </label>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>Đã chọn <strong className="text-slate-900">{weeklySlots.length}</strong> slot/tuần</span>
                {weeklySlots.length > 0 && (
                  <button type="button" onClick={() => setWeeklySlots([])} className="min-h-9 rounded-lg px-2 font-bold text-rose-600 hover:bg-rose-50">Bỏ chọn tất cả</button>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Chọn slot học</p>
              <p className="text-xs text-slate-500">Mỗi slot tương ứng 1 buổi học {CLASS_HUNT_SLOT_MINUTES} phút.</p>
            </div>
            <div ref={gridRef} className="max-h-[26rem] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="sticky left-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-bold text-slate-600">Giờ bắt đầu</th>
                    {CLASS_HUNT_DAY_ORDER.map((day) => (
                      <th key={day} className="border-b border-slate-200 px-1 py-2 text-center font-bold text-slate-600">{CLASS_HUNT_DAY_LABELS[day]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOT_TIMES.map((time) => (
                    <tr key={time} data-slot-time={time}>
                      <th scope="row" className="sticky left-0 z-[5] border-b border-slate-100 bg-white px-3 py-1 text-left font-semibold tabular-nums text-slate-700">{time}</th>
                      {CLASS_HUNT_DAY_ORDER.map((day) => {
                        const selected = selectedSlotKeys.has(`${day}|${time}`)
                        return (
                          <td key={day} className="border-b border-slate-100 px-1 py-1">
                            <button
                              type="button"
                              onClick={() => toggleSlot(day, time)}
                              aria-pressed={selected}
                              aria-label={`${CLASS_HUNT_DAY_LABELS[day]} ${time}`}
                              className={`flex h-8 w-full items-center justify-center rounded-md transition active:scale-[0.97] ${selected ? 'bg-blue-700 text-white shadow-sm hover:bg-blue-800' : 'bg-slate-100 text-transparent hover:bg-blue-100'}`}
                            >
                              <Check className="h-4 w-4" strokeWidth={3} />
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="space-y-4">
              <StepTitle step={3} title="Chọn số buổi cần xếp" />
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${sessionMode === 'all_remaining' ? 'border-blue-500 bg-blue-50/70' : 'border-slate-200 hover:border-blue-200'}`}>
                <input type="radio" name="class-hunt-session-mode" checked={sessionMode === 'all_remaining'} onChange={() => setSessionMode('all_remaining')} className="mt-1 h-4 w-4 accent-blue-700" />
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-slate-900">Xếp toàn bộ số buổi có thể học</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    {affordableSessions !== null && availablePoints !== undefined
                      ? `${affordableSessions} buổi · ${number(affordableSessions * CLASS_HUNT_SLOT_MINUTES)} phút · Sử dụng ${number(affordableSessions * CLASS_HUNT_SLOT_MINUTES)} kim cương · Còn lại ${number(availablePoints - affordableSessions * CLASS_HUNT_SLOT_MINUTES)} kim cương`
                      : 'Chọn học viên và gói học để tính số buổi.'}
                  </span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${sessionMode === 'specific' ? 'border-blue-500 bg-blue-50/70' : 'border-slate-200 hover:border-blue-200'}`}>
                <input type="radio" name="class-hunt-session-mode" checked={sessionMode === 'specific'} onChange={() => setSessionMode('specific')} className="mt-1 h-4 w-4 accent-blue-700" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-900">Xếp số buổi nhất định</span>
                  <input
                    type="number"
                    min={1}
                    max={CLASS_HUNT_MAX_SESSIONS}
                    value={sessionCount}
                    onFocus={() => setSessionMode('specific')}
                    onChange={(event) => setSessionCount(Math.max(1, Math.min(CLASS_HUNT_MAX_SESSIONS, Number(event.target.value) || 1)))}
                    className={`${FIELD} mt-2 max-w-[10rem]`}
                    placeholder="Nhập số buổi"
                  />
                </span>
              </label>
            </Card>

            <Card className="space-y-4">
              <StepTitle step={4} title="Yêu cầu giáo viên" hint="Lớp vẫn hiển thị cho mọi gia sư; chỉ người phù hợp mới nhận được." />
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset>
                  <legend className="mb-2 text-xs font-bold text-slate-700">Loại giáo viên</legend>
                  <div className="space-y-2">
                    {CLASS_HUNT_TEACHER_TYPES.map((type) => (
                      <label key={type} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-800">
                        <input type="checkbox" checked={teacherTypes.includes(type)} onChange={() => toggleTeacherType(type)} className="h-4 w-4 accent-blue-700" />
                        {CLASS_HUNT_TEACHER_TYPE_LABELS[type]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-xs font-bold text-slate-700">Giới tính</legend>
                  <div className="space-y-2">
                    {(['any', 'female', 'male'] as ClassHuntTeacherGender[]).map((value) => (
                      <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-800">
                        <input type="radio" name="class-hunt-gender" checked={gender === value} onChange={() => setGender(value)} className="h-4 w-4 accent-blue-700" />
                        {CLASS_HUNT_GENDER_LABELS[value]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </Card>
          </div>
        </div>

        <aside className="xl:sticky xl:top-20">
          <Card className="space-y-4">
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-950">Kết quả kiểm tra</h2>
              <p className="mt-0.5 text-xs text-slate-500">Xác nhận học viên, gói học và toàn bộ lịch học trước khi đăng.</p>
            </div>
            <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {([
                ['Học viên', selectedStudent ? selectedStudent.name : '—'],
                ['Gói', selectedSubject?.name || '—'],
                ['Khả dụng', availablePoints !== undefined ? `${number(availablePoints)} kim cương` : '—'],
                ['Dự kiến sử dụng', `${number(plannedDiamonds)} kim cương`],
                ['Còn lại', remainingAfter !== null ? `${number(remainingAfter)} kim cương` : '—'],
              ] as Array<[string, string]>).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className={`text-right font-bold ${label === 'Còn lại' && remainingAfter !== null && remainingAfter < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="rounded-xl border border-slate-200">
              <p className="border-b border-slate-100 px-3 py-2 text-sm font-bold text-blue-800">Lịch dự kiến</p>
              {plan.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-500">Chọn slot học để xem lịch dự kiến.</p>
              ) : (
                <ol className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-xs">
                  {plan.map((session) => (
                    <li key={`${session.date}-${session.start}`} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 px-3 py-2">
                      <span className="font-semibold text-slate-700">{CLASS_HUNT_DAY_LABELS[session.weekday]}</span>
                      <span className="tabular-nums text-slate-600">{formatDate(session.date)} · {session.start}</span>
                      <span className="text-slate-500">{session.minutes} phút</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-900">
              Tổng cộng: {plan.length} buổi · {number(plan.length * CLASS_HUNT_SLOT_MINUTES)} phút · {number(plannedDiamonds)} kim cương
            </p>
            {requirementsText && (
              <p className="flex items-start gap-2 text-xs text-slate-600"><UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />Yêu cầu: {requirementsText}</p>
            )}
            {issues.length > 0 && (
              <ul className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                {issues.map((issue) => (
                  <li key={issue} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{issue}</li>
                ))}
              </ul>
            )}
            <Button fullWidth size="lg" type="button" onClick={() => void handleCheck()} loading={checking} disabled={issues.length > 0 || plan.length === 0} className="uppercase tracking-wide">
              <Send className="h-4 w-4" />
              Đăng CLASS HUNTING
            </Button>
          </Card>
        </aside>
      </div>

      <Card padding="none">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-950">Danh sách yêu cầu</h2>
            <p className="mt-1 text-sm text-slate-500">Theo dõi yêu cầu đang mở, đã có gia sư nhận, đã hết hạn hoặc đã hủy.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadHunts()} loading={huntsLoading} className="self-start whitespace-nowrap lg:self-auto">
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-5 py-3 sm:px-6">
          {([
            ['all', 'Tất cả', counts.all],
            ['open', 'Đang mở', counts.open],
            ['claimed', 'Đã nhận', counts.claimed],
            ['expired', 'Hết hạn', counts.expired],
            ['cancelled', 'Đã hủy', counts.cancelled],
          ] as Array<[StatusFilter, string, number]>).map(([status, label, count]) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition active:scale-[0.98] ${statusFilter === status ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        {huntsError && (
          <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:mx-6" role="alert">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>{huntsError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3 border-rose-200 bg-white text-rose-700 hover:bg-rose-100" onClick={() => void loadHunts()}>
                Thử lại
              </Button>
            </div>
          </div>
        )}
        {huntsLoading ? (
          <div className="space-y-3 p-5 sm:p-6" role="status" aria-live="polite" aria-busy="true" aria-label="Đang tải danh sách CLASS HUNTING">
            {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filteredHunts.length === 0 ? (
          <EmptyState icon={<Target className="h-8 w-8" />} title="Chưa có yêu cầu phù hợp" description="Khi giáo vụ đăng một lịch mới, yêu cầu sẽ xuất hiện tại đây." />
        ) : (
          <div className="grid gap-3 p-5 sm:p-6">
            {filteredHunts.map((hunt) => {
              const status = huntStatusMeta(hunt.status)
              const requirement = describeClassHuntTeacherRequirements(hunt.teacherRequirements)
              return (
                <article key={hunt.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
                        <span className="text-xs font-semibold text-slate-500">{hunt.sessionCount} buổi, {hunt.minutes} phút/buổi</span>
                        {hunt.status === 'open' && hunt.activeTeacherCount !== undefined && (
                          <span className="text-xs text-slate-500">· Hiển thị cho {hunt.activeTeacherCount} gia sư</span>
                        )}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Học viên</p>
                          <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{hunt.student?.name || 'Học viên đã ẩn'}</p>
                          <p className="mt-0.5 break-all font-mono text-xs font-semibold text-slate-500">{hunt.student?.code || ''}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Gói học</p>
                          <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{hunt.subject.name}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Gia sư</p>
                          <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{hunt.claimedTeacher?.name || 'Đang chờ nhận'}</p>
                          {requirement && <p className="mt-0.5 text-xs text-slate-500">Yêu cầu: {requirement}</p>}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Đơn giá lớp</p>
                          {!isAdmin ? (
                            <p className="mt-1 text-sm font-semibold text-slate-500">Chỉ Admin xem đơn giá</p>
                          ) : hunt.classHuntCompensation ? (
                            <>
                              <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{formatVND(hunt.classHuntCompensation.ratePerMinute)}/phút</p>
                              <p className="mt-0.5 text-xs text-slate-500">Đơn giá riêng đã chốt, không nhân level</p>
                            </>
                          ) : (
                            <p className="mt-1 text-sm font-semibold text-slate-500">Theo đơn giá môn x level</p>
                          )}
                        </div>
                      </div>
                      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-600"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />{formatSlots(hunt, true)}</p>
                    </div>
                    {hunt.status === 'open' && (
                      <Button type="button" variant="danger" size="sm" onClick={() => setCancelTarget(hunt)} className="self-start whitespace-nowrap">
                        <XCircle className="h-4 w-4" />
                        Hủy yêu cầu
                      </Button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => { if (!publishing) setConfirm(null) }}
        onConfirm={() => void handlePublish()}
        title="Đăng CLASS HUNTING?"
        confirmLabel="Đăng lớp"
        loading={publishing}
        consequence="Lịch và kim cương chỉ được giữ khi một gia sư nhận lớp thành công và không trùng ca. Lương theo đơn giá môn x level gia sư, giống lớp thường."
      >
        {confirm && (
          <div className="space-y-3 rounded-xl bg-white p-3 text-sm">
            <p className="text-slate-700">
              <strong className="text-slate-950">{selectedStudent?.name}</strong> · {confirm.preview.subject?.name || selectedSubject?.name}
            </p>
            <p className="font-bold text-slate-900">
              {confirmSlots.length} buổi · {number(confirmSlots.length * CLASS_HUNT_SLOT_MINUTES)} phút · {number(confirmSlots.length * CLASS_HUNT_SLOT_MINUTES)} kim cương
            </p>
            {confirmSlots.length > 0 && (
              <p className="text-xs text-slate-500">Từ {formatDate(confirmSlots[0].date)} đến {formatDate(confirmSlots[confirmSlots.length - 1].date)}</p>
            )}
            <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Hiển thị cho toàn bộ {confirm.preview.activeTeacherCount ?? '—'} gia sư đang hoạt động
                {describeClassHuntTeacherRequirements(confirm.draft.teacherRequirements)
                  ? `; ${confirm.preview.matchingTeacherCount ?? 0} gia sư phù hợp yêu cầu ${describeClassHuntTeacherRequirements(confirm.draft.teacherRequirements)}.`
                  : '.'}
              </span>
            </p>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => void handleCancel()}
        title="Hủy CLASS HUNTING đang mở?"
        description="Gia sư sẽ không còn thấy yêu cầu này để nhận lớp."
        consequence="Yêu cầu đã có gia sư nhận không thể hủy từ màn hình này."
        confirmLabel="Hủy yêu cầu"
        confirmVariant="danger"
        loading={cancelling}
      />
    </div>
  )
}
