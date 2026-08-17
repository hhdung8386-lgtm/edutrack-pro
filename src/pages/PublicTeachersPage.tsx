import { useEffect } from 'react'
import {
  AppWindow,
  ArrowRight,
  BarChart3,
  BookCheck,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  Fingerprint,
  GraduationCap,
  MessageSquareText,
  MonitorSmartphone,
  NotebookPen,
  Route,
  Sparkles,
  Target,
  UserCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { PublicNav } from '@/components/layout/PublicNav'

const QUALITY_TABS = [
  { number: '01', label: 'Verified Tutors' },
  { number: '02', label: '60H Academy' },
  { number: '03', label: '1–2–3 Method™' },
  { number: '04', label: 'After Class' },
  { number: '05', label: 'AI Learning' },
  { number: '06', label: 'One App' },
]

const VERIFIED_ITEMS = [
  {
    icon: GraduationCap,
    title: 'Teaching Certified',
    description: 'TEFL · TESOL · Teaching Assistant · Nghiệp vụ sư phạm hoặc chứng nhận tương đương.',
  },
  {
    icon: CheckCircle2,
    title: 'Language Proficiency Verified',
    description: 'IELTS · TOEIC · CEFR hoặc các chứng nhận năng lực ngoại ngữ tương đương.',
  },
  {
    icon: Fingerprint,
    title: 'Identity & Profile Verified',
    description: 'Thông tin, hồ sơ và năng lực gia sư được kiểm tra trước khi xuất hiện trên hệ thống.',
  },
]

const METHOD_STEPS = [
  {
    number: '01',
    title: 'Teaching Point',
    description: 'Một trọng tâm kiến thức chính. Học đúng thứ cần học, không dàn trải.',
    icon: Target,
  },
  {
    number: '02',
    title: 'Interactive Games',
    description: 'Hai hoạt động tương tác giúp học viên luyện tập và ghi nhớ kiến thức tự nhiên hơn.',
    icon: Sparkles,
  },
  {
    number: '03',
    title: 'Practice Exercises',
    description: 'Ba bài tập ứng dụng để kiểm tra khả năng hiểu, phản xạ và sử dụng kiến thức.',
    icon: NotebookPen,
  },
]

const AFTER_CLASS_ITEMS = [
  { icon: FileText, title: 'Lesson Report', description: 'Nội dung và kiến thức đã hoàn thành.' },
  { icon: MessageSquareText, title: 'Tutor Feedback', description: 'Nhận xét riêng về khả năng tiếp thu và tương tác.' },
  { icon: Target, title: 'Areas to Improve', description: 'Những điểm học viên cần cải thiện.' },
  { icon: BookCheck, title: 'Smart Homework', description: 'Bài tập củng cố sau buổi học.' },
]

const AI_ITEMS = [
  ['Current Level', 'Trình độ hiện tại'],
  ['Learning Goals', 'Mục tiêu học tập'],
  ['Strengths & Weaknesses', 'Điểm mạnh và điểm cần cải thiện'],
  ['Learning Progress', 'Tốc độ và tiến độ học'],
  ['Tutor Feedback', 'Nhận xét xuyên suốt từ gia sư'],
]

const APP_ITEMS = [
  { icon: CalendarDays, title: 'Đặt lịch gia sư', description: 'Chọn gia sư và thời gian phù hợp.' },
  { icon: Route, title: 'Learning Schedule', description: 'Theo dõi toàn bộ lịch học.' },
  { icon: FileText, title: 'Lesson Reports', description: 'Xem lại nhận xét sau từng buổi.' },
  { icon: NotebookPen, title: 'Homework', description: 'Nhận và hoàn thành bài tập.' },
  { icon: BarChart3, title: 'Learning Progress', description: 'Theo dõi tiến bộ theo thời gian.' },
  { icon: BrainCircuit, title: 'AI Learning Profile', description: 'Hồ sơ học tập được cập nhật xuyên suốt quá trình học.' },
  { icon: UserCheck, title: 'Tutor Matching', description: 'Đề xuất gia sư phù hợp với nhu cầu và mục tiêu.' },
]

function SectionHeading({
  number,
  eyebrow,
  title,
  description,
  light = false,
}: {
  number: string
  eyebrow: string
  title: string
  description: string
  light?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className={`font-mono text-sm font-black tracking-[0.14em] ${light ? 'text-[#0d5483]' : 'text-[#0b79b6]'}`}>{number}</span>
        <span className={`h-px w-10 ${light ? 'bg-[#0d5483]/35' : 'bg-[#0b79b6]/30'}`} />
        <p className={`text-xs font-black uppercase tracking-[0.18em] ${light ? 'text-[#0d5483]' : 'text-[#0b79b6]'}`}>{eyebrow}</p>
      </div>
      <h2 className="mt-4 max-w-3xl text-balance text-3xl font-black tracking-[-0.045em] text-[#111827] sm:text-4xl lg:text-5xl">{title}</h2>
      <p className="mt-5 max-w-2xl text-pretty text-base font-medium leading-8 text-slate-600 sm:text-lg">{description}</p>
    </div>
  )
}

export function PublicTeachersPage() {
  useEffect(() => {
    document.title = 'Hệ thống gia sư chất lượng 1-1 | 123English'
  }, [])

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-[#111827]">
      <PublicNav />

      <main>
        <section className="relative overflow-hidden bg-white px-5 pb-12 pt-14 sm:px-8 sm:pb-16 lg:px-12 lg:pb-20 lg:pt-20">
          <div className="pointer-events-none absolute left-[7%] top-16 h-8 w-8 rounded-full bg-[#ffe02f]" aria-hidden="true" />
          <div className="pointer-events-none absolute right-[9%] top-28 h-7 w-7 rounded-full bg-[#0868eb]" aria-hidden="true" />
          <div className="pointer-events-none absolute right-[4%] top-[52%] h-4 w-4 rounded-full bg-[#ffc5c5]" aria-hidden="true" />

          <div className="relative mx-auto max-w-7xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#0b79b6]">The 123English tutor system</p>
            <h1 className="mx-auto mt-5 max-w-5xl text-balance text-4xl font-black tracking-[-0.055em] text-[#111827] sm:text-5xl lg:text-[4.25rem] lg:leading-[1.02]">
              Hệ thống gia sư được xây dựng cho chất lượng 1-1
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-pretty text-base font-semibold leading-8 text-slate-600 sm:text-lg">
              Tại 123English, một gia sư giỏi chỉ là điểm bắt đầu.
            </p>
            <p className="mx-auto mt-2 max-w-3xl text-pretty text-sm font-medium leading-7 text-slate-500 sm:text-base">
              Mỗi gia sư hoạt động trong một hệ thống giảng dạy đồng bộ — từ tiêu chuẩn tuyển chọn, đào tạo nội bộ, phương pháp lên lớp đến theo dõi dữ liệu và cá nhân hóa bằng AI.
            </p>

            <div className="mx-auto mt-10 grid max-w-5xl grid-cols-2 items-end gap-3 sm:grid-cols-4 sm:gap-5">
              {[
                { position: '8% center', height: 'sm:h-[22rem]' },
                { position: '36% center', height: 'sm:h-[19rem]' },
                { position: '63% center', height: 'sm:h-[19rem]' },
                { position: '91% center', height: 'sm:h-[22rem]' },
              ].map((portrait, index) => (
                <div key={portrait.position} className={`relative h-56 overflow-hidden rounded-[3.75rem] bg-[#edf7ff] shadow-[0_22px_55px_-32px_rgba(15,23,42,0.4)] ${portrait.height} ${index === 1 || index === 2 ? 'sm:translate-y-5' : ''}`}>
                  <img
                    src="/teacher-system-hero-2026.webp"
                    alt={index === 0 ? 'Đội ngũ gia sư chuyên nghiệp của hệ thống 123English' : ''}
                    aria-hidden={index !== 0}
                    className="h-full w-full scale-[1.42] object-cover"
                    style={{ objectPosition: portrait.position }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <nav aria-label="Các tiêu chuẩn của hệ thống gia sư" className="sticky top-0 z-40 border-y border-slate-200 bg-white/95 px-4 py-3 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.45)] backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-7xl snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUALITY_TABS.map((tab, index) => (
              <a
                key={tab.number}
                href={`#quality-${tab.number}`}
                className={`flex min-h-12 min-w-[10.5rem] flex-1 snap-start items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition duration-200 focus:outline-none focus:ring-2 focus:ring-[#0868eb] focus:ring-offset-2 active:scale-[0.98] ${index === 0 ? 'bg-[#ffe534] text-[#111827]' : 'text-slate-600 hover:bg-slate-50 hover:text-[#111827]'}`}
              >
                <span className="font-mono text-[11px] text-[#0b79b6]">{tab.number}</span>
                {tab.label}
              </a>
            ))}
          </div>
        </nav>

        <section id="quality-01" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto grid max-w-7xl items-start gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <div className="lg:sticky lg:top-28">
              <SectionHeading number="01" eyebrow="Verified Tutors" title="Tuyển chọn từ năng lực thực tế" description="100% gia sư được xác minh hồ sơ chuyên môn trước khi giảng dạy." />
              <p className="mt-9 border-l-4 border-[#ffe02f] pl-5 text-xl font-black leading-8 text-[#111827]">
                Không chỉ chọn người biết tiếng Anh.<br />Chúng tôi chọn người biết cách dạy tiếng Anh.
              </p>
            </div>

            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {VERIFIED_ITEMS.map(({ icon: Icon, title, description }, index) => (
                <article key={title} className="grid gap-5 py-7 sm:grid-cols-[4.5rem_1fr] sm:py-9">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 text-[#0868eb]">
                    <Icon className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-400">0{index + 1}</span>
                    <h3 className="mt-1 text-xl font-black tracking-[-0.025em] text-[#111827]">{title}</h3>
                    <p className="mt-2 max-w-2xl text-sm font-medium leading-7 text-slate-600 sm:text-base">{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="quality-02" className="scroll-mt-24 bg-[#ffe534] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
              <div className="relative order-2 lg:order-1">
                <div className="absolute -inset-x-4 bottom-5 top-5 rounded-[2.25rem] bg-[#0868eb]" aria-hidden="true" />
                <img src="/teacher-academy-2026.webp" alt="Gia sư 123English tham gia chương trình đào tạo nội bộ" className="relative aspect-[4/3] w-full rounded-[1.75rem] object-cover shadow-[0_24px_55px_-30px_rgba(15,23,42,0.5)]" loading="lazy" />
              </div>
              <div className="order-1 lg:order-2">
                <SectionHeading number="02" eyebrow="60H Teacher Academy" title="60 giờ đào tạo trước khi đứng lớp" description="Mỗi gia sư được đào tạo theo tiêu chuẩn giảng dạy của 123English trước khi nhận học viên." light />
                <div className="mt-8 inline-grid grid-cols-[auto_1fr] items-center gap-4 border-y border-[#111827]/20 py-5">
                  <strong className="font-mono text-5xl font-black tracking-[-0.08em] text-[#0868eb] sm:text-6xl">60</strong>
                  <span className="text-sm font-black uppercase leading-5 tracking-[0.16em] text-[#111827]">Hours<br />Internal Training Program</span>
                </div>
                <p className="mt-7 max-w-2xl text-sm font-semibold leading-7 text-[#2b3443] sm:text-base">
                  Phương pháp giảng dạy 1-1 · Quản lý lớp học · Sửa lỗi phát âm & ngữ pháp · Kỹ thuật đặt câu hỏi · Tương tác với trẻ em & người lớn · Đánh giá năng lực · Sử dụng hệ thống học tập 123English
                </p>
                <p className="mt-7 text-lg font-black leading-8 text-[#111827]">Gia sư không hoạt động độc lập.<br />Họ giảng dạy trong một tiêu chuẩn chung của toàn hệ thống.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="quality-03" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-4xl text-center">
              <SectionHeading number="03" eyebrow="The 1–2–3 Method™" title="Mỗi buổi học đều có mục tiêu rõ ràng" description="123English chuẩn hóa cấu trúc lớp học để mỗi phút học đều tạo ra giá trị." />
            </div>

            <div className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-0">
              <div className="absolute left-[16%] right-[16%] top-9 hidden h-px bg-slate-300 md:block" aria-hidden="true" />
              {METHOD_STEPS.map(({ number, title, description, icon: Icon }) => (
                <article key={number} className="relative px-2 text-center md:px-6">
                  <div className="relative mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[#ffe534] text-[#0868eb] ring-[10px] ring-white">
                    <Icon className="h-7 w-7" strokeWidth={2} />
                    <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#17213a] font-mono text-[10px] font-black text-white">{number}</span>
                  </div>
                  <h3 className="mt-7 text-xl font-black tracking-[-0.03em]">{title}</h3>
                  <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-7 text-slate-600">{description}</p>
                </article>
              ))}
            </div>

            <div className="mx-auto mt-14 max-w-3xl border-y border-slate-200 py-7 text-center">
              <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-[#0868eb]">Learn → Interact → Practice</p>
              <p className="mt-4 text-lg font-black leading-8">Không chỉ “học xong một buổi”.<br />Mỗi buổi phải tạo ra một bước tiến có thể theo dõi được.</p>
            </div>
          </div>
        </section>

        <section id="quality-04" className="scroll-mt-24 bg-[#edf8ff] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <div>
              <SectionHeading number="04" eyebrow="After-Class Intelligence" title="Buổi học kết thúc. Hệ thống vẫn tiếp tục theo sát." description="Sau mỗi lớp, gia sư cập nhật trực tiếp trên ứng dụng." />
              <p className="mt-8 max-w-xl text-base font-semibold leading-8 text-[#111827]">Mỗi buổi học trở thành một phần dữ liệu trong hành trình học tập, thay vì những lớp học rời rạc.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-[1.75rem] bg-[#a8dff4] sm:grid-cols-2">
              {AFTER_CLASS_ITEMS.map(({ icon: Icon, title, description }) => (
                <article key={title} className="bg-white p-6 sm:p-7">
                  <Icon className="h-6 w-6 text-[#0868eb]" strokeWidth={1.8} />
                  <h3 className="mt-5 text-lg font-black">{title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="quality-05" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
              <div>
                <SectionHeading number="05" eyebrow="AI Personalization" title="Một học viên. Một hành trình riêng." description="Không có hai học viên nào tiến bộ theo cùng một cách. 123English sử dụng dữ liệu học tập và AI để hỗ trợ phân tích." />
                <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
                  {AI_ITEMS.map(([title, description]) => (
                    <div key={title} className="grid grid-cols-[1.25rem_1fr] gap-3 py-3.5">
                      <Check className="mt-0.5 h-5 w-5 text-[#0b79b6]" strokeWidth={2.5} />
                      <p className="text-sm font-medium text-slate-600"><strong className="font-black text-[#111827]">{title}</strong> — {description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="absolute -bottom-4 -right-4 h-full w-full rounded-[2rem] bg-[#ffe534]" aria-hidden="true" />
                <img src="/teacher-personalization-2026.webp" alt="Gia sư phân tích dữ liệu để cá nhân hóa lộ trình học" className="relative aspect-[4/3] w-full rounded-[1.75rem] object-cover shadow-[0_24px_55px_-30px_rgba(15,23,42,0.5)]" loading="lazy" />
              </div>
            </div>
            <div className="mx-auto mt-16 max-w-4xl text-center">
              <p className="text-sm font-medium leading-7 text-slate-600">Từ đó, hệ thống hỗ trợ đề xuất nội dung và lộ trình phù hợp hơn cho từng học viên.</p>
              <p className="mt-4 text-2xl font-black tracking-[-0.035em]">Không phải học viên thích nghi với giáo trình.<br /><span className="text-[#0868eb]">Giáo trình thích nghi với học viên.</span></p>
            </div>
          </div>
        </section>

        <section id="quality-06" className="scroll-mt-24 bg-[#ffe534] px-5 pb-20 pt-20 sm:px-8 lg:px-12 lg:pb-28 lg:pt-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
              <SectionHeading number="06" eyebrow="Everything in One App" title="Toàn bộ hành trình học tập trong một ứng dụng" description="Từ lịch học, báo cáo sau buổi đến hồ sơ AI — mọi thông tin cần thiết đều ở đúng một nơi." light />
              <div className="hidden h-24 w-24 items-center justify-center rounded-[2rem] bg-[#0868eb] text-white lg:flex">
                <MonitorSmartphone className="h-11 w-11" strokeWidth={1.6} />
              </div>
            </div>

            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {APP_ITEMS.map(({ icon: Icon, title, description }, index) => (
                <article key={title} className={`min-h-44 rounded-[1.35rem] bg-white p-5 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)] ${index === APP_ITEMS.length - 1 ? 'sm:col-span-2 lg:col-span-2' : ''}`}>
                  <Icon className="h-6 w-6 text-[#0868eb]" strokeWidth={1.8} />
                  <h3 className="mt-5 text-base font-black">{title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{description}</p>
                </article>
              ))}
              <article className="flex min-h-44 flex-col justify-between rounded-[1.35rem] bg-[#17213a] p-5 text-white sm:col-span-2 lg:col-span-2">
                <AppWindow className="h-7 w-7 text-[#ffe534]" strokeWidth={1.8} />
                <div>
                  <p className="text-xl font-black tracking-[-0.03em]">Một hệ thống. Một hành trình liền mạch.</p>
                  <Link to="/lien-he" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ffe534] px-5 text-sm font-black text-[#111827] transition hover:bg-[#ffdc18] focus:outline-none focus:ring-2 focus:ring-white active:scale-[0.98]">
                    Nhận tư vấn
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-[#0868eb] px-5 py-14 text-white sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffe534]">123English quality system</p>
              <h2 className="mt-3 max-w-3xl text-balance text-2xl font-black tracking-[-0.04em] sm:text-3xl">Chất lượng 1-1 không đến từ một cá nhân. Nó đến từ cả một hệ thống.</h2>
            </div>
            <Link to="/chuong-trinh-hoc" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-[#111827] transition hover:-translate-y-0.5 hover:bg-[#fffbed] focus:outline-none focus:ring-2 focus:ring-[#ffe534] focus:ring-offset-2 focus:ring-offset-[#0868eb] active:translate-y-0">
              Xem chương trình
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
