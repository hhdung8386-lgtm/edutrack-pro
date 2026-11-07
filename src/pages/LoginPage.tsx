import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Lock, Eye, EyeOff, Search, ShieldCheck, Info, GraduationCap, Settings, ChevronRight } from 'lucide-react'
import { signIn, signInTeacher, signOut } from '@/lib/auth'
import { waitForAuthProfile } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { Modal } from '@/components/ui/Modal'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { NationalBrandStory } from '@/components/landing/NationalBrandStory'
import { PublicFaq } from '@/components/landing/PublicFaq'
import { LatestNewsSection } from '@/components/landing/LatestNewsSection'
import { PressCoverage } from '@/components/landing/PressCoverage'

function buildLoginSchema(lang: 'vi' | 'en') {
  return z.object({
    username: z.string().min(3, lang === 'en' ? 'Username must be at least 3 characters' : 'Tài khoản tối thiểu 3 ký tự'),
    password: z.string().min(6, lang === 'en' ? 'Password must be at least 6 characters' : 'Mật khẩu tối thiểu 6 ký tự'),
    remember: z.boolean().optional()
  })
}

type LoginData = z.infer<ReturnType<typeof buildLoginSchema>>

export function LoginPage() {
  const { t, lang } = useLanguageStore()
  const L = (vi: string, en: string) => (lang === 'en' ? en : vi)
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  
  // Login modal state
  const [loginRole, setLoginRole] = useState<'teacher' | 'admin' | null>(null)

  // Parent search state
  const [studentCode, setStudentCode] = useState('')

  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors, isSubmitting: isLoginSubmitting },
    reset: resetLoginForm
  } = useForm<LoginData>({ resolver: zodResolver(buildLoginSchema(lang)) })

  const formatEmail = (username: string) => {
    if (!username.includes('@')) return `${username}@edutrackpro.app`
    return username
  }

  const onLogin = async (data: LoginData) => {
    setErrorMsg('')
    try {
      let result
      
      if (loginRole === 'teacher') {
        // For teacher login, use teacher code and fixed password
        result = await signInTeacher(data.username, data.password)
      } else {
        // For admin login, format as email
        const emailToUse = formatEmail(data.username)
        result = await signIn(emailToUse, data.password)
      }
      
      const { user, role, teacherId, accessScope } = result

      // Chỉ mở route sau khi listener quyền đã nhận xác nhận từ server. Việc tự
      // đẩy state ở đây có thể bị onAuthStateChanged ghi đè và gây nháy trang.
      try {
        await waitForAuthProfile(user.uid, role, role === 'teacher' ? teacherId : undefined)
      } catch (profileError) {
        await signOut()
        throw profileError
      }
      
      if (accessScope === 'booking_only') navigate('/admin/booking-schedules', { replace: true })
      else if (role === 'admin' || role === 'student_manager') navigate('/admin/students/fixed', { replace: true })
      else if (role === 'teacher_manager') navigate('/admin/teachers/online', { replace: true })
      else if (role === 'teacher') navigate('/teacher/ranking', { replace: true })
      else if (role === 'guest') navigate('/waiting', { replace: true })
      else setErrorMsg(L('Tài khoản không có quyền truy cập', 'This account does not have access'))
    } catch (err: unknown) {
      const msg = (err as Error).message || ''
      const code = (err as { code?: string }).code || ''
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found') || msg.includes('invalid-email') || msg.includes('Mật khẩu không đúng') || msg.includes('Mã gia sư không tồn tại')) {
        setErrorMsg(L('Mã gia sư hoặc mật khẩu không đúng', 'Incorrect tutor code or password'))
      } else if (msg.includes('too-many-requests')) {
        setErrorMsg(L('Quá nhiều lần thử. Vui lòng thử lại sau.', 'Too many attempts. Please try again later.'))
      } else if (code.includes('unavailable') || code.includes('network-request-failed') || msg.includes('network-request-failed')) {
        setErrorMsg(L('Kết nối tới máy chủ đang gián đoạn. Vui lòng kiểm tra mạng và thử lại; dữ liệu của bạn không bị thay đổi.', 'The connection to the server was interrupted. Please check your network and try again – your data has not been changed.'))
      } else if (msg.includes('không có quyền') || msg.includes('does not have access')) {
        setErrorMsg(L('Tài khoản không có quyền truy cập', 'This account does not have access'))
      } else if (
        msg.includes('chưa được kích hoạt') ||
        msg.includes('chưa được khởi tạo') ||
        msg.includes('chưa sẵn sàng') ||
        msg.includes('không khớp hồ sơ') ||
        msg.includes('không khớp UID') ||
        msg.includes('liên kết với nhiều hồ sơ') ||
        msg.includes('Liên kết tài khoản gia sư chưa đồng bộ') ||
        msg.includes('không phải tài khoản đăng nhập hiện hành') ||
        msg.includes('Không thể đồng bộ quyền') ||
        msg.includes('Không thể xác nhận quyền') ||
        msg.includes('Quá thời gian xác nhận quyền') ||
        msg.includes('nhiều tài khoản đang hoạt động') ||
        msg.includes('nhiều tài khoản đăng nhập') ||
        msg.includes('bị khóa quyền') ||
        msg.includes('đã nghỉ dạy') ||
        msg.includes('đã bị khóa')
      ) {
        setErrorMsg(lang === 'en' ? `${msg} (Please contact the 123English academic office if you need help.)` : msg)
      } else {
        setErrorMsg(L('Đăng nhập thất bại. Vui lòng thử lại.', 'Sign-in failed. Please try again.'))
      }
    }
  }

  const handleSearchProgress = () => {
    if (!studentCode.trim()) return
    navigate(`/parent?code=${encodeURIComponent(studentCode.trim())}`)
  }

  const openLogin = (role: 'teacher' | 'admin') => {
    setLoginRole(role)
    setErrorMsg('')
    resetLoginForm()
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden font-sans bg-white">
      <PublicNav />

      <main className="w-full">
        <section className="home-banner-hero">
          <img
            src="/home-hero-banner-123english.webp"
            srcSet="/home-hero-banner-123english-1200.webp 1200w, /home-hero-banner-123english.webp 2160w"
            sizes="100vw"
            width={2160}
            height={1013}
            decoding="async"
            alt={L('Gia sư 123English giảng dạy trực tuyến cùng mascot', 'A 123English tutor teaching online with the mascot')}
            className="home-banner-hero-image"
            fetchPriority="high"
          />
          <div className="home-banner-hero-scrim" aria-hidden="true" />

          <div className="home-banner-panel">
          {/* Card: Tra cứu */}
          <div id="tra-cuu" className="relative scroll-mt-24 rounded-2xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_54px_-30px_rgba(16,33,58,0.42)] backdrop-blur-sm sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-amber-50 rounded-full flex items-center justify-center shrink-0">
                <Search className="w-5 h-5 text-slate-800" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{t('landing.search_title')}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{t('landing.search_subtitle')}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentCode}
                    onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchProgress()}
                    placeholder={t('landing.search_placeholder')}
                    className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-amber-50 focus:border-[#FFC107] transition-all text-sm font-medium"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 px-1">{t('landing.search_hint')}</p>
              </div>

              <button
                onClick={handleSearchProgress}
                className="w-full py-3 bg-[#FFC107] hover:bg-[#FFB300] text-slate-900 font-bold rounded-xl shadow-lg shadow-amber-200/50 transition-all duration-300 flex items-center justify-center gap-2 text-sm"
              >
                <Search className="w-4 h-4" /> {t('landing.search_btn')}
              </button>

            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-medium bg-slate-50 py-2.5 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              {t('landing.search_safe')}
            </div>
          </div>

          {/* Card: Đăng nhập */}
          <div className="relative rounded-2xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_54px_-30px_rgba(16,33,58,0.42)] backdrop-blur-sm sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-[#2196F3]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{t('landing.login_title')}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{t('landing.login_subtitle')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => openLogin('teacher')}
                className="flex items-center justify-between px-3 py-3 border-2 border-slate-100 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all text-sm font-bold text-slate-700 group"
              >
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
                  <span className="text-xs">{t('landing.login_teacher')}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" />
              </button>
              
              <button
                onClick={() => openLogin('admin')}
                className="flex items-center justify-between px-3 py-3 border-2 border-slate-100 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all text-sm font-bold text-slate-700 group"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
                  <span className="text-xs">{t('landing.login_admin')}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-medium bg-slate-50 py-2.5 rounded-lg">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              {t('landing.login_note')}
            </div>
          </div>
        </div>
        </section>
      </main>

      <NationalBrandStory />

      <PressCoverage />
      <LatestNewsSection />

      {/* Compact Footer */}
      <PublicFaq />
      <PublicFooter />

      {/* Login Modal */}
      <Modal
        open={loginRole !== null}
        onClose={() => setLoginRole(null)}
        title={loginRole === 'teacher' ? L('Đăng nhập Gia sư', 'Tutor sign-in') : L('Đăng nhập Quản trị viên', 'Administrator sign-in')}
        size="sm"
      >
        <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-4">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-600 font-medium">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              {loginRole === 'teacher' ? L('Mã gia sư', 'Tutor code') : L('Tài khoản', 'Username')}
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={loginRole === 'teacher' ? L('Ví dụ: GVMLLNBR', 'e.g. GVMLLNBR') : L('Nhập tên đăng nhập', 'Enter your username')}
                autoComplete="username"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2196F3] focus:bg-white transition-all text-sm font-medium"
                {...registerLogin('username')}
              />
            </div>
            {loginErrors.username && <p className="mt-1.5 text-xs text-rose-500 font-medium">{loginErrors.username.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">{L('Mật khẩu', 'Password')}</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={loginRole === 'teacher' ? L('Nhập mật khẩu gia sư', 'Enter your tutor password') : L('Nhập mật khẩu', 'Enter your password')}
                autoComplete="current-password"
                className="w-full pl-11 pr-12 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2196F3] focus:bg-white transition-all text-sm font-medium"
                {...registerLogin('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? L('Ẩn mật khẩu', 'Hide password') : L('Hiện mật khẩu', 'Show password')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {loginErrors.password && <p className="mt-1.5 text-xs text-rose-500 font-medium">{loginErrors.password.message}</p>}
          </div>

          {loginRole === 'teacher' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-600 font-medium">
               {L('Đăng nhập với mã gia sư (vd: GVMLLNBR)', 'Sign in with your tutor code (e.g. GVMLLNBR)')}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoginSubmitting}
            className="w-full mt-2 py-3.5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl shadow-lg transition-all duration-300 flex items-center justify-center disabled:opacity-50 disabled:shadow-none text-sm"
          >
            {isLoginSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              L('Đăng nhập ngay', 'Sign in')
            )}
          </button>
        </form>
      </Modal>
    </div>
  )
}
