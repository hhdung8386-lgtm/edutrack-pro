import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ReactNode, useEffect, useState } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: 'admin' | 'teacher'
  requireContractAccepted?: boolean
}

export function ProtectedRoute({ children, requiredRole, requireContractAccepted = false }: ProtectedRouteProps) {
  const { user, role, loading, initialized, teacherId } = useAuthStore()
  const location = useLocation()
  const [checkingContract, setCheckingContract] = useState(requireContractAccepted && role === 'teacher')
  const [hasAcceptedContract, setHasAcceptedContract] = useState(false)

  // Check if teacher has accepted contract
  useEffect(() => {
    if (!requireContractAccepted || role !== 'teacher' || !teacherId) {
      setCheckingContract(false)
      return
    }

    const checkContract = async () => {
      try {
        const q = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
        const snapshot = await getDocs(q)
        const hasAccepted = snapshot.docs.some(doc => {
          const data = doc.data()
          return data.status === 'agreed' || data.type === 'terms_of_service'
        })
        setHasAcceptedContract(hasAccepted)
      } catch (err) {
        console.error('Error checking contract:', err)
      } finally {
        setCheckingContract(false)
      }
    }

    checkContract()
  }, [requireContractAccepted, role, teacherId])

  if (!initialized || loading || (requireContractAccepted && checkingContract)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredRole && role !== requiredRole) {
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

  // Check if teacher needs to accept contract
  if (requireContractAccepted && role === 'teacher' && !hasAcceptedContract) {
    return <Navigate to="/teacher/contract" replace />
  }

  return <>{children}</>
}
