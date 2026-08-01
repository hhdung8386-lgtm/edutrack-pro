import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ReactNode, useEffect, useState } from 'react'
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: 'admin' | 'teacher' | 'student_manager' | 'teacher_manager'
  requireContractAccepted?: boolean
}

export function ProtectedRoute({ children, requiredRole, requireContractAccepted = false }: ProtectedRouteProps) {
  const { user, role, loading, initialized, teacherId } = useAuthStore()
  const location = useLocation()
  const [checkingRequirements, setCheckingRequirements] = useState(false)
  const [hasAcceptedContract, setHasAcceptedContract] = useState(false)
  const [hasRegisteredAvailability, setHasRegisteredAvailability] = useState(false)
  const [requirementsCheckKey, setRequirementsCheckKey] = useState<string | null>(null)
  const [requirementsError, setRequirementsError] = useState(false)
  const requiresTeacherCheck = requireContractAccepted && role === 'teacher' && !!teacherId
  const currentCheckKey = requiresTeacherCheck ? `${teacherId}:${location.pathname}` : null

  // Check if teacher has accepted contract and registered availability
  useEffect(() => {
    if (!requireContractAccepted || role !== 'teacher' || !teacherId) {
      return
    }

    let cancelled = false
    const checkRequirements = async () => {
      setCheckingRequirements(true)
      setRequirementsError(false)
      try {
        // 1. Check contract acceptance
        const contractQ = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
        const contractSnapshot = await getDocs(contractQ)
        const hasAccepted = contractSnapshot.docs.some(docSnap => {
          const data = docSnap.data()
          return data.type === 'terms_of_service' || 
                 data.status === 'agreed' || 
                 data.status === 'pending' || 
                 data.status === 'approved'
        })
        if (cancelled) return
        setHasAcceptedContract(hasAccepted)

        // 2. Check if availability is registered or if teacher has bookings
        if (hasAccepted) {
          const bookingsQ = query(
            collection(db, 'bookingRequests'),
            where('teacherId', '==', teacherId),
            limit(1)
          )
          const bookingsSnapshot = await getDocs(bookingsQ)
          if (!bookingsSnapshot.empty) {
            if (!cancelled) setHasRegisteredAvailability(true)
          } else {
            const availDoc = await getDoc(doc(db, 'teacherAvailability', teacherId))
            if (!cancelled) setHasRegisteredAvailability(availDoc.exists())
          }
        } else if (!cancelled) {
          setHasRegisteredAvailability(false)
        }
      } catch (err) {
        console.error('Error checking requirements:', err)
        if (!cancelled) setRequirementsError(true)
      } finally {
        if (!cancelled) {
          setRequirementsCheckKey(`${teacherId}:${location.pathname}`)
          setCheckingRequirements(false)
        }
      }
    }

    checkRequirements()
    return () => { cancelled = true }
  }, [requireContractAccepted, role, teacherId, location.pathname])

  if (!initialized || loading || (requiresTeacherCheck && (checkingRequirements || requirementsCheckKey !== currentCheckKey))) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
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
  if (requireContractAccepted && role === 'teacher' && !hasAcceptedContract) {
    return <Navigate to="/teacher/contract" replace />
  }

  // Check if teacher needs to register availability slots (after contract accepted)
  if (requireContractAccepted && role === 'teacher' && hasAcceptedContract && !hasRegisteredAvailability) {
    if (location.pathname !== '/teacher/availability') {
      return <Navigate to="/teacher/availability?setupRequired=true" replace />
    }
  }

  return <>{children}</>
}
