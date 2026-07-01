import { Suspense, useEffect, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

// Layouts & Protected Route (statically imported for stability and quick initial render)
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { TeacherLayout } from '@/components/layout/TeacherLayout'

// Lazy loaded Pages
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })))
const WaitingApprovalPage = lazy(() => import('@/pages/WaitingApprovalPage').then(m => ({ default: m.WaitingApprovalPage })))

// Lazy loaded Admin Pages
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage').then(m => ({ default: m.DashboardPage })))
const StudentsPage = lazy(() => import('@/pages/admin/StudentsPage').then(m => ({ default: m.StudentsPage })))
const StudentDetailPage = lazy(() => import('@/pages/admin/StudentDetailPage').then(m => ({ default: m.StudentDetailPage })))
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

// Lazy loaded Teacher Pages
const TeacherContractPage = lazy(() => import('@/pages/teacher/TeacherContractPage').then(m => ({ default: m.TeacherContractPage })))
const AttendancePage = lazy(() => import('@/pages/teacher/AttendancePage').then(m => ({ default: m.AttendancePage })))
const LessonHistoryPage = lazy(() => import('@/pages/teacher/LessonHistoryPage').then(m => ({ default: m.LessonHistoryPage })))
const TeacherSchedulesPage = lazy(() => import('@/pages/teacher/BookingSchedulesPage').then(m => ({ default: m.BookingSchedulesPage })))
const ProfilePage = lazy(() => import('@/pages/teacher/ProfilePage').then(m => ({ default: m.ProfilePage })))
const TeacherEvaluationsPage = lazy(() => import('@/pages/teacher/TeacherEvaluationsPage'))

// Lazy loaded Parent Pages
const ParentDashboardPage = lazy(() => import('@/pages/parent/ParentDashboardPage').then(m => ({ default: m.ParentDashboardPage })))

// Lazy loaded Public Pages
const TrackingPage = lazy(() => import('@/pages/tracking/TrackingPage').then(m => ({ default: m.TrackingPage })))
const SetupPage = lazy(() => import('@/pages/SetupPage').then(m => ({ default: m.SetupPage })))
const ChuongTrinhHocPage = lazy(() => import('@/pages/ChuongTrinhHocPage').then(m => ({ default: m.ChuongTrinhHocPage })))
const LienHePage = lazy(() => import('@/pages/LienHePage').then(m => ({ default: m.LienHePage })))
const PublicTeachersPage = lazy(() => import('@/pages/PublicTeachersPage').then(m => ({ default: m.PublicTeachersPage })))
const PublicEvaluationPage = lazy(() => import('@/pages/PublicEvaluationPage'))

const RootRedirect = () => {
  const { user, role, loading, initialized } = useAuthStore()
  
  if (!initialized || loading) return <LoadingSpinner />
  
  if (!user) return <Navigate to="/login" replace />
  
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />
  if (role === 'teacher') return <Navigate to="/teacher/attendance" replace />
  if (role === 'guest') return <Navigate to="/waiting" replace />
  
  // If user is logged in but has no valid role yet
  return <Navigate to="/login" replace />
}

function App() {
  const initAuth = useAuthStore((state) => state.initAuth)
  const loading = useAuthStore((state) => state.loading)
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
          <Route path="/lien-he" element={<LienHePage />} />
          <Route path="/giao-vien" element={<PublicTeachersPage />} />
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
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="students/:id" element={<StudentDetailPage />} />
            <Route path="teachers" element={<TeachersPage />} />
            <Route path="teachers/:id" element={<TeacherDetailPage />} />
            <Route path="teacher-availability" element={<TeacherAvailabilityPage />} />
            <Route path="booking-schedules" element={<BookingSchedulesPage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="bookings" element={<BookingRequestsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="evaluations" element={<AdminEvaluationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route index element={<Navigate to="dashboard" replace />} />
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
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="history" element={<LessonHistoryPage />} />
            <Route path="schedules" element={<TeacherSchedulesPage />} />
            <Route path="evaluations" element={<TeacherEvaluationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="availability" element={<Navigate to="../profile" replace />} />
            <Route index element={<Navigate to="attendance" replace />} />
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
