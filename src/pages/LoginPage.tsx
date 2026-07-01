import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Lock, Eye, EyeOff, Search, BarChart2, MessageSquare, Users, ShieldCheck, Info, GraduationCap, Settings, Phone, Globe, ChevronRight, Award, BookOpen } from 'lucide-react'
import { signIn, signInTeacher } from '@/lib/auth'
import { useLanguageStore } from '@/stores/languageStore'
import { Modal } from '@/components/ui/Modal'
import { PublicNav } from '@/components/layout/PublicNav'

const loginSchema = z.object({
  username: z.string().min(3, 'Tài khoản tối thiểu 3 ký tự'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  remember: z.boolean().optional()
})

type LoginData = z.infer<typeof loginSchema>

type SectionKey = 'gioi-thieu' | 'chuong-trinh' | 'tin-tuc' | 'lien-he' | null

export function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const { t } = useLanguageStore()
  
  // Login modal state
  const [loginRole, setLoginRole] = useState<'teacher' | 'admin' | null>(null)

  // Section modal state
  const [activeSection, setActiveSection] = useState<SectionKey>(null)

  // Parent search state
  const [studentCode, setStudentCode] = useState('')

  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors, isSubmitting: isLoginSubmitting },
    reset: resetLoginForm
  } = useForm<LoginData>({ resolver: zodResolver(loginSchema) })

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
      
      const { role } = result
      
      if (role === 'admin' || role === 'student_manager' || role === 'teacher_manager') navigate('/admin/dashboard')
      else if (role === 'teacher') navigate('/teacher/attendance')
      else if (role === 'guest') navigate('/waiting')
      else setErrorMsg('Tài khoản không có quyền truy cập')
    } catch (err: unknown) {
      const msg = (err as Error).message || ''
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found') || msg.includes('invalid-email') || msg.includes('Mật khẩu không đúng') || msg.includes('Mã giáo viên không tồn tại')) {
        setErrorMsg('Mã giáo viên hoặc mật khẩu không đúng')
      } else if (msg.includes('too-many-requests')) {
        setErrorMsg('Quá nhiều lần thử. Vui lòng thử lại sau.')
      } else if (msg.includes('không có quyền') || msg.includes('does not have access')) {
        setErrorMsg('Tài khoản không có quyền truy cập')
      } else if (msg.includes('chưa được kích hoạt')) {
        setErrorMsg(msg)
      } else {
        setErrorMsg('Đăng nhập thất bại. Vui lòng thử lại.')
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

  // Section modal content
  const sectionContent: Record<Exclude<SectionKey, null>, { title: string; content: React.ReactNode }> = {
    'gioi-thieu': {
      title: 'Giới thiệu chung',
      content: (
        <div className="space-y-4 text-slate-600 leading-relaxed">
          <p><strong className="text-slate-900">123English</strong> là một nền tảng giáo dục trực tuyến chuyên về đào tạo tiếng Anh tại Việt Nam. Đơn vị này đã khẳng định được uy tín khi được vinh danh là <strong className="text-slate-900">"Thương hiệu giáo dục trực tuyến Việt Nam ưu tiên tin dùng"</strong>.</p>
          <p>Hình ảnh từ tư liệu cho thấy thương hiệu này từng xuất hiện trên các kênh truyền hình lớn như HTV9 để khẳng định chất lượng và sự tin cậy đối với người học.</p>
        </div>
      )
    },
    'chuong-trinh': {
      title: 'Chương trình học',
      content: (
        <div className="space-y-6">
          <p className="text-slate-600">Dựa trên cấu trúc trang web và các hoạt động trên mạng xã hội, chương trình học tại đây khá đa dạng:</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-3">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 mb-1.5 text-sm">Đội ngũ giáo viên</h3>
              <p className="text-slate-600 text-xs leading-relaxed">Gồm các thầy cô Việt Nam và giáo viên nước ngoài đến từ Anh, Mỹ, sở hữu trình độ chuyên môn cao.</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 mb-1.5 text-sm">Hình thức học</h3>
              <p className="text-slate-600 text-xs leading-relaxed">Tập trung mạnh vào mảng trực tuyến (Online), cho phép người học tiếp cận linh hoạt.</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 mb-1.5 text-sm">Nội dung</h3>
              <p className="text-slate-600 text-xs leading-relaxed">Bao gồm các khóa học từ cơ bản đến nâng cao, tiếng Anh giao tiếp và bổ trợ kiến thức.</p>
            </div>
          </div>
        </div>
      )
    },
    'tin-tuc': {
      title: 'Tin tức & Sự kiện',
      content: (
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-1.5">Giải thưởng</h3>
              <p className="text-slate-600 text-sm leading-relaxed">Đạt các danh hiệu về thương hiệu giáo dục uy tín trong năm 2024.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-1.5">Truyền thông</h3>
              <p className="text-slate-600 text-sm leading-relaxed">Thường xuyên cập nhật các video bài giảng, giới thiệu giáo viên mới và các chương trình ưu đãi học phí.</p>
            </div>
          </div>
        </div>
      )
    },
    'lien-he': {
      title: 'Liên hệ',
      content: (
        <div className="space-y-4">
          <p className="text-slate-600">Để tìm hiểu chi tiết hơn hoặc đăng ký tư vấn, bạn có thể liên hệ qua các kênh sau:</p>
          <div className="space-y-3">
            <a href="https://facebook.com/123englishinvietnam" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-slate-50 hover:bg-slate-100 transition-colors p-4 rounded-xl">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold text-lg text-white">f</div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Facebook</div>
                <div className="font-bold text-slate-900 text-sm">facebook.com/123englishinvietnam</div>
              </div>
            </a>
            <a href="tel:0906966691" className="flex items-center gap-4 bg-slate-50 hover:bg-slate-100 transition-colors p-4 rounded-xl">
              <div className="w-10 h-10 bg-[#FFC107] rounded-full flex items-center justify-center text-slate-900">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Hotline</div>
                <div className="font-bold text-slate-900 text-sm">090.696.6691</div>
              </div>
            </a>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Thông tin này được tổng hợp trực tiếp từ các nguồn tin công khai liên quan. Nếu bạn cần đi sâu vào một khóa học cụ thể, bạn nên nhắn tin trực tiếp cho fanpage để được hỗ trợ tốt nhất.
          </p>
        </div>
      )
    }
  }

  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden">
      <PublicNav />

      {/* Main Content - two column layout */}
      <main className="flex-1 grid lg:grid-cols-2 min-h-0">
        {/* Left Side: Layered hero - text on top, image below */}
        <div className="relative hidden lg:flex flex-col justify-between overflow-hidden" style={{ background: 'linear-gradient(135deg, #f8f9fb 0%, #eef1f5 100%)' }}>
          {/* Image at bottom-right, z-index: 1 */}
          <img
            src="/hero0.jpg"
            alt="Learning"
            className="absolute bottom-0 right-0 w-[95%] h-[75%] object-cover object-top"
            style={{ zIndex: 1 }}
          />
          {/* Gradient overlay: fades background color into transparent so text is readable */}
          <div
            className="absolute inset-0"
            style={{
              zIndex: 2,
              background: 'linear-gradient(to bottom, #f8f9fb 15%, rgba(248,249,251,0.85) 35%, rgba(248,249,251,0.2) 60%, transparent 80%)'
            }}
          />

          {/* Text content - z-index: 3, always above image */}
          <div className="relative p-10 lg:p-12" style={{ zIndex: 3 }}>
            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-extrabold text-[#1E293B] leading-[1.1] tracking-tight">
              {t('landing.hero_title1')}<br />
              <span className="text-[#FFC107]">{t('landing.hero_title2')}</span>
            </h1>
            <p className="mt-4 text-base lg:text-lg text-slate-600 max-w-md font-medium leading-relaxed">
              {t('landing.hero_desc')}
            </p>
          </div>

          {/* 3 glass cards at bottom - z-index: 3, floating over image */}
          <div className="relative px-10 lg:px-12 pb-8" style={{ zIndex: 3 }}>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-4 border border-white/90 shadow-lg shadow-black/5">
                <div className="w-9 h-9 rounded-xl bg-[#FFC107]/15 flex items-center justify-center mb-2.5">
                  <BarChart2 className="w-5 h-5 text-[#FFC107]" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">{t('landing.feat1_title')}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{t('landing.feat1_desc')}</p>
              </div>
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-4 border border-white/90 shadow-lg shadow-black/5">
                <div className="w-9 h-9 rounded-xl bg-[#FFC107]/15 flex items-center justify-center mb-2.5">
                  <MessageSquare className="w-5 h-5 text-[#FFC107]" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">{t('landing.feat2_title')}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{t('landing.feat2_desc')}</p>
              </div>
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-4 border border-white/90 shadow-lg shadow-black/5">
                <div className="w-9 h-9 rounded-xl bg-[#FFC107]/15 flex items-center justify-center mb-2.5">
                  <Users className="w-5 h-5 text-[#FFC107]" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">{t('landing.feat3_title')}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{t('landing.feat3_desc')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile hero - shown only on small screens */}
        <div className="lg:hidden px-4 pt-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1E293B] leading-[1.1] tracking-tight">
            {t('landing.hero_title1')} <span className="text-[#FFC107]">{t('landing.hero_title2')}</span>
          </h1>
          <p className="mt-2 text-sm text-slate-600 font-medium">{t('landing.hero_desc')}</p>
        </div>

        {/* Right Side: Cards */}
        <div className="bg-[#F8FAFC] flex flex-col justify-center px-6 sm:px-8 lg:px-12 xl:px-16 py-6 space-y-4 overflow-y-auto">
          {/* Card: Tra cứu */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 relative overflow-hidden">
            <div className="absolute top-5 right-5 flex gap-1">
              <div className="w-1 h-1 rounded-full bg-amber-200" />
              <div className="w-1 h-1 rounded-full bg-amber-200" />
              <div className="w-1 h-1 rounded-full bg-amber-200" />
              <div className="w-1 h-1 rounded-full bg-amber-200" />
            </div>
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
          <div className="bg-white rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 relative">
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
      </main>

      {/* Compact Footer */}
      <footer className="border-t border-slate-200 bg-white py-3 shrink-0">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            © 2026 Hộ kinh doanh Gia Sư Toàn Năng
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-500 font-medium">
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Chính sách bảo mật</span>
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Điều khoản sử dụng</span>
            <div className="w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-black transition-colors font-bold text-[9px]">f</div>
          </div>
        </div>
      </footer>

      {/* Section Modal */}
      {activeSection && (
        <Modal
          open={activeSection !== null}
          onClose={() => setActiveSection(null)}
          title={sectionContent[activeSection].title}
          size="md"
        >
          {sectionContent[activeSection].content}
        </Modal>
      )}

      {/* Login Modal */}
      <Modal
        open={loginRole !== null}
        onClose={() => setLoginRole(null)}
        title={loginRole === 'teacher' ? 'Đăng nhập Giáo viên' : 'Đăng nhập Quản trị viên'}
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
              {loginRole === 'teacher' ? 'Mã giáo viên' : 'Tài khoản'}
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={loginRole === 'teacher' ? 'Ví dụ: GVMLLNBR' : 'Nhập tên đăng nhập'}
                autoComplete="username"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2196F3] focus:bg-white transition-all text-sm font-medium"
                {...registerLogin('username')}
              />
            </div>
            {loginErrors.username && <p className="mt-1.5 text-xs text-rose-500 font-medium">{loginErrors.username.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Mật khẩu</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={loginRole === 'teacher' ? 'Mật khẩu cố định' : 'Nhập mật khẩu'}
                autoComplete="current-password"
                className="w-full pl-11 pr-12 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2196F3] focus:bg-white transition-all text-sm font-medium"
                {...registerLogin('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {loginErrors.password && <p className="mt-1.5 text-xs text-rose-500 font-medium">{loginErrors.password.message}</p>}
          </div>

          {loginRole === 'teacher' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-600 font-medium">
               Đăng nhập với mã giáo viên (vd: GVMLLNBR)
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
              'Đăng nhập ngay'
            )}
          </button>
        </form>
      </Modal>
    </div>
  )
}
