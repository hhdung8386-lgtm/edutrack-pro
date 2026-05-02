import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GraduationCap, Mail, Lock, Eye, EyeOff, User } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
})

const registerSchema = z.object({
  name: z.string().min(2, 'Tên quá ngắn'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
})

type LoginData = z.infer<typeof loginSchema>
type RegisterData = z.infer<typeof registerSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [registerError, setRegisterError] = useState('')

  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors, isSubmitting: isLoginSubmitting },
  } = useForm<LoginData>({ resolver: zodResolver(loginSchema) })

  const {
    register: registerSignup,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors, isSubmitting: isRegisterSubmitting },
  } = useForm<RegisterData>({ resolver: zodResolver(registerSchema) })

  const onLogin = async (data: LoginData) => {
    setLoginError('')
    try {
      const { role } = await signIn(data.email, data.password)
      if (role === 'admin') navigate('/admin/dashboard')
      else if (role === 'teacher') navigate('/teacher/attendance')
      else setLoginError('Tài khoản không có quyền truy cập')
    } catch (err: unknown) {
      const msg = (err as Error).message || ''
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setLoginError('Email hoặc mật khẩu không đúng')
      } else if (msg.includes('too-many-requests')) {
        setLoginError('Quá nhiều lần thử. Vui lòng thử lại sau.')
      } else if (msg.includes('không có quyền')) {
        setLoginError(msg)
      } else {
        setLoginError('Đăng nhập thất bại. Vui lòng thử lại.')
      }
    }
  }

  const onRegister = async (data: RegisterData) => {
    setRegisterError('')
    try {
      const credential = await createUserWithEmailAndPassword(auth, data.email, data.password)
      const uid = credential.user.uid

      // Tự động cấp quyền admin cho dễ test
      await setDoc(doc(db, 'users', uid), {
        role: 'admin',
        email: data.email,
        name: data.name,
      })

      navigate('/admin/dashboard')
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setRegisterError('Email này đã được sử dụng')
      } else {
        setRegisterError(err.message || 'Đăng ký thất bại. Vui lòng thử lại.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-200/50 rounded-full blur-[120px] animate-pulse-soft" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-200/50 rounded-full blur-[120px] animate-pulse-soft" style={{ animationDelay: '1s' }} />

      <div className="relative w-full max-w-5xl z-10 flex flex-col items-center">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg transform transition-transform hover:scale-105 hover:rotate-3 duration-300">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-indigo-800 text-center">
            EduTrack Pro
          </h1>
          <p className="text-sm md:text-base text-slate-500 mt-2 text-center">Hệ thống quản lý lớp học 1 kèm 1</p>
        </div>

        {/* Form Container */}
        <div className="w-full bg-white/80 backdrop-blur-xl border border-slate-200 rounded-[2rem] p-6 md:p-10 shadow-2xl transition-all duration-300 flex flex-col md:flex-row gap-10 md:gap-16">
          
          {/* Login Section */}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Lock className="w-6 h-6 text-indigo-500" />
              Đăng Nhập
            </h2>
            <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-5">
              <Input
                label="Email"
                type="email"
                placeholder="admin@edutrackpro.app"
                autoComplete="username"
                leftIcon={<Mail className="w-4 h-4" />}
                error={loginErrors.email?.message}
                {...registerLogin('email')}
              />

              <Input
                label="Mật khẩu"
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                leftIcon={<Lock className="w-4 h-4" />}
                error={loginErrors.password?.message}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="text-slate-500 hover:text-indigo-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                {...registerLogin('password')}
              />

              {loginError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 animate-fade-in">
                  <p className="text-sm text-rose-600">{loginError}</p>
                </div>
              )}

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={isLoginSubmitting}
                className="mt-4 rounded-xl shadow-lg shadow-indigo-200/50 hover:shadow-indigo-300/50 hover:-translate-y-0.5 transition-all duration-300"
              >
                Đăng nhập
              </Button>
            </form>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent"></div>
          <div className="md:hidden h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent my-4"></div>

          {/* Register Section */}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <User className="w-6 h-6 text-emerald-500" />
              Đăng Ký Mới
            </h2>
            <form onSubmit={handleRegisterSubmit(onRegister)} className="space-y-5">
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
                label="Email"
                type="email"
                placeholder="email@example.com"
                autoComplete="username"
                leftIcon={<Mail className="w-4 h-4" />}
                error={registerErrors.email?.message}
                {...registerSignup('email')}
              />

              <Input
                label="Mật khẩu"
                type={showRegisterPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                leftIcon={<Lock className="w-4 h-4" />}
                error={registerErrors.password?.message}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                    className="text-slate-500 hover:text-emerald-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                {...registerSignup('password')}
              />

              {registerError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 animate-fade-in">
                  <p className="text-sm text-rose-600">{registerError}</p>
                </div>
              )}

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={isRegisterSubmitting}
                className="mt-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200/50 hover:shadow-emerald-300/50 hover:-translate-y-0.5 transition-all duration-300"
              >
                Đăng Ký & Đăng Nhập
              </Button>
            </form>
          </div>
          
        </div>
      </div>
    </div>
  )
}
