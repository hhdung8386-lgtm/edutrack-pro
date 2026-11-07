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
import { useL } from '@/stores/languageStore'

function ProfileSkeleton() {
  const L = useL()
  return (
    <div className="space-y-5 animate-pulse" aria-label={L('Đang tải hồ sơ gia sư', 'Loading tutor profile')}>
      <div className="h-40 rounded-2xl bg-slate-100" />
      <div className="h-28 rounded-2xl bg-slate-100" />
      <div className="h-56 rounded-2xl bg-slate-100" />
    </div>
  )
}

export function PublicTeacherProfilePage() {
  const { id } = useParams()
  const L = useL()
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
        // Chỉ đọc đúng một DTO đã được whitelist; không đọc document `teachers`.
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
        document.title = `${safeTeacher.code || 'Tutor'} | 123English`
      } catch (error) {
        console.error('Load public teacher profile failed:', error)
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
    <div className="min-h-[100dvh] bg-[#FFFCF3] text-slate-950">
      <PublicNav />
      <main>
        <section className="border-b border-[#E8C44A] bg-gradient-to-r from-[#FFF4BF] via-[#FFFBEA] to-white px-4 py-7 sm:px-8 sm:py-8 lg:px-12">
          <div className="mx-auto max-w-5xl">
            <Link to="/login" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-slate-600 transition hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <ArrowLeft className="h-4 w-4" />
              {L('Về trang đăng nhập', 'Back to home')}
            </Link>
            <div className="mt-4 max-w-2xl">
              <h1 className="text-3xl font-black tracking-tight text-[#10213A] sm:text-4xl">{L('Hồ sơ gia sư 123English', '123English tutor profile')}</h1>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600 sm:text-base">
                {L('Thông tin chuyên môn, kinh nghiệm giảng dạy và chứng chỉ dành cho phụ huynh.', 'Professional details, teaching experience and certificates for parents.')}
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 py-7 sm:px-8 sm:py-8 lg:px-12 lg:py-12">
          <div className="mx-auto max-w-5xl">
            {loading && <ProfileSkeleton />}
            {!loading && notFound && (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm sm:px-6">
                <h2 className="text-xl font-black text-slate-900">{L('Hồ sơ hiện không khả dụng', 'This profile is not available')}</h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
                  {L('Link không đúng, hồ sơ chưa được công khai hoặc gia sư hiện không ở trạng thái giảng dạy.', 'The link is incorrect, the profile has not been published, or the tutor is not currently teaching.')}
                </p>
                <Link to="/login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#FFC107] px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-[#eaae00] focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 active:scale-[0.98]">
                  {L('Về trang đăng nhập', 'Back to home')}
                </Link>
              </div>
            )}
            {!loading && teacher && (
              <>
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-800">
                  <ShieldCheck className="mt-0.5 h-5 w-5 flex-none" />
                  {L('Trang chỉ hiển thị thông tin nghề nghiệp và năng lực giảng dạy dành cho phụ huynh.', 'This page only shows professional and teaching information for parents.')}
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
