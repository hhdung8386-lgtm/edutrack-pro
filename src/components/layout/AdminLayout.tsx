import { Outlet, useLocation } from 'react-router-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, ClipboardCheck, BarChart2, Menu, X, GraduationCap, BookOpen, Wallet, Settings, LogOut } from 'lucide-react'
import { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { signOut } from '@/lib/auth'
import { toast } from '@/stores/toastStore'
import { usePendingCount } from '@/hooks/usePendingCount'

const mobileNavItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/students', icon: Users, label: 'Học viên' },
  { to: '/admin/approvals', icon: ClipboardCheck, label: 'Duyệt', hasBadge: true },
  { to: '/admin/reports', icon: BarChart2, label: 'Báo cáo' },
]

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/students': 'Học viên',
  '/admin/teachers': 'Giáo viên',
  '/admin/subjects': 'Môn học',
  '/admin/approvals': 'Duyệt buổi dạy',
  '/admin/reports': 'Báo cáo',
  '/admin/payroll': 'Lương giáo viên',
  '/admin/settings': 'Cài đặt',
}

export function AdminLayout() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const pendingCount = usePendingCount()
  const pageTitle = Object.entries(PAGE_TITLES).find(([key]) => location.pathname.startsWith(key))?.[1] || 'EduTrack Pro'

  const handleSignOut = async () => {
    await signOut()
    toast.success('Đã đăng xuất')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AdminSidebar />
      </div>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 z-40 gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-100 text-sm">{pageTitle}</span>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="p-2 text-slate-400 hover:text-white"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile sheet overlay */}
      {sheetOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setSheetOpen(false)} />
          <div className="lg:hidden fixed right-0 top-0 bottom-0 w-72 bg-slate-900 border-l border-slate-800 z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <span className="font-semibold text-slate-100">Menu</span>
              <button onClick={() => setSheetOpen(false)} className="p-2 text-slate-400 hover:text-white" aria-label="Đóng menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {[
                { to: '/admin/teachers', icon: GraduationCap, label: 'Giáo viên' },
                { to: '/admin/subjects', icon: BookOpen, label: 'Môn học' },
                { to: '/admin/payroll', icon: Wallet, label: 'Lương giáo viên' },
                { to: '/admin/settings', icon: Settings, label: 'Cài đặt' },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSheetOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors
                    ${isActive ? 'bg-indigo-500/15 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="px-3 py-4 border-t border-slate-800">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-slate-800 w-full transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Đăng xuất
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main content */}
      <main className="lg:pl-64 min-h-screen">
        <div className="pt-14 lg:pt-0 pb-20 lg:pb-0 px-4 sm:px-6 lg:px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-40 safe-area-inset-bottom">
        <div className="grid grid-cols-4 h-14">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium relative
                ${isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <item.icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : ''}`} />
                    {item.hasBadge && pendingCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </div>
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
