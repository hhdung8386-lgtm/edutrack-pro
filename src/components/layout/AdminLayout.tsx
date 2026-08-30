import { Outlet, useLocation } from 'react-router-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { CalendarClock, ChevronDown, ClipboardCheck, GraduationCap, LogOut, Menu, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { signOut } from '@/lib/auth'
import { toast } from '@/stores/toastStore'
import { usePendingCount } from '@/hooks/usePendingCount'
import { usePendingBookingCount } from '@/hooks/usePendingBookingCount'

import { useAuthStore } from '@/stores/authStore'
import { NotificationDrawer } from '../shared/NotificationDrawer'
import {
  getVisibleAdminNavigation,
  isAdminNavGroupActive,
  nextOpenAdminNavGroup,
  type AdminNavBadge,
} from './adminNavigation'

const PAGE_TITLES: Record<string, string> = {
  '/admin/students/one-to-one': 'Lớp 1 kèm 1',
  '/admin/students/group': 'Lớp nhóm',
  '/admin/offline-classes': 'Lớp offline',
  '/admin/offline-classes/groups': 'Lớp nhóm offline',
  '/admin/students/fixed': 'Học viên cố định',
  '/admin/students/flexible': 'Học viên linh hoạt',
  '/admin/students': 'Học viên',
  '/admin/student-alerts': 'Cảnh báo học viên',
  '/admin/teachers/online': 'Gia sư online',
  '/admin/teachers/offline': 'Gia sư offline',
  '/admin/teachers/tester': 'Gia sư tester',
  '/admin/teachers/resigned': 'Gia sư nghỉ dạy',
  '/admin/teachers': 'Gia sư',
  '/admin/teacher-availability': 'Lịch gia sư',
  '/admin/booking-schedules': 'Lịch xếp lớp',
  '/admin/online-classrooms': 'Phòng học thử trực tuyến',
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
  '/admin/quota-reconcile': 'Đối soát quỹ buổi',
  '/admin/site-content': 'Nội dung trang web',
  '/admin/notifications': 'Gửi thông báo',
  '/admin/settings': 'Cài đặt',
}

export function AdminLayout() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [mobileOpenGroupId, setMobileOpenGroupId] = useState<string | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('admin_sidebar_collapsed') === 'true')
  const location = useLocation()
  const navigate = useNavigate()
  const pendingCount = usePendingCount()
  const pendingBookingCount = usePendingBookingCount()
  // Không quét toàn bộ lịch sử vắng học trên mọi trang admin chỉ để hiển thị badge.
  // Trang Cảnh báo học viên vẫn tự tải dữ liệu đầy đủ khi người dùng mở trực tiếp.
  const studentAlertCount = 0
  const { user, role, accessScope } = useAuthStore()
  const isBookingAssistant = accessScope === 'booking_only'
  const visibleGroups = useMemo(() => getVisibleAdminNavigation(role, accessScope), [accessScope, role])
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

  const badgeCount = (badge?: AdminNavBadge) => {
    if (badge === 'approvals') return pendingCount
    if (badge === 'bookings') return pendingBookingCount
    if (badge === 'studentAlerts') return studentAlertCount
    return 0
  }

  const openMobileMenu = (groupId?: string) => {
    setMobileOpenGroupId(groupId ?? visibleGroups.find((group) => isAdminNavGroupActive(group, location.pathname))?.id ?? null)
    setSheetOpen(true)
  }

  const mobilePrimaryGroup = isBookingAssistant
    ? visibleGroups.find((group) => group.id === 'schedules')
    : role === 'teacher_manager'
    ? visibleGroups.find((group) => group.id === 'teachers')
    : visibleGroups.find((group) => group.id === 'students')

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AdminSidebar 
          pendingCount={pendingCount} 
          pendingBookingCount={pendingBookingCount} 
          studentAlertCount={studentAlertCount}
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
          {!isBookingAssistant && <NotificationDrawer targetType="managers" targetId={user?.uid || ''} />}
          
          <button
            onClick={() => openMobileMenu()}
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
            <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-4 pb-6">
              {visibleGroups.map((group) => {
                const isOpen = mobileOpenGroupId === group.id
                const isActive = isAdminNavGroupActive(group, location.pathname)
                const groupBadgeCount = group.items.reduce((total, item) => total + badgeCount(item.badge), 0)

                if (group.directTo) {
                  return (
                    <NavLink
                      key={group.id}
                      to={group.directTo}
                      onClick={() => setSheetOpen(false)}
                      className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm font-extrabold transition active:scale-[0.99] ${isActive ? 'border-brand-300 bg-brand-50/60 text-brand-900' : 'border-slate-100 bg-slate-50/70 text-slate-800'}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-100">
                        <group.icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1">{group.label}</span>
                      {groupBadgeCount > 0 && (
                        <span className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                          {groupBadgeCount > 99 ? '99+' : groupBadgeCount}
                        </span>
                      )}
                    </NavLink>
                  )
                }

                return (
                  <section key={group.id} className={`overflow-hidden rounded-2xl border ${isActive ? 'border-brand-300 bg-brand-50/60' : 'border-slate-100 bg-slate-50/70'}`}>
                    <button
                      type="button"
                      onClick={() => setMobileOpenGroupId((current) => nextOpenAdminNavGroup(current, group.id))}
                      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-3 text-left text-sm font-extrabold text-slate-800 active:scale-[0.99]"
                      aria-expanded={isOpen}
                      aria-controls={`mobile-admin-nav-${group.id}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-100">
                        <group.icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1">{group.label}</span>
                      {groupBadgeCount > 0 && (
                        <span className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                          {groupBadgeCount > 99 ? '99+' : groupBadgeCount}
                        </span>
                      )}
                      <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <div id={`mobile-admin-nav-${group.id}`} className={`grid transition-[grid-template-rows,opacity] duration-200 ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="min-h-0">
                        <div className="grid grid-cols-1 gap-1 border-t border-slate-100 p-2 sm:grid-cols-2">
                          {group.items.map((item) => {
                            const count = badgeCount(item.badge)
                            return (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setSheetOpen(false)}
                                className={({ isActive: itemIsActive }) =>
                                  `flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold transition active:scale-[0.99]
                                  ${itemIsActive ? 'bg-brand-100 text-brand-900' : 'bg-white text-slate-600 hover:text-slate-900'}`
                                }
                              >
                                <item.icon className="h-[18px] w-[18px] shrink-0 text-brand-700" />
                                <span className="min-w-0 flex-1">{item.label}</span>
                                {count > 0 && (
                                  <span className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                                    {count > 99 ? '99+' : count}
                                  </span>
                                )}
                              </NavLink>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                )
              })}
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
        <div className={`grid h-16 ${isBookingAssistant ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {isBookingAssistant ? (
            <NavLink
              to="/admin/booking-schedules"
              className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition active:scale-[0.97] ${isActive ? 'text-brand-700' : 'text-slate-500'}`}
            >
              {({ isActive }) => (
                <>
                  <CalendarClock className="h-5 w-5" />
                  <span>Xếp lớp</span>
                  {isActive && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-brand-500" />}
                </>
              )}
            </NavLink>
          ) : (
            <>
              <button
                type="button"
                onClick={() => mobilePrimaryGroup && openMobileMenu(mobilePrimaryGroup.id)}
                className={`relative flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition active:scale-[0.97] ${mobilePrimaryGroup && isAdminNavGroupActive(mobilePrimaryGroup, location.pathname) ? 'text-brand-700' : 'text-slate-500'}`}
              >
                {role === 'teacher_manager' ? <GraduationCap className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                <span>{role === 'teacher_manager' ? 'Gia sư' : 'Học viên'}</span>
                {mobilePrimaryGroup && isAdminNavGroupActive(mobilePrimaryGroup, location.pathname) && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-brand-500" />}
              </button>
              <NavLink
                to="/admin/approvals"
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition active:scale-[0.97] ${isActive ? 'text-brand-700' : 'text-slate-500'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="relative">
                      <ClipboardCheck className={`h-5 w-5 ${isActive ? 'text-brand-600' : ''}`} />
                      {pendingCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                          {pendingCount > 9 ? '9+' : pendingCount}
                        </span>
                      )}
                    </div>
                    <span>Duyệt</span>
                    {isActive && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-brand-500" />}
                  </>
                )}
              </NavLink>
            </>
          )}
          <button
            type="button"
            onClick={() => openMobileMenu()}
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
