import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  GraduationCap,
  Headphones,
  MessageCircleMore,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { PublicNav } from '@/components/layout/PublicNav'
import { getBasicEnglishStudyPlan } from '@/data/basicEnglishStudyPlans'
import { CURRICULUM_GROUPS } from '@/data/curriculumCatalog'

const LEVEL_META: Record<number, { proficiency: string; cefr: string }> = {
  1: { proficiency: 'Beginner', cefr: 'A1' },
  2: { proficiency: 'Elementary', cefr: 'A2' },
  3: { proficiency: 'Pre-intermediate', cefr: 'B1' },
  4: { proficiency: 'Intermediate', cefr: 'B1+' },
}

const TARGET_CURRICULUM_ID = 'tieng-anh-nen-tang-nguoi-lon'

export function CurriculumLevelPage() {
  const { curriculumId, level: levelParam } = useParams()
  const level = Number(levelParam)
  const plan = getBasicEnglishStudyPlan(level)
  const curriculum = useMemo(
    () => CURRICULUM_GROUPS.flatMap((group) => group.items).find((item) => item.id === curriculumId),
    [curriculumId],
  )
  const [expandedLesson, setExpandedLesson] = useState<number | null>(null)

  useEffect(() => {
    if (!plan || !curriculum) return
    document.title = `${curriculum.name} - Level ${plan.level} | 123English`
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [curriculum, plan])

  if (curriculumId !== TARGET_CURRICULUM_ID || !curriculum || !plan) {
    return <Navigate to="/chuong-trinh-hoc" replace />
  }

  const meta = LEVEL_META[level]

  return (
    <div className="min-h-[100dvh] bg-[#FFFCF3] font-[var(--font-quicksand)] text-[#10213A]">
      <PublicNav />
      <main>
        <section className="border-b border-amber-100 bg-white px-4 py-6 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <Link
              to="/chuong-trinh-hoc#tieng-anh-nen-tang-nguoi-lon"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-extrabold text-slate-600 transition hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại chương trình học
            </Link>

            <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
              <section className="rounded-[1.75rem] border border-amber-100 bg-white p-5 shadow-[0_24px_70px_-54px_rgba(16,33,58,0.45)] sm:p-7">
                <div className="flex items-start gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-800 ring-1 ring-amber-100">
                    <BookOpenCheck className="h-8 w-8" />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-700">Người lớn · Level {level}</p>
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">{curriculum.name}</h1>
                    <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600 sm:text-base">{curriculum.description}</p>
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { Icon: BookOpenCheck, value: plan.totalLessons, label: 'Bài học' },
                    { Icon: Clock3, value: '25 phút', label: '/ bài học' },
                    { Icon: GraduationCap, value: meta.proficiency, label: 'Trình độ' },
                    { Icon: CheckCircle2, value: meta.cefr, label: 'CEFR tham chiếu' },
                  ].map(({ Icon, value, label }) => (
                    <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <Icon className="h-5 w-5 text-amber-700" />
                      <p className="mt-3 text-lg font-black tabular-nums text-[#10213A]">{value}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-7">
                  <p className="text-sm font-extrabold text-slate-700">Chọn level khác</p>
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:max-w-md">
                    {[1, 2, 3, 4].map((availableLevel) => (
                      <Link
                        key={availableLevel}
                        to={`/chuong-trinh-hoc/${TARGET_CURRICULUM_ID}/level/${availableLevel}`}
                        className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                          availableLevel === level
                            ? 'bg-[#FFC107] text-[#10213A] shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-800'
                        }`}
                      >
                        {availableLevel}
                      </Link>
                    ))}
                  </div>
                </div>
              </section>

              <aside className="rounded-[1.75rem] bg-[#10213A] p-6 text-white shadow-[0_26px_70px_-44px_rgba(16,33,58,0.75)] xl:sticky xl:top-24">
                <Headphones className="h-7 w-7 text-[#FFC107]" />
                <h2 className="mt-4 text-2xl font-black tracking-[-0.025em]">Cần tư vấn Level {level}?</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">Đội ngũ 123English sẽ đối chiếu trình độ hiện tại và mục tiêu để đề xuất lộ trình phù hợp.</p>
                <Link to="/lien-he" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-5 text-sm font-black text-[#10213A] transition hover:-translate-y-0.5 hover:bg-[#FFB300] focus:outline-none focus:ring-2 focus:ring-amber-300">
                  <MessageCircleMore className="h-4 w-4" />
                  Tư vấn khóa học
                </Link>
              </aside>
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-8 lg:px-12 lg:py-14">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-700">Study plan · Basic English {level}</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.035em]">Nội dung chương trình Level {level}</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Chọn từng bài để xem mục tiêu và hoạt động giảng dạy chi tiết.</p>
            </div>

            <div className="mt-7 overflow-hidden rounded-[1.5rem] border border-amber-100 bg-white shadow-[0_20px_60px_-48px_rgba(16,33,58,0.4)]">
              <div className="hidden grid-cols-[70px_minmax(180px,0.75fr)_minmax(300px,1.25fr)_56px] gap-4 bg-[#FFF7D6] px-5 py-4 text-xs font-black uppercase tracking-[0.08em] text-amber-900 md:grid">
                <span>Bài</span><span>Tên bài học</span><span>Mục tiêu học tập</span><span />
              </div>
              <div className="divide-y divide-slate-100">
                {plan.lessons.map((lesson) => {
                  const expanded = expandedLesson === lesson.number
                  return (
                    <article key={lesson.number}>
                      <button
                        type="button"
                        onClick={() => setExpandedLesson(expanded ? null : lesson.number)}
                        className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-amber-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 md:grid-cols-[70px_minmax(180px,0.75fr)_minmax(300px,1.25fr)_56px] md:items-center md:gap-4 md:px-5"
                        aria-expanded={expanded}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 bg-white text-xs font-black tabular-nums text-amber-800">{String(lesson.number).padStart(2, '0')}</span>
                        <strong className="text-sm leading-6 text-[#10213A]">{lesson.title}</strong>
                        <span className="text-sm font-medium leading-6 text-slate-600">{lesson.objective}</span>
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
                          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      {expanded && (
                        <div className="border-t border-amber-100 bg-[#FFFCF3] px-4 py-4 md:pl-[calc(70px+1.25rem)] md:pr-8">
                          <p className="text-xs font-black uppercase tracking-[0.1em] text-amber-800">Chi tiết hoạt động</p>
                          <p className="mt-2 max-w-5xl text-sm font-medium leading-7 text-slate-700">{lesson.activity}</p>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
