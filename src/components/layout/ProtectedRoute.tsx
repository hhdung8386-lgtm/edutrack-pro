import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ReactNode, useEffect, useState } from 'react'
import { collection, query, where, getDocsFromServer, doc, getDocFromServer, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { signOut } from '@/lib/auth'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: 'admin' | 'teacher' | 'student_manager' | 'teacher_manager'
  requireContractAccepted?: boolean
}

export function ProtectedRoute({ children, requiredRole, requireContractAccepted = false }: ProtectedRouteProps) {
  const { user, role, loading, initialized, teacherId, profileStatus } = useAuthStore()
  const location = useLocation()
  const [hasAcceptedContract, setHasAcceptedContract] = useState(false)
  const [hasRegisteredAvailability, setHasRegisteredAvailability] = useState(false)
  const [requirementsCheckKey, setRequirementsCheckKey] = useState<string | null>(null)
  const [requirementsDecisionKey, setRequirementsDecisionKey] = useState<string | null>(null)
  const [requirementsCheckedTeacherId, setRequirementsCheckedTeacherId] = useState<string | null>(null)
  const [requirementsError, setRequirementsError] = useState(false)
  const requiresTeacherCheck = requireContractAccepted && role === 'teacher' && !!teacherId
  const currentCheckKey = requiresTeacherCheck ? `${teacherId}:${location.pathname}` : null

  // Check if teacher has accepted contract and registered availability
  useEffect(() => {
    if (!requireContractAccepted || role !== 'teacher' || !teacherId) {
      return
    }

    // Kiểm tra lại nền khi đổi route để nhận thay đổi từ Admin, nhưng chỉ chặn
    // toàn màn hình ở lần kiểm tra đầu tiên của đúng gia sư.
    if (requirementsCheckKey === currentCheckKey) {
      return
    }

    let cancelled = false
    const isInitialCheck = requirementsCheckedTeacherId !== teacherId
    const checkRequirements = async () => {
      if (isInitialCheck) setRequirementsError(false)
      let checkSucceeded = false
      try {
        // 1. Check contract acceptance
        const contractQ = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
        const contractSnapshot = await getDocsFromServer(contractQ)
        const nextHasAccepted = contractSnapshot.docs.some(docSnap => {
          const data = docSnap.data()
          return data.type === 'terms_of_service' || 
                 data.status === 'agreed' || 
                 data.status === 'pending' || 
                 data.status === 'approved'
        })
        if (cancelled) return
        setHasAcceptedContract(nextHasAccepted)

        // 2. Check if availability is registered or if teacher has bookings
        if (nextHasAccepted) {
          const bookingsQ = query(
            collection(db, 'bookingRequests'),
            where('teacherId', '==', teacherId),
            limit(1)
          )
          const bookingsSnapshot = await getDocsFromServer(bookingsQ)
          let nextHasAvailability = false
          if (!bookingsSnapshot.empty) {
            nextHasAvailability = true
          } else {
            const availDoc = await getDocFromServer(doc(db, 'teacherAvailability', teacherId))
            nextHasAvailability = availDoc.exists()
          }
          if (!cancelled) setHasRegisteredAvailability(nextHasAvailability)
        } else if (!cancelled) {
          setHasRegisteredAvailability(false)
        }
        checkSucceeded = true
      } catch (err) {
        console.error('Error checking requirements:', err)
        if (!cancelled && isInitialCheck) setRequirementsError(true)
      } finally {
        if (!cancelled) {
          setRequirementsCheckKey(`${teacherId}:${location.pathname}`)
          if (checkSucceeded) setRequirementsDecisionKey(`${teacherId}:${location.pathname}`)
          setRequirementsCheckedTeacherId(teacherId)
        }
      }
    }

    checkRequirements()
    return () => { cancelled = true }
  }, [currentCheckKey, location.pathname, requireContractAccepted, requirementsCheckedTeacherId, requirementsCheckKey, role, teacherId])

  if (!initialized || loading || (requiresTeacherCheck && requirementsCheckedTeacherId !== teacherId)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (user && (profileStatus === 'missing' || profileStatus === 'error')) {
    const missingProfile = profileStatus === 'missing'
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">
            {missingProfile ? 'Tài khoản chưa được khởi tạo đầy đủ' : 'Chưa xác nhận được quyền truy cập'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {missingProfile
              ? 'Vui lòng liên hệ Admin và chọn “Khôi phục đăng nhập” cho tài khoản gia sư này.'
              : 'Kết nối tới máy chủ đang gián đoạn. Vui lòng thử tải lại; dữ liệu của bạn không bị thay đổi.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {!missingProfile && (
              <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
                Thử tải lại
              </button>
            )}
            <button
              type="button"
              onClick={() => { void signOut().finally(() => window.location.assign('/login')) }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Về trang đăng nhập
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (requiresTeacherCheck && requirementsError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Chưa kiểm tra được quyền truy cập</h1>
          <p className="mt-2 text-sm text-slate-500">Kết nối đang gián đoạn. Vui lòng tải lại trang để kiểm tra hợp đồng và lịch rảnh.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
            Tải lại trang
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const isAuthorized = !requiredRole || role === requiredRole || 
    (requiredRole === 'admin' && (role === 'student_manager' || role === 'teacher_manager'));

  if (!isAuthorized) {
    // If user is a guest (not yet approved), redirect to waiting page
    if (role === 'guest') {
      return <Navigate to="/waiting" replace />
    }
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-rose-500 mb-2">403</h1>
          <p className="text-slate-500">Bạn không có quyền truy cập trang này</p>
        </div>
      </div>
    )
  }

  if (requiredRole === 'teacher' && role === 'teacher' && !teacherId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Tài khoản chưa đồng bộ hồ sơ gia sư</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Vui lòng quay lại trang đăng nhập và đăng nhập lại một lần để hệ thống tự khôi phục liên kết hồ sơ. Nếu vẫn còn lỗi, hãy liên hệ Admin.
          </p>
          <a href="/login" className="mt-4 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
            Về trang đăng nhập
          </a>
        </div>
      </div>
    )
  }

  // Handle specific path restrictions for managers
  if (role === 'student_manager') {
    if (location.pathname.startsWith('/admin/teachers') || location.pathname.startsWith('/admin/contracts')) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-rose-500 mb-2">403</h1>
            <p className="text-slate-500">Bạn không có quyền truy cập trang này</p>
          </div>
        </div>
      )
    }
  }

  if (role === 'teacher_manager') {
    if (location.pathname.startsWith('/admin/students')) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-rose-500 mb-2">403</h1>
            <p className="text-slate-500">Bạn không có quyền truy cập trang này</p>
          </div>
        </div>
      )
    }
  }

  // Check if teacher needs to accept contract
  const hasCurrentRequirementsDecision = !requiresTeacherCheck || requirementsDecisionKey === currentCheckKey

  if (hasCurrentRequirementsDecision && requireContractAccepted && role === 'teacher' && !hasAcceptedContract) {
    return <Navigate to="/teacher/contract" replace />
  }

  // Check if teacher needs to register availability slots (after contract accepted)
  if (hasCurrentRequirementsDecision && requireContractAccepted && role === 'teacher' && hasAcceptedContract && !hasRegisteredAvailability) {
    // Hồ sơ chưa hoàn thiện được TeacherLayout đưa về /teacher/profile. Phải cho
    // route hồ sơ đi qua trước; nếu ép sang lịch rảnh ở đây, hai lớp sẽ redirect
    // /teacher/profile <-> /teacher/availability vô hạn đối với gia sư mới.
    const isProfileSetupRoute = location.pathname === '/teacher/profile'
    if (location.pathname !== '/teacher/availability' && !isProfileSetupRoute) {
      return <Navigate to="/teacher/availability?setupRequired=true" replace />
    }
  }

  return <>{children}</>
}
