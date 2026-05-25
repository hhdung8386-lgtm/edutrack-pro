import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { PenLine, History, User, LogOut, FileText, Globe, Calendar } from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { toast } from '@/stores/toastStore'
import { Logo } from '@/components/shared/Logo'

export function TeacherLayout() {
  const { user } = useAuthStore()
  const { lang, setLang, t } = useLanguageStore()
  const navigate = useNavigate()

  const navItems = [
    { to: '/teacher/attendance', icon: PenLine, labelKey: 'nav.attendance' },
    { to: '/teacher/history', icon: History, labelKey: 'nav.history' },
    { to: '/teacher/contract', icon: FileText, labelKey: 'nav.contract' },
    { to: '/teacher/availability', icon: Calendar, labelKey: 'nav.availability' },
    { to: '/teacher/profile', icon: User, labelKey: 'nav.profile' },
  ]

  const handleSignOut = async () => {
    await signOut()
    toast.success(t('nav.signed_out'))
    navigate('/login')
  }

  const toggleLang = () => setLang(lang === 'vi' ? 'en' : 'vi')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop header */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 items-center px-6 z-30 gap-4 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <Logo className="scale-[0.6] origin-left" />
          <span className="text-xs font-bold text-[#3BB8EB] uppercase tracking-wider border-l border-slate-200 pl-3">{t('nav.teacher')}</span>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${isActive ? 'bg-[#3BB8EB]/10 text-[#3BB8EB]' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`
              }
            >
              <item.icon className="w-4 h-4" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
            title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <Globe className="w-3.5 h-3.5" />
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
          <span className="text-xs text-slate-500 hidden xl:block">{user?.email}</span>
          <button onClick={handleSignOut} className="p-2 text-slate-400 hover:text-rose-500 transition-colors" title={t('nav.signout')}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center px-4 z-40 shadow-sm">
        <div className="flex items-center gap-2.5 flex-1">
          <Logo className="scale-[0.55] origin-left -ml-2" />
        </div>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
        >
          <Globe className="w-3 h-3" />
          {lang === 'vi' ? 'EN' : 'VI'}
        </button>
      </header>

      <main className="min-h-screen">
        <div className="pt-14 lg:pt-16 pb-20 lg:pb-6 px-4 sm:px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="grid grid-cols-5 h-14">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium relative
                ${isActive ? 'text-[#3BB8EB]' : 'text-slate-400 hover:text-slate-600'}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-[#3BB8EB]' : ''}`} />
                  <span>{t(item.labelKey)}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#3BB8EB] rounded-full" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
