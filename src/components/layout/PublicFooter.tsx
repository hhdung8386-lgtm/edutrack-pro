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
    <footer className="w-full border-t border-slate-100 bg-white text-[#10213A]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:px-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9B6C00]">Thông tin đơn vị</p>
          <img src="/brand-logo.png" alt="123English" className="mt-3 h-10 w-auto" />
          <p className="mt-3 text-base font-black leading-snug text-[#10213A]">{COMPANY_INFO.brandLine}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Đơn vị chủ quản: <span className="font-black text-[#10213A]">{COMPANY_INFO.owner}</span>
            <br />
            Mã số hộ kinh doanh: <span className="font-black text-[#10213A]">{COMPANY_INFO.businessCode}</span>
          </p>

          <div className="mt-6 space-y-5 text-[15px]">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#0D8FC7]" />
              <div>
                <p className="font-black">Trụ sở đăng ký</p>
                <p className="mt-1 font-semibold leading-6 text-slate-600">{COMPANY_INFO.registeredOffice}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#0D8FC7]" />
              <div className="space-y-3">
                <p className="font-black">Văn phòng đại diện</p>
                {COMPANY_INFO.offices.map((office) => (
                  <div key={office.name}>
                    <p className="font-black">{office.name}:</p>
                    <p className="mt-0.5 font-semibold leading-6 text-slate-600">{office.address}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="text-sm">
          <p className="text-base font-black text-[#0D8FC7]">Liên hệ</p>
          <div className="mt-4 space-y-3">
            <a href={COMPANY_INFO.academicPhone.href} className="flex items-center gap-3 font-black hover:text-[#0D8FC7]">
              <Phone className="h-5 w-5 shrink-0 text-[#0D8FC7]" />
              <span>
                Giáo vụ: {COMPANY_INFO.academicPhone.label}
              </span>
            </a>
            <a href={COMPANY_INFO.consultingPhone.href} className="flex items-center gap-3 font-black hover:text-[#0D8FC7]">
              <Phone className="h-5 w-5 shrink-0 text-[#0D8FC7]" />
              <span>
                Tư vấn khóa học: {COMPANY_INFO.consultingPhone.label}
              </span>
            </a>
          </div>

          <nav aria-label="Mạng xã hội 123English" className="mt-7">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Theo dõi 123English</p>
            <div className="mt-3 flex items-center gap-3">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`123English trên ${social.label}`}
                  title={social.label}
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 ${social.className}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
                    <path d={social.path} />
                  </svg>
                  <span className="sr-only">{social.label}</span>
                </a>
              ))}
            </div>
          </nav>
        </div>
      </div>

      <div className="border-t border-slate-100 py-4 text-center text-xs font-medium text-slate-400">
        © 2026 123English. All rights reserved.
      </div>
    </footer>
  )
}
