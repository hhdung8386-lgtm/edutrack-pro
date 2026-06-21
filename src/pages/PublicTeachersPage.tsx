import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Filter,
  GraduationCap,
  Search,
  Star,
  Users,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { DayOfWeek, Teacher, TeacherAvailability } from '@/types'

type LessonStats = {
  lessons: number
  minutes: number
}

type TeacherView = Teacher & {
  availability?: TeacherAvailability
  lessonStats: LessonStats
  priorityScore: number
  isForeignTeacher: boolean
  hasAvailableSchedule: boolean
}

type FilterKey = 'all' | 'featured' | 'available' | 'foreign'

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2',
  tue: 'Thứ 3',
  wed: 'Thứ 4',
  thu: 'Thứ 5',
  fri: 'Thứ 6',
  sat: 'Thứ 7',
  sun: 'Chủ nhật',
}

const GRADE_WEIGHT: Record<string, number> = {
  A: 28,
  B: 16,
  C: 8,
  PH: 18,
  SA: 18,
}

const STRENGTH_LABELS: Record<string, string> = {
  pronunciation: 'Phát âm chuẩn',
  patience: 'Kiên nhẫn',
  lesson_plans: 'Có giáo án riêng',
  close_followup: 'Theo sát học viên',
  progress_reports: 'Báo cáo tiến độ',
  tools_proficiency: 'Dạy online tốt',
}

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

function isForeignTeacher(teacher: Teacher) {
  const grade = teacher.teacherGrade
  const haystack = [
    teacher.livingArea,
    teacher.university,
    teacher.degreeType,
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
  if (teacher.pedagogicalCert) highlights.push('Nghiệp vụ sư phạm')
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

function calculatePriority(teacher: Teacher, availability: TeacherAvailability | undefined, stats: LessonStats) {
  const scheduleScore = hasSchedule(availability) ? 18 : 0
  const photoScore = teacher.photoURL ? 30 : 0
  const adminScore = teacher.teacherGrade ? GRADE_WEIGHT[teacher.teacherGrade] || 0 : 0
  const teachingScore = Math.min(22, Math.floor(stats.minutes / 250))
  const profileScore = buildHighlights(teacher).length * 3

  return photoScore + adminScore + scheduleScore + teachingScore + profileScore
}

function summarizeBio(teacher: Teacher) {
  const source = teacher.bio || teacher.studentResults || teacher.otherStrengths || ''
  if (!source) return 'Hồ sơ đang được cập nhật. Giáo viên có kinh nghiệm phù hợp sẽ được tư vấn theo mục tiêu học của học viên.'
  return source.length > 150 ? `${source.slice(0, 150).trim()}...` : source
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
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-2xl font-black text-slate-400">
      {getInitials(teacher.name)}
    </div>
  )
}

function TeacherCard({ teacher, compact = false }: { teacher: TeacherView; compact?: boolean }) {
  const highlights = buildHighlights(teacher)
  const strengths = (teacher.strengths || []).map((key) => STRENGTH_LABELS[key] || key).slice(0, 3)
  const chips = [...highlights, ...strengths].slice(0, compact ? 3 : 5)

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/70">
      <div className={compact ? 'flex gap-4 p-4' : 'grid gap-0 md:grid-cols-[220px_1fr]'}>
        <div className={compact ? 'h-24 w-24 shrink-0 overflow-hidden rounded-xl' : 'relative h-64 overflow-hidden bg-slate-100 md:h-full'}>
          <TeacherPhoto teacher={teacher} />
          {!compact && teacher.teacherGrade && (
            <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-800 shadow-sm">
              Admin ưu tiên
            </div>
          )}
        </div>

        <div className={compact ? 'min-w-0 flex-1' : 'flex min-w-0 flex-col p-5'}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                {teacher.subjectNames?.slice(0, 2).join(', ') || 'Giáo viên 1 kèm 1'}
              </p>
              <h3 className="mt-1 truncate text-xl font-black tracking-tight text-slate-950">{teacher.name}</h3>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              <Star className="h-3.5 w-3.5 fill-current" />
              {teacher.lessonStats.lessons || teacher.studentsTaughtCount || 0}
            </div>
          </div>

          {!compact && (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {summarizeBio(teacher)}
            </p>
          )}

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
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <span>{getNextSchedule(teacher.availability)}</span>
            </div>
            {!compact && (
              <>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span>{teacher.lessonStats.minutes.toLocaleString('vi-VN')} phút đã dạy</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <GraduationCap className="h-4 w-4 text-slate-400" />
                  <span>Level lương x{teacher.level}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function PublicTeachersPage() {
  const [teachers, setTeachers] = useState<TeacherView[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    document.title = 'Đội ngũ giáo viên 123English'

    let active = true

    async function loadTeachers() {
      setLoading(true)
      try {
        const [teacherSnap, availabilitySnap, lessonSnap] = await Promise.all([
          getDocs(query(collection(db, 'teachers'), where('status', '==', 'active'))),
          getDocs(collection(db, 'teacherAvailability')),
          getDocs(query(collection(db, 'publicLessons'), where('status', '==', 'approved'))),
        ])

        if (!active) return

        const availabilityMap = new Map<string, TeacherAvailability>()
        availabilitySnap.docs.forEach((docSnap) => {
          availabilityMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as TeacherAvailability)
        })

        const lessonMap: Record<string, LessonStats> = {}
        lessonSnap.docs.forEach((docSnap) => {
          const data = docSnap.data()
          const teacherId = String(data.teacherId || '')
          if (!teacherId) return
          lessonMap[teacherId] = lessonMap[teacherId] || { lessons: 0, minutes: 0 }
          lessonMap[teacherId].lessons += 1
          lessonMap[teacherId].minutes += Number(data.minutes) || 0
        })

        const nextTeachers = teacherSnap.docs
          .map((docSnap) => {
            const teacher = { id: docSnap.id, ...docSnap.data() } as Teacher
            const availability = availabilityMap.get(teacher.id)
            const lessonStats = lessonMap[teacher.id] || { lessons: 0, minutes: 0 }
            const hasAvailableSchedule = hasSchedule(availability)

            return {
              ...teacher,
              availability,
              lessonStats,
              priorityScore: calculatePriority(teacher, availability, lessonStats),
              isForeignTeacher: isForeignTeacher(teacher),
              hasAvailableSchedule,
            }
          })
          .sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name, 'vi'))

        setTeachers(nextTeachers)
      } catch (error) {
        console.error('Error loading public teachers:', error)
        setTeachers([])
      } finally {
        if (active) setLoading(false)
      }
    }

    loadTeachers()

    return () => {
      active = false
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
        (filter === 'featured' && !!teacher.teacherGrade) ||
        (filter === 'available' && teacher.hasAvailableSchedule) ||
        (filter === 'foreign' && teacher.isForeignTeacher)

      return matchesSearch && matchesFilter
    })
  }, [filter, search, teachers])

  const topTeachers = filteredTeachers.slice(0, 3)
  const foreignTeachers = teachers.filter((teacher) => teacher.isForeignTeacher).slice(0, 4)
  const availableCount = teachers.filter((teacher) => teacher.hasAvailableSchedule).length

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950">
            <ChevronLeft className="h-4 w-4" />
            Về trang chủ
          </Link>
          <a
            href="tel:0906966691"
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            Tư vấn chọn giáo viên
          </a>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-white">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-sky-50 to-white" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Ưu tiên giáo viên có ảnh, lịch rảnh và hồ sơ đầy đủ
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Đội ngũ giáo viên 123English
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                Tìm giáo viên phù hợp theo môn học, kinh nghiệm, lịch rảnh và mức ưu tiên từ admin. Các hồ sơ có ảnh và cập nhật lịch rảnh sẽ được hiển thị nổi bật hơn.
              </p>

              <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-2xl font-black tabular-nums">{teachers.length}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">giáo viên active</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-2xl font-black tabular-nums">{availableCount}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">đã có lịch rảnh</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-2xl font-black tabular-nums">{foreignTeachers.length}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">giáo viên nước ngoài</p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-3 shadow-2xl shadow-slate-300/60">
              <div className="rounded-[1.45rem] bg-white p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Gợi ý hôm nay</p>
                    <h2 className="text-xl font-black text-slate-950">Hồ sơ nổi bật</h2>
                  </div>
                  <Award className="h-6 w-6 text-amber-500" />
                </div>
                <div className="space-y-3">
                  {(topTeachers.length ? topTeachers : teachers.slice(0, 3)).map((teacher) => (
                    <TeacherCard key={teacher.id} teacher={teacher} compact />
                  ))}
                  {!loading && teachers.length === 0 && (
                    <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
                      Chưa có hồ sơ giáo viên công khai.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="sticky top-0 z-10 -mx-4 border-y border-slate-200 bg-[#f6f8fb]/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo tên, môn dạy, chứng chỉ, trường học..."
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70"
                />
              </label>

              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                {[
                  ['all', 'Tất cả'],
                  ['featured', 'Admin ưu tiên'],
                  ['available', 'Có lịch rảnh'],
                  ['foreign', 'Nước ngoài'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key as FilterKey)}
                    className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition active:scale-[0.98] ${
                      filter === key
                        ? 'bg-slate-950 text-white shadow-lg shadow-slate-300'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-950'
                    }`}
                  >
                    {key === 'all' && <Filter className="h-4 w-4" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {loading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-72 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
                ))
              : filteredTeachers.map((teacher) => (
                  <TeacherCard key={teacher.id} teacher={teacher} />
                ))}
          </div>

          {!loading && filteredTeachers.length === 0 && (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-xl font-black text-slate-950">Chưa tìm thấy giáo viên phù hợp</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Thử đổi từ khóa hoặc chọn lại bộ lọc. Bộ phận học vụ có thể tư vấn giáo viên phù hợp theo mục tiêu học.
              </p>
            </div>
          )}
        </section>

        {foreignTeachers.length > 0 && (
          <section className="bg-white py-10">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Foreign teachers</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Giáo viên nước ngoài</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setFilter('foreign')}
                  className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-slate-400 hover:text-slate-950 sm:block"
                >
                  Xem nhóm này
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {foreignTeachers.map((teacher) => (
                  <TeacherCard key={teacher.id} teacher={teacher} compact />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
