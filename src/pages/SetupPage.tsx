import { useState } from 'react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export function SetupPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleSetup = async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Try Create User
      let uid = ''
      try {
        const credential = await createUserWithEmailAndPassword(auth, 'admin@edutrackpro.app', 'admin123')
        uid = credential.user.uid
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          // If exists, sign in to get UID
          const credential = await signInWithEmailAndPassword(auth, 'admin@edutrackpro.app', 'admin123')
          uid = credential.user.uid
        } else {
          throw authErr
        }
      }

      // 2. Set Role in Firestore
      await setDoc(doc(db, 'users', uid), {
        role: 'admin',
        email: 'admin@edutrackpro.app',
      })

      setSuccess(true)
      setTimeout(() => {
        navigate('/login')
      }, 3000)
    } catch (err: any) {
      if (err.code === 'permission-denied') {
        setError('Lỗi phân quyền Firestore. Vui lòng vào Firebase Console -> Firestore Database -> Rules và đổi thành "allow read, write: if true;"')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full border border-slate-700">
        <h1 className="text-2xl font-bold text-white mb-4">Khởi tạo dữ liệu</h1>
        <p className="text-slate-400 mb-6">
          Nhấn nút bên dưới để tạo tài khoản Admin mặc định cho hệ thống:
          <br /><br />
          Email: <strong className="text-white">admin@edutrackpro.app</strong><br />
          Mật khẩu: <strong className="text-white">admin123</strong>
        </p>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg mb-4 text-sm">
            Tạo tài khoản thành công! Đang chuyển hướng về trang đăng nhập...
          </div>
        )}

        <Button onClick={handleSetup} fullWidth loading={loading} disabled={success}>
          Tạo tài khoản Admin
        </Button>
      </div>
    </div>
  )
}
