import { Link, useLocation } from 'react-router-dom'
import { Globe, Phone } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'

const NAV_ITEMS = [
  { to: '/login', label: 'Trang chủ', match: ['/login', '/'] },
  { to: '/chuong-trinh-hoc', label: 'Chương trình học', match: ['/chuong-trinh-hoc'] },
  { to: '/giao-vien', label: 'Giáo viên', match: ['/giao-vien'] },
  { to: '/lien-he', label: 'Liên hệ', match: ['/lien-he'] },
]

export function PublicNav() {
  const location = useLocation()

  return (
    <nav className="shrink-0 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur md:px-12 lg:px-20">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        <Link to="/login" className="flex min-w-0 items-center">
          <Logo className="scale-[0.64] origin-left" />
        </Link>

        <div className="hidden items-center gap-8 text-sm font-semibold text-slate-600 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = item.match.some((path) => location.pathname === path)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`border-b-2 pb-1 transition-colors ${
                  active
                    ? 'border-[#FFC107] text-slate-950'
                    : 'border-transparent hover:border-[#FFC107]/50 hover:text-slate-950'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <a
            href="tel:0906966691"
            className="hidden items-center gap-2 text-sm font-bold text-slate-800 transition-colors hover:text-[#D99B00] sm:flex"
          >
            <Phone className="h-4 w-4 text-[#FFC107]" />
            090.696.6691
          </a>
          <button className="flex items-center gap-1.5 text-xs font-bold text-slate-500 transition-colors hover:text-slate-800">
            <Globe className="h-4 w-4" />
            EN
          </button>
        </div>
      </div>
    </nav>
  )
}
