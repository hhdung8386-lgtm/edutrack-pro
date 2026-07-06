import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ReactNode, useEffect, useState } from 'react'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: 'admin' | 'teacher' | 'student_manager' | 'teacher_manager'
  requireContractAccepted?: boolean
}

export function ProtectedRoute({ children, requiredRole, requireContractAccepted = false }: ProtectedRouteProps) {
  const { user, role, loading, initialized, teacherId } = useAuthStore()
  const location = useLocation()
  const [checkingRequirements, setCheckingRequirements] = useState(requireContractAccepted && role === 'teacher')
  const [hasAcceptedContract, setHasAcceptedContract] = useState(false)
  const [hasRegisteredAvailability, setHasRegisteredAvailability] = useState(false)

  // Check if teacher has accepted contract and registered availability
  useEffect(() => {
    if (!requireContractAccepted || role !== 'teacher' || !teacherId) {
      setCheckingRequirements(false)
      return
    }

    const checkRequirements = async () => {
      try {
        // 1. Check contract acceptance
        const contractQ = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
        const contractSnapshot = await getDocs(contractQ)
        const hasAccepted = contractSnapshot.docs.some(docSnap => {
          const data = docSnap.data()
          return data.status === 'agreed' || data.type === 'terms_of_service'
        })
        setHasAcceptedContract(hasAccepted)

        // 2. Check if availability is registered
        if (hasAccepted) {
          const availDoc = await getDoc(doc(db, 'teacherAvailability', teacherId))
          if (availDoc.exists()) {
            const data = availDoc.data()
            const hasSlots = data.slots && Object.values(data.slots).some((day: any) => day.available === true)
            setHasRegisteredAvailability(!!hasSlots)
          } else {
            setHasRegisteredAvailability(false)
          }
        }
      } catch (err) {
        console.error('Error checking requirements:', err)
      } finally {
        setCheckingRequirements(false)
      }
    }

    checkRequirements()
  }, [requireContractAccepted, role, teacherId, location.pathname])

  if (!initialized || loading || (requireContractAccepted && checkingRequirements)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
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
      return <Navigate to="/teacher/availability" replace />
    }
  }

  return <>{children}</>
}
