import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { PenLine, History, User, GraduationCap, LogOut } from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'

const navItems = [
  { to: '/teacher/attendance', icon: PenLine, label: 'Điểm danh' },
  { to: '/teacher/history', icon: History, label: 'Lịch sử' },
  { to: '/teacher/profile', icon: User, label: 'Hồ sơ' },
]

export function TeacherLayout() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Đã đăng xuất')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop header */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 h-16 bg-slate-50 border-b border-slate-200 items-center px-6 z-30 gap-4">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-4.5 h-4.5 text-slate-900" />
          </div>
          <span className="font-bold text-slate-900">EduTrack Pro</span>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider ml-1">Giáo viên</span>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive ? 'bg-indigo-500/15 text-indigo-400' : 'text-slate-500 hover:text-white hover:bg-white'}`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <span className="text-xs text-slate-500">{user?.email}</span>
          <button
            onClick={handleSignOut}
            className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-slate-50 border-b border-slate-200 flex items-center px-4 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-slate-900" />
          </div>
          <span className="font-semibold text-slate-900 text-sm">EduTrack Pro</span>
        </div>
      </header>

      <main className="min-h-screen">
        <div className="pt-14 lg:pt-16 pb-20 lg:pb-6 px-4 sm:px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-50 border-t border-slate-200 z-40">
        <div className="grid grid-cols-3 h-14">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium relative
                ${isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-600'}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : ''}`} />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-400 rounded-full" />
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
