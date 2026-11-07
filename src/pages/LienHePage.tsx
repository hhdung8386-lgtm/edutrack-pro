import { useState } from 'react'
import {
  ArrowUpRight,
  Clock3,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter, useCompanyInfo } from '@/components/layout/PublicFooter'
import { SiteBlocks } from '@/components/site/SiteBlocks'
import { useSiteContent } from '@/lib/siteContent'
import { normalizeVietnamPhone, submitCustomerLead } from '@/lib/customerLeads'
import { useL } from '@/stores/languageStore'
import { optimizedImage } from '@/lib/optimizedImages'

const ZALO_URL = 'https://zalo.me/0906966691'
const CONSULTING_PHONE = { label: '0933.964.683', href: 'tel:0933964683' }
const ACADEMIC_PHONE = { label: '039.399.8733', href: 'tel:0393998733' }
const OFFICES = [
  'Trụ sở đăng ký: 78/20 Hoàng Văn Hợp, phường An Lạc A, quận Bình Tân, TP.HCM',
  'Văn phòng Bình Tân: 104A đường 32B, phường Bình Trị Đông B, quận Bình Tân',
  'Văn phòng Quận 2: 12 đường số 5, KĐT Sala, phường An Khánh, TP.HCM',
]
const OFFICES_EN = [
  'Registered office: 78/20 Hoàng Văn Hợp Street, An Lạc A Ward, Bình Tân District, Ho Chi Minh City',
  'Bình Tân Office: 104A Street 32B, Bình Trị Đông B Ward, Bình Tân District',
  'District 2 Office: 12 Street No. 5, Sala Urban Area, An Khánh Ward, Ho Chi Minh City',
]
// Giá trị lưu vào Firestore luôn là tiếng Việt để trang admin đọc thống nhất; chỉ nhãn hiển thị đổi theo ngôn ngữ.
const SUBJECT_OPTIONS = [
  { value: 'Tư vấn lộ trình tiếng Anh', en: 'Advice on an English learning path' },
  { value: 'Chương trình dành cho trẻ em', en: 'Programmes for children' },
  { value: 'IELTS và chứng chỉ quốc tế', en: 'IELTS and international certificates' },
  { value: 'Đào tạo cho doanh nghiệp', en: 'Corporate training' },
  { value: 'Hỗ trợ tài khoản và buổi học', en: 'Help with my account or lessons' },
]

export function LienHePage() {
  const L = useL()
  const COMPANY_INFO = useCompanyInfo()
  const [form, setForm] = useState({ name: '', phone: '', subject: '', message: '' })
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { content: siteContent } = useSiteContent('contact')
  const primaryHero = siteContent.blocks.find((block) => block.type === 'hero' && block.enabled)
  const extraBlocks = siteContent.blocks.filter((block) => block.id !== primaryHero?.id)

  const onChange =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    const phone = normalizeVietnamPhone(form.phone)
    if (!form.name.trim()) return setError(L('Vui lòng nhập họ và tên.', 'Please enter your full name.'))
    if (!phone) return setError(L('Số điện thoại chưa đúng, ví dụ: 0912 345 678.', `Please enter a valid Vietnamese mobile number, e.g. 0912 345 678. If you are outside Vietnam, please email ${COMPANY_INFO.representative.email}.`))
    setError('')

    // Thông tin về trang admin "Form khách đăng ký"; nhân viên tự liên hệ lại khách.
    setSubmitting(true)
    const saved = await submitCustomerLead({
      source: 'lien-he',
      name: form.name,
      phone,
      subject: form.subject,
      message: form.message,
    })
    setSubmitting(false)
    if (!saved) return setError(L(`Chưa gửi được thông tin. Vui lòng thử lại hoặc gọi ${CONSULTING_PHONE.label}.`, `We couldn’t send your details. Please try again or call ${CONSULTING_PHONE.label}.`))
    setSent(true)
    setForm({ name: '', phone: '', subject: '', message: '' })
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
                {L(primaryHero?.eyebrow || 'Liên hệ 123English', 'Contact 123English')}
              </span>
              <h1 className="mt-5 text-[clamp(2.6rem,5.4vw,5rem)] font-black leading-[0.98] tracking-[-0.055em]">
                {L(primaryHero?.title || 'Bắt đầu bằng một cuộc trò chuyện rõ ràng.', 'We’re here to help you every step of the way.')}
              </h1>
              <p className="mt-6 max-w-lg text-base font-semibold leading-8 text-slate-600">
                {L(
                  primaryHero?.subtitle ||
                    'Chia sẻ mục tiêu học tập, đội ngũ 123English sẽ cùng bạn xác định lộ trình phù hợp và bước tiếp theo cần thiết.',
                  'If you have a question or would like advice on lessons, the 123English team is happy to help quickly and carefully.',
                )}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={ZALO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#FFC107] px-5 text-sm font-black text-[#10213A] shadow-[0_16px_36px_-20px_rgba(255,193,7,0.85)] transition hover:-translate-y-0.5 hover:bg-[#FFB300]"
                >
                  <MessageCircle className="h-4 w-4" />
                  {L('Tư vấn qua Zalo', 'Chat with us on Zalo')}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                <a
                  href={CONSULTING_PHONE.href}
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black transition hover:-translate-y-0.5 hover:border-[#20B3E5]"
                >
                  <Phone className="h-4 w-4 text-[#0D8FC7]" />
                  {CONSULTING_PHONE.label}
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-5 -top-5 h-28 w-28 rounded-[2rem] bg-[#FFF1B6]" aria-hidden="true" />
              <img
                src={optimizedImage(primaryHero?.image || '/lienhe.png')}
                alt={L('Đội ngũ tư vấn 123English', 'The 123English advisory team')}
                className="relative aspect-[16/10] w-full rounded-[2.25rem] object-cover shadow-[0_32px_80px_-42px_rgba(16,33,58,0.5)]"
              />
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.72fr_1.28fr]">
            <aside className="rounded-[2rem] bg-[#10213A] p-6 text-white sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#FFD344]">{L('Kết nối trực tiếp', 'Get in touch')}</p>
              <h2 className="mt-4 text-2xl font-black leading-tight">{L('Chọn kênh thuận tiện nhất cho bạn.', 'Choose the channel that suits you best.')}</h2>
              <div className="mt-8 grid gap-7">
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C3557] text-[#FFD344]">
                    <Phone className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black">{L('Hotline hỗ trợ', 'Support hotlines')}</p>
                    <a href={ACADEMIC_PHONE.href} className="mt-1 block text-lg font-black text-[#FFD344]">{ACADEMIC_PHONE.label}</a>
                    <p className="text-xs font-semibold text-slate-300">{L('Giáo vụ', 'Academic office')}</p>
                    <a href={CONSULTING_PHONE.href} className="mt-3 block text-lg font-black text-[#FFD344]">{CONSULTING_PHONE.label}</a>
                    <p className="text-xs font-semibold text-slate-300">{L('Tư vấn khóa học', 'Course advice')}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C3557] text-[#68D5F2]">
                    <Mail className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black">{L('Người tiếp nhận', 'Contact person')}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-300">{COMPANY_INFO.representative.name} – {COMPANY_INFO.representative.title}</p>
                    <a href={COMPANY_INFO.representative.phone.href} className="mt-1 block text-lg font-black text-[#FFD344]">{COMPANY_INFO.representative.phone.label}</a>
                    <a href={`mailto:${COMPANY_INFO.representative.email}`} className="mt-1 block break-all text-sm font-semibold text-slate-300 hover:text-white">{COMPANY_INFO.representative.email}</a>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C3557] text-[#68D5F2]">
                    <Clock3 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black">{L('Thời gian hỗ trợ', 'Support hours')}</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-300">{L('Thứ 2 đến Chủ nhật', 'Monday to Sunday')}<br />{L('08:00 - 21:00', '08:00 – 21:00 (Vietnam time, GMT+7)')}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C3557] text-[#FFD344]">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black">{L('Địa chỉ văn phòng', 'Office addresses')}</p>
                    <div className="mt-2 space-y-2">
                      {L(OFFICES, OFFICES_EN).map((office) => <p key={office} className="text-sm font-semibold leading-6 text-slate-300">{office}</p>)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C3557] text-[#64E1BC]">
                    <Globe2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black">{L('Kênh chính thức', 'Official website')}</p>
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
                {L('Thông tin chỉ được sử dụng để đội ngũ 123English hỗ trợ nhu cầu tư vấn của bạn.', 'Your information is only used by the 123English team to respond to your enquiry.')}
              </div>
            </aside>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_28px_70px_-52px_rgba(16,33,58,0.5)] sm:p-8 lg:p-10">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#0D8FC7]">{L('Yêu cầu tư vấn', 'Request advice')}</span>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{L('Bạn đang hướng đến mục tiêu nào?', 'What would you like to achieve?')}</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                {L('Điền thông tin cơ bản, tư vấn viên 123English sẽ liên hệ lại với bạn trong giờ làm việc.', 'Fill in a few details and a 123English advisor will get back to you during working hours.')}
              </p>

              <form onSubmit={submitForm} className="mt-7 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold">
                  {L('Họ và tên', 'Full name')}
                  <input
                    required
                    value={form.name}
                    onChange={onChange('name')}
                    placeholder={L('Nguyễn Minh Anh', 'e.g. Anna Smith')}
                    className="min-h-12 rounded-2xl border border-slate-200 px-4 font-semibold outline-none transition placeholder:text-slate-300 focus:border-[#20B3E5] focus:ring-4 focus:ring-[#20B3E5]/10"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  {L('Số điện thoại', 'Phone number (Vietnam)')}
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
                  {L('Nội dung cần tư vấn', 'What can we help with?')}
                  <select
                    required
                    value={form.subject}
                    onChange={onChange('subject')}
                    className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none transition focus:border-[#20B3E5] focus:ring-4 focus:ring-[#20B3E5]/10"
                  >
                    <option value="">{L('Chọn mục tiêu', 'Choose a topic')}</option>
                    {SUBJECT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{L(option.value, option.en)}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                  {L('Chia sẻ thêm', 'Anything else?')}
                  <textarea
                    value={form.message}
                    onChange={onChange('message')}
                    placeholder={L('Mục tiêu, độ tuổi hoặc thời gian bạn muốn được liên hệ...', 'Your goals, the learner’s age or the best time to contact you...')}
                    rows={4}
                    className="resize-none rounded-2xl border border-slate-200 px-4 py-3 font-semibold leading-6 outline-none transition placeholder:text-slate-300 focus:border-[#20B3E5] focus:ring-4 focus:ring-[#20B3E5]/10"
                  />
                </label>
                {error && (
                  <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 sm:col-span-2">{error}</p>
                )}
                {sent && !error && (
                  <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 sm:col-span-2">
                    {L('Đã gửi thông tin cho 123English. Tư vấn viên sẽ liên hệ lại với bạn trong giờ làm việc.', 'Thank you – your details have been sent to 123English. An advisor will contact you during working hours.')}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#FFC107] px-6 text-sm font-black text-[#10213A] transition hover:-translate-y-0.5 hover:bg-[#FFB300] disabled:opacity-70 sm:col-span-2 sm:w-fit"
                >
                  {submitting ? L('Đang gửi...', 'Sending...') : L('Gửi yêu cầu tư vấn', 'Send request')}
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
