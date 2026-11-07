import { ArrowRight, BookOpenCheck, MonitorSmartphone, UserRound, ListChecks } from 'lucide-react'
import { useL } from '@/stores/languageStore'

interface TutoringInfoSectionProps {
  /** Nơi nút "Xem nội dung học thêm" dẫn tới (neo trong trang hoặc đường dẫn). */
  href: string
  className?: string
}

const DETAILS = [
  { Icon: BookOpenCheck, label: 'Môn học', value: 'Tiếng Anh', labelEn: 'Subject', valueEn: 'English' },
  { Icon: MonitorSmartphone, label: 'Hình thức', value: 'Dạy trực tuyến 1 kèm 1', labelEn: 'Format', valueEn: 'Online 1-on-1 tutoring' },
  { Icon: UserRound, label: 'Số lượng', value: '01 gia sư – 01 học viên', labelEn: 'Class size', valueEn: '1 tutor – 1 learner' },
  { Icon: ListChecks, label: 'Nội dung', value: 'Theo nhu cầu học thêm của từng học viên', labelEn: 'Content', valueEn: 'Based on each learner’s needs' },
] as const

/**
 * Khối thông tin "Dạy thêm tiếng Anh 1 kèm 1": nêu rõ môn học, hình thức, số lượng
 * và nội dung để người đọc hiểu ngay dịch vụ 123English đang cung cấp.
 */
export function TutoringInfoSection({ href, className = '' }: TutoringInfoSectionProps) {
  const L = useL()
  return (
    <section
      id="day-them-tieng-anh"
      aria-labelledby="day-them-tieng-anh-title"
      className={`scroll-mt-20 px-5 py-14 sm:px-8 lg:px-12 lg:py-20 ${className}`}
    >
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-[#FFFBEB] via-white to-[#FFF6CF] shadow-[0_28px_70px_-40px_rgba(138,88,0,0.35)]">
        <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:p-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-[#FFC107] px-4 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[#10213A]">
              {L('Dạy thêm 1 kèm 1', '1-on-1 tutoring')}
            </p>
            <h2
              id="day-them-tieng-anh-title"
              className="mt-5 text-3xl font-black uppercase leading-tight tracking-[-0.03em] text-[#10213A] sm:text-4xl lg:text-[2.6rem]"
            >
              {L('Dạy thêm tiếng Anh 1 kèm 1', '1-on-1 English tutoring')}
            </h2>
            <p className="mt-4 text-xl font-black leading-snug text-[#8A5800] sm:text-2xl">
              {L('Học thêm theo đúng phần kiến thức bạn đang cần', 'Extra lessons focused on exactly what you need')}
            </p>
            <p className="mt-6 text-base font-semibold leading-8 text-slate-700 sm:text-lg">
              {L('123English tổ chức dạy thêm tiếng Anh theo hình thức trực tuyến', '123English runs online English tutoring with')}{' '}
              <strong className="font-black text-[#10213A]">{L('1 gia sư – 1 học viên', '1 tutor and 1 learner')}</strong>.
            </p>
            <p className="mt-3 text-base font-semibold leading-8 text-slate-700 sm:text-lg">
              {L('Gia sư căn cứ vào trình độ hiện tại, nội dung học viên cần củng cố và nhu cầu học thêm để lựa chọn nội dung phù hợp cho từng buổi.', 'The tutor chooses the content for each lesson based on the learner’s current level, the areas they need to strengthen and what they want to learn.')}
            </p>
            <a
              href={href}
              className="mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#FFC107] px-7 text-base font-black text-[#10213A] shadow-[0_16px_36px_-18px_rgba(217,141,0,0.7)] transition hover:-translate-y-0.5 hover:bg-[#FFB300] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              {L('Xem nội dung học thêm', 'See lesson content')}
              <ArrowRight className="h-5 w-5" />
            </a>
          </div>

          <dl className="grid content-start gap-4">
            {DETAILS.map(({ Icon, label, value, labelEn, valueEn }) => (
              <div
                key={label}
                className="flex items-start gap-4 rounded-2xl border border-amber-100 bg-white p-5 shadow-[0_12px_28px_-20px_rgba(35,55,80,0.35)]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FFF1B6] text-[#8A5800]">
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <dt className="text-sm font-black uppercase tracking-[0.1em] text-[#A76500]">{L(label, labelEn)}</dt>
                  <dd className="mt-1 text-lg font-black leading-snug text-[#10213A]">{L(value, valueEn)}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
