import type { CSSProperties } from 'react'
import {
  ArrowDown,
  BookOpenCheck,
  GraduationCap,
  Headphones,
  MessageCircleMore,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { TutoringInfoSection } from '@/components/landing/TutoringInfoSection'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { PublicNav } from '@/components/layout/PublicNav'
import { SiteBlocks } from '@/components/site/SiteBlocks'
import { useSiteContent } from '@/lib/siteContent'
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

/**
 * Ba chặng năng lực hiển thị thành một hàng ngay phía trên bảng giáo trình.
 * Tỷ lệ cột bám đúng phạm vi cuốn 1 / 4 / 4 để thẳng hàng với C1..C9.
 */
const LEVEL_STAGES = [
  {
    levels: '1',
    title: 'Nền tảng',
    note: 'Từ vựng, mẫu câu cơ bản.',
    span: 1,
    surface: 'bg-[#FFF6CF]',
    text: 'text-[#8A5800]',
  },
  {
    levels: '2-5',
    title: 'Thực chiến',
    note: 'Phát triển kỹ năng giao tiếp, học thuật và ứng dụng tiếng Anh vào các tình huống thực tế.',
    span: 4,
    surface: 'bg-[#EAF8FD]',
    text: 'text-[#087AA1]',
  },
  {
    levels: '6-9',
    title: 'Chuyên sâu',
    note: 'Nâng cao khả năng diễn đạt, tư duy ngôn ngữ và sử dụng tiếng Anh một cách tự chủ, linh hoạt.',
    span: 4,
    surface: 'bg-[#EAF8F2]',
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

function StudyPlanLevelRail({ item, tone }: { item: CurriculumItem; tone: CurriculumAudience }) {
  const style = GROUP_STYLES[tone]

  return (
    <div>
      <div className="grid grid-cols-9 gap-1.5" aria-label={`Chọn cuốn của ${item.name}`}>
        {Array.from({ length: 9 }, (_, index) => {
          const level = index + 1
          const active = level >= item.startLevel && level <= item.endLevel
          const available = Boolean(item.studyPlanSlug && level <= (item.studyPlanEndLevel || 0))
          const className = `flex h-9 items-center justify-center rounded-lg text-xs font-extrabold transition ${
            active ? `${style.rail} text-white` : 'bg-slate-100 text-slate-400'
          } ${available ? 'hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300' : ''}`

          return available ? (
            <Link
              key={level}
              to={`/chuong-trinh-hoc/${item.id}/level/${level}`}
              className={className}
              aria-label={`Xem lộ trình ${item.name}, Cuốn ${level}`}
            >
              {level}
            </Link>
          ) : (
            <span key={level} className={className} aria-disabled="true">{level}</span>
          )
        })}
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        Chọn Cuốn 1–{item.studyPlanEndLevel} để xem đầy đủ nội dung từng buổi học.
      </p>
    </div>
  )
}

function DesktopMatrix() {
  return (
    <div className="hidden overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_22px_64px_rgba(35,55,80,0.08)] md:block">
      {/* Hàng ba chặng năng lực — tỷ lệ 1 / 4 / 4 bám đúng C1..C9 */}
      <div className="grid grid-cols-[250px_minmax(0,1fr)] border-b border-amber-200 bg-[#FFFBEB]">
        <div className="flex items-center px-6 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#A76500]">
          Các cuốn tài liệu tham khảo
        </div>
        <div className="grid grid-cols-9 gap-px bg-amber-200/60">
          {LEVEL_STAGES.map((stage) => (
            <div
              key={stage.title}
              className={`flex flex-col items-center justify-center px-3 py-3 text-center ${stage.surface}`}
              style={{ gridColumn: `span ${stage.span}` }}
            >
              <p className={`text-sm font-black ${stage.text}`}>Cuốn {stage.levels}</p>
              <p className={`mt-0.5 text-xs font-black ${stage.text}`}>{stage.title}</p>
              <p className="mt-1 hidden max-w-[34rem] text-[11px] font-semibold leading-4 text-slate-500 lg:block">{stage.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[250px_minmax(0,1fr)] border-b border-amber-300 bg-[#FFC107] text-[#10213A]">
        <div className="flex items-center px-6 py-4 text-sm font-extrabold">Danh mục tài liệu</div>
        <div className="grid grid-cols-9">
          {Array.from({ length: 9 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-16 items-center justify-center border-l border-[#10213A]/10 text-sm font-black"
            >
              C{index + 1}
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
      {/* Ba chặng năng lực — bản rút gọn cho điện thoại */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <p className="bg-[#FFC107] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#10213A]">
          Các cuốn tài liệu tham khảo
        </p>
        <div className="grid grid-cols-3 gap-px bg-amber-200/60">
          {LEVEL_STAGES.map((stage) => (
            <div key={stage.title} className={`px-2 py-2.5 text-center ${stage.surface}`}>
              <p className={`text-xs font-black leading-4 ${stage.text}`}>Cuốn {stage.levels}</p>
              <p className={`text-xs font-black leading-4 ${stage.text}`}>{stage.title}</p>
              <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">{stage.note}</p>
            </div>
          ))}
        </div>
      </div>

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
  // Khối nội dung do admin cấu hình trong trang "Nội dung trang web"
  const { content } = useSiteContent('curriculum')
  const extraBlocks = content.blocks.filter((block) => block.type !== 'hero')

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-white font-[var(--font-quicksand)] text-[#10213A]">
      <PublicNav />

      <main>
        <TutoringInfoSection href="#ban-do-giao-trinh" className="pt-14 lg:pt-20" />

        <section id="ban-do-giao-trinh" className="program-scroll-reveal scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-black tracking-[-0.035em] sm:text-4xl">TÀI LIỆU HỖ TRỢ DẠY THÊM</h2>
              <p className="mt-4 text-base font-medium leading-7 text-slate-600">
                123English chuẩn bị nhiều bộ tài liệu để gia sư tham khảo và lựa chọn trong quá trình dạy thêm 1 kèm 1.
              </p>
              <p className="mt-3 text-base font-medium leading-7 text-slate-600">
                Mỗi bộ tài liệu được chia thành nhiều cuốn. Học viên không bắt buộc phải học lần lượt hoặc hoàn thành toàn bộ các cuốn.
              </p>
              <p className="mt-3 text-base font-medium leading-7 text-slate-600">
                Gia sư lựa chọn cuốn và nội dung phù hợp dựa trên kiến thức hiện tại, độ tuổi và nhu cầu học thêm của từng học viên.
              </p>
            </div>

            <div className="mt-9">
              <DesktopMatrix />
              <MobileMatrix />
            </div>
          </div>
        </section>

        <section className="program-scroll-reveal bg-white px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-black tracking-[-0.035em] sm:text-4xl">Chi tiết từng bộ tài liệu</h2>
              <p className="mt-4 text-base font-medium leading-7 text-slate-600">
                Nội dung giúp gia sư, học viên và phụ huynh cùng hiểu mục tiêu trước khi lựa chọn.
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
                            {item.studyPlanSlug
                              ? <StudyPlanLevelRail item={item} tone={group.id} />
                              : <LevelRail item={item} tone={group.id} />}
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
        <SiteBlocks blocks={extraBlocks} />
      </main>

      <PublicFooter />
    </div>
  )
}
