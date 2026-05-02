import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GraduationCap, User, Lock, Eye, EyeOff, CheckCircle2, XCircle, CalendarDays, Users, TrendingUp, Sparkles } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'

const loginSchema = z.object({
  username: z.string().min(3, 'Tài khoản tối thiểu 3 ký tự'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  remember: z.boolean().optional()
})

const registerSchema = z.object({
  name: z.string().min(2, 'Tên quá ngắn'),
  username: z.string()
    .min(3, 'Tài khoản tối thiểu 3 ký tự')
    .regex(/^[a-zA-Z0-9_\.]+$/, 'Tài khoản viết liền không dấu, không có khoảng trắng (VD: giasu1)'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"]
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
    reset: resetRegister,
    control: registerControl
  } = useForm<RegisterData>({ resolver: zodResolver(registerSchema) })

  const registerPassword = useWatch({ control: registerControl, name: 'password' })
  const registerConfirmPassword = useWatch({ control: registerControl, name: 'confirmPassword' })

  const formatEmail = (username: string) => {
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

      await setDoc(doc(db, 'users', uid), {
        role: 'guest',
        email: emailToUse,
        username: data.username,
        name: data.name,
      })

      await auth.signOut()
      toast.success('Đăng ký thành công! Vui lòng đợi Admin cấp quyền.')
      switchTab('login')
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

  const isPasswordMatch = registerConfirmPassword && registerPassword === registerConfirmPassword;
  const isPasswordError = registerConfirmPassword && registerPassword !== registerConfirmPassword;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorators */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-300/30 rounded-full blur-[120px] animate-pulse-soft" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-300/30 rounded-full blur-[120px] animate-pulse-soft" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-[40%] left-[20%] w-[20%] h-[20%] bg-amber-300/20 rounded-full blur-[80px] animate-pulse-soft" style={{ animationDelay: '3s' }} />

      <div className="relative w-full max-w-5xl z-10 flex flex-col md:flex-row gap-8 items-stretch">
        
        {/* Left Marketing Panel - Visible mainly on md+ screens */}
        <div className="hidden md:flex flex-col justify-between w-1/2 p-10 bg-gradient-to-br from-indigo-600/90 to-indigo-800/90 rounded-[2rem] shadow-2xl backdrop-blur-md relative overflow-hidden border border-indigo-400/30 text-white">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,255,255,0.3)] animate-[bounce_3s_infinite]">
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold mb-4 leading-tight tracking-tight drop-shadow-md text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-white animate-[pulse_3s_ease-in-out_infinite]">
              EduTrack Pro
            </h1>
            <div className="text-indigo-100 text-lg font-medium drop-shadow-sm leading-relaxed border-l-4 border-indigo-400 pl-4 py-1 transition-all duration-500 hover:border-white">
              Giải pháp toàn diện tối ưu hóa quản lý trung tâm và gia sư, 
              <span className="text-white font-semibold flex items-center gap-2 mt-2">
                <Sparkles className="w-5 h-5 text-amber-300 animate-pulse"/> 
                Nâng tầm chất lượng giáo dục.
              </span>
            </div>
          </div>

          <div className="relative z-10 mt-12 space-y-6">
            <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10 shadow-lg transform hover:-translate-y-1 transition-transform group">
              <div className="w-12 h-12 flex-shrink-0 bg-white p-2 rounded-full shadow-md flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-white">Quản Lý Dễ Dàng</h3>
                <p className="text-sm text-indigo-100">Tối ưu hóa vận hành trung tâm</p>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10 shadow-lg transform hover:-translate-y-1 transition-transform group">
              <div className="w-12 h-12 flex-shrink-0 bg-white p-2 rounded-full shadow-md flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform">
                <CalendarDays className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-white">Lịch Trình Thông Minh</h3>
                <p className="text-sm text-indigo-100">Sắp xếp ca dạy khoa học, hiệu quả</p>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10 shadow-lg transform hover:-translate-y-1 transition-transform group">
              <div className="w-12 h-12 flex-shrink-0 bg-white p-2 rounded-full shadow-md flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform">
                <TrendingUp className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-white">Đồng Bộ Xuyên Suốt</h3>
                <p className="text-sm text-indigo-100">Kết nối trung tâm, gia sư và học viên</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Auth Container */}
        <div className="w-full md:w-1/2 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-[2rem] p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] transition-all duration-300">
          
          <div className="md:hidden flex flex-col items-center mb-6">
             <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mb-2 shadow-lg">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-indigo-800 text-center">
                EduTrack Pro
              </h1>
          </div>

          {/* Tabs */}
          <div className="flex p-1.5 bg-slate-100 rounded-xl mb-8 shadow-inner">
            <button
              onClick={() => switchTab('login')}
              className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all duration-300 ${
                activeTab === 'login'
                  ? 'bg-white text-indigo-600 shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Đăng Nhập
            </button>
            <button
              onClick={() => switchTab('register')}
              className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all duration-300 ${
                activeTab === 'register'
                  ? 'bg-white text-emerald-600 shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Đăng Ký Tài Khoản
            </button>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 rounded-r-xl px-4 py-3 mb-6 animate-fade-in shadow-sm">
              <p className="text-sm font-medium text-rose-700">{errorMsg}</p>
            </div>
          )}

          {/* Login Section */}
          {activeTab === 'login' && (
            <div className="animate-fade-in">
              <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-5">
                <Input
                  label="Tài khoản đăng nhập"
                  type="text"
                  placeholder="Ví dụ: nguyenvana"
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
                      className="text-slate-400 hover:text-indigo-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...registerLogin('password')}
                />

                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                      {...registerLogin('remember')}
                    />
                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">Nhớ mật khẩu để vào nhanh</span>
                  </label>
                  <a href="#" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Quên mật khẩu?</a>
                </div>

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={isLoginSubmitting}
                  className="mt-6 rounded-xl shadow-lg shadow-indigo-200/50 hover:shadow-indigo-400/50 hover:-translate-y-0.5 transition-all duration-300 py-6 text-base font-bold tracking-wide"
                >
                  ĐĂNG NHẬP NGAY
                </Button>
              </form>
            </div>
          )}

          {/* Register Section */}
          {activeTab === 'register' && (
            <div className="animate-fade-in">
              <form onSubmit={handleRegisterSubmit(onRegister)} className="space-y-5">
                <Input
                  label="Họ và Tên"
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  autoComplete="name"
                  leftIcon={<User className="w-4 h-4" />}
                  error={registerErrors.name?.message}
                  {...registerSignup('name')}
                />

                <Input
                  label="Tài khoản muốn tạo"
                  type="text"
                  placeholder="Ví dụ: nguyenvana"
                  autoComplete="username"
                  leftIcon={<User className="w-4 h-4" />}
                  error={registerErrors.username?.message}
                  {...registerSignup('username')}
                />

                <Input
                  label="Mật khẩu"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu an toàn"
                  autoComplete="new-password"
                  leftIcon={<Lock className="w-4 h-4" />}
                  error={registerErrors.password?.message}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-emerald-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...registerSignup('password')}
                />

                <div className="relative">
                  <Input
                    label="Xác nhận mật khẩu"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Nhập lại mật khẩu"
                    autoComplete="new-password"
                    leftIcon={<Lock className={`w-4 h-4 transition-colors ${isPasswordMatch ? 'text-emerald-500' : isPasswordError ? 'text-rose-500' : ''}`} />}
                    error={registerErrors.confirmPassword?.message}
                    className={`transition-all duration-300 ${isPasswordMatch ? 'border-emerald-400 ring-1 ring-emerald-400 bg-emerald-50/30' : ''} ${isPasswordError ? 'border-rose-400 ring-1 ring-rose-400 bg-rose-50/30' : ''}`}
                    rightElement={
                      <div className="min-h-[44px] min-w-[44px] flex items-center justify-center">
                        {isPasswordMatch && <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-slide-up" />}
                        {isPasswordError && <XCircle className="w-5 h-5 text-rose-500 animate-slide-down" />}
                      </div>
                    }
                    {...registerSignup('confirmPassword')}
                  />
                </div>

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={isRegisterSubmitting}
                  className="mt-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200/50 hover:shadow-emerald-400/50 hover:-translate-y-0.5 transition-all duration-300 py-6 text-base font-bold tracking-wide"
                >
                  TẠO TÀI KHOẢN VÀ VÀO HỆ THỐNG
                </Button>
              </form>
            </div>
          )}
          
        </div>
      </div>
    </div>
  )
}
