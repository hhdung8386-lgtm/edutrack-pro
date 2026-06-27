import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen,
  ClipboardCheck, BarChart2, Wallet, Settings,
  LogOut, FileText, CalendarClock, CalendarDays
} from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Logo } from '@/components/shared/Logo'

const navItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/students', icon: Users, label: 'Học viên' },
  { to: '/admin/teachers', icon: GraduationCap, label: 'Giáo viên' },
  { to: '/admin/teacher-availability', icon: CalendarDays, label: 'Lịch giáo viên' },
  { to: '/admin/booking-schedules', icon: CalendarClock, label: 'Lịch xếp lớp' },
  { to: '/admin/bookings', icon: CalendarClock, label: 'Yêu cầu giáo viên', bookingBadge: true },
  { to: '/admin/subjects', icon: BookOpen, label: 'Môn học' },
  { to: '/admin/approvals', icon: ClipboardCheck, label: 'Duyệt buổi dạy', hasBadge: true },
  { to: '/admin/reports', icon: BarChart2, label: 'Báo cáo' },
  { to: '/admin/payroll', icon: Wallet, label: 'Lương giáo viên' },
  { to: '/admin/contracts', icon: FileText, label: 'Hợp đồng' },
  { to: '/admin/settings', icon: Settings, label: 'Cài đặt' },
]

export function AdminSidebar({ pendingCount = 0, pendingBookingCount = 0 }: { pendingCount?: number; pendingBookingCount?: number }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Đã đăng xuất')
    navigate('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-slate-50 border-r border-slate-200 flex flex-col z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-200">
        <Logo className="scale-[0.7] origin-left" />
        <div className="mt-2 pl-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Hệ thống quản trị</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group
              ${isActive
                ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-600'}`} />
                <span className="flex-1">{item.label}</span>
                {item.hasBadge && pendingCount > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
                {item.bookingBadge && pendingBookingCount > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {pendingBookingCount > 99 ? '99+' : pendingBookingCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-slate-200">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white transition-colors group">
          <div className="w-8 h-8 bg-indigo-500/20 border border-indigo-500/30 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-indigo-400">
              {user?.email?.[0]?.toUpperCase() || 'A'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-600 truncate">{user?.email}</p>
            <p className="text-[10px] text-slate-500">Quản trị viên</p>
          </div>
          <button
            onClick={handleSignOut}
            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
