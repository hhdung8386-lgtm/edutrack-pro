import type { CSSProperties } from 'react'
import {
  ArrowDown,
  BookOpenCheck,
  GraduationCap,
  Headphones,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { PublicNav } from '@/components/layout/PublicNav'
import {
  CURRICULUM_GROUPS,
  type CurriculumAudience,
  type CurriculumItem,
} from '@/data/curriculumCatalog'

const GROUP_STYLES: Record<
  CurriculumAudience,
  {
    label: string
    border: string
    background: string
    accent: string
    rail: string
    soft: string
  }
> = {
  children: {
    label: 'Khởi đầu tự nhiên',
    border: 'border-emerald-200',
    background: 'bg-emerald-50/70',
    accent: 'text-emerald-700',
    rail: 'bg-emerald-500',
    soft: 'bg-emerald-100 text-emerald-800',
  },
  teens: {
    label: 'Phát triển học thuật',
    border: 'border-sky-200',
    background: 'bg-sky-50/70',
    accent: 'text-sky-700',
    rail: 'bg-sky-500',
    soft: 'bg-sky-100 text-sky-800',
  },
  adults: {
    label: 'Ứng dụng thực tế',
    border: 'border-amber-200',
    background: 'bg-amber-50/70',
    accent: 'text-amber-700',
    rail: 'bg-[#FFC107]',
    soft: 'bg-amber-100 text-amber-900',
  },
}

const LEVEL_STAGES = [
  {
    levels: 'Level 1',
    title: 'Nền tảng',
    note: 'Làm quen, phát âm và phản xạ cơ bản',
    surface: 'bg-[#FFF6CF]',
    accent: 'bg-[#FFC107]',
    text: 'text-[#8A5800]',
  },
  {
    levels: 'Level 2-6',
    title: 'Thực chiến',
    note: 'Giao tiếp, học thuật và ứng dụng',
    surface: 'bg-[#EAF8FD]',
    accent: 'bg-[#27B5DF]',
    text: 'text-[#087AA1]',
  },
  {
    levels: 'Level 7-9',
    title: 'Bứt phá',
    note: 'Diễn đạt chuyên sâu và tự chủ',
    surface: 'bg-[#EAF8F2]',
    accent: 'bg-[#08B981]',
    text: 'text-[#08795A]',
  },
]

function scrollToCurriculum(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function LevelRail({ item, tone }: { item: CurriculumItem; tone: CurriculumAudience }) {
  const style = GROUP_STYLES[tone]

  return (
    <div className="grid grid-cols-9 gap-1.5" aria-label={`${item.name}, ${item.rangeLabel}`}>
      {Array.from({ length: 9 }, (_, index) => {
        const level = index + 1
        const active = level >= item.startLevel && level <= item.endLevel
        return (
          <span
            key={level}
            className={`flex h-7 items-center justify-center rounded-md text-[10px] font-extrabold ${
              active ? `${style.rail} text-white` : 'bg-slate-100 text-slate-400'
            }`}
          >
            {level}
          </span>
        )
      })}
    </div>
  )
}

function DesktopMatrix() {
  return (
    <div className="hidden overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_22px_64px_rgba(35,55,80,0.08)] md:block">
      <div className="grid grid-cols-[250px_minmax(0,1fr)] border-b border-slate-200 bg-[#10213A] text-white">
        <div className="flex items-center px-6 py-4 text-sm font-extrabold">Danh mục giáo trình</div>
        <div className="grid grid-cols-9">
          {Array.from({ length: 9 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-16 items-center justify-center border-l border-white/10 text-sm font-black"
            >
              L{index + 1}
            </div>
          ))}
        </div>
      </div>

      {CURRICULUM_GROUPS.map((group) => {
        const style = GROUP_STYLES[group.id]
        return (
          <section key={group.id} className={`border-b border-slate-200 last:border-b-0 ${style.background}`}>
            <div className="grid grid-cols-[250px_minmax(0,1fr)]">
              <div className={`px-6 py-5 ${style.accent}`}>
                <p className="text-xs font-black uppercase tracking-[0.12em]">{style.label}</p>
                <h3 className="mt-1 text-xl font-black text-[#10213A]">{group.label}</h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{group.summary}</p>
              </div>
              <div className="space-y-2 border-l border-slate-200 p-4">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToCurriculum(item.id)}
                    className="grid w-full grid-cols-9 items-center gap-1.5 text-left"
                    aria-label={`Xem ${item.name}`}
                  >
                    <span
                      className={`group relative flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 text-sm font-extrabold text-white shadow-sm transition-transform hover:-translate-y-0.5 active:translate-y-px ${style.rail}`}
                      style={
                        {
                          gridColumn: `${item.startLevel} / span ${item.endLevel - item.startLevel + 1}`,
                        } as CSSProperties
                      }
                    >
                      <span className="truncate">{item.name.replace('Giáo trình ', '')}</span>
                      <ArrowDown className="h-4 w-4 shrink-0 opacity-80 transition-transform group-hover:translate-y-0.5" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function MobileMatrix() {
  return (
    <div className="space-y-5 md:hidden">
      {CURRICULUM_GROUPS.map((group) => {
        const style = GROUP_STYLES[group.id]
        return (
          <section
            key={group.id}
            className={`rounded-[1.5rem] border p-4 ${style.border} ${style.background}`}
          >
            <p className={`text-[11px] font-black uppercase tracking-[0.1em] ${style.accent}`}>{style.label}</p>
            <h3 className="mt-1 text-xl font-black text-[#10213A]">{group.label}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{group.summary}</p>

            <div className="mt-4 space-y-3">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToCurriculum(item.id)}
                  className="w-full rounded-2xl border border-white bg-white p-4 text-left shadow-[0_10px_28px_rgba(35,55,80,0.06)] transition-transform active:scale-[0.99]"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-sm font-black leading-5 text-[#10213A]">{item.name}</span>
                      <span className={`mt-1 block text-xs font-extrabold ${style.accent}`}>{item.rangeLabel}</span>
                    </span>
                    <ArrowDown className={`mt-0.5 h-5 w-5 shrink-0 ${style.accent}`} />
                  </span>
                  <span className="mt-3 block">
                    <LevelRail item={item} tone={group.id} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function ChuongTrinhHocPage() {
  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-[#FFFDF8] font-[var(--font-quicksand)] text-[#10213A]">
      <PublicNav />

      <main>
        <section className="relative overflow-hidden border-b border-amber-100">
          <div className="program-orbit pointer-events-none absolute -right-24 top-8 h-72 w-72 rounded-full border-[42px] border-[#FFC107]/10" />
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-12">
            <div className="program-hero-copy relative">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A76500]">
                Chương trình học 123English
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Chọn đúng giáo trình cho từng chặng tiến bộ.
              </h1>
              <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-slate-600 sm:text-lg">
                9 cấp độ rõ ràng, 16 giáo trình và lộ trình phù hợp cho từng độ tuổi.
              </p>
              <a
                href="#ban-do-giao-trinh"
                className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-6 text-sm font-black text-[#10213A] shadow-[0_12px_30px_rgba(217,141,0,0.22)] transition-transform hover:-translate-y-0.5 active:translate-y-px"
              >
                Xem bản đồ giáo trình
                <ArrowDown className="h-4 w-4" />
              </a>
            </div>

            <div className="program-journey relative rounded-[2rem] border border-amber-200 bg-white p-5 shadow-[0_26px_70px_rgba(217,141,0,0.1)] sm:p-7">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF4C7] text-[#A76500]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">Ba chặng năng lực</h2>
                  <p className="text-sm font-medium text-slate-500">Từ nền tảng đến khả năng sử dụng tự chủ</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {LEVEL_STAGES.map((stage, index) => (
                  <article
                    key={stage.title}
                    className={`program-stage group relative grid min-h-[112px] grid-cols-[auto_1fr] items-center gap-3 overflow-hidden rounded-2xl p-4 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(16,33,58,0.09)] sm:block sm:min-h-[168px] ${stage.surface}`}
                    style={{ '--stage-delay': `${180 + index * 100}ms` } as CSSProperties}
                  >
                    <span
                      className={`absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100 ${stage.accent}`}
                    />
                    <div
                      className={`flex min-w-[76px] items-center justify-center rounded-xl bg-white/80 px-3 py-2 text-center text-[11px] font-black shadow-sm ${stage.text} sm:inline-flex sm:min-w-0`}
                    >
                      {stage.levels}
                    </div>
                    <div className="min-w-0 sm:mt-5">
                      <h3 className="whitespace-nowrap text-lg font-black sm:text-xl">{stage.title}</h3>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 sm:mt-2">{stage.note}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <span className="text-xs font-black text-slate-600">Lộ trình 9 cấp độ</span>
                  <span className="text-[11px] font-bold text-slate-400">Tiến dần theo năng lực</span>
                </div>
                <div className="grid grid-cols-9 gap-1.5">
                {Array.from({ length: 9 }, (_, index) => (
                  <div
                    key={index}
                    className={`program-level flex aspect-square items-center justify-center rounded-lg text-xs font-black shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-md ${
                      index === 0
                        ? 'bg-[#FFC107] text-[#10213A]'
                        : index < 6
                          ? 'bg-[#24B8E6] text-white'
                          : 'bg-emerald-500 text-white'
                    }`}
                    style={{ '--level-delay': `${520 + index * 55}ms` } as CSSProperties}
                  >
                    {index + 1}
                  </div>
                ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="ban-do-giao-trinh" className="program-scroll-reveal scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-black tracking-[-0.035em] sm:text-4xl">Bản đồ giáo trình theo 9 cấp độ</h2>
              <p className="mt-4 text-base font-medium leading-7 text-slate-600">
                Mỗi thanh màu thể hiện phạm vi cấp độ của một giáo trình. Chọn giáo trình để xem đầy đủ nội dung bên dưới.
              </p>
            </div>

            <div className="mt-9">
              <DesktopMatrix />
              <MobileMatrix />
            </div>
          </div>
        </section>

        <section className="program-scroll-reveal border-y border-slate-100 bg-white px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-black tracking-[-0.035em] sm:text-4xl">Chi tiết từng giáo trình</h2>
              <p className="mt-4 text-base font-medium leading-7 text-slate-600">
                Nội dung giúp giáo viên, học viên và phụ huynh cùng hiểu mục tiêu trước khi lựa chọn.
              </p>
            </div>

            <div className="mt-12 space-y-16">
              {CURRICULUM_GROUPS.map((group) => {
                const style = GROUP_STYLES[group.id]
                const GroupIcon =
                  group.id === 'children' ? Headphones : group.id === 'teens' ? GraduationCap : MessageCircleMore

                return (
                  <section key={group.id}>
                    <div className="flex items-start gap-4">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${style.soft}`}>
                        <GroupIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-[-0.025em]">{group.label}</h3>
                        <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">{group.summary}</p>
                      </div>
                    </div>

                    <div className="mt-7 grid gap-4 lg:grid-cols-2">
                      {group.items.map((item) => (
                        <article
                          id={item.id}
                          key={item.id}
                          className={`scroll-mt-24 rounded-[1.5rem] border bg-white p-5 shadow-[0_14px_40px_rgba(35,55,80,0.055)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_46px_rgba(35,55,80,0.1)] sm:p-6 ${style.border}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.soft}`}>
                              <BookOpenCheck className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-lg font-black leading-6">{item.name}</h4>
                              <p className={`mt-1 text-xs font-extrabold ${style.accent}`}>
                                {item.audienceLabel} | {item.rangeLabel}
                              </p>
                            </div>
                          </div>
                          <p className="mt-4 text-sm font-medium leading-6 text-slate-600">{item.description}</p>
                          <div className="mt-5">
                            <LevelRail item={item} tone={group.id} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </section>

        <section className="program-scroll-reveal px-5 py-14 sm:px-8 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-6 rounded-[2rem] bg-[#10213A] p-6 text-white shadow-[0_24px_60px_rgba(16,33,58,0.18)] sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#FFC107]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black">Chưa chắc lộ trình nào phù hợp?</h2>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-300">
                  Tra cứu tiến độ hiện tại hoặc liên hệ 123English để được tư vấn theo độ tuổi và mục tiêu học tập.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                to="/login#tra-cuu"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#FFC107] px-5 text-sm font-black text-[#10213A] transition-transform hover:-translate-y-0.5 active:translate-y-px"
              >
                Tra cứu tiến độ
              </Link>
              <Link
                to="/lien-he"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 px-5 text-sm font-black text-white transition-colors hover:bg-white/10"
              >
                Nhận tư vấn
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
