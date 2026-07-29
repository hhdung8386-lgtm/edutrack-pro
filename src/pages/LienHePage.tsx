import { useState } from 'react'
import {
  ArrowUpRight,
  Clock3,
  Globe2,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { SiteBlocks } from '@/components/site/SiteBlocks'
import { useSiteContent } from '@/lib/siteContent'

const ZALO_URL = 'https://zalo.me/0906966691'
const PHONE_URL = 'tel:0906966691'

export function LienHePage() {
  const [form, setForm] = useState({ name: '', phone: '', subject: '', message: '' })
  const { content: siteContent } = useSiteContent('contact')
  const primaryHero = siteContent.blocks.find((block) => block.type === 'hero' && block.enabled)
  const extraBlocks = siteContent.blocks.filter((block) => block.id !== primaryHero?.id)

  const onChange =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  const openZalo = (event: React.FormEvent) => {
    event.preventDefault()
    window.open(ZALO_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-[#10213A]">
      <PublicNav />

      <main className="flex-1">
        <section className="overflow-hidden border-b border-[#F3E5AE] bg-white px-5 py-12 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#9B6C00]">
                <Sparkles className="h-4 w-4" />
                {primaryHero?.eyebrow || 'Liên hệ 123English'}
              </span>
              <h1 className="mt-5 text-[clamp(2.6rem,5.4vw,5rem)] font-black leading-[0.98] tracking-[-0.055em]">
                {primaryHero?.title || 'Bắt đầu bằng một cuộc trò chuyện rõ ràng.'}
              </h1>
              <p className="mt-6 max-w-lg text-base font-semibold leading-8 text-slate-600">
                {primaryHero?.subtitle ||
                  'Chia sẻ mục tiêu học tập, đội ngũ 123English sẽ cùng bạn xác định lộ trình phù hợp và bước tiếp theo cần thiết.'}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={ZALO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#FFC107] px-5 text-sm font-black text-[#10213A] shadow-[0_16px_36px_-20px_rgba(255,193,7,0.85)] transition hover:-translate-y-0.5 hover:bg-[#FFB300]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Tư vấn qua Zalo
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                <a
                  href={PHONE_URL}
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black transition hover:-translate-y-0.5 hover:border-[#20B3E5]"
                >
                  <Phone className="h-4 w-4 text-[#0D8FC7]" />
                  090.696.6691
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-5 -top-5 h-28 w-28 rounded-[2rem] bg-[#FFF1B6]" aria-hidden="true" />
              <img
                src={primaryHero?.image || '/lienhe.png'}
                alt="Đội ngũ tư vấn 123English"
                className="relative aspect-[16/10] w-full rounded-[2.25rem] object-cover shadow-[0_32px_80px_-42px_rgba(16,33,58,0.5)]"
              />
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.72fr_1.28fr]">
            <aside className="rounded-[2rem] bg-[#10213A] p-6 text-white sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#FFD344]">Kết nối trực tiếp</p>
              <h2 className="mt-4 text-2xl font-black leading-tight">Chọn kênh thuận tiện nhất cho bạn.</h2>
              <div className="mt-8 grid gap-7">
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C3557] text-[#FFD344]">
                    <Phone className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black">Hotline tư vấn</p>
                    <a href={PHONE_URL} className="mt-1 block text-lg font-black text-[#FFD344]">090.696.6691</a>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C3557] text-[#68D5F2]">
                    <Clock3 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black">Thời gian hỗ trợ</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-300">Thứ 2 đến Chủ nhật<br />08:00 - 21:00</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C3557] text-[#64E1BC]">
                    <Globe2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black">Kênh chính thức</p>
                    <a
                      href="https://www.123english.edu.vn"
                      className="mt-1 block text-sm font-semibold text-slate-300 hover:text-white"
                    >
                      www.123english.edu.vn
                    </a>
                  </div>
                </div>
              </div>
              <div className="mt-8 flex items-start gap-3 border-t border-white/10 pt-6 text-xs font-semibold leading-5 text-slate-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#64E1BC]" />
                Thông tin chỉ được sử dụng để đội ngũ 123English hỗ trợ nhu cầu tư vấn của bạn.
              </div>
            </aside>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_28px_70px_-52px_rgba(16,33,58,0.5)] sm:p-8 lg:p-10">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#0D8FC7]">Yêu cầu tư vấn</span>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">Bạn đang hướng đến mục tiêu nào?</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                Điền thông tin cơ bản, sau đó hệ thống sẽ mở kênh Zalo chính thức để bạn trao đổi trực tiếp.
              </p>

              <form onSubmit={openZalo} className="mt-7 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold">
                  Họ và tên
                  <input
                    required
                    value={form.name}
                    onChange={onChange('name')}
                    placeholder="Nguyễn Minh Anh"
                    className="min-h-12 rounded-2xl border border-slate-200 px-4 font-semibold outline-none transition placeholder:text-slate-300 focus:border-[#20B3E5] focus:ring-4 focus:ring-[#20B3E5]/10"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Số điện thoại
                  <input
                    required
                    inputMode="tel"
                    value={form.phone}
                    onChange={onChange('phone')}
                    placeholder="090 000 0000"
                    className="min-h-12 rounded-2xl border border-slate-200 px-4 font-semibold outline-none transition placeholder:text-slate-300 focus:border-[#20B3E5] focus:ring-4 focus:ring-[#20B3E5]/10"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                  Nội dung cần tư vấn
                  <select
                    required
                    value={form.subject}
                    onChange={onChange('subject')}
                    className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none transition focus:border-[#20B3E5] focus:ring-4 focus:ring-[#20B3E5]/10"
                  >
                    <option value="">Chọn mục tiêu</option>
                    <option>Tư vấn lộ trình tiếng Anh</option>
                    <option>Chương trình dành cho trẻ em</option>
                    <option>IELTS và chứng chỉ quốc tế</option>
                    <option>Đào tạo cho doanh nghiệp</option>
                    <option>Hỗ trợ tài khoản và lớp học</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                  Chia sẻ thêm
                  <textarea
                    value={form.message}
                    onChange={onChange('message')}
                    placeholder="Mục tiêu, độ tuổi hoặc thời gian bạn muốn được liên hệ..."
                    rows={4}
                    className="resize-none rounded-2xl border border-slate-200 px-4 py-3 font-semibold leading-6 outline-none transition placeholder:text-slate-300 focus:border-[#20B3E5] focus:ring-4 focus:ring-[#20B3E5]/10"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#FFC107] px-6 text-sm font-black text-[#10213A] transition hover:-translate-y-0.5 hover:bg-[#FFB300] sm:col-span-2 sm:w-fit"
                >
                  Tiếp tục trao đổi qua Zalo
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </section>

        <SiteBlocks blocks={extraBlocks} />
      </main>

      <PublicFooter />
    </div>
  )
}
