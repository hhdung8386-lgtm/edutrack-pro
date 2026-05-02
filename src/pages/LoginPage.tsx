import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GraduationCap, User, Lock, Eye, EyeOff } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const loginSchema = z.object({
  username: z.string().min(3, 'Tài khoản tối thiểu 3 ký tự'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
})

const registerSchema = z.object({
  name: z.string().min(2, 'Tên quá ngắn'),
  username: z.string().min(3, 'Tài khoản tối thiểu 3 ký tự'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
})

type LoginData = z.infer<typeof loginSchema>
type RegisterData = z.infer<typeof registerSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors, isSubmitting: isLoginSubmitting },
    reset: resetLogin
  } = useForm<LoginData>({ resolver: zodResolver(loginSchema) })

  const {
    register: registerSignup,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors, isSubmitting: isRegisterSubmitting },
    reset: resetRegister
  } = useForm<RegisterData>({ resolver: zodResolver(registerSchema) })

  const formatEmail = (username: string) => {
    // Nếu người dùng không nhập @ (nghĩa là không nhập định dạng email chuẩn), tự động thêm đuôi @edutrackpro.app
    if (!username.includes('@')) {
      return `${username}@edutrackpro.app`
    }
    return username
  }

  const onLogin = async (data: LoginData) => {
    setErrorMsg('')
    try {
      const emailToUse = formatEmail(data.username)
      const { role } = await signIn(emailToUse, data.password)
      if (role === 'admin') navigate('/admin/dashboard')
      else if (role === 'teacher') navigate('/teacher/attendance')
      else setErrorMsg('Tài khoản không có quyền truy cập')
    } catch (err: unknown) {
      const msg = (err as Error).message || ''
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found') || msg.includes('invalid-email')) {
        setErrorMsg('Tài khoản hoặc mật khẩu không đúng')
      } else if (msg.includes('too-many-requests')) {
        setErrorMsg('Quá nhiều lần thử. Vui lòng thử lại sau.')
      } else if (msg.includes('không có quyền')) {
        setErrorMsg(msg)
      } else {
        setErrorMsg('Đăng nhập thất bại. Vui lòng thử lại.')
      }
    }
  }

  const onRegister = async (data: RegisterData) => {
    setErrorMsg('')
    try {
      const emailToUse = formatEmail(data.username)
      const credential = await createUserWithEmailAndPassword(auth, emailToUse, data.password)
      const uid = credential.user.uid

      // Tự động cấp quyền admin cho dễ test
      await setDoc(doc(db, 'users', uid), {
        role: 'admin',
        email: emailToUse,
        username: data.username, // Lưu thêm username gốc
        name: data.name,
      })

      navigate('/admin/dashboard')
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('Tài khoản này đã tồn tại')
      } else {
        setErrorMsg(err.message || 'Đăng ký thất bại. Vui lòng thử lại.')
      }
    }
  }

  const switchTab = (tab: 'login' | 'register') => {
    setActiveTab(tab)
    setErrorMsg('')
    resetLogin()
    resetRegister()
    setShowPassword(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-200/50 rounded-full blur-[120px] animate-pulse-soft" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-200/50 rounded-full blur-[120px] animate-pulse-soft" style={{ animationDelay: '1s' }} />

      <div className="relative w-full max-w-md z-10 flex flex-col items-center">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg transform transition-transform hover:scale-105 hover:rotate-3 duration-300">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-indigo-800 text-center">
            EduTrack Pro
          </h1>
        </div>

        {/* Form Container */}
        <div className="w-full bg-white/80 backdrop-blur-xl border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-2xl transition-all duration-300">
          
          {/* Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
            <button
              onClick={() => switchTab('login')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'login'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Đăng Nhập
            </button>
            <button
              onClick={() => switchTab('register')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'register'
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Đăng Ký
            </button>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-5 animate-fade-in">
              <p className="text-sm text-rose-600">{errorMsg}</p>
            </div>
          )}

          {/* Login Section */}
          {activeTab === 'login' && (
            <div className="animate-fade-in">
              <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-4">
                <Input
                  label="Tài khoản đăng nhập"
                  type="text"
                  placeholder="Ví dụ: admin hoặc admin@edutrackpro.app"
                  autoComplete="username"
                  leftIcon={<User className="w-4 h-4" />}
                  error={loginErrors.username?.message}
                  {...registerLogin('username')}
                />

                <Input
                  label="Mật khẩu"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  leftIcon={<Lock className="w-4 h-4" />}
                  error={loginErrors.password?.message}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-500 hover:text-indigo-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...registerLogin('password')}
                />

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={isLoginSubmitting}
                  className="mt-6 rounded-xl shadow-lg shadow-indigo-200/50 hover:shadow-indigo-300/50 hover:-translate-y-0.5 transition-all duration-300"
                >
                  Đăng nhập
                </Button>
              </form>
            </div>
          )}

          {/* Register Section */}
          {activeTab === 'register' && (
            <div className="animate-fade-in">
              <form onSubmit={handleRegisterSubmit(onRegister)} className="space-y-4">
                <Input
                  label="Họ và Tên"
                  type="text"
                  placeholder="Nguyễn Văn A"
                  autoComplete="name"
                  leftIcon={<User className="w-4 h-4" />}
                  error={registerErrors.name?.message}
                  {...registerSignup('name')}
                />

                <Input
                  label="Tài khoản muốn tạo"
                  type="text"
                  placeholder="Ví dụ: admin123"
                  autoComplete="username"
                  leftIcon={<User className="w-4 h-4" />}
                  error={registerErrors.username?.message}
                  {...registerSignup('username')}
                />

                <Input
                  label="Mật khẩu"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  leftIcon={<Lock className="w-4 h-4" />}
                  error={registerErrors.password?.message}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-500 hover:text-emerald-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...registerSignup('password')}
                />

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={isRegisterSubmitting}
                  className="mt-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200/50 hover:shadow-emerald-300/50 hover:-translate-y-0.5 transition-all duration-300"
                >
                  Tạo tài khoản & Đăng nhập
                </Button>
              </form>
            </div>
          )}
          
        </div>
      </div>
    </div>
  )
}
