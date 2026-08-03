import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpenCheck,
  CircleCheckBig,
  GraduationCap,
  Plus,
  Quote,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  UsersRound,
} from 'lucide-react'

const LEVELS = [
  { level: 'L1', height: 22, color: '#FFD75A' },
  { level: 'L2', height: 27, color: '#FFD04A' },
  { level: 'L3', height: 33, color: '#FFC340' },
  { level: 'L4', height: 40, color: '#FF9C48' },
  { level: 'L5', height: 47, color: '#FF8846' },
  { level: 'L6', height: 54, color: '#FF7A52' },
  { level: 'L7', height: 61, color: '#FF6F67' },
  { level: 'L8', height: 68, color: '#FF686B' },
  { level: 'L9', height: 75, color: '#FF6464' },
  { level: 'L10', height: 80, color: '#B9E62C' },
  { level: 'L11', height: 85, color: '#A8DB31' },
  { level: 'L12', height: 90, color: '#97D23B' },
  { level: 'L13', height: 94, color: '#6DD9D7' },
  { level: 'L14', height: 98, color: '#61D3DE' },
  { level: 'L15', height: 102, color: '#50C9E6' },
  { level: 'L16', height: 108, color: '#42BFE9' },
]

const RESULT_HIGHLIGHTS = [
  { value: 2850, suffix: '+', label: 'học viên đạt IELTS 6.5+', icon: Target, tone: 'blue' },
  { value: 1230, suffix: '+', label: 'học viên đạt IELTS 7.0+', icon: Trophy, tone: 'green' },
  { value: 520, suffix: '+', label: 'học viên đạt IELTS 8.0+', icon: Award, tone: 'coral' },
  { value: 95.6, suffix: '%', decimals: 1, label: 'hoàn thành mục tiêu du học', icon: CircleCheckBig, tone: 'mint' },
  { value: 1800, suffix: '+', label: 'học viên vào nhóm đại học mục tiêu', icon: GraduationCap, tone: 'violet' },
]

const TESTIMONIALS = [
  {
    quote:
      'Con chủ động nói tiếng Anh hơn và tự theo dõi được tiến độ mỗi tuần. Gia sư sửa rất sát từng lỗi nhỏ nên gia đình thấy thay đổi rõ ràng.',
    name: 'Nguyễn Minh Anh',
    role: 'Phụ huynh học viên lớp 8',
    result: 'Con tăng từ 5.5 lên 7.0 IELTS',
  },
  {
    quote:
      'Lộ trình chia mục tiêu theo từng chặng nên em biết mình cần cải thiện gì trước. Các buổi speaking 1 kèm 1 giúp em tự tin hơn hẳn.',
    name: 'Trần Quốc Bảo',
    role: 'Học viên chương trình IELTS',
    result: 'IELTS 7.0 Overall',
  },
  {
    quote:
      'Lịch học linh hoạt nhưng vẫn có người theo sát. Sau mỗi buổi đều có nhận xét rõ ràng nên em không còn học theo cảm tính như trước.',
    name: 'Phạm Thùy Linh',
    role: 'Sinh viên năm nhất',
    result: 'Đạt mục tiêu đầu vào đại học',
  },
  {
    quote:
      'Mình thích nhất là phụ huynh có thể xem tiến độ và nhận xét ngay sau buổi học. Việc đồng hành với con trở nên cụ thể và nhẹ nhàng hơn.',
    name: 'Lê Hoàng Nam',
    role: 'Phụ huynh học viên thiếu niên',
    result: 'Duy trì lịch học đều 6 tháng',
  },
  {
    quote:
      'Em được hướng dẫn cách chia thời gian cho từng dạng bài thay vì chỉ làm thật nhiều đề. Điểm writing tăng rõ nhất sau ba tháng học đều.',
    name: 'Đỗ Gia Hân',
    role: 'Học viên lớp 11 tại Hà Nội',
    result: 'Writing tăng từ 5.5 lên 6.5',
  },
  {
    quote:
      'Cô giáo kiên nhẫn, nói vừa tốc độ và luôn gửi lại phần cần ôn sau buổi học. Con nhà mình bớt sợ giao tiếp và chủ động nói hơn.',
    name: 'Vũ Thanh Hương',
    role: 'Phụ huynh học viên tiểu học',
    result: 'Hoàn thành lộ trình giao tiếp cơ bản',
  },
  {
    quote:
      'Mình học song song TOEIC và tiếng Anh công việc. Lịch linh hoạt giúp mình duy trì được tiến độ dù thường xuyên phải đổi ca làm.',
    name: 'Nguyễn Hải Đăng',
    role: 'Chuyên viên khách hàng doanh nghiệp',
    result: 'TOEIC tăng 165 điểm',
  },
  {
    quote:
      'Báo cáo sau buổi học rất cụ thể nên gia đình biết con đang mạnh ở đâu và cần hỗ trợ phần nào. Việc chọn gia sư cũng thuận tiện.',
    name: 'Trương Ngọc Mai',
    role: 'Phụ huynh học viên lớp 6',
    result: 'Duy trì 42 buổi học liên tục',
  },
  {
    quote:
      'Em thích cách gia sư sửa phát âm ngay trong hội thoại. Sau mỗi tuần em nghe lại bản ghi và thấy phản xạ tự nhiên hơn trước.',
    name: 'Lê Đức Minh',
    role: 'Sinh viên năm hai tại TP.HCM',
    result: 'Đạt mục tiêu speaking 7.0',
  },
]

const UNIVERSITIES = [
  {
    name: 'Đại học Bách khoa Hà Nội',
    shortName: 'HUST',
    logo: '/university-logos/hust.png',
    students: 128,
  },
  {
    name: 'Đại học Quốc gia Hà Nội',
    shortName: 'VNU',
    logo: '/university-logos/vnu.svg',
    students: 186,
  },
  {
    name: 'Đại học Ngoại thương',
    shortName: 'FTU',
    logo: '/university-logos/ftu.png',
    students: 142,
  },
  {
    name: 'Đại học Kinh tế TP.HCM',
    shortName: 'UEH',
    logo: '/university-logos/ueh.jpg',
    students: 164,
  },
  {
    name: 'Harvard University',
    shortName: 'Harvard',
    logo: '/school-logos/harvard.svg',
    students: 96,
  },
  {
    name: 'Stanford University',
    shortName: 'Stanford',
    logo: '/school-logos/stanford.png',
    students: 82,
  },
  {
    name: 'Massachusetts Institute of Technology',
    shortName: 'MIT',
    logo: '/school-logos/mit.png',
    students: 74,
  },
  {
    name: 'University of California, Berkeley',
    shortName: 'UC Berkeley',
    logo: '/school-logos/berkeley.svg',
    students: 88,
  },
]

const HIGH_SCHOOLS = [
  {
    name: 'THPT chuyên Hà Nội - Amsterdam',
    shortName: 'HN-Ams',
    city: 'Hà Nội',
    logo: '/school-logos/hn-ams.png',
  },
  {
    name: 'THPT chuyên Chu Văn An',
    shortName: 'CVA',
    city: 'Hà Nội',
    logo: '/school-logos/chu-van-an.png',
  },
  {
    name: 'Phổ thông Năng khiếu, ĐHQG TP.HCM',
    shortName: 'PTNK',
    city: 'TP.HCM',
    logo: '/school-logos/ptnk.png',
  },
  {
    name: 'THPT chuyên Trần Đại Nghĩa',
    shortName: 'TĐN',
    city: 'TP.HCM',
    logo: '/school-logos/tran-dai-nghia.png',
  },
  {
    name: 'THPT chuyên Lê Hồng Phong',
    shortName: 'Lê Hồng Phong',
    city: 'TP.HCM',
    logo: '/school-logos/le-hong-phong.jpg',
  },
  {
    name: 'THPT Nguyễn Thị Minh Khai',
    shortName: 'NTMK',
    city: 'TP.HCM',
    logo: '/school-logos/nguyen-thi-minh-khai.png',
  },
  {
    name: 'THPT Marie Curie',
    shortName: 'Marie Curie',
    city: 'TP.HCM',
    logo: '/school-logos/marie-curie.png',
  },
  {
    name: 'THPT Gia Định',
    shortName: 'Gia Định',
    city: 'TP.HCM',
    logo: '/school-logos/gia-dinh.gif',
  },
]

/**
 * Tắt khối "Mục tiêu học thuật được quan tâm" theo yêu cầu vận hành.
 * Giữ nguyên mã nguồn để có thể bật lại bất cứ lúc nào mà không phải viết lại.
 */
const SHOW_ACADEMIC_GOALS = false

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  isVisible,
}: {
  value: number
  decimals?: number
  suffix?: string
  prefix?: string
  isVisible: boolean
}) {
  const outputRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const output = outputRef.current
    if (!output || !isVisible) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      output.textContent = `${prefix}${formatNumber(value, decimals)}${suffix}`
      return
    }

    let frameId = 0
    const startedAt = performance.now()
    const duration = 1400

    const draw = (time: number) => {
      const progress = Math.min((time - startedAt) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      output.textContent = `${prefix}${formatNumber(value * eased, decimals)}${suffix}`

      if (progress < 1) frameId = requestAnimationFrame(draw)
    }

    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [decimals, isVisible, prefix, suffix, value])

  return (
    <span ref={outputRef}>
      {prefix}
      {formatNumber(isVisible ? value : 0, decimals)}
      {suffix}
    </span>
  )
}

function useRevealOnView() {
  const sectionRef = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return { sectionRef, isVisible }
}

export function OutcomeHighlights() {
  const { sectionRef, isVisible } = useRevealOnView()
  const [testimonialIndex, setTestimonialIndex] = useState(0)
  const [isTestimonialPaused, setIsTestimonialPaused] = useState(false)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || isTestimonialPaused) return

    const timer = window.setInterval(() => {
      setTestimonialIndex((current) => (current + 1) % TESTIMONIALS.length)
    }, 7000)

    return () => window.clearInterval(timer)
  }, [isTestimonialPaused])

  const visibleTestimonials = Array.from(
    { length: 3 },
    (_, offset) => TESTIMONIALS[(testimonialIndex + offset) % TESTIMONIALS.length],
  )
  const selectTestimonial = (direction: number) => {
    setTestimonialIndex((current) => (current + direction + TESTIMONIALS.length) % TESTIMONIALS.length)
  }

  return (
    <section
      ref={sectionRef}
      id="ket-qua"
      className={`outcome-section relative overflow-hidden bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24 ${
        isVisible ? 'is-visible' : ''
      }`}
    >
      <div className="outcome-orbit outcome-orbit-one" aria-hidden="true" />
      <div className="outcome-orbit outcome-orbit-two" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-7xl">
        <div className="outcome-reveal grid gap-8 lg:grid-cols-[1.16fr_0.84fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#A76500] shadow-sm">
              <Sparkles className="h-4 w-4 text-[#FFC107]" />
              Thành quả được đo bằng tiến bộ thật
            </div>
            <h2 className="max-w-4xl text-3xl font-black leading-[1.04] tracking-[-0.04em] text-[#10213A] sm:text-4xl lg:text-6xl">
              Những con số tạo nên
              <span className="block text-[#118ED0]">niềm tin học tập.</span>
            </h2>
          </div>
          <div className="lg:pb-1">
            <p className="max-w-xl text-sm font-medium leading-7 text-slate-600 sm:text-base">
              Từ nền tảng tiếng Anh, mục tiêu IELTS đến cánh cửa đại học, mỗi lộ trình đều được theo dõi bằng dữ liệu và phản hồi rõ ràng.
            </p>
            <a
              href="#tra-cuu"
              className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#0E7EBA] transition-colors hover:text-[#10213A]"
            >
              Tra cứu hành trình của học viên
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="outcome-reveal outcome-delay-one mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.8fr_0.8fr_0.8fr]">
          <article className="relative min-h-52 overflow-hidden rounded-[2rem] bg-[#10213A] p-7 text-white shadow-[0_24px_70px_rgba(15,35,60,0.18)] sm:p-8">
            <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[34px] border-[#24B8E6]/15" />
            <div className="absolute bottom-5 right-6 h-16 w-16 rounded-full bg-[#FFC107]" />
            <UsersRound className="h-6 w-6 text-[#62D5F3]" />
            <div className="mt-10 text-5xl font-black tracking-[-0.05em] sm:text-6xl">
              <AnimatedNumber value={12800} suffix="+" isVisible={isVisible} />
            </div>
            <p className="mt-2 max-w-xs text-sm font-semibold leading-6 text-slate-300">
              lượt học viên đã bắt đầu một lộ trình cá nhân hóa cùng 123English
            </p>
          </article>

          {[
            { value: 87.6, suffix: '%', label: 'đạt hoặc vượt mục tiêu IELTS', icon: Target, tone: 'text-[#118ED0]' },
            { value: 91.2, suffix: '%', label: 'đạt nguyện vọng 1 đại học', icon: GraduationCap, tone: 'text-[#16A777]' },
            { value: 98.7, suffix: '%', label: 'phụ huynh và học viên hài lòng', icon: Star, tone: 'text-[#D98D00]' },
          ].map((item) => (
            <article
              key={item.label}
              className="group rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-[0_18px_55px_rgba(15,35,60,0.07)] transition-transform duration-500 hover:-translate-y-1"
            >
              <item.icon className={`h-6 w-6 ${item.tone}`} />
              <div className="mt-9 text-4xl font-black tracking-[-0.04em] text-[#10213A]">
                <AnimatedNumber value={item.value} decimals={1} suffix={item.suffix} isVisible={isVisible} />
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{item.label}</p>
            </article>
          ))}
        </div>

        <div className="outcome-reveal outcome-delay-two mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0">
            <article className="overflow-hidden rounded-[2.25rem] border border-[#D8EEF7] bg-white shadow-[0_24px_70px_rgba(17,142,208,0.09)]">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8F7FD] text-[#118ED0]">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-[-0.025em] text-[#10213A] sm:text-2xl">
                      Bản đồ quy đổi năng lực 16 cấp độ
                    </h3>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500 sm:text-sm">
                      Từ nền tảng đến mục tiêu IELTS, TOEFL và TOEIC
                    </p>
                  </div>
                </div>
                <div className="self-start rounded-full bg-[#FFF4C7] px-3 py-1.5 text-xs font-extrabold text-[#9A6100] sm:self-auto">
                  Lộ trình tăng dần theo năng lực
                </div>
              </div>

              <div className="px-4 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-8">
                <div className="w-full">
                  <div
                    className="grid h-[230px] items-end gap-1 sm:h-[330px] sm:gap-2"
                    style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                  >
                    {LEVELS.map((item, index) => (
                      <div key={item.level} className="flex h-full min-w-0 flex-col justify-end">
                        <div className="outcome-level-track relative h-[190px] sm:h-[250px]">
                          <div
                            className="outcome-level-bar absolute inset-x-0 bottom-0 rounded-t-[0.7rem]"
                            style={
                              {
                                '--level-height': `clamp(${Math.max(42, item.height * 1.32)}px, ${item.height * 0.2}vw, ${item.height * 2.15}px)`,
                                '--level-color': item.color,
                                '--level-delay': `${index * 42}ms`,
                              } as CSSProperties
                            }
                          >
                            <span className="absolute inset-x-0 bottom-2 text-center text-[7px] font-black text-[#10213A] sm:bottom-3 sm:text-[10px]">
                              {item.level}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    className="mt-3 grid gap-1 text-center text-[8px] font-black uppercase tracking-[0.03em] text-slate-500 sm:gap-1.5 sm:text-[9px]"
                    style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                  >
                    <div className="col-span-3 rounded-md bg-[#FFF7D6] py-2 sm:rounded-lg">A1</div>
                    <div className="col-span-3 rounded-md bg-[#FFF0DF] py-2 sm:rounded-lg">A2</div>
                    <div className="col-span-3 rounded-md bg-[#FFE7E5] py-2 sm:rounded-lg">B1</div>
                    <div className="col-span-3 rounded-md bg-[#F0F9D7] py-2 sm:rounded-lg">B2</div>
                    <div className="col-span-2 rounded-md bg-[#E3F8F7] py-2 sm:rounded-lg">C1</div>
                    <div className="col-span-2 rounded-md bg-[#E4F6FC] py-2 sm:rounded-lg">C2</div>
                  </div>
                </div>
              </div>
            </article>

            <article className="mt-4 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_16px_45px_rgba(15,35,60,0.05)]">
              <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <h3 className="text-sm font-black uppercase tracking-[0.08em] text-[#10213A]">Bảng quy đổi tham khảo</h3>
                <span className="text-xs font-semibold text-slate-400">Đọc từ trái sang phải theo từng nhóm trình độ</span>
              </div>
              <div className="hidden sm:block">
                <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                  <tbody>
                    {[
                      ['Khung CEFR', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
                      ['Năng lực', 'Beginner', 'Elementary', 'Intermediate', 'Upper Intermediate', 'Advanced', 'Expert'],
                      ['TOEFL iBT', '0 - 20', '21 - 31', '32 - 45', '46 - 93', '94 - 114', '115 - 120'],
                      ['IELTS', '0 - 4.0', '4.0 - 4.5', '4.5 - 5.5', '5.5 - 6.5', '7.0 - 8.0', '8.5 - 9.0'],
                      ['TOEIC', '0 - 200', '205 - 385', '390 - 785', '790 - 1095', '1100 - 1305', 'Trên 1305'],
                    ].map((row) => (
                      <tr key={row[0]} className="border-b border-slate-100 last:border-0">
                        {row.map((cell, index) => (
                          <td
                            key={cell}
                            className={`px-4 py-3 ${index === 0 ? 'font-black text-[#10213A]' : 'text-center font-semibold text-slate-500'}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 p-4 sm:hidden">
                {[
                  ['A1', 'Beginner', 'TOEFL 0 - 20', 'IELTS 0 - 4.0', 'TOEIC 0 - 200'],
                  ['A2', 'Elementary', 'TOEFL 21 - 31', 'IELTS 4.0 - 4.5', 'TOEIC 205 - 385'],
                  ['B1', 'Intermediate', 'TOEFL 32 - 45', 'IELTS 4.5 - 5.5', 'TOEIC 390 - 785'],
                  ['B2', 'Upper Intermediate', 'TOEFL 46 - 93', 'IELTS 5.5 - 6.5', 'TOEIC 790 - 1095'],
                  ['C1', 'Advanced', 'TOEFL 94 - 114', 'IELTS 7.0 - 8.0', 'TOEIC 1100 - 1305'],
                  ['C2', 'Expert', 'TOEFL 115 - 120', 'IELTS 8.5 - 9.0', 'TOEIC trên 1305'],
                ].map(([cefr, ability, toefl, ielts, toeic]) => (
                  <article key={cefr} className="rounded-2xl border border-slate-100 bg-[#FCFDFE] p-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <strong className="text-lg font-black text-[#10213A]">{cefr}</strong>
                      <span className="text-right text-xs font-extrabold text-[#118ED0]">{ability}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold leading-4 text-slate-500">
                      <span>{toefl}</span>
                      <span>{ielts}</span>
                      <span>{toeic}</span>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </div>

          <aside className="relative overflow-hidden rounded-[2.25rem] border border-amber-200/80 bg-[#FFFCF3] p-6 shadow-[0_24px_70px_rgba(217,141,0,0.08)] sm:p-7">
            <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full border-[26px] border-[#FFC107]/15" />
            <div className="relative">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A76500]">Kết quả nổi bật</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#10213A]">Thành tích theo từng cột mốc.</h3>

              <div className="mt-7 space-y-3">
                {RESULT_HIGHLIGHTS.map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-white/85 p-3.5">
                    <div className={`outcome-result-icon outcome-result-icon-${item.tone}`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xl font-black tracking-[-0.03em] text-[#10213A]">
                        <AnimatedNumber
                          value={item.value}
                          decimals={item.decimals}
                          suffix={item.suffix}
                          isVisible={isVisible}
                        />
                      </div>
                      <p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <a
                href="#tra-cuu"
                className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-sm font-extrabold text-[#A76500] transition-colors hover:bg-[#FFF4C7]"
              >
                Xem tiến độ học tập
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </aside>
        </div>

        {SHOW_ACADEMIC_GOALS && (
        <div className="outcome-reveal outcome-delay-three mt-7 overflow-hidden rounded-[2.25rem] border border-amber-200/70 bg-white shadow-[0_24px_70px_rgba(217,141,0,0.08)]">
          <div className="px-6 pb-5 pt-7 text-center sm:px-9">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A76500]">Mục tiêu học thuật được quan tâm</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[#10213A] sm:text-3xl">
              Những mục tiêu được học viên quan tâm
            </h3>
            <p className="mx-auto mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              Hai nhóm mục tiêu rõ ràng giúp gia đình tham khảo lộ trình phù hợp từ cấp THPT đến đại học trong nước và quốc tế.
            </p>
          </div>

          <div className="space-y-4 border-t border-slate-100 bg-[#FFFEFA] p-4 sm:p-6">
            <article className="min-w-0 overflow-hidden rounded-[1.75rem] border border-[#D8EEF7] bg-white py-5">
              <div className="flex items-center gap-3 px-5 sm:px-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E8F7FD] text-[#118ED0]">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#118ED0]">Nhóm đại học</p>
                  <h4 className="mt-1 text-lg font-black text-[#10213A]">Trong nước và quốc tế</h4>
                </div>
              </div>

              <div className="outcome-logo-marquee mt-4 py-2" aria-label="Danh sách đại học trong nước và quốc tế">
                <div className="outcome-logo-track">
                  {[...UNIVERSITIES, ...UNIVERSITIES].map((university, index) => (
                    <article
                      key={`${university.shortName}-${index}`}
                      className="outcome-university-card"
                      aria-hidden={index >= UNIVERSITIES.length}
                    >
                      <img src={university.logo} alt={index < UNIVERSITIES.length ? university.name : ''} loading="lazy" />
                      <div>
                        <div className="text-sm font-black text-[#10213A]">{university.shortName}</div>
                        <div className="mt-0.5 max-w-44 text-[11px] font-semibold leading-4 text-slate-500">
                          {university.name}
                        </div>
                      </div>
                      <div className="ml-auto text-right">
                        <div className="text-lg font-black text-[#118ED0]">
                          <AnimatedNumber value={university.students} suffix="+" isVisible={isVisible} />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400">lượt quan tâm</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </article>

            <article className="min-w-0 overflow-hidden rounded-[1.75rem] border border-amber-200/80 bg-[#FFF9E8] py-5">
              <div className="flex items-center gap-3 px-5 sm:px-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A76500] shadow-sm">
                  <BookOpenCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#A76500]">Nhóm THPT</p>
                  <h4 className="mt-1 text-lg font-black text-[#10213A]">Các trường được học viên quan tâm</h4>
                </div>
              </div>

              <div
                className="outcome-logo-marquee outcome-high-school-marquee mt-4 py-2"
                aria-label="Danh sách các trường trung học phổ thông được học viên quan tâm"
              >
                <div className="outcome-logo-track outcome-high-school-track">
                  {[...HIGH_SCHOOLS, ...HIGH_SCHOOLS].map((school, index) => (
                    <article
                      key={`${school.shortName}-${index}`}
                      className="outcome-high-school-card"
                      aria-hidden={index >= HIGH_SCHOOLS.length}
                    >
                      <img src={school.logo} alt={index < HIGH_SCHOOLS.length ? school.name : ''} loading="lazy" />
                      <div className="min-w-0">
                        <div className="text-sm font-black text-[#10213A]">{school.shortName}</div>
                        <div className="mt-1 max-w-52 text-[11px] font-semibold leading-4 text-slate-500">{school.name}</div>
                        <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#A76500]">
                          {school.city}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>
        )}

        <div
          className="outcome-reveal outcome-delay-three mt-7 grid overflow-hidden rounded-[2.25rem] border border-amber-200/70 bg-white shadow-[0_24px_70px_rgba(217,141,0,0.08)] xl:grid-cols-[310px_minmax(0,1fr)]"
          onMouseEnter={() => setIsTestimonialPaused(true)}
          onMouseLeave={() => setIsTestimonialPaused(false)}
          onFocusCapture={() => setIsTestimonialPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsTestimonialPaused(false)
          }}
        >
          <div className="relative flex min-h-80 flex-col justify-between overflow-hidden bg-[#FFC107] p-7 sm:p-9">
            <div className="absolute -right-14 -top-14 h-52 w-52 rounded-full border-[28px] border-white/25" />
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-[#9A6100] shadow-sm">
                <CircleCheckBig className="h-5 w-5" />
              </div>
              <h3 className="mt-7 text-3xl font-black tracking-[-0.04em] text-[#10213A]">
                Trải nghiệm khiến người học muốn tiếp tục.
              </h3>
            </div>

            <div className="relative mt-10 flex items-end justify-between gap-5">
              <div>
                <div className="text-6xl font-black tracking-[-0.06em] text-[#10213A]">
                  <AnimatedNumber value={4.8} decimals={1} isVisible={isVisible} />
                </div>
                <div className="mt-1 flex gap-1 text-[#10213A]" aria-label="4,8 trên 5 sao">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-2 text-sm font-black text-[#6D4A00]">
                  <AnimatedNumber value={18640} suffix="+ đánh giá đã ghi nhận" isVisible={isVisible} />
                </p>
              </div>
              <Award className="h-16 w-16 text-white/75" />
            </div>
          </div>

          <div className="relative flex min-h-80 flex-col justify-between p-6 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#118ED0]">Cảm nhận từ người học</p>
                <h3 className="mt-1 text-xl font-black tracking-[-0.025em] text-[#10213A]">Ba câu chuyện đang được hiển thị</h3>
              </div>
              <a
                href="/lien-he?muc=danh-gia"
                className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-[#10213A] px-4 text-sm font-extrabold text-white transition-colors hover:bg-[#173457] sm:self-auto"
              >
                <Plus className="h-4 w-4" />
                Gửi đánh giá
              </a>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleTestimonials.map((testimonial, index) => (
                <figure
                  key={`${testimonialIndex}-${testimonial.name}`}
                  className={`outcome-testimonial-slide flex min-h-72 flex-col rounded-[1.5rem] border border-slate-200 bg-[#FCFDFE] p-5 ${
                    index === 1 ? 'hidden md:flex' : index === 2 ? 'hidden xl:flex' : ''
                  }`}
                >
                  <Quote className="h-6 w-6 text-[#24B8E6]" />
                  <blockquote className="mt-4 line-clamp-5 text-sm font-semibold leading-6 text-slate-600">
                    “{testimonial.quote}”
                  </blockquote>
                  <figcaption className="mt-auto border-t border-slate-100 pt-4">
                    <div className="font-black text-[#10213A]">{testimonial.name}</div>
                    <div className="mt-1 text-xs font-medium leading-5 text-slate-400">{testimonial.role}</div>
                    <div className="mt-3 inline-flex rounded-lg bg-[#EAF8F3] px-2.5 py-1.5 text-[10px] font-extrabold text-[#14815F]">
                      {testimonial.result}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2" aria-label="Chọn đánh giá">
                {TESTIMONIALS.map((testimonial, index) => (
                  <button
                    key={testimonial.name}
                    type="button"
                    onClick={() => setTestimonialIndex(index)}
                    className={`h-2.5 rounded-full transition-[width,background-color] duration-500 ${
                      index === testimonialIndex ? 'w-8 bg-[#FFC107]' : 'w-2.5 bg-slate-200 hover:bg-slate-300'
                    }`}
                    aria-label={`Xem đánh giá của ${testimonial.name}`}
                    aria-pressed={index === testimonialIndex}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-slate-400">
                  {testimonialIndex + 1}/{TESTIMONIALS.length}
                </span>
                <button
                  type="button"
                  onClick={() => selectTestimonial(-1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-[#FFC107] hover:text-[#A76500]"
                  aria-label="Xem đánh giá trước"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => selectTestimonial(1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#10213A] text-white transition-colors hover:bg-[#173457]"
                  aria-label="Xem đánh giá tiếp theo"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="outcome-reveal outcome-delay-three mt-6 grid gap-4 rounded-[2rem] bg-[#10213A] p-5 text-white sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#FFC107]">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black">Bắt đầu bằng một lộ trình phù hợp, không phải một lời hứa chung chung.</h3>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-300">
                Tra cứu tiến độ đang có hoặc liên hệ để được tư vấn mục tiêu IELTS và học thuật.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href="#tra-cuu"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#FFC107] px-5 text-sm font-extrabold text-[#10213A] transition-colors hover:bg-[#FFD451]"
            >
              Tra cứu tiến độ
            </a>
            <a
              href="/lien-he"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 px-5 text-sm font-extrabold text-white transition-colors hover:bg-white/10"
            >
              Nhận tư vấn
            </a>
          </div>
        </div>

      </div>
    </section>
  )
}
