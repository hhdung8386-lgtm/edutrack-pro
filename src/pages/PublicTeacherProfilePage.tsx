import { useEffect, useState } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '@/lib/firebase'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { PublicNav } from '@/components/layout/PublicNav'
import { TeacherProfileDetails } from '@/components/teachers/TeacherProfileDetails'
import type { Teacher } from '@/types'
import { publicProfileAsTeacher, type PublicTeacherProfile } from '@/lib/publicTeacherProfile'

function ProfileSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Đang tải hồ sơ gia sư">
      <div className="h-40 rounded-2xl bg-slate-100" />
      <div className="h-28 rounded-2xl bg-slate-100" />
      <div className="h-56 rounded-2xl bg-slate-100" />
    </div>
  )
}

export function PublicTeacherProfilePage() {
  const { id } = useParams()
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true

    async function loadTeacher() {
      if (!id) {
        setNotFound(true)
        setLoading(false)
        return
      }

      try {
        const teacherSnapshot = await getDoc(doc(db, 'publicTeacherProfiles', id))
        if (!active) return
        if (!teacherSnapshot.exists()) {
          setNotFound(true)
          return
        }

        const safeTeacher = publicProfileAsTeacher(
          teacherSnapshot.id,
          teacherSnapshot.data() as PublicTeacherProfile,
        )
        setTeacher(safeTeacher)
        document.title = `${safeTeacher.code || safeTeacher.name} | Giáo viên 123English`
      } catch (error) {
        console.error('Error loading public teacher profile:', error)
        if (active) setNotFound(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadTeacher()
    return () => {
      active = false
    }
  }, [id])

  return (
    <div className="min-h-[100dvh] bg-white text-slate-950">
      <PublicNav />
      <main>
        <section className="border-b border-amber-100 bg-[#fffaf0] px-5 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-5xl">
            <Link to="/giao-vien" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-amber-700">
              <ArrowLeft className="h-4 w-4" />
              Đội ngũ giáo viên
            </Link>
            <div className="mt-5 max-w-2xl">
              <h1 className="text-3xl font-black tracking-tight text-[#10213A] sm:text-4xl">Hồ sơ giáo viên 123English</h1>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600 sm:text-base">
                Thông tin chuyên môn, kinh nghiệm giảng dạy và chứng chỉ đã được cập nhật trên hệ thống.
              </p>
            </div>
          </div>
        </section>

        <section className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          <div className="mx-auto max-w-5xl">
            {loading && <ProfileSkeleton />}
            {!loading && notFound && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center">
                <h2 className="text-xl font-black text-slate-900">Hồ sơ hiện không khả dụng</h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
                  Hồ sơ này không tồn tại hoặc giáo viên hiện không ở trạng thái giảng dạy.
                </p>
                <Link to="/giao-vien" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#FFC107] px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-[#eaae00] active:scale-[0.98]">
                  Xem đội ngũ giáo viên
                </Link>
              </div>
            )}
            {!loading && teacher && (
              <>
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-800">
                  <ShieldCheck className="mt-0.5 h-5 w-5 flex-none" />
                  Trang chỉ hiển thị thông tin nghề nghiệp và năng lực giảng dạy dành cho phụ huynh.
                </div>
                <TeacherProfileDetails
                  teacher={teacher}
                  subjects={[]}
                  totalApprovedMinutes={teacher.totalApprovedMinutes}
                  publicView
                />
              </>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
