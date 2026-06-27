import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { PenLine, History, User, LogOut, FileText, Globe, CalendarClock } from 'lucide-react'
import { doc, getDoc, collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { BookingRequest } from '@/types'
import { signOut } from '@/lib/auth'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { toast } from '@/stores/toastStore'
import { Logo } from '@/components/shared/Logo'
import { Teacher } from '@/types'

export function TeacherLayout() {
  const { user, teacherId } = useAuthStore()
  const { lang, setLang, t } = useLanguageStore()
  const navigate = useNavigate()
  const [profileReminder, setProfileReminder] = useState<{ missingPhoto: boolean } | null>(null)

  const navItems = [
    { to: '/teacher/attendance', icon: PenLine, labelKey: 'nav.attendance' },
    { to: '/teacher/schedules', icon: CalendarClock, labelKey: 'nav.schedules' },
    { to: '/teacher/history', icon: History, labelKey: 'nav.history' },
    { to: '/teacher/contract', icon: FileText, labelKey: 'nav.contract' },
    { to: '/teacher/profile', icon: User, labelKey: 'nav.profile' },
  ]

  const handleSignOut = async () => {
    await signOut()
    toast.success(t('nav.signed_out'))
    navigate('/login')
  }

  const toggleLang = () => setLang(lang === 'vi' ? 'en' : 'vi')

  useEffect(() => {
    if (!teacherId) {
      setProfileReminder(null)
      return
    }

    let active = true
    const currentTeacherId = teacherId

    async function loadReminderState() {
      try {
        const teacherSnap = await getDoc(doc(db, 'teachers', currentTeacherId))

        if (!active) return

        const teacher = teacherSnap.exists() ? ({ id: teacherSnap.id, ...teacherSnap.data() } as Teacher) : null

        const missingPhoto = !teacher?.photoURL

        setProfileReminder(missingPhoto ? { missingPhoto } : null)
      } catch (error) {
        console.error('Error loading teacher profile reminder:', error)
      }
    }

    loadReminderState()

    return () => {
      active = false
    }
  }, [teacherId])

  // Real-time booking schedules notification listener
  useEffect(() => {
    if (!teacherId) return

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Record session start time to avoid notification alerts for old historic bookings
    const sessionStart = Timestamp.now()

    const q = query(
      collection(db, 'bookingRequests'),
      where('teacherId', '==', teacherId),
      where('status', '==', 'confirmed')
    )

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const booking = { id: change.doc.id, ...change.doc.data() } as BookingRequest
          if (booking.confirmedAt && booking.confirmedAt.seconds > sessionStart.seconds) {
            // Trigger browser native notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Lịch dạy mới!', {
                body: `Bạn có lịch dạy mới với học sinh ${booking.studentName} lúc ${booking.requestedStart} ngày ${booking.requestedDate}.`,
                icon: '/favicon.ico'
              })
            }
            // Trigger in-app toast
            toast.success(`Lịch dạy mới: ${booking.studentName} - ${booking.requestedStart} ngày ${booking.requestedDate}`)
          }
        }
      })
    }, (error) => {
      console.error('Error listening for new teacher bookings:', error)
    })

    return unsub
  }, [teacherId])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop header */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 items-center px-6 z-30 gap-4 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <Logo className="scale-[0.6] origin-left" />
          <span className="text-xs font-bold text-[#3BB8EB] uppercase tracking-wider border-l border-slate-200 pl-3">{t('nav.teacher')}</span>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${isActive ? 'bg-[#3BB8EB]/10 text-[#3BB8EB]' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`
              }
            >
              <item.icon className="w-4 h-4" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
            title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <Globe className="w-3.5 h-3.5" />
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
          <span className="text-xs text-slate-500 hidden xl:block">{user?.email}</span>
          <button onClick={handleSignOut} className="p-2 text-slate-400 hover:text-rose-500 transition-colors" title={t('nav.signout')}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center px-4 z-40 shadow-sm">
        <div className="flex items-center gap-2.5 flex-1">
          <Logo className="scale-[0.55] origin-left -ml-2" />
        </div>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
        >
          <Globe className="w-3 h-3" />
          {lang === 'vi' ? 'EN' : 'VI'}
        </button>
      </header>

      <main className="min-h-screen">
        <div className="pt-14 lg:pt-16 pb-20 lg:pb-6 px-4 sm:px-6 py-6">
          {profileReminder && (
            <div className="mx-auto mb-4 max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold">Cập nhật hồ sơ để được ưu tiên hiển thị</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Trang Đội ngũ giáo viên mới sẽ ưu tiên hồ sơ có ảnh rõ ràng. Lịch rảnh hiện do Admin quản lý để đảm bảo xếp lịch thống nhất.
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {profileReminder.missingPhoto && (
                    <button
                      type="button"
                      onClick={() => navigate('/teacher/profile')}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
                    >
                      Cập nhật ảnh
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="grid grid-cols-4 h-14">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium relative
                ${isActive ? 'text-[#3BB8EB]' : 'text-slate-400 hover:text-slate-600'}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-[#3BB8EB]' : ''}`} />
                  <span>{t(item.labelKey)}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#3BB8EB] rounded-full" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
