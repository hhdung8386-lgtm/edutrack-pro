import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { signOut } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Logo } from '@/components/shared/Logo'
import {
  getVisibleAdminNavigation,
  isAdminNavGroupActive,
  nextOpenAdminNavGroup,
  type AdminNavBadge,
} from './adminNavigation'

export function AdminSidebar({ 
  pendingCount = 0, 
  pendingBookingCount = 0,
  studentAlertCount = 0,
  isCollapsed,
  onToggleCollapse
}: { 
  pendingCount?: number; 
  pendingBookingCount?: number;
  studentAlertCount?: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, role, accessScope } = useAuthStore()
  const visibleGroups = useMemo(() => getVisibleAdminNavigation(role, accessScope), [accessScope, role])
  const activeGroup = visibleGroups.find((group) => isAdminNavGroupActive(group, location.pathname))
  const [menuState, setMenuState] = useState<{ pathname: string; openGroupId: string | null }>(() => ({
    pathname: location.pathname,
    openGroupId: activeGroup?.id ?? null,
  }))
  const openGroupId = menuState.pathname === location.pathname
    ? menuState.openGroupId
    : activeGroup?.id ?? null

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

  const toggleGroup = (groupId: string) => {
    if (isCollapsed) {
      setMenuState({ pathname: location.pathname, openGroupId: groupId })
      onToggleCollapse()
      return
    }
    setMenuState({
      pathname: location.pathname,
      openGroupId: nextOpenAdminNavGroup(openGroupId, groupId),
    })
  }

  return (
    <aside className={`fixed left-0 top-0 h-full bg-slate-50 border-r border-slate-200 flex flex-col z-30 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      {/* Logo */}
      <div className={`px-5 py-5 border-b border-slate-200 flex flex-col items-center transition-all ${isCollapsed ? 'px-2' : 'px-5'}`}>
        {isCollapsed ? (
          <div className="w-10 h-10 bg-gradient-to-br from-brand-400 to-brand-500 rounded-xl flex items-center justify-center font-black text-brand-900 shadow-sm shadow-brand-500/30" title="EduTrack Pro">
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
      <nav className={`flex-1 overflow-y-auto py-4 transition-all ${isCollapsed ? 'px-2' : 'px-3'}`}>
        <div className="space-y-1.5">
          {visibleGroups.map((group) => {
            const isOpen = openGroupId === group.id
            const isActive = isAdminNavGroupActive(group, location.pathname)
            const groupBadgeCount = group.items.reduce((total, item) => total + badgeCount(item.badge), 0)

            if (group.directTo) {
              return (
                <section key={group.id} className={isCollapsed ? '' : 'rounded-xl'}>
                  <NavLink
                    to={group.directTo}
                    title={isCollapsed ? group.label : undefined}
                    className={`group relative flex w-full items-center rounded-xl text-sm font-extrabold transition-all duration-150
                      ${isCollapsed ? 'mx-auto h-11 w-11 justify-center p-2.5' : 'gap-3 px-3 py-2.5'}
                      ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}
                  >
                    <group.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-brand-700' : 'text-slate-500 group-hover:text-slate-700'}`} />
                    {!isCollapsed && <span className="flex-1 text-left">{group.label}</span>}
                    {!isCollapsed && groupBadgeCount > 0 && (
                      <span className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                        {groupBadgeCount > 99 ? '99+' : groupBadgeCount}
                      </span>
                    )}
                    {isCollapsed && groupBadgeCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />}
                  </NavLink>
                </section>
              )
            }

            return (
              <section key={group.id} className={isCollapsed ? '' : 'rounded-xl'}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  title={isCollapsed ? group.label : undefined}
                  aria-expanded={isOpen}
                  aria-controls={`admin-nav-${group.id}`}
                  className={`group relative flex w-full items-center rounded-xl text-sm font-extrabold transition-all duration-150
                    ${isCollapsed ? 'mx-auto h-11 w-11 justify-center p-2.5' : 'gap-3 px-3 py-2.5'}
                    ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}
                >
                  <group.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-brand-700' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-left">{group.label}</span>
                      {groupBadgeCount > 0 && (
                        <span className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                          {groupBadgeCount > 99 ? '99+' : groupBadgeCount}
                        </span>
                      )}
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </>
                  )}
                  {isCollapsed && groupBadgeCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </button>

                {!isCollapsed && (
                  <div
                    id={`admin-nav-${group.id}`}
                    className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <div className="min-h-0">
                      <div className="relative ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
                        {group.items.map((item) => {
                          const count = badgeCount(item.badge)
                          return (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              end={item.end}
                              className={({ isActive: itemIsActive }) =>
                                `group relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all duration-150
                                ${itemIsActive ? 'border border-brand-300 bg-brand-100 text-brand-900 shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`
                              }
                            >
                              {({ isActive: itemIsActive }) => (
                                <>
                                  <item.icon className={`h-4 w-4 shrink-0 ${itemIsActive ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600'}`} />
                                  <span className="min-w-0 flex-1">{item.label}</span>
                                  {count > 0 && (
                                    <span className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                                      {count > 99 ? '99+' : count}
                                    </span>
                                  )}
                                </>
                              )}
                            </NavLink>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </nav>

      {/* User footer */}
      <div className={`py-3 border-t border-slate-200 transition-all ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 bg-brand-100 border border-brand-300 rounded-full flex items-center justify-center flex-shrink-0" title={user?.email || undefined}>
              <span className="text-xs font-black text-brand-800">
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
            <div className="w-8 h-8 bg-brand-100 border border-brand-300 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-black text-brand-800">
                {user?.email?.[0]?.toUpperCase() || 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-600 truncate">{user?.email}</p>
              <p className="text-[10px] text-slate-500">
                {accessScope === 'booking_only' ? 'Trợ lý xếp lớp' : role === 'student_manager' ? 'Quản lý Học viên' : role === 'teacher_manager' ? 'Quản lý Gia sư' : 'Quản trị viên'}
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
          className="p-2 text-slate-400 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors w-full flex items-center justify-center gap-2"
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
