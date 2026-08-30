import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  AlertTriangle,
  BarChart2,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  FileText,
  Gift,
  GraduationCap,
  LayoutTemplate,
  MapPin,
  MonitorUp,
  Settings,
  TestTube2,
  UserX,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'

export type AdminNavBadge = 'approvals' | 'bookings' | 'studentAlerts'

export interface AdminNavItem {
  to: string
  icon: LucideIcon
  label: string
  end?: boolean
  badge?: AdminNavBadge
}

export interface AdminNavGroup {
  id: string
  label: string
  icon: LucideIcon
  activePrefixes: string[]
  activePaths?: string[]
  directTo?: string
  items: AdminNavItem[]
}

export const adminNavigationGroups: AdminNavGroup[] = [
  {
    id: 'students',
    label: 'Lớp online',
    icon: Users,
    activePrefixes: ['/admin/students/fixed', '/admin/students/flexible', '/admin/students/one-to-one', '/admin/students/group'],
    activePaths: ['/admin/students'],
    items: [
      { to: '/admin/students/fixed', icon: CalendarCheck2, label: 'Học viên cố định' },
      { to: '/admin/students/flexible', icon: CalendarRange, label: 'Học viên linh hoạt' },
      { to: '/admin/students/group', icon: UsersRound, label: 'Lớp nhóm' },
    ],
  },
  {
    id: 'offline-classes',
    label: 'Lớp offline',
    icon: MapPin,
    activePrefixes: ['/admin/offline-classes'],
    items: [
      { to: '/admin/offline-classes', icon: MapPin, label: 'Học viên offline', end: true },
      { to: '/admin/offline-classes/groups', icon: UsersRound, label: 'Lớp nhóm offline' },
    ],
  },
  {
    id: 'teachers',
    label: 'Gia sư',
    icon: GraduationCap,
    activePrefixes: ['/admin/teachers'],
    items: [
      { to: '/admin/teachers/online', icon: MonitorUp, label: 'Gia sư online' },
      { to: '/admin/teachers/offline', icon: MapPin, label: 'Gia sư offline' },
      { to: '/admin/teachers/tester', icon: TestTube2, label: 'Gia sư tester' },
      { to: '/admin/teachers/resigned', icon: UserX, label: 'Gia sư nghỉ dạy' },
    ],
  },
  {
    id: 'schedules',
    label: 'Lịch học',
    icon: CalendarDays,
    activePrefixes: [
      '/admin/teacher-availability',
      '/admin/booking-schedules',
      '/admin/online-classrooms',
      '/admin/future-bookings',
      '/admin/bookings',
    ],
    items: [
      { to: '/admin/teacher-availability', icon: CalendarDays, label: 'Lịch gia sư' },
      { to: '/admin/booking-schedules', icon: CalendarClock, label: 'Lịch xếp lớp' },
      { to: '/admin/online-classrooms', icon: MonitorUp, label: 'Phòng học thử' },
      { to: '/admin/future-bookings', icon: CalendarDays, label: 'Lịch học đã đặt' },
      { to: '/admin/bookings', icon: CalendarClock, label: 'Yêu cầu gia sư', badge: 'bookings' },
    ],
  },
  {
    id: 'courses',
    label: 'Khóa học',
    icon: BookOpen,
    activePrefixes: ['/admin/subjects', '/admin/site-content'],
    items: [
      { to: '/admin/subjects', icon: BookOpen, label: 'Môn học' },
      { to: '/admin/site-content', icon: LayoutTemplate, label: 'Nội dung trang web' },
    ],
  },
  {
    id: 'accounting',
    label: 'Kế toán',
    icon: Calculator,
    activePrefixes: [
      '/admin/evaluations',
      '/admin/student-alerts',
      '/admin/quota-reconcile',
      '/admin/student-experience',
      '/admin/payroll',
      '/admin/contracts',
      '/admin/overdue-bookings',
      '/admin/approvals',
    ],
    items: [
      { to: '/admin/evaluations', icon: ClipboardCheck, label: 'Đánh giá học viên' },
      { to: '/admin/student-alerts', icon: AlertTriangle, label: 'Cảnh báo học viên', badge: 'studentAlerts' },
      { to: '/admin/overdue-bookings', icon: AlertCircle, label: 'Ca học quá hạn' },
      { to: '/admin/approvals', icon: ClipboardCheck, label: 'Duyệt buổi dạy', badge: 'approvals' },
      { to: '/admin/quota-reconcile', icon: Calculator, label: 'Đối soát quỹ buổi' },
      { to: '/admin/student-experience', icon: Gift, label: 'Quà & nạp tiền' },
      { to: '/admin/payroll', icon: Wallet, label: 'Lương gia sư' },
      { to: '/admin/contracts', icon: FileText, label: 'Hợp đồng' },
    ],
  },
  {
    id: 'management',
    label: 'Quản trị',
    icon: BriefcaseBusiness,
    activePrefixes: ['/admin/reports', '/admin/notifications', '/admin/settings'],
    items: [
      { to: '/admin/reports', icon: BarChart2, label: 'Báo cáo' },
      { to: '/admin/notifications', icon: Bell, label: 'Gửi thông báo' },
      { to: '/admin/settings', icon: Settings, label: 'Cài đặt' },
    ],
  },
]

export function canAccessAdminNavItem(
  item: AdminNavItem,
  role: string | null | undefined,
  accessScope?: string | null,
) {
  if (accessScope === 'booking_only') return item.to === '/admin/booking-schedules'
  if (item.to === '/admin/notifications' && role !== 'admin') return false
  if (item.to === '/admin/online-classrooms' && role !== 'admin') return false
  if (role === 'student_manager' && (item.to.startsWith('/admin/teachers') || item.to.startsWith('/admin/contracts'))) return false
  if (role === 'teacher_manager' && (item.to.startsWith('/admin/students') || item.to.startsWith('/admin/offline-classes') || item.to.startsWith('/admin/student-alerts'))) return false
  return true
}

export function getVisibleAdminNavigation(role: string | null | undefined, accessScope?: string | null) {
  return adminNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessAdminNavItem(item, role, accessScope)),
    }))
    .filter((group) => group.items.length > 0)
}

export function isAdminNavGroupActive(group: AdminNavGroup, pathname: string) {
  return group.activePaths?.includes(pathname) === true
    || group.activePrefixes.some((prefix) => pathname.startsWith(prefix))
}

/** Chỉ cho phép một nhóm mở; bấm lại đúng nhóm đang mở sẽ thu gọn nhóm đó. */
export function nextOpenAdminNavGroup(currentGroupId: string | null, clickedGroupId: string) {
  return currentGroupId === clickedGroupId ? null : clickedGroupId
}
