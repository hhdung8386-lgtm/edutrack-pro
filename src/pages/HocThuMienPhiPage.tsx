import { useEffect, useRef, useState } from 'react'
import {
  BadgeCheck,
  CalendarCheck2,
  ChevronDown,
  ClipboardCheck,
  Gift,
  Globe2,
  MonitorPlay,
  Phone,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
} from 'lucide-react'
import { Mascot123 } from '@/components/landing/Mascot123'
import { normalizeVietnamPhone, submitCustomerLead } from '@/lib/customerLeads'

const HOTLINE = { label: '0933.964.683', href: 'tel:0933964683' }
const IMG = '/hoc-thu'

const AGE_GROUPS = ['Bé 4–6 tuổi', 'Bé 6–9 tuổi', 'Bé 9–13 tuổi', 'Teen 13–18 tuổi', 'Người đi làm']

const LEVELS = [
  { label: 'Pre-A1', h: 22 },
  { label: 'A1', h: 34 },
  { label: 'A2', h: 46 },
  { label: 'B1', h: 60 },
  { label: 'B2', h: 76 },
  { label: 'C1', h: 92 },
]

const FEATURES = [
  {
    icon: MonitorPlay,
    title: 'Lớp học tương tác 1 kèm 1',
    text: 'Bài giảng sinh động với trò chơi, hình ảnh, phát âm — con được nói tiếng Anh gần như suốt buổi học.',
    image: `${IMG}/online-class.webp`,
    alt: 'Lớp học trực tuyến tương tác của 123English',
  },
  {
    icon: ClipboardCheck,
    title: 'Báo cáo sau mỗi buổi + xem lại video',
    text: 'Phụ huynh nhận nhận xét chi tiết từng buổi và có thể xem lại buổi học bất cứ lúc nào.',
    image: `${IMG}/companion.webp`,
    alt: 'Học viên học trực tuyến cùng gia sư',
  },
  {
    icon: BadgeCheck,
    title: 'Gia sư tinh tuyển, trình độ B2+',
    text: 'Mỗi gia sư trải qua hơn 60 giờ đào tạo nội bộ và được theo dõi chất lượng sau từng buổi dạy.',
    image: `${IMG}/tutor.webp`,
    alt: 'Gia sư 123English chuẩn bị bài giảng',
  },
]

const PROGRAMS = [
  { title: 'Tiếng Anh Trẻ em', age: '4 – 12 tuổi', image: `${IMG}/kids.webp`, tag: 'Phản xạ tự nhiên' },
  { title: 'Tiếng Anh Thiếu niên', age: '13 – 18 tuổi', image: `${IMG}/teens.webp`, tag: 'IELTS · Cambridge' },
  { title: 'Tiếng Anh Người lớn', age: 'Giao tiếp', image: `${IMG}/adults.webp`, tag: 'Tự tin nói' },
  { title: 'Tiếng Anh Doanh nghiệp', age: 'Công việc', image: `${IMG}/business.webp`, tag: 'Business English' },
]

const STEPS = [
  { icon: CalendarCheck2, title: 'Đăng ký', text: 'Để lại số điện thoại, tư vấn viên sẽ liên hệ lại.' },
  { icon: ClipboardCheck, title: 'Kiểm tra trình độ', text: 'Đánh giá theo khung CEFR, xác định điểm xuất phát.' },
  { icon: PlayCircle, title: 'Học thử 1 kèm 1', text: 'Trải nghiệm buổi học thật cùng gia sư và nhận lộ trình riêng.' },
]

const FAQS = [
  {
    q: 'Buổi học thử có mất phí không?',
    a: 'Hoàn toàn miễn phí. Bạn chỉ cần đăng ký, 123English sẽ sắp xếp gia sư và giờ học phù hợp.',
  },
  {
    q: 'Con học online trên thiết bị nào?',
    a: 'Máy tính, laptop hoặc máy tính bảng có camera và micro. Lớp học mở trực tiếp trên trình duyệt, không cần cài phần mềm.',
  },
  {
    q: 'Sau buổi học thử có bắt buộc đăng ký khoá học?',
    a: 'Không. Bạn nhận kết quả kiểm tra trình độ và lộ trình gợi ý, sau đó tự quyết định.',
  },
  {
    q: 'Lịch học có linh hoạt không?',
    a: 'Có. Bạn có thể chọn lịch cố định hằng tuần hoặc tự đặt lịch theo khung giờ trống của gia đình.',
  },
]

function usePageMeta() {
  useEffect(() => {
    const previousTitle = document.title
    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = existing?.content
    const description = existing ?? document.createElement('meta')

    document.title = 'Học thử miễn phí 1 kèm 1 | 123English'
    description.name = 'description'
    description.content =
      'Đăng ký học thử tiếng Anh 1 kèm 1 miễn phí cùng gia sư đạt chuẩn B2+, kiểm tra trình độ theo CEFR và nhận lộ trình học riêng tại 123English.'
    if (!existing) document.head.appendChild(description)
    window.scrollTo({ top: 0, behavior: 'auto' })

    return () => {
      document.title = previousTitle
      if (existing && previousDescription !== undefined) existing.content = previousDescription
      else description.remove()
    }
  }, [])
}

function SectionTitle({ eyebrow, title, light = false }: { eyebrow: string; title: string; light?: boolean }) {
  return (
    <div className="text-center">
      <p className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.14em] ${light ? 'text-[#FFE27A]' : 'text-[#B37400]'}`}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {eyebrow}
      </p>
      <h2 className={`mt-2 text-[1.6rem] font-black leading-tight tracking-[-0.02em] ${light ? 'text-white' : 'text-[#10213A]'}`}>
        {title}
      </h2>
    </div>
  )
}

function SignupForm({ formRef }: { formRef: React.RefObject<HTMLFormElement | null> }) {
  const [form, setForm] = useState({ name: '', phone: '', age: AGE_GROUPS[1] })
  const [agreed, setAgreed] = useState(true)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    const phone = normalizeVietnamPhone(form.phone)
    if (!form.name.trim()) return setError('Vui lòng nhập họ tên phụ huynh / học viên.')
    if (!phone) return setError('Số điện thoại chưa đúng, ví dụ: 0912 345 678.')
    if (!agreed) return setError('Vui lòng đồng ý để 123English liên hệ tư vấn.')
    setError('')

    // Thông tin về trang admin "Form khách đăng ký"; nhân viên tự liên hệ lại khách.
    setSubmitting(true)
    const saved = await submitCustomerLead({ source: 'hoc-thu-mien-phi', name: form.name, phone, ageGroup: form.age })
    setSubmitting(false)
    if (!saved) return setError(`Chưa gửi được thông tin. Vui lòng thử lại hoặc gọi ${HOTLINE.label}.`)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_18px_50px_-20px_rgba(16,33,58,0.35)]">
        <Mascot123 pose="cheer" className="mx-auto h-32 w-32" />
        <h3 className="mt-2 text-xl font-black text-[#10213A]">Đăng ký thành công!</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          123English đã nhận thông tin của bạn. Tư vấn viên sẽ liên hệ số <b>{normalizeVietnamPhone(form.phone)}</b> để xếp lịch học thử trong giờ làm việc.
        </p>
        <div className="mt-5 grid gap-3">
          <a
            href={HOTLINE.href}
            className="flex h-12 items-center justify-center gap-2 rounded-full border-2 border-[#10213A] text-base font-black text-[#10213A]"
          >
            <Phone className="h-5 w-5" aria-hidden />
            Cần gấp? Gọi {HOTLINE.label}
          </a>
        </div>
      </div>
    )
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="rounded-[28px] bg-white p-5 shadow-[0_18px_50px_-20px_rgba(16,33,58,0.35)]"
    >
      <div className="flex items-center gap-2 rounded-2xl bg-[#FFF4C7] px-4 py-3">
        <Gift className="h-6 w-6 shrink-0 text-[#E53935]" aria-hidden />
        <p className="text-sm font-black leading-5 text-[#10213A]">
          Nhận miễn phí: <span className="text-[#E53935]">1 buổi học thử 1 kèm 1</span> + kiểm tra trình độ CEFR
        </p>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Họ tên</span>
        <input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Họ tên phụ huynh / học viên"
          autoComplete="name"
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none focus:border-[#2E9BE6] focus:bg-white"
        />
      </label>

      <label className="mt-3 flex h-12 items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-[#2E9BE6] focus-within:bg-white">
        <span className="flex h-full items-center border-r border-slate-200 px-3 text-sm font-black text-slate-500">+84</span>
        <span className="sr-only">Số điện thoại</span>
        <input
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          placeholder="Số điện thoại"
          inputMode="tel"
          autoComplete="tel"
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-semibold outline-none"
        />
      </label>

      <fieldset className="mt-3">
        <legend className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500">Đăng ký cho</legend>
        <div className="flex flex-wrap gap-2">
          {AGE_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setForm((current) => ({ ...current, age: group }))}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
                form.age === group
                  ? 'border-[#2E9BE6] bg-[#2E9BE6] text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex items-start gap-2 text-xs font-semibold leading-5 text-slate-500">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#2E9BE6]"
        />
        Tôi đồng ý để 123English liên hệ tư vấn và sắp xếp buổi học thử.
      </label>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF7A1A] to-[#E53935] text-lg font-black text-white shadow-[0_10px_24px_-10px_rgba(229,57,53,0.8)] active:scale-[0.98] disabled:opacity-70"
      >
        {submitting ? 'Đang gửi...' : 'Đăng ký học thử ngay'}
      </button>
      <p className="mt-3 text-center text-xs font-semibold text-slate-500">
        Tư vấn viên sẽ gọi lại trong giờ làm việc · Không spam
      </p>
    </form>
  )
}

export function HocThuMienPhiPage() {
  usePageMeta()
  const formRef = useRef<HTMLFormElement | null>(null)
  const [formVisible, setFormVisible] = useState(true)
  const [openFaq, setOpenFaq] = useState(0)

  useEffect(() => {
    const node = formRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), { threshold: 0.2 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const scrollToForm = () => {
    const node = document.getElementById('dang-ky')
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-[#FFF4C7] font-[var(--font-quicksand)] text-[#10213A]">
      <div className="relative mx-auto w-full max-w-[480px] bg-white pb-28 shadow-[0_0_60px_-20px_rgba(16,33,58,0.25)]">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#FFE27A] bg-white/95 px-4 backdrop-blur">
          <a href="/" className="flex items-center" aria-label="Trang chủ 123English">
            <img src="/brand-logo.png" alt="123English" className="h-8 w-auto" />
          </a>
          <a
            href={HOTLINE.href}
            className="flex items-center gap-1.5 rounded-full bg-[#10213A] px-3 py-1.5 text-xs font-black text-white"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            {HOTLINE.label}
          </a>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#FFD02E] to-[#FFE88A] px-4 pb-6 pt-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/30" aria-hidden />
          <div className="pointer-events-none absolute -left-10 top-40 h-24 w-24 rounded-full bg-[#2E9BE6]/15" aria-hidden />

          <p className="relative mx-auto w-fit rounded-full bg-[#E53935] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-white">
            🎁 Ưu đãi đăng ký hôm nay
          </p>
          <h1 className="relative mt-3 text-center text-[1.35rem] font-black leading-tight">
            Học thử MIỄN PHÍ 1 kèm 1 cùng
          </h1>
          <p className="relative text-center text-[2.6rem] font-black leading-none tracking-[-0.03em] text-[#1667B8]">
            Gia sư chuẩn B2+
          </p>
          <p className="relative mt-2 text-center text-sm font-bold text-[#5C3D00]">
            Kiểm tra trình độ CEFR · Lộ trình cá nhân hoá · Học online tại nhà
          </p>

          <div className="relative mt-5">
            <div className="overflow-hidden rounded-[26px] border-4 border-white shadow-lg">
              <img
                src={`${IMG}/team.webp`}
                alt="Đội ngũ gia sư quốc tế của 123English"
                className="aspect-[16/10] w-full object-cover object-[70%_center]"
                fetchPriority="high"
              />
            </div>
            <span className="absolute -left-1 top-6 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#E53935] shadow">
              ❤ Very nice!
            </span>
            <span className="absolute -top-3 right-4 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#1667B8] shadow">
              👍 Good job!
            </span>
            <span className="absolute bottom-4 left-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#B37400] shadow">
              ⭐ Excellent
            </span>
            <Mascot123 pose="wave" className="absolute -bottom-8 -right-3 h-32 w-28 drop-shadow-lg" />
          </div>

          <div className="relative mt-8 grid grid-cols-3 gap-2 text-center">
            {[
              ['1.000+', 'học viên tin chọn'],
              ['10+', 'quốc gia kết nối'],
              ['60+ giờ', 'đào tạo gia sư'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl bg-white/80 px-1 py-2.5">
                <p className="text-lg font-black text-[#1667B8]">{value}</p>
                <p className="text-[11px] font-bold leading-tight text-slate-600">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Form */}
        <section id="dang-ky" className="-mt-1 scroll-mt-14 bg-gradient-to-b from-[#FFE88A] to-white px-4 pb-8 pt-2">
          <SignupForm formRef={formRef} />
        </section>

        {/* CEFR */}
        <section className="px-4 py-10">
          <SectionTitle eyebrow="Kiểm tra trình độ" title="Đánh giá theo khung CEFR & lộ trình riêng cho bạn" />
          <div className="relative mt-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#EAF6FF] to-[#FFF7D6] p-5">
            <div className="absolute left-4 top-4 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-[#10213A] text-white shadow-lg">
              <span className="text-sm font-black leading-none">CEFR</span>
              <span className="text-[9px] font-bold opacity-80">Standard</span>
            </div>
            <div className="ml-auto flex h-40 w-[78%] items-end justify-between gap-1.5 pt-6">
              {LEVELS.map((level, index) => (
                <div key={level.label} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-xl bg-gradient-to-t from-[#1667B8] to-[#4FB6F5] shadow-inner"
                    style={{ height: `${level.h * 1.2}px`, opacity: 0.55 + index * 0.08 }}
                  />
                  <span className="text-[10px] font-black text-[#1667B8]">{level.label}</span>
                </div>
              ))}
            </div>
            <Mascot123 pose="cheer" className="absolute -bottom-2 left-0 h-24 w-24" />
          </div>
          <ul className="mt-5 grid gap-3">
            {[
              ['9 cấp độ rõ ràng', 'Nền tảng → Thực chiến → Bứt phá, biết chính xác con đang ở đâu.'],
              ['Chấm 4 kỹ năng', 'Nghe, nói, đọc, viết — kèm nhận xét phát âm và phản xạ.'],
              ['Lộ trình cá nhân hoá', 'Gợi ý giáo trình và tần suất học phù hợp mục tiêu của gia đình.'],
            ].map(([title, text]) => (
              <li key={title} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#2E9BE6]" aria-hidden />
                <div>
                  <p className="font-black">{title}</p>
                  <p className="mt-0.5 text-sm font-semibold leading-6 text-slate-600">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Features */}
        <section className="relative overflow-hidden rounded-t-[36px] bg-gradient-to-b from-[#1E8BE0] to-[#1463B4] px-4 pb-12 pt-10">
          <div className="pointer-events-none absolute -right-12 top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden />
          <SectionTitle light eyebrow="Vì sao chọn 123English" title="Dạy thật. Học thật. Tick xanh thật." />
          <div className="mt-7 grid gap-5">
            {FEATURES.map(({ icon: Icon, title, text, image, alt }, index) => (
              <article key={title} className="overflow-hidden rounded-[26px] bg-white shadow-xl">
                <img
                  src={image}
                  alt={alt}
                  loading="lazy"
                  className={`aspect-[16/9] w-full object-cover ${index === 2 ? 'object-[center_35%]' : ''}`}
                />
                <div className="flex gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFD02E] text-[#10213A]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-black leading-snug">{title}</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{text}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-[22px] bg-white/10 p-4 text-white ring-1 ring-white/20">
            <Globe2 className="h-8 w-8 shrink-0 text-[#FFE27A]" aria-hidden />
            <p className="text-sm font-bold leading-6">
              Cộng đồng học viên được kết nối với gia sư và cơ hội học tập tại <b className="text-[#FFE27A]">hơn 10 quốc gia</b>.
            </p>
          </div>
        </section>

        {/* Programs */}
        <section className="px-4 py-10">
          <SectionTitle eyebrow="Chương trình học" title="Phù hợp cho cả gia đình" />
          <div className="mt-6 grid grid-cols-2 gap-3">
            {PROGRAMS.map((program) => (
              <article key={program.title} className="overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-sm">
                <img src={program.image} alt={program.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                <div className="p-3">
                  <span className="rounded-full bg-[#FFF4C7] px-2 py-0.5 text-[10px] font-black text-[#B37400]">{program.tag}</span>
                  <h3 className="mt-1.5 text-sm font-black leading-snug">{program.title}</h3>
                  <p className="text-xs font-bold text-slate-500">{program.age}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Achievements */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#FFD02E] to-[#FFE88A] px-4 pb-12 pt-10">
          <div className="text-center">
            <Trophy className="mx-auto h-9 w-9 text-[#E53935]" aria-hidden />
            <p className="mt-2 text-sm font-black text-[#5C3D00]">Tự hào được vinh danh</p>
            <h2 className="mt-1 text-[1.7rem] font-black leading-tight text-[#1667B8]">Thương hiệu mạnh quốc gia 2026</h2>
            <p className="text-sm font-bold text-[#5C3D00]">Viet Nam Top Brand Awards · Dinh Độc Lập</p>
          </div>
          <div className="relative mt-6 rounded-[26px] bg-[#1463B4] p-2.5 shadow-xl">
            <img
              src={`${IMG}/award-main.webp`}
              alt="123English nhận giải Thương hiệu mạnh quốc gia 2026"
              loading="lazy"
              className="aspect-[3/2] w-full rounded-[20px] object-cover"
            />
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <img
                src={`${IMG}/award-recipient.webp`}
                alt="Đại diện 123English tại lễ vinh danh"
                loading="lazy"
                className="aspect-[4/3] w-full rounded-[16px] object-cover"
              />
              <img
                src={`${IMG}/award-stage.webp`}
                alt="Sân khấu lễ công bố Thương hiệu mạnh quốc gia"
                loading="lazy"
                className="aspect-[4/3] w-full rounded-[16px] object-cover"
              />
            </div>
            <Mascot123 pose="cheer" className="absolute -bottom-10 -right-3 h-28 w-28 drop-shadow-lg" />
          </div>
          <div className="mt-8 flex items-center justify-center gap-1 text-[#E53935]" aria-label="Đánh giá 5 sao">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star key={index} className="h-5 w-5 fill-current" aria-hidden />
            ))}
          </div>
          <p className="mt-1 text-center text-sm font-bold text-[#5C3D00]">Được cộng đồng hơn 1.000 gia đình tin tưởng</p>
        </section>

        {/* Steps */}
        <section className="px-4 py-10">
          <SectionTitle eyebrow="Chỉ 3 bước" title="Bắt đầu học thử thật đơn giản" />
          <ol className="relative mt-6 grid gap-4">
            <span className="absolute bottom-8 left-[27px] top-8 w-0.5 bg-[#FFD02E]" aria-hidden />
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="relative flex gap-4">
                <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#FFD02E] text-[#10213A] ring-4 ring-white">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <div className="flex-1 rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black text-[#2E9BE6]">BƯỚC {index + 1}</p>
                  <p className="font-black">{title}</p>
                  <p className="mt-0.5 text-sm font-semibold leading-6 text-slate-600">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section className="px-4 pb-10">
          <SectionTitle eyebrow="Hỏi đáp" title="Phụ huynh thường hỏi" />
          <div className="mt-6 grid gap-3">
            {FAQS.map((faq, index) => {
              const open = openFaq === index
              return (
                <div key={faq.q} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? -1 : index)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left font-black"
                  >
                    {faq.q}
                    <ChevronDown className={`h-5 w-5 shrink-0 text-[#2E9BE6] transition ${open ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  {open && <p className="px-4 pb-4 text-sm font-semibold leading-6 text-slate-600">{faq.a}</p>}
                </div>
              )
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-4 overflow-hidden rounded-[30px] bg-gradient-to-br from-[#1E8BE0] to-[#1463B4] p-6 text-center text-white">
          <Mascot123 pose="wave" className="mx-auto h-32 w-32" />
          <h2 className="mt-1 text-2xl font-black leading-tight">Sẵn sàng cho buổi học đầu tiên?</h2>
          <p className="mt-2 text-sm font-semibold text-white/85">Đăng ký hôm nay để giữ suất học thử miễn phí.</p>
          <button
            type="button"
            onClick={scrollToForm}
            className="mt-5 h-13 w-full rounded-full bg-[#FFD02E] py-3.5 text-lg font-black text-[#10213A]"
          >
            Nhận suất học thử
          </button>
        </section>

        {/* Footer */}
        <footer className="mt-10 bg-[#10213A] px-4 py-8 text-sm font-semibold text-white/75">
          <img src="/brand-logo.png" alt="123English" className="h-8 w-auto rounded bg-white px-2 py-1" />
          <p className="mt-4">Nền tảng giáo dục trực tuyến 123English</p>
          <p className="mt-2">Hotline: <a href={HOTLINE.href} className="font-black text-[#FFD02E]">{HOTLINE.label}</a></p>
          <p className="mt-2">Văn phòng Bình Tân: 104A đường 32B, P. Bình Trị Đông B, Q. Bình Tân</p>
          <p className="mt-1">Văn phòng Quận 2: 12 đường số 5, KĐT Sala, P. An Khánh, TP.HCM</p>
          <p className="mt-5 text-xs text-white/50">© {new Date().getFullYear()} 123English. All rights reserved.</p>
        </footer>

        {/* Sticky CTA */}
        <div
          className={`fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] px-3 pb-[max(12px,env(safe-area-inset-bottom))] transition-transform duration-300 ${
            formVisible ? 'pointer-events-none translate-y-[220%]' : 'translate-y-0'
          }`}
        >
          <div className="relative flex items-center gap-2 rounded-full bg-white p-1.5 pl-[86px] shadow-[0_10px_30px_-8px_rgba(16,33,58,0.45)] ring-1 ring-[#FFE27A]">
            <Mascot123 pose="wave" className="absolute bottom-0.5 left-1 z-10 h-[96px] w-[82px] drop-shadow-md" />
            <p className="flex-1 text-[13px] font-black leading-tight">
              Học thử miễn phí
              <span className="block text-[11px] font-bold text-slate-500">Kèm kiểm tra trình độ</span>
            </p>
            <button
              type="button"
              onClick={scrollToForm}
              className="rounded-full bg-gradient-to-r from-[#FF7A1A] to-[#E53935] px-5 py-3 text-sm font-black text-white"
            >
              Nhận ngay!
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
