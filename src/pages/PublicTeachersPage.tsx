import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  DocumentData,
  getDoc,
  getCountFromServer,
  getDocs,
  limit as firestoreLimit,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  startAfter,
  where,
} from 'firebase/firestore'
import {
  AlertCircle,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Filter,
  GraduationCap,
  Search,
  Send,
  ShieldCheck,
  Star,
  TrendingUp,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { PublicNav } from '@/components/layout/PublicNav'
import { db } from '@/lib/firebase'
import { MINUTE_PRESETS } from '@/lib/constants'
import { toast } from '@/stores/toastStore'
import { DayOfWeek, Student, Teacher, TeacherAvailability } from '@/types'

type TeacherView = Teacher & {
  availability?: TeacherAvailability
  priorityScore: number
  priorityReasons: string[]
  isForeignTeacher: boolean
  hasAvailableSchedule: boolean
}

type FilterKey = 'recommended' | 'all' | 'available' | 'featured' | 'experienced' | 'foreign'

type ScheduleOption = {
  day: DayOfWeek
  start: string
  end: string
  label: string
}

const PAGE_SIZE = 24

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
}

const DAY_ORDER = Object.keys(DAY_LABELS) as DayOfWeek[]

const GRADE_WEIGHT: Record<string, number> = {
  A: 30,
  B: 22,
  PH: 22,
  SA: 22,
  C: 12,
}

const STRENGTH_LABELS: Record<string, string> = {
  pronunciation: 'Phát âm chuẩn',
  patience: 'Kiên nhẫn',
  lesson_plans: 'Có giáo án riêng',
  close_followup: 'Theo sát học viên',
  progress_reports: 'Báo cáo tiến độ',
  tools_proficiency: 'Dạy online tốt',
}

const FILTERS: Array<{ key: FilterKey; label: string; helper: string }> = [
  { key: 'recommended', label: 'Đề xuất phù hợp', helper: 'Có lịch, hồ sơ tốt, ưu tiên cao' },
  { key: 'available', label: 'Có lịch gần', helper: 'Dễ xếp buổi học tiếp theo' },
  { key: 'featured', label: 'Học vụ đề xuất', helper: 'Được học vụ đưa lên trước' },
  { key: 'experienced', label: 'Dạy nhiều', helper: 'Kinh nghiệm và số học viên cao' },
  { key: 'foreign', label: 'Nước ngoài', helper: 'PH, SA hoặc hồ sơ quốc tế' },
  { key: 'all', label: 'Tất cả', helper: 'Danh sách đang tải' },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function hasSchedule(availability?: TeacherAvailability) {
  if (!availability?.slots) return false
  return Object.values(availability.slots).some((slot) => slot?.available && slot.timeRanges?.length > 0)
}

function timeToMinutes(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function minutesToTime(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function buildScheduleOptions(availability: TeacherAvailability | undefined, duration: number): ScheduleOption[] {
  if (!availability?.slots) return []

  return DAY_ORDER.flatMap((day) => {
    const slot = availability.slots[day]
    if (!slot?.available || !slot.timeRanges?.length) return []

    return slot.timeRanges.flatMap((range) => {
      const start = timeToMinutes(range.start)
      const end = timeToMinutes(range.end)
      const options: ScheduleOption[] = []

      for (let cursor = start; cursor + duration <= end; cursor += 30) {
        const optionStart = minutesToTime(cursor)
        const optionEnd = minutesToTime(cursor + duration)
        options.push({
          day,
          start: optionStart,
          end: optionEnd,
          label: `${DAY_LABELS[day]}, ${optionStart}-${optionEnd}`,
        })
      }

      return options
    })
  })
}

function getStudentMinuteFund(student: Student) {
  const minutesPerSession = student.minutesPerSession || 50
  const total = student.totalMinutes ?? student.totalSessions * minutesPerSession
  const used = student.usedMinutes ?? student.usedSessions * minutesPerSession
  const remaining = student.remainingMinutes ?? Math.max(0, total - used)
  const held = student.reservedMinutes ?? student.heldMinutes ?? 0
  const available = Math.max(0, remaining - held)

  return { total, used, held, available }
}

function isForeignTeacher(teacher: Teacher) {
  const grade = teacher.teacherGrade
  const haystack = [
    teacher.livingArea,
    teacher.university,
    teacher.degreeType,
    teacher.otherCerts,
    ...(teacher.languagesTaught || []),
    ...(teacher.subjectNames || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    grade === 'PH' ||
    grade === 'SA' ||
    haystack.includes('philippines') ||
    haystack.includes('filipino') ||
    haystack.includes('native') ||
    haystack.includes('foreign') ||
    haystack.includes('canada') ||
    haystack.includes('usa') ||
    haystack.includes('uk') ||
    haystack.includes('australia')
  )
}

function buildHighlights(teacher: Teacher) {
  const highlights: string[] = []

  if (teacher.ielts) highlights.push(`IELTS ${teacher.ielts}`)
  if (teacher.toeic) highlights.push(`TOEIC ${teacher.toeic}`)
  if (teacher.tesolTefl) highlights.push('TESOL/TEFL')
  if (teacher.pedagogicalCert) highlights.push('Sư phạm')
  if (teacher.teachingYears) highlights.push(`${teacher.teachingYears} năm kinh nghiệm`)
  if (teacher.studentsTaughtCount) highlights.push(`${teacher.studentsTaughtCount}+ học viên`)

  return highlights.slice(0, 4)
}

function getNextSchedule(availability?: TeacherAvailability) {
  if (!availability?.slots) return 'Chưa cập nhật lịch rảnh'

  for (const day of Object.keys(DAY_LABELS) as DayOfWeek[]) {
    const slot = availability.slots[day]
    if (slot?.available && slot.timeRanges?.length) {
      const first = slot.timeRanges[0]
      return `${DAY_LABELS[day]}, ${first.start}-${first.end}`
    }
  }

  return 'Chưa cập nhật lịch rảnh'
}

function summarizeBio(teacher: Teacher) {
  const source = teacher.bio || teacher.studentResults || teacher.otherStrengths || ''
  if (!source) return 'Hồ sơ đang được cập nhật. Học vụ sẽ tư vấn giáo viên phù hợp theo mục tiêu học của học viên.'
  return source.length > 145 ? `${source.slice(0, 145).trim()}...` : source
}

function formatRoundedHundredPlus(count: number) {
  if (count <= 0) return '0'
  return `${Math.max(100, Math.ceil(count / 100) * 100)}+`
}

function getPriorityReasons(teacher: Teacher, availability?: TeacherAvailability) {
  const reasons: string[] = []

  if (hasSchedule(availability)) reasons.push('Có lịch rảnh')
  if (teacher.teacherGrade) reasons.push(`Học vụ đề xuất ${teacher.teacherGrade}`)
  if (teacher.photoURL) reasons.push('Có ảnh hồ sơ')
  if ((teacher.teachingYears || 0) >= 2) reasons.push('Kinh nghiệm tốt')
  if ((teacher.studentsTaughtCount || 0) >= 20) reasons.push('Đã dạy nhiều học viên')
  if (buildHighlights(teacher).length >= 2) reasons.push('Hồ sơ đầy đủ')

  return reasons.slice(0, 4)
}

function calculatePriority(teacher: Teacher, availability?: TeacherAvailability) {
  const scheduleScore = hasSchedule(availability) ? 34 : 0
  const adminScore = teacher.teacherGrade ? GRADE_WEIGHT[teacher.teacherGrade] || 0 : 0
  const photoScore = teacher.photoURL ? 18 : 0
  const experienceScore = Math.min(18, (teacher.teachingYears || 0) * 3)
  const taughtScore = Math.min(18, Math.floor((teacher.studentsTaughtCount || 0) / 5))
  const profileScore = Math.min(14, buildHighlights(teacher).length * 4 + (teacher.bio ? 2 : 0))
  const foreignScore = isForeignTeacher(teacher) ? 6 : 0

  return scheduleScore + adminScore + photoScore + experienceScore + taughtScore + profileScore + foreignScore
}

function TeacherPhoto({ teacher }: { teacher: Teacher }) {
  if (teacher.photoURL) {
    return (
      <img
        src={teacher.photoURL}
        alt={`Ảnh giáo viên ${teacher.name}`}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#fff8df] text-2xl font-black text-[#d69a00]">
      {getInitials(teacher.name)}
    </div>
  )
}

function TeacherCard({
  teacher,
  compact = false,
  onSelect,
}: {
  teacher: TeacherView
  compact?: boolean
  onSelect?: (teacher: TeacherView) => void
}) {
  const highlights = buildHighlights(teacher)
  const strengths = (teacher.strengths || []).map((key) => STRENGTH_LABELS[key] || key).slice(0, 3)
  const chips = [...teacher.priorityReasons, ...highlights, ...strengths].slice(0, compact ? 3 : 6)

  return (
    <article className="group overflow-hidden rounded-2xl border border-[#eadfbd] bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#e3c55d] hover:shadow-xl hover:shadow-amber-100/70">
      <div className={compact ? 'flex gap-4 p-4' : 'grid gap-0 md:grid-cols-[210px_1fr]'}>
        <div className={compact ? 'h-24 w-24 shrink-0 overflow-hidden rounded-xl' : 'relative h-64 overflow-hidden bg-[#fff8df] md:h-full'}>
          <TeacherPhoto teacher={teacher} />
          {!compact && teacher.priorityReasons[0] && (
            <div className="absolute left-3 top-3 rounded-full bg-[#020617]/90 px-3 py-1 text-xs font-bold text-white shadow-sm">
              {teacher.priorityReasons[0]}
            </div>
          )}
        </div>

        <div className={compact ? 'min-w-0 flex-1' : 'flex min-w-0 flex-col p-5'}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#98720a]">
                {teacher.subjectNames?.slice(0, 2).join(', ') || 'Giáo viên 1 kèm 1'}
              </p>
              <h3 className="mt-1 truncate text-xl font-black tracking-tight text-slate-950">{teacher.name}</h3>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#fff3c4] px-2.5 py-1 text-xs font-black text-[#9a5d00]">
              <Star className="h-3.5 w-3.5 fill-current" />
              {teacher.priorityScore}
            </div>
          </div>

          {!compact && <p className="mt-3 text-sm leading-6 text-slate-600">{summarizeBio(teacher)}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {teacher.hasAvailableSchedule && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <Clock3 className="h-3.5 w-3.5" />
                Có lịch rảnh
              </span>
            )}
            {teacher.isForeignTeacher && (
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                Giáo viên nước ngoài
              </span>
            )}
            {chips.map((chip) => (
              <span key={chip} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {chip}
              </span>
            ))}
          </div>

          <div className={compact ? 'mt-3 text-xs text-slate-500' : 'mt-auto grid gap-3 pt-5 sm:grid-cols-3'}>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CalendarDays className="h-4 w-4 text-[#c89000]" />
              <span>{getNextSchedule(teacher.availability)}</span>
            </div>
            {!compact && (
              <>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users className="h-4 w-4 text-[#c89000]" />
                  <span>{teacher.studentsTaughtCount || 0}+ học viên</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <GraduationCap className="h-4 w-4 text-[#c89000]" />
                  <span>{teacher.teachingYears || 0} năm kinh nghiệm</span>
                </div>
              </>
            )}
          </div>

          {!compact && onSelect && (
            <button
              type="button"
              onClick={() => onSelect(teacher)}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98] sm:w-auto"
            >
              <CalendarDays className="h-4 w-4" />
              Xem lịch và yêu cầu
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function TeacherBookingModal({
  teacher,
  onClose,
}: {
  teacher: TeacherView | null
  onClose: () => void
}) {
  const [studentCode, setStudentCode] = useState('')
  const [student, setStudent] = useState<Student | null>(null)
  const [studentError, setStudentError] = useState('')
  const [studentLoading, setStudentLoading] = useState(false)
  const [duration, setDuration] = useState<number>(50)
  const [selectedSlot, setSelectedSlot] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const scheduleOptions = useMemo(
    () => buildScheduleOptions(teacher?.availability, duration).slice(0, 48),
    [duration, teacher?.availability]
  )
  const selectedSchedule = scheduleOptions.find((option) => `${option.day}|${option.start}|${option.end}` === selectedSlot)
  const fund = student ? getStudentMinuteFund(student) : null
  const canAfford = !fund || fund.available >= duration
  const highlights = teacher ? buildHighlights(teacher) : []
  const strengths = teacher ? (teacher.strengths || []).map((key) => STRENGTH_LABELS[key] || key).slice(0, 4) : []

  useEffect(() => {
    setStudentCode('')
    setStudent(null)
    setStudentError('')
    setDuration(50)
    setSelectedSlot('')
    setNote('')
  }, [teacher?.id])

  useEffect(() => {
    setSelectedSlot('')
  }, [duration, teacher?.id])

  if (!teacher) return null

  const lookupStudent = async () => {
    const code = studentCode.trim().toUpperCase()
    setStudentError('')
    setStudent(null)

    if (!code) {
      setStudentError('Vui lòng nhập mã học viên.')
      return
    }

    setStudentLoading(true)
    try {
      const studentQuery = query(collection(db, 'students'), where('code', '==', code))
      const studentSnap = await getDocs(studentQuery)
      if (studentSnap.empty) {
        setStudentError('Không tìm thấy mã học viên này.')
        return
      }

      const foundStudent = { id: studentSnap.docs[0].id, ...studentSnap.docs[0].data() } as Student
      setStudent(foundStudent)
    } catch (error) {
      console.error('Error looking up student for booking:', error)
      setStudentError('Chưa thể kiểm tra mã học viên, vui lòng thử lại.')
    } finally {
      setStudentLoading(false)
    }
  }

  const submitRequest = async () => {
    if (!student) {
      setStudentError('Vui lòng kiểm tra mã học viên trước khi gửi yêu cầu.')
      return
    }

    if (!selectedSchedule) {
      toast.warning('Vui lòng chọn khung giờ mong muốn.')
      return
    }

    if (!canAfford) {
      toast.warning('Quỹ phút khả dụng chưa đủ cho khung giờ đã chọn.')
      return
    }

    setSubmitting(true)
    try {
      await addDoc(collection(db, 'bookingRequests'), {
        status: 'pending',
        teacherId: teacher.id,
        teacherCode: teacher.code,
        teacherName: teacher.name,
        teacherPhotoURL: teacher.photoURL || '',
        studentId: student.id,
        studentCode: student.code,
        studentName: student.name,
        subjectId: student.subjectId,
        subjectName: student.subjectName || teacher.subjectNames?.[0] || '',
        requestedDay: selectedSchedule.day,
        requestedStart: selectedSchedule.start,
        requestedEnd: selectedSchedule.end,
        requestedMinutes: duration,
        availableMinutesAtRequest: fund?.available ?? 0,
        heldMinutesAtRequest: fund?.held ?? 0,
        note: note.trim(),
        createdAt: serverTimestamp(),
      })

      toast.success('Đã gửi yêu cầu. Học vụ sẽ kiểm tra và xác nhận lịch.')
      onClose()
    } catch (error) {
      console.error('Error submitting booking request:', error)
      toast.error('Chưa gửi được yêu cầu. Có thể cần cập nhật quyền ghi bookingRequests trên Firebase.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[94dvh] w-full max-w-6xl overflow-hidden rounded-t-[1.75rem] bg-[#fffaf0] shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-center justify-between border-b border-[#eadfbd] bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18400]">Chi tiết giáo viên</p>
            <h2 className="truncate text-xl font-black text-slate-950">{teacher.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[calc(94dvh-68px)] overflow-y-auto lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="border-b border-[#eadfbd] bg-white p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="grid gap-4 sm:grid-cols-[160px_1fr] lg:grid-cols-1">
              <div className="overflow-hidden rounded-2xl bg-[#fff8df] aspect-[4/5]">
                <TeacherPhoto teacher={teacher} />
              </div>
              <div>
                <div className="flex flex-wrap gap-2">
                  {teacher.priorityReasons.map((reason) => (
                    <span key={reason} className="rounded-full bg-[#fff3c4] px-3 py-1 text-xs font-bold text-[#8a6200]">
                      {reason}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{summarizeBio(teacher)}</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#fff6d8] p-4">
                    <p className="text-2xl font-black tabular-nums">{teacher.studentsTaughtCount || 0}+</p>
                    <p className="text-xs font-semibold text-slate-600">học viên đã dạy</p>
                  </div>
                  <div className="rounded-2xl bg-[#fff6d8] p-4">
                    <p className="text-2xl font-black tabular-nums">{teacher.teachingYears || 0}</p>
                    <p className="text-xs font-semibold text-slate-600">năm kinh nghiệm</p>
                  </div>
                </div>
              </div>
            </div>

            {(highlights.length > 0 || strengths.length > 0) && (
              <div className="mt-6">
                <h3 className="text-sm font-black text-slate-950">Điểm nổi bật</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...highlights, ...strengths].map((item) => (
                    <span key={item} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-black text-slate-950">Lịch rảnh đã cập nhật</h3>
              <div className="mt-3 space-y-2">
                {DAY_ORDER.map((day) => {
                  const slot = teacher.availability?.slots?.[day]
                  if (!slot?.available || !slot.timeRanges?.length) return null
                  return (
                    <div key={day} className="flex items-center justify-between gap-3 rounded-xl border border-[#eadfbd] bg-[#fffaf0] px-3 py-2">
                      <span className="text-sm font-bold text-slate-800">{DAY_LABELS[day]}</span>
                      <span className="text-right text-xs font-semibold text-slate-600">
                        {slot.timeRanges.map((range) => `${range.start}-${range.end}`).join(', ')}
                      </span>
                    </div>
                  )
                })}
                {!teacher.hasAvailableSchedule && (
                  <div className="rounded-xl border border-dashed border-[#d9c36c] bg-[#fffaf0] p-4 text-sm font-semibold text-slate-600">
                    Giáo viên chưa cập nhật lịch rảnh. Phụ huynh vẫn có thể gửi ghi chú để học vụ tư vấn.
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="p-4 sm:p-6">
            <div className="rounded-3xl border border-[#eadfbd] bg-white p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFC107]/20 text-[#9a6a00]">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-950">Gửi yêu cầu giữ lịch</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Đây là yêu cầu chờ học vụ xác nhận, chưa trừ phút và chưa tính lương.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">Mã học viên</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={studentCode}
                      onChange={(event) => setStudentCode(event.target.value.toUpperCase())}
                      onKeyDown={(event) => event.key === 'Enter' && lookupStudent()}
                      placeholder="VD: HS8X2K91"
                      className="h-12 min-w-0 flex-1 rounded-xl border border-[#eadfbd] bg-[#fffaf0] px-4 font-mono text-sm font-black uppercase tracking-widest text-slate-950 outline-none transition focus:border-[#d6a600] focus:ring-4 focus:ring-[#ffde63]/30"
                    />
                    <button
                      type="button"
                      onClick={lookupStudent}
                      disabled={studentLoading}
                      className="h-12 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {studentLoading ? 'Đang kiểm tra' : 'Kiểm tra'}
                    </button>
                  </div>
                  {studentError && (
                    <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {studentError}
                    </span>
                  )}
                </label>

                {student && fund && (
                  <div className="rounded-2xl border border-[#eadfbd] bg-[#fffaf0] p-4">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-[#b18400]" />
                      <p className="text-sm font-black text-slate-950">{student.name}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500">{student.subjectName}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ['Số phút hiện có', fund.total],
                        ['Đã sử dụng', fund.used],
                        ['Đã giữ chỗ', fund.held],
                        ['Khả dụng', fund.available],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-white p-3">
                          <p className="text-lg font-black tabular-nums text-slate-950">{Number(value).toLocaleString('vi-VN')}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p>
                        </div>
                      ))}
                    </div>
                    {!canAfford && (
                      <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                        Quỹ phút khả dụng chưa đủ cho {duration} phút. Hãy chọn thời lượng ngắn hơn hoặc liên hệ học vụ.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-sm font-bold text-slate-700">Thời lượng muốn giữ</p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {MINUTE_PRESETS.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => setDuration(minutes)}
                        className={`h-11 rounded-xl text-sm font-black transition active:scale-[0.98] ${
                          duration === minutes
                            ? 'bg-[#FFC107] text-slate-950 shadow-lg shadow-amber-100'
                            : 'bg-[#fffaf0] text-slate-700 ring-1 ring-[#eadfbd] hover:text-slate-950'
                        }`}
                      >
                        {minutes} phút
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    Hệ thống hiện hỗ trợ các mốc 25, 50, 75 và 100 phút. Khung bắt đầu được tách theo bước 30 phút từ lịch rảnh giáo viên.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-700">Khung giờ mong muốn</p>
                  {scheduleOptions.length > 0 ? (
                    <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {scheduleOptions.map((option) => {
                        const value = `${option.day}|${option.start}|${option.end}`
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setSelectedSlot(value)}
                            className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition active:scale-[0.98] ${
                              selectedSlot === value
                                ? 'border-slate-950 bg-slate-950 text-white'
                                : 'border-[#eadfbd] bg-[#fffaf0] text-slate-700 hover:border-[#d6a600] hover:text-slate-950'
                            }`}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-2xl border border-dashed border-[#d9c36c] bg-[#fffaf0] p-4 text-sm font-semibold text-slate-600">
                      Chưa có khung phù hợp với thời lượng đã chọn. Hãy đổi thời lượng hoặc ghi chú để học vụ hỗ trợ.
                    </div>
                  )}
                </div>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">Ghi chú cho học vụ</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="Ví dụ: bé muốn học thử với giáo viên này vào buổi tối, ưu tiên thứ 3 hoặc thứ 5."
                    className="mt-2 w-full resize-none rounded-xl border border-[#eadfbd] bg-[#fffaf0] px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#d6a600] focus:ring-4 focus:ring-[#ffde63]/30"
                  />
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 -mx-4 mt-4 border-t border-[#eadfbd] bg-[#fffaf0]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting || !student || !selectedSchedule || !canAfford}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-100 transition hover:bg-[#f0ae00] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu cho học vụ'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export function PublicTeachersPage() {
  const [teachers, setTeachers] = useState<TeacherView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('recommended')
  const [summaryCounts, setSummaryCounts] = useState({ teachers: 0, students: 0 })
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherView | null>(null)

  const loadTeachers = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true)
      setTeachers([])
      setLastDoc(null)
      setHasMore(true)
    } else {
      setLoadingMore(true)
    }

    try {
      const teachersQuery = reset || !lastDoc
        ? query(
            collection(db, 'teachers'),
            where('status', '==', 'active'),
            firestoreLimit(PAGE_SIZE)
          )
        : query(
            collection(db, 'teachers'),
            where('status', '==', 'active'),
            startAfter(lastDoc),
            firestoreLimit(PAGE_SIZE)
          )

      const teacherSnap = await getDocs(teachersQuery)
      const rawTeachers = teacherSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Teacher))
      const availabilityPairs = await Promise.all(
        rawTeachers.map(async (teacher) => {
          try {
            const availabilitySnap = await getDoc(doc(db, 'teacherAvailability', teacher.id))
            return [
              teacher.id,
              availabilitySnap.exists()
                ? ({ id: availabilitySnap.id, ...availabilitySnap.data() } as TeacherAvailability)
                : undefined,
            ] as const
          } catch {
            return [teacher.id, undefined] as const
          }
        })
      )
      const availabilityMap = new Map(availabilityPairs)

      const pageTeachers = rawTeachers.map((teacher) => {
        const availability = availabilityMap.get(teacher.id)
        return {
          ...teacher,
          availability,
          priorityScore: calculatePriority(teacher, availability),
          priorityReasons: getPriorityReasons(teacher, availability),
          isForeignTeacher: isForeignTeacher(teacher),
          hasAvailableSchedule: hasSchedule(availability),
        }
      })

      setTeachers((prev) => {
        const merged = reset ? pageTeachers : [...prev, ...pageTeachers]
        const byId = new Map(merged.map((teacher) => [teacher.id, teacher]))
        return Array.from(byId.values()).sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name, 'vi'))
      })
      setLastDoc(teacherSnap.docs[teacherSnap.docs.length - 1] || null)
      setHasMore(teacherSnap.docs.length === PAGE_SIZE)
    } catch (error) {
      console.error('Error loading public teachers:', error)
      if (reset) setTeachers([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [lastDoc])

  useEffect(() => {
    document.title = 'Đội ngũ giáo viên 123English'
    loadTeachers(true)
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadSummaryCounts() {
      try {
        const [teacherCountSnap, studentCountSnap] = await Promise.all([
          getCountFromServer(query(collection(db, 'teachers'), where('status', '==', 'active'))),
          getCountFromServer(query(collection(db, 'students'), where('status', '==', 'active'))),
        ])

        if (mounted) {
          setSummaryCounts({
            teachers: teacherCountSnap.data().count,
            students: studentCountSnap.data().count,
          })
        }
      } catch (error) {
        console.error('Error loading public summary counts:', error)
      }
    }

    loadSummaryCounts()

    return () => {
      mounted = false
    }
  }, [])

  const filteredTeachers = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return teachers.filter((teacher) => {
      const haystack = [
        teacher.name,
        teacher.bio,
        teacher.university,
        teacher.major,
        ...(teacher.subjectNames || []),
        ...(teacher.languagesTaught || []),
        ...(teacher.academicSubjectsTaught || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch = !keyword || haystack.includes(keyword)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'recommended' && teacher.priorityScore >= 45) ||
        (filter === 'available' && teacher.hasAvailableSchedule) ||
        (filter === 'featured' && !!teacher.teacherGrade) ||
        (filter === 'experienced' && ((teacher.teachingYears || 0) >= 2 || (teacher.studentsTaughtCount || 0) >= 20)) ||
        (filter === 'foreign' && teacher.isForeignTeacher)

      return matchesSearch && matchesFilter
    })
  }, [filter, search, teachers])

  const topTeachers = filteredTeachers.slice(0, 3)
  const availableCount = teachers.filter((teacher) => teacher.hasAvailableSchedule).length

  return (
    <div className="min-h-screen bg-[#fffaf0] text-slate-950">
      <PublicNav />

      <main>
        <section
          className="relative overflow-hidden border-b border-[#eadfbd] bg-[#fff6d8] bg-cover bg-center"
          style={{ backgroundImage: "url('/teacher-hero-bg.png')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#fff6d8]/95 via-[#fff6d8]/82 to-[#fffaf0]/70" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-14">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e6c04d] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                <ShieldCheck className="h-4 w-4 text-[#d69700]" />
                Dành cho học viên và phụ huynh đã có tài khoản 123English
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Chọn giáo viên phù hợp cho buổi học tiếp theo
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
                Danh sách ưu tiên giáo viên có lịch rảnh, hồ sơ rõ ràng, được học vụ đề xuất và có kinh nghiệm phù hợp. Khi cần đổi giáo viên hoặc xếp lịch mới, phụ huynh có thể dùng trang này để chọn nhanh trước khi nhắn học vụ.
              </p>

              <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
                <div className="rounded-2xl border border-[#f0df9f] bg-white/80 p-4">
                  <p className="text-2xl font-black tabular-nums">{formatRoundedHundredPlus(summaryCounts.teachers)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">giáo viên toàn hệ thống</p>
                </div>
                <div className="rounded-2xl border border-[#f0df9f] bg-white/80 p-4">
                  <p className="text-2xl font-black tabular-nums">{formatRoundedHundredPlus(summaryCounts.students)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">học viên đang học</p>
                </div>
                <div className="rounded-2xl border border-[#f0df9f] bg-white/80 p-4">
                  <p className="text-2xl font-black tabular-nums">{availableCount}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">có lịch rảnh</p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border-[10px] border-slate-950 bg-white p-5 shadow-2xl shadow-amber-200/60">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b18400]">Gợi ý hôm nay</p>
                  <h2 className="text-2xl font-black text-slate-950">Ưu tiên hiển thị</h2>
                </div>
                <Award className="h-7 w-7 text-[#ffb900]" />
              </div>
              <div className="space-y-3">
                {(topTeachers.length ? topTeachers : teachers.slice(0, 3)).map((teacher) => (
                  <button
                    key={teacher.id}
                    type="button"
                    onClick={() => setSelectedTeacher(teacher)}
                    className="block w-full rounded-2xl text-left transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#ffde63]/40"
                  >
                    <TeacherCard teacher={teacher} compact />
                  </button>
                ))}
                {!loading && teachers.length === 0 && (
                  <div className="rounded-2xl bg-[#fff8df] p-6 text-center text-sm font-semibold text-slate-600">
                    Chưa có hồ sơ giáo viên công khai.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="sticky top-0 z-10 -mx-4 border-y border-[#eadfbd] bg-[#fffaf0]/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm tên giáo viên, môn dạy, chứng chỉ, trường học..."
                  className="h-12 w-full rounded-xl border border-[#eadfbd] bg-white pl-12 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#d6a600] focus:ring-4 focus:ring-[#ffde63]/30"
                />
              </label>

              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                {FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    title={item.helper}
                    className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition active:scale-[0.98] ${
                      filter === item.key
                        ? 'bg-slate-950 text-white shadow-lg shadow-amber-200'
                        : 'bg-white text-slate-700 ring-1 ring-[#eadfbd] hover:text-slate-950'
                    }`}
                  >
                    {item.key === 'recommended' && <CheckCircle2 className="h-4 w-4" />}
                    {item.key === 'all' && <Filter className="h-4 w-4" />}
                    {item.key === 'experienced' && <TrendingUp className="h-4 w-4" />}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs font-medium text-slate-500">
              Bộ lọc chỉ áp dụng trên danh sách đã tải. Bấm Xem thêm để mở rộng thêm hồ sơ giáo viên.
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {loading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-72 animate-pulse rounded-2xl bg-white ring-1 ring-[#eadfbd]" />
                ))
              : filteredTeachers.map((teacher) => (
                  <TeacherCard key={teacher.id} teacher={teacher} onSelect={setSelectedTeacher} />
                ))}
          </div>

          {!loading && filteredTeachers.length === 0 && (
            <div className="mt-8 rounded-3xl border border-dashed border-[#d9c36c] bg-white p-10 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-[#c89000]" />
              <h2 className="mt-4 text-xl font-black text-slate-950">Chưa tìm thấy giáo viên phù hợp trong danh sách đã tải</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Thử đổi bộ lọc hoặc bấm Xem thêm để tải thêm giáo viên. Học vụ vẫn có thể tư vấn theo mã học viên và lịch học hiện tại.
              </p>
            </div>
          )}

          <div className="mt-8 flex justify-center">
            {hasMore ? (
              <button
                type="button"
                onClick={() => loadTeachers(false)}
                disabled={loadingMore}
                className="rounded-full bg-[#FFC107] px-7 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-200 transition hover:bg-[#f0ae00] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Đang tải thêm...' : 'Xem thêm giáo viên'}
              </button>
            ) : (
              <p className="text-sm font-semibold text-slate-500">Đã tải hết danh sách giáo viên hiện có.</p>
            )}
          </div>
        </section>
      </main>

      <TeacherBookingModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} />
    </div>
  )
}
