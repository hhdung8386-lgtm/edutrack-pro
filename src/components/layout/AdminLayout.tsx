import { Outlet, useLocation } from 'react-router-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, ClipboardCheck, Menu, X, GraduationCap, BookOpen, Wallet, Settings, LogOut, CalendarClock, CalendarDays, CalendarCheck2, CalendarRange, BarChart2, FileText, Bell, Gift, MonitorUp, MapPin, TestTube2, AlertCircle, Calculator, LayoutTemplate } from 'lucide-react'
import { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { signOut } from '@/lib/auth'
import { toast } from '@/stores/toastStore'
import { usePendingCount } from '@/hooks/usePendingCount'
import { usePendingBookingCount } from '@/hooks/usePendingBookingCount'

import { useAuthStore } from '@/stores/authStore'
import { NotificationDrawer } from '../shared/NotificationDrawer'

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/students/fixed': 'Học viên cố định',
  '/admin/students/flexible': 'Học viên linh hoạt',
  '/admin/students': 'Học viên',
  '/admin/teachers/online': 'Gia sư online',
  '/admin/teachers/offline': 'Gia sư offline',
  '/admin/teachers/tester': 'Gia sư tester',
  '/admin/teachers': 'Gia sư',
  '/admin/teacher-availability': 'Lịch gia sư',
  '/admin/booking-schedules': 'Lịch xếp lớp',
  '/admin/future-bookings': 'Lịch học đã đặt',
  '/admin/overdue-bookings': 'Ca học quá hạn',
  '/admin/bookings': 'Yêu cầu gia sư',
  '/admin/subjects': 'Môn học',
  '/admin/evaluations': 'Đánh giá học viên',
  '/admin/approvals': 'Duyệt buổi dạy',
  '/admin/reports': 'Báo cáo',
  '/admin/payroll': 'Lương gia sư',
  '/admin/contracts': 'Hợp đồng',
  '/admin/student-experience': 'Quà tặng & nạp tiền',
  '/admin/settings': 'Cài đặt',
}

export function AdminLayout() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('admin_sidebar_collapsed') === 'true')
  const location = useLocation()
  const navigate = useNavigate()
  const pendingCount = usePendingCount()
  const pendingBookingCount = usePendingBookingCount()
  const { user, role } = useAuthStore()
  const pageTitle = Object.entries(PAGE_TITLES).find(([key]) => location.pathname.startsWith(key))?.[1] || 'EduTrack Pro'

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('admin_sidebar_collapsed', String(next))
      return next
    })
  }

  const handleSignOut = async () => {
    await signOut()
    toast.success('Đã đăng xuất')
    navigate('/login')
  }

  const mobileNavItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    role === 'teacher_manager'
      ? { to: '/admin/teachers/online', icon: GraduationCap, label: 'Gia sư' }
      : { to: '/admin/students', icon: Users, label: 'Học viên' },
    { to: '/admin/approvals', icon: ClipboardCheck, label: 'Duyệt', hasBadge: true },
  ]

  // Danh sách đồng bộ với AdminSidebar (desktop) — iPad/mobile dùng menu này
  const mobileMenuItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/students', icon: Users, label: 'Học viên' },
    { to: '/admin/students/fixed', icon: CalendarCheck2, label: 'Học viên cố định' },
    { to: '/admin/students/flexible', icon: CalendarRange, label: 'Học viên linh hoạt' },
    { to: '/admin/teachers/online', icon: MonitorUp, label: 'Gia sư online' },
    { to: '/admin/teachers/offline', icon: MapPin, label: 'Gia sư offline' },
    { to: '/admin/teachers/tester', icon: TestTube2, label: 'Gia sư tester' },
    { to: '/admin/teacher-availability', icon: CalendarDays, label: 'Lịch gia sư' },
    { to: '/admin/booking-schedules', icon: CalendarClock, label: 'Lịch xếp lớp' },
    { to: '/admin/future-bookings', icon: CalendarDays, label: 'Lịch học đã đặt' },
    { to: '/admin/overdue-bookings', icon: AlertCircle, label: 'Ca học quá hạn' },
    { to: '/admin/quota-reconcile', icon: Calculator, label: 'Đối soát quỹ buổi' },
    { to: '/admin/bookings', icon: CalendarClock, label: 'Yêu cầu gia sư', bookingBadge: true },
    { to: '/admin/subjects', icon: BookOpen, label: 'Môn học' },
    { to: '/admin/evaluations', icon: ClipboardCheck, label: 'Đánh giá học viên' },
    { to: '/admin/approvals', icon: ClipboardCheck, label: 'Duyệt buổi dạy', hasBadge: true },
    { to: '/admin/reports', icon: BarChart2, label: 'Báo cáo' },
    { to: '/admin/payroll', icon: Wallet, label: 'Lương gia sư' },
    { to: '/admin/contracts', icon: FileText, label: 'Hợp đồng' },
    { to: '/admin/notifications', icon: Bell, label: 'Gửi thông báo' },
    { to: '/admin/student-experience', icon: Gift, label: 'Quà & nạp tiền' },
    { to: '/admin/site-content', icon: LayoutTemplate, label: 'Nội dung trang web' },
    { to: '/admin/settings', icon: Settings, label: 'Cài đặt' },
  ].filter((item) => {
    if (role === 'student_manager' && (item.to.startsWith('/admin/teachers') || item.to.startsWith('/admin/contracts'))) return false
    if (role === 'teacher_manager' && item.to.startsWith('/admin/students')) return false
    return true
  })

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AdminSidebar 
          pendingCount={pendingCount} 
          pendingBookingCount={pendingBookingCount} 
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
      </div>

      {/* Unified Top Header Bar */}
      <header className={`fixed top-0 right-0 left-0 ${isSidebarCollapsed ? 'lg:left-20' : 'lg:left-64'} h-14 bg-white border-b border-slate-200/80 flex items-center justify-between px-6 z-40 transition-all duration-300`}>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-slate-800 text-sm hidden lg:inline-block">{pageTitle}</span>
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-400 to-brand-500 rounded-lg flex items-center justify-center font-black text-brand-900 text-xs">
              ET
            </div>
            <span className="font-bold text-slate-800 text-sm">{pageTitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Notifications bell drawer */}
          <NotificationDrawer targetType="managers" targetId={user?.uid || ''} />
          
          <button
            onClick={() => setSheetOpen(true)}
            className="lg:hidden p-2 text-slate-500 hover:text-slate-900"
            aria-label="Mở menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile all-features sheet */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] lg:hidden" onClick={() => setSheetOpen(false)} />
          <section className="fixed inset-x-0 bottom-0 z-50 flex max-h-[84dvh] flex-col rounded-t-[28px] border-t border-brand-200 bg-white shadow-[0_-24px_70px_-30px_rgba(15,23,42,0.45)] lg:hidden" aria-label="Tất cả chức năng quản trị">
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-center justify-between border-b border-slate-100 px-5 pb-4 pt-3">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="123English" className="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-100" />
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-slate-950">Tất cả chức năng</h2>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Chọn mục cần quản lý</p>
                </div>
              </div>
              <button onClick={() => setSheetOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 active:scale-[0.97]" aria-label="Đóng menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto px-4 py-4 pb-6">
              {mobileMenuItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSheetOpen(false)}
                  className={({ isActive }) =>
                    `relative flex min-h-[68px] items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-bold transition active:scale-[0.98]
                    ${isActive ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-100 bg-slate-50/70 text-slate-700 hover:border-brand-200 hover:bg-brand-50/70'}`
                  }
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-100">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 leading-5">{item.label}</span>
                  {item.bookingBadge && pendingBookingCount > 0 && (
                    <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {pendingBookingCount > 99 ? '99+' : pendingBookingCount}
                    </span>
                  )}
                  {item.hasBadge && pendingCount > 0 && (
                    <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-100 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button
                onClick={handleSignOut}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-600 transition hover:bg-rose-50 hover:text-rose-600 active:scale-[0.98]"
              >
                <LogOut className="w-5 h-5" />
                Đăng xuất
              </button>
            </div>
          </section>
        </>
      )}

      {/* Main content */}
      <main className={`min-h-screen transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="pt-20 pb-20 lg:pb-6 px-4 sm:px-6 lg:px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid h-16 grid-cols-4">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition active:scale-[0.97]
                ${isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-700'}`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <item.icon className={`h-5 w-5 ${isActive ? 'text-brand-600' : ''}`} />
                    {item.hasBadge && pendingCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </div>
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-brand-500" />
                  )}
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="relative flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-500 transition hover:text-slate-700 active:scale-[0.97]"
            aria-label="Mở tất cả chức năng"
          >
            <Menu className="h-5 w-5" />
            <span>Menu</span>
            {(pendingBookingCount > 0) && <span className="absolute left-1/2 top-2.5 ml-3 h-2 w-2 rounded-full bg-amber-500" />}
          </button>
        </div>
      </nav>
    </div>
  )
}
