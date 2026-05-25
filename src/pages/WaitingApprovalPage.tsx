import { useNavigate } from 'react-router-dom'
import { signOut } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Clock, Phone, LogOut, MessageCircle, BookOpen, Globe } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/languageStore'
import { Logo } from '@/components/shared/Logo'

export function WaitingApprovalPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { t, lang, setLang } = useLanguageStore()

  const handleSignOut = async () => {
    await signOut()
    toast.success(t('waiting.logout') + ' ' + t('waiting.title').replace('! 🎉', '')) // Quick translation fix for toast
    navigate('/login')
  }

  const toggleLang = () => setLang(lang === 'vi' ? 'en' : 'vi')

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-sky-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-15%] right-[-10%] w-[50%] h-[50%] bg-[#3BB8EB]/8 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FFE500]/10 rounded-full blur-[100px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 transition-all border border-slate-200/50 backdrop-blur-sm"
            title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <Globe className="w-4 h-4" />
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-[2rem] p-8 shadow-xl shadow-slate-200/30 text-center relative pt-12">
          
          <div className="w-16 h-16 bg-gradient-to-br from-[#FFE500] to-[#E6A800] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-yellow-200/50 animate-bounce">
            <Clock className="w-8 h-8 text-white" />
          </div>

          <div className="flex justify-center mb-4">
            <Logo className="scale-75" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {t('waiting.title')}
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            {t('waiting.desc1')}<br />
            {t('waiting.desc2')}
          </p>

          <div className="bg-sky-50 border border-sky-100 rounded-2xl p-5 mb-6 text-left space-y-3">
            <h3 className="text-sm font-bold text-[#2196F3] flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              {t('waiting.guide_title')}
            </h3>
            <div className="space-y-2.5">
              {[
                t('waiting.step1'),
                t('waiting.step2'),
                t('waiting.step3'),
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-[#3BB8EB] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-slate-700">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <a href="tel:0906966691"
            className="flex items-center justify-center gap-3 w-full py-3.5 bg-[#3BB8EB] text-white rounded-xl font-semibold text-sm shadow-lg shadow-sky-200/50 hover:bg-[#2da8db] hover:-translate-y-0.5 transition-all duration-300 mb-3">
            <Phone className="w-5 h-5" />
            {t('waiting.call')}
          </a>

          <div className="flex gap-3">
            <Button fullWidth variant="outline" onClick={handleSignOut} className="text-sm">
              <LogOut className="w-4 h-4 mr-2" />
              {t('waiting.logout')}
            </Button>
            <Button fullWidth variant="ghost" onClick={() => window.location.reload()} className="text-sm">
              {t('waiting.check_again')}
            </Button>
          </div>

          {user && (
            <p className="text-xs text-slate-400 mt-4">{t('waiting.account')}: {user.email}</p>
          )}
        </div>
      </div>
    </div>
  )
}
