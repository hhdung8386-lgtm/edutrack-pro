import { Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

// Pages
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Layouts & Protected Route
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { TeacherLayout } from '@/components/layout/TeacherLayout'

// Admin Pages
import { DashboardPage } from '@/pages/admin/DashboardPage'
import { StudentsPage } from '@/pages/admin/StudentsPage'
import { StudentDetailPage } from '@/pages/admin/StudentDetailPage'
import { TeachersPage } from '@/pages/admin/TeachersPage'
import { SubjectsPage } from '@/pages/admin/SubjectsPage'
import { ApprovalsPage } from '@/pages/admin/ApprovalsPage'
import { ReportsPage } from '@/pages/admin/ReportsPage'
import { PayrollPage } from '@/pages/admin/PayrollPage'
import { SettingsPage } from '@/pages/admin/SettingsPage'

// Teacher Pages
import { AttendancePage } from '@/pages/teacher/AttendancePage'
import { LessonHistoryPage } from '@/pages/teacher/LessonHistoryPage'
import { ProfilePage } from '@/pages/teacher/ProfilePage'

// Public Pages
import { TrackingPage } from '@/pages/tracking/TrackingPage'
import { SetupPage } from '@/pages/SetupPage'

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
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/setup" element={<SetupPage />} />

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
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Teacher Routes */}
          <Route
            path="/teacher/*"
            element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherLayout />
              </ProtectedRoute>
            }
          >
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="history" element={<LessonHistoryPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route index element={<Navigate to="attendance" replace />} />
          </Route>

          {/* Catch all */}
          <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
