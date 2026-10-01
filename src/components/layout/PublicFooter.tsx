import { MapPin, Phone } from 'lucide-react'

// Shared by public contact forms that must display the same company details.
// eslint-disable-next-line react-refresh/only-export-components
export const COMPANY_INFO = {
  brandLine: '123English – Nền tảng gia sư tiếng Anh trực tuyến 1 kèm 1',
  owner: 'Gia Sư Toàn Năng',
  businessCode: '079196005873',
  registeredOffice: '78/20 Hoàng Văn Hợp, Phường An Lạc A, Quận Bình Tân, Thành phố Hồ Chí Minh, Việt Nam.',
  offices: [
    { name: 'Văn phòng Bình Tân', address: '104A Đường 32B, Phường Bình Trị Đông B, Quận Bình Tân, TP.HCM.' },
    { name: 'Văn phòng Quận 2', address: '12 Đường số 5, KĐT Sala, Phường An Khánh, TP.HCM.' },
  ],
  academicPhone: { label: '039.399.8733', href: 'tel:0393998733' },
  consultingPhone: { label: '0933.964.683', href: 'tel:0933964683' },
}

const SOCIAL_LINKS = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/123englishinvietnam',
    className: 'bg-[#0866FF] hover:bg-[#075BD8] focus-visible:ring-blue-200',
    path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@123english_vietnam',
    className: 'bg-[#FF0000] hover:bg-[#D90000] focus-visible:ring-red-200',
    path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@123english.vietnam',
    className: 'bg-[#111111] hover:bg-black focus-visible:ring-slate-300',
    path: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
] as const

export function PublicFooter() {
  return (
    <footer className="w-full border-t border-slate-200/70 bg-white px-[clamp(1.25rem,3vw,3rem)] font-[var(--font-quicksand)] text-[#10213A]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 py-10 sm:grid-cols-2 sm:gap-x-10 sm:py-12 lg:grid-cols-[1.05fr_1.25fr_0.8fr] lg:gap-x-12 lg:py-14">
        <section aria-labelledby="footer-company-title" className="min-w-0">
          <h2 id="footer-company-title" className="text-sm font-bold leading-6 text-[#10213A]">Thông tin đơn vị</h2>
          <img src="/brand-logo.png" alt="123English" className="mt-5 h-10 w-auto" width={156} height={40} loading="lazy" />
          <p className="mt-4 max-w-md text-balance text-[15px] font-bold leading-6">{COMPANY_INFO.brandLine}</p>
          <dl className="mt-5 space-y-3 text-sm leading-6">
            <div>
              <dt className="font-medium text-slate-500">Đơn vị chủ quản</dt>
              <dd className="font-bold">{COMPANY_INFO.owner}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Mã số hộ kinh doanh</dt>
              <dd className="font-semibold tabular-nums">{COMPANY_INFO.businessCode}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="footer-address-title" className="min-w-0 border-t border-slate-200/70 pt-7 sm:row-span-2 sm:border-0 sm:pt-0 lg:row-span-1">
          <h2 id="footer-address-title" className="text-sm font-bold leading-6">Địa chỉ</h2>
          <div className="mt-5 space-y-5 text-sm">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#0D8FC7]" />
              <div>
                <h3 className="font-bold leading-6">Trụ sở đăng ký</h3>
                <p className="mt-1 font-medium leading-6 text-slate-600">{COMPANY_INFO.registeredOffice}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#0D8FC7]" />
              <div className="space-y-3">
                <h3 className="font-bold leading-6">Văn phòng đại diện</h3>
                {COMPANY_INFO.offices.map((office) => (
                  <div key={office.name}>
                    <p className="font-semibold leading-6">{office.name}</p>
                    <p className="mt-0.5 font-medium leading-6 text-slate-600">{office.address}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="footer-contact-title" className="min-w-0 border-t border-slate-200/70 pt-7 text-sm sm:col-start-1 sm:row-start-2 sm:border-0 sm:pt-0 lg:col-start-auto lg:row-start-auto">
          <h2 id="footer-contact-title" className="text-sm font-bold leading-6">Liên hệ</h2>
          <div className="mt-5 space-y-4">
            <a href={COMPANY_INFO.academicPhone.href} className="group flex min-h-12 items-start gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0D8FC7]">
              <Phone className="mt-1 h-5 w-5 shrink-0 text-[#0D8FC7]" />
              <span className="leading-6">
                <span className="block font-medium text-slate-500">Giáo vụ</span>
                <span className="block text-base font-bold tabular-nums transition-colors group-hover:text-[#0D8FC7]">{COMPANY_INFO.academicPhone.label}</span>
              </span>
            </a>
            <a href={COMPANY_INFO.consultingPhone.href} className="group flex min-h-12 items-start gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0D8FC7]">
              <Phone className="mt-1 h-5 w-5 shrink-0 text-[#0D8FC7]" />
              <span className="leading-6">
                <span className="block font-medium text-slate-500">Tư vấn học thêm</span>
                <span className="block text-base font-bold tabular-nums transition-colors group-hover:text-[#0D8FC7]">{COMPANY_INFO.consultingPhone.label}</span>
              </span>
            </a>
          </div>

          <nav aria-label="Mạng xã hội 123English" className="mt-7">
            <h3 className="font-bold leading-6">Theo dõi 123English</h3>
            <div className="mt-3 flex items-center gap-3">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`123English trên ${social.label}`}
                  title={social.label}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-white transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 ${social.className}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
                    <path d={social.path} />
                  </svg>
                  <span className="sr-only">{social.label}</span>
                </a>
              ))}
            </div>
          </nav>
        </section>
      </div>

      <div className="mx-auto w-full max-w-7xl border-t border-slate-200/70 py-5 text-center text-xs font-medium leading-5 text-slate-500 sm:text-left">
        © 2026 123English. All rights reserved.
      </div>
    </footer>
  )
}
