import { Suspense, useEffect, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

// Layouts & Protected Route (statically imported for stability and quick initial render)
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { TeacherLayout } from '@/components/layout/TeacherLayout'
import { TeacherAttendanceGate } from '@/components/teacher/TeacherAttendanceGate'

// Lazy loaded Pages
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })))
const BaiVietPage = lazy(() => import('@/pages/BaiVietPage').then(m => ({ default: m.BaiVietPage })))
const BaiVietChiTietPage = lazy(() => import('@/pages/BaiVietPage').then(m => ({ default: m.BaiVietChiTietPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })))
const WaitingApprovalPage = lazy(() => import('@/pages/WaitingApprovalPage').then(m => ({ default: m.WaitingApprovalPage })))

// Lazy loaded Admin Pages
const StudentsPage = lazy(() => import('@/pages/admin/StudentsPage').then(m => ({ default: m.StudentsPage })))
const GroupClassesPage = lazy(() => import('@/pages/admin/GroupClassesPage').then(m => ({ default: m.GroupClassesPage })))
const StudentDetailPage = lazy(() => import('@/pages/admin/StudentDetailPage').then(m => ({ default: m.StudentDetailPage })))
const StudentAlertsPage = lazy(() => import('@/pages/admin/StudentAlertsPage').then(m => ({ default: m.StudentAlertsPage })))
const TeachersPage = lazy(() => import('@/pages/admin/TeachersPage').then(m => ({ default: m.TeachersPage })))
const TeacherDetailPage = lazy(() => import('@/pages/admin/TeacherDetailPage').then(m => ({ default: m.TeacherDetailPage })))
const TeacherAvailabilityPage = lazy(() => import('@/pages/admin/TeacherAvailabilityPage').then(m => ({ default: m.TeacherAvailabilityPage })))
const SubjectsPage = lazy(() => import('@/pages/admin/SubjectsPage').then(m => ({ default: m.SubjectsPage })))
const ApprovalsPage = lazy(() => import('@/pages/admin/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })))
const BookingRequestsPage = lazy(() => import('@/pages/admin/BookingRequestsPage').then(m => ({ default: m.BookingRequestsPage })))
const BookingSchedulesPage = lazy(() => import('@/pages/admin/BookingSchedulesPage').then(m => ({ default: m.BookingSchedulesPage })))
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage').then(m => ({ default: m.ReportsPage })))
const PayrollPage = lazy(() => import('@/pages/admin/PayrollPage').then(m => ({ default: m.PayrollPage })))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage').then(m => ({ default: m.SettingsPage })))
const ContractsPage = lazy(() => import('@/pages/admin/ContractsPage').then(m => ({ default: m.ContractsPage })))
const AdminEvaluationsPage = lazy(() => import('@/pages/admin/AdminEvaluationsPage'))
const NotificationsPage = lazy(() => import('@/pages/admin/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const FutureBookingsPage = lazy(() => import('@/pages/admin/FutureBookingsPage').then(m => ({ default: m.FutureBookingsPage })))
const OverdueBookingsPage = lazy(() => import('@/pages/admin/OverdueBookingsPage').then(m => ({ default: m.OverdueBookingsPage })))
const SiteContentPage = lazy(() => import('@/pages/admin/SiteContentPage').then(m => ({ default: m.SiteContentPage })))
const QuotaReconcilePage = lazy(() => import('@/pages/admin/QuotaReconcilePage').then(m => ({ default: m.QuotaReconcilePage })))
const StudentExperiencePage = lazy(() => import('@/pages/admin/StudentExperiencePage').then(m => ({ default: m.StudentExperiencePage })))

// Lazy loaded Teacher Pages
const TeacherContractPage = lazy(() => import('@/pages/teacher/TeacherContractPage').then(m => ({ default: m.TeacherContractPage })))
const AttendancePage = lazy(() => import('@/pages/teacher/AttendancePage').then(m => ({ default: m.AttendancePage })))
const LessonHistoryPage = lazy(() => import('@/pages/teacher/LessonHistoryPage').then(m => ({ default: m.LessonHistoryPage })))
const TeacherSchedulesPage = lazy(() => import('@/pages/teacher/BookingSchedulesPage').then(m => ({ default: m.BookingSchedulesPage })))
const TeacherBookingRequestsPage = lazy(() => import('@/pages/teacher/BookingRequestsPage').then(m => ({ default: m.TeacherBookingRequestsPage })))
const ProfilePage = lazy(() => import('@/pages/teacher/ProfilePage').then(m => ({ default: m.ProfilePage })))
const TeacherEvaluationsPage = lazy(() => import('@/pages/teacher/TeacherEvaluationsPage'))
const TeacherAvailabilityEditPage = lazy(() => import('@/pages/teacher/AvailabilityPage').then(m => ({ default: m.AvailabilityPage })))
const TeacherRankingPage = lazy(() => import('@/pages/teacher/TeacherRankingPage').then(m => ({ default: m.TeacherRankingPage })))

// Lazy loaded Parent Pages
const ParentDashboardPage = lazy(() => import('@/pages/parent/ParentDashboardPage').then(m => ({ default: m.ParentDashboardPage })))

// Lazy loaded Public Pages
const TrackingPage = lazy(() => import('@/pages/tracking/TrackingPage').then(m => ({ default: m.TrackingPage })))
const SetupPage = lazy(() => import('@/pages/SetupPage').then(m => ({ default: m.SetupPage })))
const ChuongTrinhHocPage = lazy(() => import('@/pages/ChuongTrinhHocPage').then(m => ({ default: m.ChuongTrinhHocPage })))
const CurriculumLevelPage = lazy(() => import('@/pages/CurriculumLevelPage').then(m => ({ default: m.CurriculumLevelPage })))
const ChuongTrinhCaNhanHoaPage = lazy(() => import('@/pages/ChuongTrinhCaNhanHoaPage').then(m => ({ default: m.ChuongTrinhCaNhanHoaPage })))
const LienHePage = lazy(() => import('@/pages/LienHePage').then(m => ({ default: m.LienHePage })))
const PublicTeacherProfilePage = lazy(() => import('@/pages/PublicTeacherProfilePage').then(m => ({ default: m.PublicTeacherProfilePage })))
const PublicTeachersPage = lazy(() => import('@/pages/PublicTeachersPage').then(m => ({ default: m.PublicTeachersPage })))
const PublicEvaluationPage = lazy(() => import('@/pages/PublicEvaluationPage'))

const RootRedirect = () => {
  const { user, role, accessScope, loading, initialized } = useAuthStore()
  
  if (!initialized || loading) return <LoadingSpinner />
  
  if (!user) return <Navigate to="/login" replace />
  
  if (accessScope === 'booking_only') return <Navigate to="/admin/booking-schedules" replace />
  if (role === 'admin' || role === 'student_manager') return <Navigate to="/admin/students/fixed" replace />
  if (role === 'teacher_manager') return <Navigate to="/admin/teachers/online" replace />
  if (role === 'teacher') return <Navigate to="/teacher/ranking" replace />
  if (role === 'guest') return <Navigate to="/waiting" replace />
  
  // If user is logged in but has no valid role yet
  return <Navigate to="/login" replace />
}

const AdminIndexRedirect = () => {
  const role = useAuthStore((state) => state.role)
  const accessScope = useAuthStore((state) => state.accessScope)
  return <Navigate to={accessScope === 'booking_only' ? 'booking-schedules' : role === 'teacher_manager' ? 'teachers/online' : 'students/fixed'} replace />
}

function App() {
  const initAuth = useAuthStore((state) => state.initAuth)
  const initialized = useAuthStore((state) => state.initialized)

  useEffect(() => {
    const unsubscribe = initAuth()
    return unsubscribe
  }, [initAuth])

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/chuong-trinh-hoc" element={<ChuongTrinhHocPage />} />
          <Route path="/chuong-trinh-hoc/:curriculumId/level/:level" element={<CurriculumLevelPage />} />
          <Route path="/chuong-trinh-ca-nhan-hoa" element={<ChuongTrinhCaNhanHoaPage />} />
          <Route path="/lien-he" element={<LienHePage />} />
          <Route path="/bai-viet" element={<BaiVietPage />} />
          <Route path="/bai-viet/:slug" element={<BaiVietChiTietPage />} />
          <Route path="/giao-vien" element={<PublicTeachersPage />} />
          <Route path="/giao-vien/:id" element={<PublicTeacherProfilePage />} />
          <Route path="/giao-vien/*" element={<Navigate to="/login" replace />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/waiting" element={<WaitingApprovalPage />} />
          <Route path="/evaluation/:id" element={<PublicEvaluationPage />} />

          {/* Parent Routes - public auth via student code + phone */}
          <Route path="/parent" element={<ParentDashboardPage />} />

          {/* Admin Routes */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard cũ đã bị loại bỏ vì tự quét/ghi dữ liệu khi mở trang.
                Giữ redirect để bookmark cũ không rơi vào trang 404. */}
            <Route path="dashboard" element={<Navigate to="/admin/students/fixed" replace />} />
            <Route path="students" element={<StudentsPage key="all" learningScheduleType="all" />} />
            <Route path="students/one-to-one" element={<Navigate to="/admin/students/fixed" replace />} />
            <Route path="students/group" element={<GroupClassesPage deliveryMode="online" />} />
            <Route path="offline-classes" element={<StudentsPage key="offline" learningScheduleType="offline" />} />
            <Route path="offline-classes/groups" element={<GroupClassesPage deliveryMode="offline" />} />
            <Route path="students/fixed" element={<StudentsPage key="fixed" learningScheduleType="fixed" />} />
            <Route path="students/flexible" element={<StudentsPage key="flexible" learningScheduleType="flexible" />} />
            <Route path="student-alerts" element={<StudentAlertsPage />} />
            <Route path="students/:id" element={<StudentDetailPage />} />
            <Route path="teachers" element={<Navigate to="online" replace />} />
            <Route path="teachers/online" element={<TeachersPage category="online" />} />
            <Route path="teachers/offline" element={<TeachersPage category="offline" />} />
            <Route path="teachers/tester" element={<TeachersPage category="tester" />} />
            <Route path="teachers/resigned" element={<TeachersPage category="resigned" />} />
            <Route path="teachers/:id" element={<TeacherDetailPage />} />
            <Route path="teacher-availability" element={<TeacherAvailabilityPage />} />
            <Route path="booking-schedules" element={<BookingSchedulesPage />} />
            <Route path="future-bookings" element={<FutureBookingsPage />} />
            <Route path="overdue-bookings" element={<OverdueBookingsPage />} />
            <Route path="site-content" element={<SiteContentPage />} />
            <Route path="quota-reconcile" element={<QuotaReconcilePage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="bookings" element={<BookingRequestsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="evaluations" element={<AdminEvaluationsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="student-experience" element={<StudentExperiencePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route index element={<AdminIndexRedirect />} />
          </Route>

          {/* Teacher Routes */}
          <Route
            path="/teacher/contract"
            element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<TeacherContractPage />} />
          </Route>

          <Route
            path="/teacher/*"
            element={
              <ProtectedRoute requiredRole="teacher" requireContractAccepted={true}>
                <TeacherLayout />
              </ProtectedRoute>
            }
          >
            <Route path="attendance" element={<TeacherAttendanceGate><AttendancePage /></TeacherAttendanceGate>} />
            <Route path="ranking" element={<TeacherRankingPage />} />
            <Route path="history" element={<LessonHistoryPage />} />
            <Route path="schedules" element={<TeacherSchedulesPage />} />
            <Route path="booking-requests" element={<TeacherBookingRequestsPage />} />
            <Route path="evaluations" element={<TeacherEvaluationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="availability" element={<TeacherAvailabilityEditPage />} />
            <Route index element={<Navigate to="ranking" replace />} />
          </Route>

          {/* Catch all */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
