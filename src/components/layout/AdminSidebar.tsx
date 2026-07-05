import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen,
  ClipboardCheck, BarChart2, Wallet, Settings,
  LogOut, FileText, CalendarClock, CalendarDays,
  ChevronLeft, ChevronRight
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
  { to: '/admin/evaluations', icon: ClipboardCheck, label: 'Đánh giá học viên' },
  { to: '/admin/approvals', icon: ClipboardCheck, label: 'Duyệt buổi dạy', hasBadge: true },
  { to: '/admin/reports', icon: BarChart2, label: 'Báo cáo' },
  { to: '/admin/payroll', icon: Wallet, label: 'Lương giáo viên' },
  { to: '/admin/contracts', icon: FileText, label: 'Hợp đồng' },
  { to: '/admin/settings', icon: Settings, label: 'Cài đặt' },
]

export function AdminSidebar({ 
  pendingCount = 0, 
  pendingBookingCount = 0,
  isCollapsed,
  onToggleCollapse
}: { 
  pendingCount?: number; 
  pendingBookingCount?: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const navigate = useNavigate()
  const { user, role } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Đã đăng xuất')
    navigate('/login')
  }

  const filteredNavItems = navItems.filter((item) => {
    if (role === 'student_manager' && (item.to.startsWith('/admin/teachers') || item.to.startsWith('/admin/contracts'))) return false
    if (role === 'teacher_manager' && item.to.startsWith('/admin/students')) return false
    return true
  })

  return (
    <aside className={`fixed left-0 top-0 h-full bg-slate-50 border-r border-slate-200 flex flex-col z-30 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      {/* Logo */}
      <div className={`px-5 py-5 border-b border-slate-200 flex flex-col items-center transition-all ${isCollapsed ? 'px-2' : 'px-5'}`}>
        {isCollapsed ? (
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center font-bold text-white shadow-sm shadow-indigo-500/20" title="EduTrack Pro">
            ET
          </div>
        ) : (
          <>
            <Logo className="h-12 w-auto max-w-[190px]" />
            <div className="mt-2 pl-2 w-full">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Hệ thống quản trị</span>
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-4 overflow-y-auto space-y-1 transition-all ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={isCollapsed ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-lg text-sm font-medium transition-all duration-150 group relative
              ${isCollapsed ? 'justify-center p-2.5 mx-auto w-11 h-11' : 'gap-3 px-3 py-2.5 mx-1'}
              ${isActive
                ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-600'}`} />
                {!isCollapsed && <span className="flex-1">{item.label}</span>}
                {isCollapsed ? (
                  ((item.hasBadge && pendingCount > 0) || (item.bookingBadge && pendingBookingCount > 0)) && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
                  )
                ) : (
                  <>
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
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className={`py-3 border-t border-slate-200 transition-all ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/20 border border-indigo-500/30 rounded-full flex items-center justify-center flex-shrink-0" title={user?.email || undefined}>
              <span className="text-xs font-bold text-indigo-400">
                {user?.email?.[0]?.toUpperCase() || 'A'}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white transition-colors group">
            <div className="w-8 h-8 bg-indigo-500/20 border border-indigo-500/30 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-indigo-400">
                {user?.email?.[0]?.toUpperCase() || 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-600 truncate">{user?.email}</p>
              <p className="text-[10px] text-slate-500">
                {role === 'student_manager' ? 'Quản lý Học viên' : role === 'teacher_manager' ? 'Quản lý Giáo viên' : 'Quản trị viên'}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Collapse toggle button */}
      <div className="px-3 py-2 border-t border-slate-200 flex justify-center">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/50 rounded-lg transition-colors w-full flex items-center justify-center gap-2"
          title={isCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-xs font-semibold">Thu gọn menu</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
