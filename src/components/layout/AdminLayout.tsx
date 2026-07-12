import { Outlet, useLocation } from 'react-router-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, ClipboardCheck, Menu, X, GraduationCap, BookOpen, Wallet, Settings, LogOut, CalendarClock, CalendarDays, BarChart2, FileText, Bell } from 'lucide-react'
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
  '/admin/students': 'Học viên',
  '/admin/teachers': 'Giáo viên',
  '/admin/teacher-availability': 'Lịch giáo viên',
  '/admin/booking-schedules': 'Lịch xếp lớp',
  '/admin/future-bookings': 'Lịch học đã đặt',
  '/admin/bookings': 'Yêu cầu giáo viên',
  '/admin/subjects': 'Môn học',
  '/admin/evaluations': 'Đánh giá học viên',
  '/admin/approvals': 'Duyệt buổi dạy',
  '/admin/reports': 'Báo cáo',
  '/admin/payroll': 'Lương giáo viên',
  '/admin/contracts': 'Hợp đồng',
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
    { to: '/admin/students', icon: Users, label: 'Học viên' },
    { to: '/admin/evaluations', icon: ClipboardCheck, label: 'Đánh giá' },
    { to: '/admin/approvals', icon: ClipboardCheck, label: 'Duyệt', hasBadge: true },
    { to: '/admin/bookings', icon: CalendarClock, label: 'Yêu cầu', bookingBadge: true },
  ].filter((item) => {
    if (role === 'student_manager' && (item.to.startsWith('/admin/teachers') || item.to.startsWith('/admin/contracts'))) return false
    if (role === 'teacher_manager' && item.to.startsWith('/admin/students')) return false
    return true
  })

  // Danh sách đồng bộ với AdminSidebar (desktop) — iPad/mobile dùng menu này
  const mobileMenuItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/students', icon: Users, label: 'Học viên' },
    { to: '/admin/teachers', icon: GraduationCap, label: 'Giáo viên' },
    { to: '/admin/teacher-availability', icon: CalendarDays, label: 'Lịch giáo viên' },
    { to: '/admin/booking-schedules', icon: CalendarClock, label: 'Lịch xếp lớp' },
    { to: '/admin/future-bookings', icon: CalendarDays, label: 'Lịch học đã đặt' },
    { to: '/admin/bookings', icon: CalendarClock, label: 'Yêu cầu giáo viên', bookingBadge: true },
    { to: '/admin/subjects', icon: BookOpen, label: 'Môn học' },
    { to: '/admin/evaluations', icon: ClipboardCheck, label: 'Đánh giá học viên' },
    { to: '/admin/approvals', icon: ClipboardCheck, label: 'Duyệt buổi dạy', hasBadge: true },
    { to: '/admin/reports', icon: BarChart2, label: 'Báo cáo' },
    { to: '/admin/payroll', icon: Wallet, label: 'Lương giáo viên' },
    { to: '/admin/contracts', icon: FileText, label: 'Hợp đồng' },
    { to: '/admin/notifications', icon: Bell, label: 'Gửi thông báo' },
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
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white text-xs">
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

      {/* Mobile sheet overlay */}
      {sheetOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setSheetOpen(false)} />
          <div className="lg:hidden fixed right-0 top-0 bottom-0 w-72 bg-slate-50 border-l border-slate-200 z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <span className="font-semibold text-slate-900">Menu</span>
              <button onClick={() => setSheetOpen(false)} className="p-2 text-slate-500 hover:text-slate-900" aria-label="Đóng menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {mobileMenuItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSheetOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors
                    ${isActive ? 'bg-indigo-500/15 text-indigo-400' : 'text-slate-500 hover:text-white hover:bg-white'}`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
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
            <div className="px-3 py-4 border-t border-slate-200">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-slate-500 hover:text-rose-400 hover:bg-white w-full transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Đăng xuất
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main content */}
      <main className={`min-h-screen transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="pt-20 pb-20 lg:pb-6 px-4 sm:px-6 lg:px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-50 border-t border-slate-200 z-40 safe-area-inset-bottom">
        <div className="grid grid-cols-4 h-14">
          {mobileNavItems.map((item) => (
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
                  <div className="relative">
                    <item.icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : ''}`} />
                    {item.hasBadge && pendingCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                    {item.bookingBadge && pendingBookingCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {pendingBookingCount > 9 ? '9+' : pendingBookingCount}
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
