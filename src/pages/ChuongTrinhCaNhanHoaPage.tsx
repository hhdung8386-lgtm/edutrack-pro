import { useEffect, type ComponentType } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Flag,
  Gauge,
  Handshake,
  HeartHandshake,
  Languages,
  Layers3,
  Luggage,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Mic2,
  Monitor,
  Plane,
  Presentation,
  RefreshCw,
  RotateCcw,
  Route,
  School,
  ShieldCheck,
  Target,
  TrendingUp,
  UserCheck,
  UserRound,
  Volume2,
  WandSparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { PublicNav } from '@/components/layout/PublicNav'

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

const CONSULTATION_PATH = '/lien-he'

const HERO_PROOFS: { icon: IconComponent; label: string }[] = [
  { icon: BrainCircuit, label: 'AI thiết kế lộ trình' },
  { icon: UserRound, label: 'Gia sư 1 kèm 1' },
  { icon: BarChart3, label: 'Theo dõi tiến bộ' },
  { icon: RefreshCw, label: 'Điều chỉnh liên tục' },
]

const PERSONAL_PATHS: {
  icon: IconComponent
  title: string
  goal: string
  path: string[]
}[] = [
  {
    icon: BriefcaseBusiness,
    title: 'Sales Manager',
    goal: 'Làm việc với khách hàng quốc tế.',
    path: ['Small Talk', 'Product Introduction', 'Client Meeting', 'Negotiation', 'Handling Objections', 'Follow-up'],
  },
  {
    icon: Plane,
    title: 'Chuẩn bị du lịch',
    goal: 'Tự tin giao tiếp trong chuyến đi nước ngoài.',
    path: ['Airport', 'Immigration', 'Hotel', 'Restaurant', 'Transportation', 'Emergency'],
  },
  {
    icon: Monitor,
    title: 'Nhân viên văn phòng',
    goal: 'Sử dụng tiếng Anh trong môi trường công việc.',
    path: ['Introducing Yourself', 'Emails', 'Meetings', 'Reporting', 'Presentations', 'International Teams'],
  },
]

const PERSONAL_DIMENSIONS: {
  icon: IconComponent
  title: string
  body: string
  layout: string
}[] = [
  {
    icon: UserCheck,
    title: 'Gia sư riêng',
    body: 'Một gia sư tập trung vào một học viên.',
    layout: 'md:col-span-5',
  },
  {
    icon: Route,
    title: 'Lộ trình riêng',
    body: 'Mục tiêu học tập được xác định riêng.',
    layout: 'md:col-span-7',
  },
  {
    icon: BookOpenCheck,
    title: 'Nội dung riêng',
    body: 'Bài học được lựa chọn và xây dựng theo nhu cầu.',
    layout: 'md:col-span-7',
  },
  {
    icon: Target,
    title: 'Trọng tâm riêng',
    body: 'Tập trung nhiều hơn vào kỹ năng học viên còn yếu.',
    layout: 'md:col-span-5',
  },
  {
    icon: ClipboardCheck,
    title: 'Bài luyện tập riêng',
    body: 'Nội dung luyện tập bám sát kiến thức và mục tiêu.',
    layout: 'md:col-span-5',
  },
  {
    icon: TrendingUp,
    title: 'Tiến độ riêng',
    body: 'Lộ trình được điều chỉnh khi học viên tiến bộ.',
    layout: 'md:col-span-7',
  },
]

const PROFILE_SIGNALS: { icon: IconComponent; title: string; body: string }[] = [
  { icon: Gauge, title: 'Trình độ hiện tại', body: 'Bạn đang thực sự ở đâu trên hành trình tiếng Anh?' },
  { icon: Flag, title: 'Mục tiêu', body: 'Bạn học tiếng Anh để làm gì?' },
  { icon: Volume2, title: 'Kỹ năng cần cải thiện', body: 'Speaking, Listening, Pronunciation, Vocabulary hay Grammar?' },
  { icon: MapPin, title: 'Bối cảnh sử dụng', body: 'Công việc, học tập, du lịch hay cuộc sống?' },
  { icon: CalendarClock, title: 'Thời gian học', body: 'Bạn muốn đạt mục tiêu trong khoảng thời gian nào?' },
  { icon: BarChart3, title: 'Tiến độ thực tế', body: 'Bạn tiến bộ nhanh ở đâu và còn gặp khó khăn ở đâu?' },
]

const ADAPTIVE_EXAMPLES = [
  ['Phát âm đã tốt hơn', 'Giảm nội dung pronunciation.'],
  ['Phản xạ vẫn chậm', 'Tăng speaking practice và role-play.'],
  ['Sắp phỏng vấn', 'Bổ sung Interview English.'],
  ['Chuyển sang vị trí quản lý', 'Thêm Meeting, Presentation và Leadership Communication.'],
]

const LEARNING_PRIORITIES = [
  ['Bạn đã biết gì', 'Không dành quá nhiều thời gian học lại.'],
  ['Bạn chưa tốt ở đâu', 'Tăng cường luyện tập đúng điểm yếu.'],
  ['Bạn cần gì', 'Ưu tiên kiến thức liên quan trực tiếp đến mục tiêu.'],
  ['Bạn sẽ dùng tiếng Anh ở đâu', 'Đưa tình huống thực tế vào bài học.'],
]

const REAL_OUTCOMES = [
  'Giới thiệu bản thân tự nhiên hơn',
  'Trò chuyện với người nước ngoài',
  'Phản xạ nhanh hơn khi được hỏi',
  'Giao tiếp với khách hàng',
  'Tham gia cuộc họp bằng tiếng Anh',
  'Đi du lịch và xử lý tình huống cơ bản',
  'Phỏng vấn bằng tiếng Anh',
  'Trình bày ý tưởng rõ ràng hơn',
]

const LEARNING_FLOW: { icon: IconComponent; label: string; title: string; body: string }[] = [
  { icon: MapPin, label: 'REAL SITUATION', title: 'Tình huống thực tế', body: 'Bắt đầu từ việc bạn thực sự sẽ gặp.' },
  { icon: Languages, label: 'LANGUAGE', title: 'Ngôn ngữ cần thiết', body: 'Từ vựng và mẫu câu phù hợp.' },
  { icon: ClipboardCheck, label: 'PRACTICE', title: 'Thực hành có hướng dẫn', body: 'Xây phản xạ từng bước.' },
  { icon: MessagesSquare, label: 'ROLE-PLAY', title: 'Mô phỏng với gia sư', body: 'Luyện đúng bối cảnh thật.' },
  { icon: BadgeCheck, label: 'FEEDBACK', title: 'Nhận phản hồi', body: 'Sửa phát âm, ngữ pháp và cách diễn đạt.' },
  { icon: FileText, label: 'PERSONAL PRACTICE', title: 'Bài luyện tập riêng', body: 'Bám sát điểm cần cải thiện.' },
]

const AI_TASKS = [
  'Phân tích nhu cầu',
  'Xây dựng và đề xuất nội dung',
  'Cá nhân hóa bài học',
  'Tạo bài luyện tập',
  'Theo dõi dữ liệu học tập',
  'Hỗ trợ điều chỉnh lộ trình',
]

const TUTOR_TASKS = [
  'Giảng dạy và trò chuyện',
  'Luyện phản xạ',
  'Mô phỏng tình huống',
  'Sửa lỗi trực tiếp',
  'Đánh giá khả năng sử dụng',
  'Đồng hành cùng học viên',
]

const PERSONAL_LAYERS: { icon: IconComponent; label: string; title: string; body: string }[] = [
  { icon: Gauge, label: 'PERSONAL LEVEL', title: 'Cá nhân hóa trình độ', body: 'Nội dung phù hợp với năng lực hiện tại, không quá dễ và không vượt khả năng tiếp nhận.' },
  { icon: Flag, label: 'PERSONAL GOAL', title: 'Cá nhân hóa mục tiêu', body: 'Giao tiếp, công việc, du lịch, phỏng vấn hoặc nhu cầu chuyên biệt.' },
  { icon: BookOpenCheck, label: 'PERSONAL CONTENT', title: 'Cá nhân hóa nội dung', body: 'Chủ đề, từ vựng, mẫu câu và tình huống được chọn theo mục tiêu.' },
  { icon: ClipboardCheck, label: 'PERSONAL PRACTICE', title: 'Cá nhân hóa luyện tập', body: 'Dành nhiều thời gian hơn cho những điểm học viên chưa thành thạo.' },
  { icon: Clock3, label: 'PERSONAL PACE', title: 'Cá nhân hóa tốc độ', body: 'Không phải mọi học viên đều cần cùng số buổi cho một kiến thức.' },
  { icon: Route, label: 'PERSONAL PATH', title: 'Cá nhân hóa lộ trình', body: 'Khi khả năng và mục tiêu thay đổi, chương trình được cập nhật tương ứng.' },
]

const GOALS: { icon: IconComponent; title: string }[] = [
  { icon: BriefcaseBusiness, title: 'Tiếng Anh công việc' },
  { icon: BarChart3, title: 'Sales & Business' },
  { icon: Presentation, title: 'Thuyết trình' },
  { icon: Handshake, title: 'Meeting & Negotiation' },
  { icon: MessageCircle, title: 'Giao tiếp hằng ngày' },
  { icon: Plane, title: 'Du lịch' },
  { icon: Luggage, title: 'Định cư' },
  { icon: UserCheck, title: 'Phỏng vấn' },
  { icon: School, title: 'Học tập' },
  { icon: AudioLines, title: 'Phản xạ giao tiếp' },
  { icon: Mic2, title: 'Phát âm' },
  { icon: Building2, title: 'Tiếng Anh theo ngành nghề' },
]

const SALES_PATH = [
  ['FOUNDATION', 'Giới thiệu bản thân, công ty và sản phẩm.'],
  ['CLIENT COMMUNICATION', 'Small talk, tìm hiểu nhu cầu và tư vấn khách hàng.'],
  ['SALES CONVERSATION', 'Trình bày lợi ích, báo giá và giải đáp câu hỏi.'],
  ['NEGOTIATION', 'Thương lượng và xử lý từ chối.'],
  ['REAL PRACTICE', 'Role-play cuộc gọi và cuộc họp bán hàng thực tế.'],
  ['PROFESSIONAL COMMUNICATION', 'Email, follow-up và duy trì quan hệ khách hàng.'],
]

const BENEFITS: { icon: IconComponent; title: string; body: string }[] = [
  { icon: Target, title: 'Học đúng mục tiêu', body: 'Thời gian học tập trung hơn vào điều bạn thực sự muốn đạt được.' },
  { icon: BookOpenCheck, title: 'Nội dung dành riêng', body: 'Không bắt buộc đi theo toàn bộ giáo trình đại trà.' },
  { icon: WandSparkles, title: 'Tập trung vào điểm yếu', body: 'Những kỹ năng chưa tốt được ưu tiên luyện tập nhiều hơn.' },
  { icon: BriefcaseBusiness, title: 'Ứng dụng thực tế', body: 'Đưa công việc, nhu cầu và tình huống thật vào chương trình.' },
  { icon: RotateCcw, title: 'Linh hoạt theo tiến độ', body: 'Lộ trình có thể thay đổi khi nhu cầu học viên thay đổi.' },
  { icon: UserRound, title: 'Gia sư 1 kèm 1', body: 'Toàn bộ buổi học dành cho một học viên.' },
  { icon: BrainCircuit, title: 'AI hỗ trợ cá nhân hóa', body: 'Công nghệ giúp xây dựng và điều chỉnh nội dung linh hoạt hơn.' },
  { icon: TrendingUp, title: 'Hướng tới kết quả thực tế', body: 'Không chỉ hoàn thành bài học mà hướng tới khả năng sử dụng tiếng Anh.' },
]

function SectionHeading({ title, body, align = 'left' }: { title: string; body?: string; align?: 'left' | 'center' }) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <h2 className="text-3xl font-black leading-[1.08] tracking-[-0.04em] text-[#10213A] sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {body && <p className="mt-5 text-base font-semibold leading-7 text-slate-600 sm:text-lg sm:leading-8">{body}</p>}
    </div>
  )
}

function CheckList({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item} className={`flex items-start gap-3 text-sm font-bold leading-6 ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
          <Check className={`mt-1 h-4 w-4 shrink-0 ${dark ? 'text-[#FFD344]' : 'text-[#A76500]'}`} aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function ChuongTrinhCaNhanHoaPage() {
  useEffect(() => {
    const previousTitle = document.title
    const existingDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = existingDescription?.content
    const description = existingDescription ?? document.createElement('meta')

    document.title = 'Chương Trình Cá Nhân Hoá bằng AI | 123English'
    description.name = 'description'
    description.content = 'AI Personal Learning xây dựng lộ trình tiếng Anh riêng theo trình độ, mục tiêu và nhu cầu thực tế của từng học viên.'
    if (!existingDescription) document.head.appendChild(description)
    window.scrollTo({ top: 0, behavior: 'auto' })

    return () => {
      document.title = previousTitle
      if (existingDescription && previousDescription !== undefined) {
        existingDescription.content = previousDescription
      } else {
        description.remove()
      }
    }
  }, [])

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-white font-[var(--font-quicksand)] text-[#10213A]">
      <PublicNav />

      <main>
        <section className="relative overflow-hidden border-b border-slate-100 bg-white">
          <div className="pointer-events-none absolute -left-32 top-16 h-72 w-72 rounded-full bg-[#FFC107]/10 blur-3xl" aria-hidden />
          <div className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:px-12 lg:py-16">
            <div className="relative z-10 max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#946400]">AI PERSONAL LEARNING</p>
              <h1 className="mt-4 text-[clamp(2.65rem,5.4vw,4.9rem)] font-black leading-[0.98] tracking-[-0.055em] text-[#10213A]">
                Chương trình tiếng Anh được thiết kế riêng cho bạn bằng AI
              </h1>
              <p className="mt-6 max-w-xl text-base font-semibold leading-7 text-slate-600 sm:text-lg sm:leading-8">
                Mỗi học viên sở hữu một lộ trình riêng, dựa trên trình độ, mục tiêu và nhu cầu sử dụng tiếng Anh thực tế.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to={CONSULTATION_PATH}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#FFC107] px-5 text-sm font-black text-[#10213A] shadow-[0_18px_34px_-22px_rgba(183,124,0,0.9)] transition hover:-translate-y-0.5 hover:bg-[#FFB800] focus:outline-none focus:ring-2 focus:ring-[#A76500] focus:ring-offset-2 active:translate-y-px"
                >
                  Tạo lộ trình AI của tôi
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
                <a
                  href="#cach-xay-dung"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 text-sm font-black text-[#10213A] transition hover:-translate-y-0.5 hover:border-[#D99B00] focus:outline-none focus:ring-2 focus:ring-[#A76500] focus:ring-offset-2 active:translate-y-px"
                >
                  Khám phá cách hoạt động
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
              <div className="absolute -right-4 -top-4 h-full w-full rounded-[2rem] bg-[#FFC107]" aria-hidden />
              <img
                src="/teacher-personalization-2026.webp"
                alt="Gia sư 123English đồng hành cùng học viên trong chương trình cá nhân hóa"
                width={1536}
                height={1024}
                fetchPriority="high"
                className="relative aspect-[4/3] w-full rounded-[2rem] object-cover shadow-[0_32px_76px_-44px_rgba(16,33,58,0.55)]"
              />
            </div>
          </div>
        </section>

        <section className="border-b border-slate-100 bg-[#FFFCF2] px-5 py-6 sm:px-8 lg:px-12">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 lg:grid-cols-4">
            {HERO_PROOFS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_12px_30px_-26px_rgba(16,33,58,0.4)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF2B8] text-[#8A5800]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-xs font-black leading-5 text-[#10213A] sm:text-sm">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <SectionHeading
              title="Bạn đã học nhiều lần nhưng vẫn chưa đạt điều mình muốn?"
              body="Có thể vấn đề không nằm ở việc bạn học chưa đủ nhiều. Bạn đang học quá nhiều thứ không thực sự dành cho mình."
            />
            <div className="rounded-[2rem] border border-[#F1D77B] bg-[#FFF8DA] p-6 sm:p-8">
              <p className="text-xl font-black leading-8 text-[#10213A] sm:text-2xl">
                Một giáo trình giao tiếp thông thường phải phục vụ hàng nghìn học viên, trong khi mục tiêu của mỗi người hoàn toàn khác nhau.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {['Gặp khách hàng', 'Phỏng vấn xin việc', 'Đi du lịch', 'Thuyết trình bằng tiếng Anh', 'Cải thiện phát âm', 'Tăng phản xạ giao tiếp'].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-xl bg-white/80 px-4 py-3 text-sm font-bold text-slate-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#A76500]" aria-hidden />
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-7 text-lg font-black text-[#8A5800]">Vậy tại sao tất cả phải học cùng một lộ trình?</p>
            </div>
          </div>
        </section>

        <section id="cach-xay-dung" className="scroll-mt-24 border-y border-slate-100 bg-slate-50 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="Từ chọn giáo trình thành tạo giáo trình"
              body="AI Personal Learning không xếp học viên vào một bộ giáo trình có sẵn. 123English bắt đầu từ chính học viên."
            />

            <div className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
              <div className="overflow-hidden rounded-[2rem] bg-[#10213A] p-6 text-white sm:p-8 lg:p-10">
                <div className="grid gap-4">
                  {[
                    'Bạn đang ở đâu?',
                    'Bạn muốn đạt được điều gì?',
                    'Bạn đang yếu ở đâu?',
                    'Bạn cần dùng tiếng Anh trong tình huống nào?',
                  ].map((question, index) => (
                    <div key={question} className="flex items-center gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-black text-[#FFD344]">
                        {index + 1}
                      </span>
                      <p className="text-base font-black sm:text-lg">{question}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex items-start gap-4 rounded-2xl bg-[#FFC107] p-5 text-[#10213A]">
                  <BrainCircuit className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
                  <div>
                    <p className="font-black">AI hỗ trợ xây dựng lộ trình dành riêng cho bạn.</p>
                    <p className="mt-1 text-sm font-bold leading-6 text-[#4C3B00]">Không bắt đầu bằng Lesson 1. Bắt đầu bằng chính bạn.</p>
                  </div>
                </div>
              </div>
              <div className="relative min-h-80 overflow-hidden rounded-[2rem]">
                <img
                  src="/home-learning-companion-2026.png"
                  alt="Học viên học trực tuyến cùng gia sư 123English"
                  width={1536}
                  height={1152}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="Một học viên, một lộ trình"
              body="Hai người có thể cùng trình độ tiếng Anh. Nếu mục tiêu khác nhau, chương trình cũng nên khác nhau."
            />
            <div className="mt-10 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
              {PERSONAL_PATHS.map(({ icon: Icon, title, goal, path }, index) => (
                <article
                  key={title}
                  className={`flex h-full flex-col rounded-[2rem] border p-6 sm:p-8 ${index === 0 ? 'border-[#E5BF34] bg-[#FFF8DA]' : 'border-slate-200 bg-white shadow-[0_24px_56px_-46px_rgba(16,33,58,0.45)]'}`}
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFC107] text-[#10213A]">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-xl font-black text-[#10213A]">{title}</h3>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{goal}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3">
                    {path.map((item, pathIndex) => (
                      <span key={item} className="inline-flex items-center gap-2">
                        {pathIndex > 0 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#A76500]" aria-hidden />}
                        <span className="whitespace-nowrap rounded-xl border border-[#E8D28A] bg-white px-3 py-2 text-xs font-black text-slate-700">{item}</span>
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-100 bg-[#FFFCF2] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="Đây mới thực sự là cá nhân hóa"
              body="Học 1 kèm 1 chưa đủ nếu mọi học viên vẫn phải theo cùng một giáo trình. 123English cá nhân hóa sâu hơn."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-12">
              {PERSONAL_DIMENSIONS.map(({ icon: Icon, title, body, layout }, index) => (
                <article
                  key={title}
                  className={`rounded-[1.75rem] p-6 sm:p-7 ${layout} ${index === 1 || index === 4 ? 'bg-[#10213A] text-white' : index === 2 ? 'bg-[#FFC107] text-[#10213A]' : 'border border-slate-200 bg-white text-[#10213A]'}`}
                >
                  <Icon className={`h-6 w-6 ${index === 1 || index === 4 ? 'text-[#FFD344]' : 'text-[#8A5800]'}`} aria-hidden />
                  <h3 className="mt-5 text-xl font-black">{title}</h3>
                  <p className={`mt-2 text-sm font-semibold leading-6 ${index === 1 || index === 4 ? 'text-slate-300' : 'text-slate-600'}`}>{body}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-center text-base font-black text-[#10213A] sm:text-lg">
              <span>Học riêng</span><span className="text-[#A76500]">+</span>
              <span>Nội dung riêng</span><span className="text-[#A76500]">+</span>
              <span>Lộ trình riêng</span>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="AI hiểu bạn trước khi xây dựng lộ trình"
              body="Từ sáu nhóm dữ liệu cốt lõi, AI hỗ trợ xây dựng Learning Profile riêng cho từng học viên."
            />
            <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-x-7 sm:grid-cols-2">
                {PROFILE_SIGNALS.map(({ icon: Icon, title, body }) => (
                  <article key={title} className="border-t border-slate-200 py-6">
                    <div className="flex items-start gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF2B8] text-[#8A5800]">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <div>
                        <h3 className="font-black text-[#10213A]">{title}</h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <aside className="rounded-[2rem] bg-[#10213A] p-6 text-white sm:p-8">
                <RefreshCw className="h-7 w-7 text-[#FFD344]" aria-hidden />
                <h3 className="mt-5 text-2xl font-black leading-tight">Bạn thay đổi. Chương trình cũng thay đổi.</h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">Một lộ trình không nên cố định mãi mãi.</p>
                <div className="mt-7 grid gap-4">
                  {ADAPTIVE_EXAMPLES.map(([situation, response]) => (
                    <div key={situation} className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                      <p className="text-sm font-black text-white">{situation}</p>
                      <p className="mt-1 flex items-start gap-2 text-sm font-semibold leading-6 text-slate-300">
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#FFD344]" aria-hidden />
                        {response}
                      </p>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-100 bg-slate-50 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="Học đúng thứ bạn cần"
              body="Ít nội dung dư thừa hơn. Nhiều thời gian cho mục tiêu hơn. Không nhất thiết học nhiều hơn, hãy học đúng hơn."
            />
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {LEARNING_PRIORITIES.map(([title, body], index) => (
                <article key={title} className={`rounded-[1.75rem] p-6 sm:p-7 ${index === 0 ? 'bg-[#FFC107]' : 'border border-slate-200 bg-white'}`}>
                  <div className="flex items-start gap-4">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index === 0 ? 'bg-white/60' : 'bg-[#FFF2B8]'}`}>
                      <Check className="h-5 w-5 text-[#8A5800]" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-lg font-black text-[#10213A]">{title}</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-16 grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
              <div>
                <h3 className="text-2xl font-black leading-tight tracking-[-0.03em] sm:text-3xl">Từ kiến thức đến khả năng sử dụng thực tế</h3>
                <p className="mt-4 text-base font-semibold leading-7 text-slate-600">
                  Không chỉ đo bạn đã học bao nhiêu. Chương trình hướng tới việc bạn có thể làm được gì bằng tiếng Anh.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {REAL_OUTCOMES.map((outcome) => (
                  <div key={outcome} className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_16px_36px_-32px_rgba(16,33,58,0.35)]">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#A76500]" aria-hidden />
                    <span className="text-sm font-bold leading-6 text-slate-700">{outcome}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="Học từ chính những tình huống bạn sẽ gặp"
              body="Bạn không chỉ học cách tạo một câu tiếng Anh. Bạn luyện cách sử dụng câu đó khi tình huống thật xảy ra."
              align="center"
            />
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {LEARNING_FLOW.map(({ icon: Icon, label, title, body }) => (
                <li key={label} className="border-t-4 border-[#FFC107] bg-[#FFFCF2] p-5">
                  <Icon className="h-6 w-6 text-[#8A5800]" aria-hidden />
                  <p className="mt-5 text-[11px] font-black text-[#946400]">{label}</p>
                  <h3 className="mt-2 font-black leading-6 text-[#10213A]">{title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y border-slate-100 bg-[#FFFCF2] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="AI và gia sư cùng tạo nên trải nghiệm học thật"
              body="AI không thay thế gia sư tại 123English. Công nghệ hỗ trợ phía sau, gia sư trực tiếp tạo tương tác và phản hồi trong từng buổi học."
            />
            <div className="mt-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="grid gap-5 sm:grid-cols-2">
                <article className="rounded-[2rem] bg-[#10213A] p-6 text-white sm:p-8">
                  <BrainCircuit className="h-7 w-7 text-[#FFD344]" aria-hidden />
                  <h3 className="mt-5 text-2xl font-black">AI hỗ trợ cá nhân hóa</h3>
                  <div className="mt-6"><CheckList items={AI_TASKS} dark /></div>
                </article>
                <article className="rounded-[2rem] border border-[#E8D28A] bg-white p-6 sm:p-8">
                  <HeartHandshake className="h-7 w-7 text-[#8A5800]" aria-hidden />
                  <h3 className="mt-5 text-2xl font-black">Gia sư tạo trải nghiệm học</h3>
                  <div className="mt-6"><CheckList items={TUTOR_TASKS} /></div>
                </article>
              </div>
              <div className="min-h-80 overflow-hidden rounded-[2rem]">
                <img
                  src="/home-teacher-student-2026.png"
                  alt="Gia sư 123English hướng dẫn học viên trong buổi học trực tuyến"
                  width={1588}
                  height={988}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-lg font-black leading-8 text-[#10213A]">
              AI tạo sức mạnh cá nhân hóa. Gia sư tạo nên trải nghiệm học thật.
            </p>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="Sáu lớp cá nhân hóa xoay quanh chính bạn"
              body="Mỗi lớp giải quyết một phần khác nhau của trải nghiệm học, từ điểm bắt đầu đến tốc độ và lộ trình dài hạn."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PERSONAL_LAYERS.map(({ icon: Icon, label, title, body }, index) => (
                <article key={label} className={`rounded-[1.75rem] p-6 sm:p-7 ${index === 0 || index === 4 ? 'bg-[#FFF2B8]' : 'border border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <Icon className="h-6 w-6 text-[#8A5800]" aria-hidden />
                    <span className="text-[11px] font-black text-[#946400]">{label}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-black text-[#10213A]">{title}</h3>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-100 bg-slate-50 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="Bạn muốn học tiếng Anh để làm gì?"
              body="Hãy để mục tiêu quyết định giáo trình. Mỗi nhu cầu có thể được xây dựng thành một lộ trình riêng."
              align="center"
            />
            <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {GOALS.map(({ icon: Icon, title }) => (
                <div key={title} className="flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#D99B00] hover:shadow-[0_18px_36px_-30px_rgba(16,33,58,0.4)]">
                  <Icon className="h-5 w-5 text-[#8A5800]" aria-hidden />
                  <p className="mt-4 text-sm font-black leading-5 text-[#10213A]">{title}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
              <div className="lg:sticky lg:top-24">
                <SectionHeading
                  title="Ví dụ: Tôi cần tiếng Anh để làm Sales"
                  body="Thay vì một khóa Business English chung, chương trình phân tích những tình huống học viên thực sự gặp."
                />
                <img
                  src="/adult_meeting.png"
                  alt="Học viên thực hành thuyết trình bằng tiếng Anh trong môi trường công việc"
                  width={1024}
                  height={1024}
                  loading="lazy"
                  className="mt-8 aspect-[4/3] w-full rounded-[2rem] object-cover object-[center_35%]"
                />
              </div>
              <div className="grid gap-4">
                {SALES_PATH.map(([title, body]) => (
                  <article key={title} className="grid gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-5 sm:grid-cols-[12rem_1fr] sm:items-center sm:p-6">
                    <p className="text-sm font-black text-[#8A5800]">{title}</p>
                    <p className="text-sm font-semibold leading-6 text-slate-600">{body}</p>
                  </article>
                ))}
                <div className="rounded-[1.5rem] bg-[#FFC107] p-6 text-lg font-black leading-8 text-[#10213A]">
                  Đây không còn là một khóa học tiếng Anh. Đây là tiếng Anh được xây dựng quanh công việc của bạn.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-100 bg-[#FFFCF2] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              title="Tại sao AI Personal Learning đáng để lựa chọn?"
              body="Một khóa học được tạo từ chính mục tiêu của bạn, thay vì bắt bạn thích nghi với một giáo trình chung."
            />
            <div className="mt-10 grid gap-x-8 md:grid-cols-2">
              {BENEFITS.map(({ icon: Icon, title, body }) => (
                <article key={title} className="flex gap-4 border-t border-slate-200 py-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF2B8] text-[#8A5800]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-black text-[#10213A]">{title}</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-5xl rounded-[2.25rem] bg-[#FFC107] px-6 py-12 text-center text-[#10213A] sm:px-10 sm:py-16 lg:px-16">
            <Layers3 className="mx-auto h-8 w-8" aria-hidden />
            <h2 className="mt-6 text-3xl font-black leading-[1.08] tracking-[-0.04em] sm:text-4xl lg:text-5xl">
              Your English. Your Goals. Your Learning Path.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base font-bold leading-7 text-[#4C3B00] sm:text-lg">
              Một học viên. Một mục tiêu. Một lộ trình riêng. Đừng cố gắng thích nghi với một giáo trình, hãy để giáo trình thích nghi với bạn.
            </p>
            <p className="mt-7 text-lg font-black">Bạn muốn sử dụng tiếng Anh để làm được điều gì?</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to={CONSULTATION_PATH}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#10213A] px-6 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#1C3557] focus:outline-none focus:ring-2 focus:ring-[#10213A] focus:ring-offset-2 focus:ring-offset-[#FFC107] active:translate-y-px"
              >
                Tạo lộ trình AI của tôi
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2 text-sm font-bold text-[#4C3B00]">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Đăng ký đánh giá và tư vấn cùng 123English
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
