import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Globe, Menu, Phone, X } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'

const NAV_ITEMS = [
  { to: '/login', label: 'Trang chủ', match: ['/login', '/'] },
  { to: '/chuong-trinh-hoc', label: 'Chương trình học', match: ['/chuong-trinh-hoc'] },
  { to: '/giao-vien', label: 'Gia sư', match: ['/giao-vien'] },
  { to: '/bai-viet', label: 'Bài viết', match: ['/bai-viet'] },
  { to: '/lien-he', label: 'Liên hệ', match: ['/lien-he'] },
]

function isNavItemActive(pathname: string, match: string[]) {
  return match.some((path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`)))
}

export function PublicNav() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!mobileMenuOpen) return undefined

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileMenuOpen])

  return (
    <nav className="relative z-50 shrink-0 border-b border-slate-100 bg-white/95 px-5 py-3 backdrop-blur sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        <Link to="/login" className="flex min-w-0 items-center">
          <Logo className="h-10 w-auto max-w-[160px] sm:h-11 sm:max-w-[176px]" clickable={false} />
        </Link>

        <div className="hidden items-center gap-8 text-sm font-semibold text-slate-600 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(location.pathname, item.match)
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

        <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
          <a
            href="tel:0906966691"
            className="hidden items-center gap-2 text-sm font-bold text-slate-800 transition-colors hover:text-[#D99B00] sm:flex"
          >
            <Phone className="h-4 w-4 text-[#FFC107]" />
            090.696.6691
          </a>
          <button
            type="button"
            className="flex h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            aria-label="Chuyển ngôn ngữ"
          >
            <Globe className="h-4 w-4" />
            EN
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:border-[#FFC107] hover:bg-amber-50 lg:hidden"
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="public-mobile-menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div
        id="public-mobile-menu"
        className={`absolute inset-x-0 top-full border-b border-slate-200 bg-white shadow-[0_18px_36px_rgba(15,23,42,0.12)] transition-[opacity,transform,visibility] duration-200 lg:hidden ${
          mobileMenuOpen
            ? 'visible translate-y-0 opacity-100'
            : 'invisible -translate-y-2 opacity-0'
        }`}
      >
        <div className="mx-auto max-w-7xl space-y-1 px-5 py-4 sm:px-8">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(location.pathname, item.match)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex min-h-11 items-center justify-between rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                  active
                    ? 'bg-amber-50 text-slate-950 ring-1 ring-amber-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                {item.label}
                {active && <span className="h-2 w-2 rounded-full bg-[#FFC107]" aria-hidden="true" />}
              </Link>
            )
          })}
          <a
            href="tel:0906966691"
            className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-800"
          >
            <Phone className="h-4 w-4 text-[#D99B00]" />
            090.696.6691
          </a>
        </div>
      </div>
    </nav>
  )
}
