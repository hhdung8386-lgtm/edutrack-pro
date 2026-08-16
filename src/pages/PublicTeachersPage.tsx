import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, Search, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { PublicNav } from '@/components/layout/PublicNav'
import { db } from '@/lib/firebase'
import { publicProfileAsTeacher, type PublicTeacherProfile } from '@/lib/publicTeacherProfile'
import type { Teacher } from '@/types'

type PublicTeacherView = Teacher

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function getSearchText(teacher: PublicTeacherView) {
  return [
    teacher.name,
    teacher.code,
    teacher.country,
    teacher.livingArea,
    teacher.university,
    teacher.major,
    teacher.bio,
    ...(teacher.subjectNames || []),
    ...(teacher.languagesTaught || []),
    ...(teacher.academicSubjectsTaught || []),
    ...(teacher.strengths || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('vi')
}

function TeacherCard({ teacher }: { teacher: PublicTeacherView }) {
  const profileLabel = teacher.releasedNickname || teacher.code || 'Gia sư 123English'
  const experienceLabel = teacher.teachingYears
    ? `${teacher.teachingYears} năm kinh nghiệm`
    : 'Hồ sơ chuyên môn 123English'
  const subjects = (teacher.subjectNames || []).slice(0, 3)

  return (
    <article className="group overflow-hidden rounded-[1.5rem] border border-[#eadfbd] bg-white shadow-[0_14px_40px_rgba(35,55,80,0.06)] transition duration-300 hover:-translate-y-1 hover:border-[#e3c55d] hover:shadow-[0_22px_48px_rgba(35,55,80,0.12)]">
      <div className="grid gap-0 sm:grid-cols-[9rem_1fr]">
        <div className="relative aspect-[1.1] overflow-hidden bg-[#fff8df] sm:aspect-auto sm:min-h-[12rem]">
          {teacher.photoURL ? (
            <img
              src={teacher.photoURL}
              alt={`Ảnh hồ sơ ${profileLabel}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full min-h-[8rem] items-center justify-center text-3xl font-black text-[#d69a00]">
              {getInitials(teacher.name)}
            </div>
          )}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-black text-emerald-700 shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đã xác thực
          </span>
        </div>

        <div className="flex min-w-0 flex-col p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#98720a]">
            {subjects.join(' · ') || 'Gia sư 1 kèm 1'}
          </p>
          <h2 className="mt-1 truncate text-xl font-black tracking-tight text-[#10213A]">{profileLabel}</h2>
          <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-slate-600">
            {teacher.bio || 'Đồng hành cùng học viên theo lộ trình phù hợp với mục tiêu và trình độ hiện tại.'}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#fff5cc] px-3 py-1 text-xs font-bold text-[#9a5d00]">{experienceLabel}</span>
            {teacher.trainedAt123English && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Đã đào tạo nội bộ</span>
            )}
            {teacher.country && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{teacher.country}</span>
            )}
          </div>

          <Link
            to={`/giao-vien/${teacher.id}`}
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#10213A] px-4 text-sm font-black text-white transition hover:bg-[#1b365d] focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2"
          >
            Xem hồ sơ gia sư
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  )
}

export function PublicTeachersPage() {
  const [teachers, setTeachers] = useState<PublicTeacherView[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    document.title = 'Đội ngũ gia sư | 123English'
    let active = true

    async function loadPublicTeachers() {
      try {
        // Chỉ đọc DTO public đã được admin publish; không đọc collection teachers.
        const snapshot = await getDocs(
          query(
            collection(db, 'publicTeacherProfiles'),
            where('isPublished', '==', true),
            where('status', '==', 'active'),
          ),
        )

        const nextTeachers = snapshot.docs.flatMap((document) => {
          try {
            const profile = document.data() as PublicTeacherProfile
            return [publicProfileAsTeacher(document.id, profile)]
          } catch (error) {
            console.warn('Skip invalid public teacher profile:', document.id, error)
            return []
          }
        })

        nextTeachers.sort((first, second) => {
          const firstScore = (first.photoURL ? 2 : 0) + (first.bio ? 1 : 0) + (first.teachingYears || 0)
          const secondScore = (second.photoURL ? 2 : 0) + (second.bio ? 1 : 0) + (second.teachingYears || 0)
          return secondScore - firstScore || first.name.localeCompare(second.name, 'vi')
        })

        if (active) setTeachers(nextTeachers)
      } catch (error) {
        console.error('Load public teacher directory failed:', error)
        if (active) setLoadError(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadPublicTeachers()
    return () => {
      active = false
    }
  }, [])

  const filteredTeachers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi')
    if (!keyword) return teachers
    return teachers.filter((teacher) => getSearchText(teacher).includes(keyword))
  }, [search, teachers])

  return (
    <div className="min-h-[100dvh] bg-[#fffaf0] text-[#10213A]">
      <PublicNav />

      <main>
        <section className="relative overflow-hidden border-b border-[#eadfbd] bg-[#fff6d8]">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,#ffe07a,transparent_38%),linear-gradient(135deg,transparent,#fffaf0)] lg:block" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:py-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#e6c04d] bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm">
                <Users className="h-4 w-4 text-[#d69700]" />
                Đội ngũ 123English
              </span>
              <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                Tìm gia sư phù hợp cho hành trình học tiếng Anh.
              </h1>
              <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-slate-700 sm:text-lg">
                Xem hồ sơ chuyên môn, kinh nghiệm và môn dạy của các gia sư đã được 123English công khai. Chọn một hồ sơ để xem thông tin chi tiết.
              </p>

              <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#f0df9f] bg-white/80 p-4">
                  <p className="text-2xl font-black tabular-nums">{teachers.length}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">hồ sơ công khai</p>
                </div>
                <div className="rounded-2xl border border-[#f0df9f] bg-white/80 p-4">
                  <p className="text-2xl font-black tabular-nums">{teachers.filter((teacher) => teacher.photoURL).length}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">có ảnh hồ sơ</p>
                </div>
                <div className="col-span-2 rounded-2xl border border-[#f0df9f] bg-white/80 p-4 sm:col-span-1">
                  <p className="text-2xl font-black tabular-nums">1:1</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">hình thức học</p>
                </div>
              </div>
            </div>

            <div className="self-end rounded-[2rem] border-[10px] border-slate-950 bg-white p-5 shadow-2xl shadow-amber-200/60">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff3c4] text-[#b77900]">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b18400]">Hồ sơ công khai</p>
                  <h2 className="mt-1 text-xl font-black">Minh bạch trước khi lựa chọn</h2>
                </div>
              </div>
              <p className="mt-5 text-sm font-medium leading-6 text-slate-600">
                Thông tin trên trang này chỉ gồm dữ liệu nghề nghiệp đã được duyệt để phụ huynh tham khảo.
              </p>
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
                <BookOpen className="h-5 w-5 shrink-0 text-[#d69700]" />
                Chọn hồ sơ để xem chi tiết
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          <div className="rounded-2xl border border-[#eadfbd] bg-white p-4 shadow-[0_12px_30px_rgba(35,55,80,0.04)] sm:p-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên, môn dạy, chứng chỉ hoặc khu vực..."
                aria-label="Tìm gia sư"
                className="h-12 w-full rounded-xl border border-[#eadfbd] bg-white pl-12 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#d6a600] focus:ring-4 focus:ring-[#ffde63]/30"
              />
            </label>
          </div>

          {loading ? (
            <div className="mt-8 grid gap-5 lg:grid-cols-2" aria-label="Đang tải danh sách gia sư">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-64 animate-pulse rounded-[1.5rem] bg-white ring-1 ring-[#eadfbd]" />
              ))}
            </div>
          ) : loadError ? (
            <div className="mt-8 rounded-3xl border border-rose-200 bg-white p-10 text-center">
              <h2 className="text-xl font-black text-slate-950">Chưa thể tải danh sách gia sư</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Vui lòng thử tải lại sau ít phút. Dữ liệu hồ sơ hiện có không bị thay đổi.
              </p>
            </div>
          ) : filteredTeachers.length > 0 ? (
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {filteredTeachers.map((teacher) => <TeacherCard key={teacher.id} teacher={teacher} />)}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-[#d9c36c] bg-white p-10 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-[#c89000]" />
              <h2 className="mt-4 text-xl font-black text-slate-950">
                {teachers.length > 0 ? 'Không tìm thấy hồ sơ phù hợp' : 'Chưa có hồ sơ gia sư công khai'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                {teachers.length > 0
                  ? 'Thử tìm với từ khóa khác hoặc xóa bộ lọc tìm kiếm.'
                  : 'Danh sách sẽ hiển thị khi 123English công khai hồ sơ gia sư đã được duyệt.'}
              </p>
            </div>
          )}
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
