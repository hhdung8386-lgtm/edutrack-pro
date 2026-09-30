import { MapPin, Phone } from 'lucide-react'

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
        </div>
      </div>

      <div className="border-t border-slate-100 py-4 text-center text-xs font-medium text-slate-400">
        © 2026 123English. All rights reserved.
      </div>
    </footer>
  )
}
