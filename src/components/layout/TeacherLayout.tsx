import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { missingTeacherFields, REQUIRED_TEACHER_FIELDS } from '@/lib/teacherProfile'
import { PenLine, History, User, LogOut, FileText, Globe, CalendarClock, ClipboardCheck, CalendarRange, CircleAlert, ArrowRight, CheckCircle2 } from 'lucide-react'
import { doc, getDoc, collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { BookingRequest } from '@/types'
import { signOut } from '@/lib/auth'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { toast } from '@/stores/toastStore'
import { Logo } from '@/components/shared/Logo'
import { Teacher } from '@/types'
import { NotificationDrawer } from '../shared/NotificationDrawer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export function TeacherLayout() {
  const { user, teacherId } = useAuthStore()
  const { lang, setLang, t } = useLanguageStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileReminder, setProfileReminder] = useState<{ missingPhoto: boolean } | null>(null)
  // null = chưa biết (đang tải) — chỉ chặn khi chắc chắn hồ sơ thiếu
  const [profileMissingCount, setProfileMissingCount] = useState<number | null>(null)
  const [profileMissingFields, setProfileMissingFields] = useState<(keyof Teacher)[]>([])
  const [showProfileCompletionModal, setShowProfileCompletionModal] = useState(false)
  
  // Real-time clock and timezone states
  const [timezoneOffset, setTimezoneOffset] = useState<number>(7)
  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  // shortLabel: nhãn rút gọn cho bottom nav mobile — nhãn dài ("Lịch dạy của tôi")
  // bị xuống 2 dòng làm lệch cả thanh điều hướng
  const navItems = [
    { to: '/teacher/attendance', icon: PenLine, labelKey: 'nav.attendance', shortLabel: { vi: 'Điểm danh', en: 'Attendance' } },
    { to: '/teacher/availability', icon: CalendarRange, labelKey: 'nav.availability', shortLabel: { vi: 'Lịch rảnh', en: 'Availability' } },
    { to: '/teacher/schedules', icon: CalendarClock, labelKey: 'nav.schedules', shortLabel: { vi: 'Lịch dạy', en: 'Classes' } },
    { to: '/teacher/evaluations', icon: ClipboardCheck, labelKey: 'nav.evaluations', shortLabel: { vi: 'Đánh giá', en: 'Reviews' } },
    { to: '/teacher/history', icon: History, labelKey: 'nav.history', shortLabel: { vi: 'Lịch sử', en: 'History' } },
    { to: '/teacher/contract', icon: FileText, labelKey: 'nav.contract', shortLabel: { vi: 'Hợp đồng', en: 'Contract' } },
    { to: '/teacher/profile', icon: User, labelKey: 'nav.profile', shortLabel: { vi: 'Hồ sơ', en: 'Profile' } },
  ]

  const handleSignOut = async () => {
    if (teacherId) {
      sessionStorage.removeItem(`teacher-profile-completion-notice:${teacherId}`)
    }
    await signOut()
    toast.success(t('nav.signed_out'))
    navigate('/login')
  }

  const toggleLang = () => setLang(lang === 'vi' ? 'en' : 'vi')

  // Clock tick interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = () => {
    const utcMs = currentTime.getTime() + currentTime.getTimezoneOffset() * 60 * 1000
    const targetMs = utcMs + timezoneOffset * 60 * 60 * 1000
    const d = new Date(targetMs)
    
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    
    const sign = timezoneOffset >= 0 ? '+' : '-'
    const absOffset = Math.abs(timezoneOffset)
    const offsetHours = String(Math.floor(absOffset)).padStart(2, '0')
    const offsetMins = String(Math.round((absOffset % 1) * 60)).padStart(2, '0')
    
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} (UTC${sign}${offsetHours}:${offsetMins})`
  }

  // Sync profile reminder and timezone offset in real time
  useEffect(() => {
    if (!teacherId) {
      setProfileReminder(null)
      setProfileMissingFields([])
      setProfileMissingCount(null)
      setShowProfileCompletionModal(false)
      setTimezoneOffset(7)
      return
    }

    const unsub = onSnapshot(doc(db, 'teachers', teacherId), (snap) => {
      if (snap.exists()) {
        const teacherData = snap.data()
        const offset = typeof teacherData.timezoneOffset === 'number' ? teacherData.timezoneOffset : 7
        setTimezoneOffset(offset)
        const missingPhoto = !teacherData.photoURL
        const missingFields = missingTeacherFields(teacherData as Teacher)
        setProfileReminder(missingPhoto ? { missingPhoto } : null)
        setProfileMissingFields(missingFields)
        setProfileMissingCount(missingFields.length)

        const reminderKey = `teacher-profile-completion-notice:${teacherId}`
        if (missingFields.length === 0) {
          sessionStorage.removeItem(reminderKey)
          setShowProfileCompletionModal(false)
        } else if (
          !location.pathname.startsWith('/teacher/contract') &&
          sessionStorage.getItem(reminderKey) !== 'dismissed'
        ) {
          setShowProfileCompletionModal(true)
        }
      }
    })

    return unsub
  }, [teacherId, location.pathname])

  const dismissProfileCompletionModal = () => {
    if (teacherId) {
      sessionStorage.setItem(`teacher-profile-completion-notice:${teacherId}`, 'dismissed')
    }
    setShowProfileCompletionModal(false)
  }

  const openProfileFromReminder = () => {
    dismissProfileCompletionModal()
    navigate('/teacher/profile?setupRequired=true')
  }

  // Hồ sơ chưa hoàn thiện -> khóa mọi trang, đưa về Hồ sơ để điền đủ (trừ trang Hợp đồng)
  useEffect(() => {
    if (profileMissingCount === null || profileMissingCount === 0) return
    const path = location.pathname
    if (path.startsWith('/teacher/profile') || path.startsWith('/teacher/contract')) return
    navigate('/teacher/profile?setupRequired=true', { replace: true })
  }, [profileMissingCount, location.pathname, navigate])

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
      {/* Desktop header — mọi nhãn giữ 1 dòng (whitespace-nowrap), đồng hồ gọn, không cho wrap xấu */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur border-b border-slate-200 items-center px-4 xl:px-6 z-30 gap-3 shadow-sm">
        <div className="flex items-center gap-2.5 shrink-0">
          <Logo className="h-9 w-auto max-w-[130px]" />
          <span className="text-[11px] font-bold text-[#3BB8EB] uppercase tracking-wider border-l border-slate-200 pl-2.5 whitespace-nowrap">{t('nav.teacher')}</span>
          <span
            className="inline-flex items-center whitespace-nowrap text-[11px] font-mono font-bold text-slate-500 bg-slate-100/80 px-2 py-1 rounded-lg border border-slate-200/50 tabular-nums"
            title={formatTime()}
          >
            {formatTime().replace(/^\d{4}-\d{2}-\d{2} /, '').replace('(UTC', '· UTC').replace(')', '')}
          </span>
        </div>

        <nav className="flex items-center gap-0.5 xl:gap-1 flex-1 justify-center min-w-0 overflow-x-auto hide-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all duration-200
                ${isActive ? 'bg-[#3BB8EB]/10 text-[#2196F3] shadow-[inset_0_0_0_1px_rgba(59,184,235,0.25)]' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200 shrink-0">
          {/* Notifications bell drawer */}
          <NotificationDrawer targetType="teachers" targetId={teacherId || ''} />

          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all whitespace-nowrap"
            title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <Globe className="w-3.5 h-3.5" />
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
          <span className="text-[11px] text-slate-400 hidden 2xl:block max-w-[180px] truncate" title={user?.email || ''}>{user?.email}</span>
          <button onClick={handleSignOut} className="p-2 text-slate-400 hover:text-rose-500 transition-colors" title={t('nav.signout')}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center px-4 z-40 shadow-sm gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Logo className="h-8 w-auto max-w-[120px]" />
          <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60 truncate">
            {formatTime()}
          </span>
        </div>
        {/* Notifications bell drawer */}
        <NotificationDrawer targetType="teachers" targetId={teacherId || ''} />

        <button
          onClick={toggleLang}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shrink-0"
        >
          <Globe className="w-3 h-3" />
          {lang === 'vi' ? 'EN' : 'VI'}
        </button>

        {/* Nút đăng xuất trên mobile — trước đây chỉ desktop mới có */}
        <button
          onClick={handleSignOut}
          className="p-2 text-slate-400 hover:text-rose-500 active:text-rose-600 transition-colors shrink-0"
          title={t('nav.signout')}
          aria-label={t('nav.signout')}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <main className="min-h-screen">
        <div className="pt-14 lg:pt-16 pb-20 lg:pb-6 px-4 sm:px-6 py-6">
          {profileMissingCount !== null && profileMissingCount > 0 && (
            <div className="mx-auto mb-4 max-w-4xl rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-rose-950 shadow-sm">
              <p className="text-sm font-bold">
                {lang === 'vi'
                  ? `Hồ sơ của bạn còn thiếu ${profileMissingCount} mục bắt buộc`
                  : `Your profile is missing ${profileMissingCount} required fields`}
              </p>
              <p className="mt-1 text-xs leading-5 text-rose-700">
                {lang === 'vi'
                  ? 'Vui lòng hoàn thiện đầy đủ hồ sơ (kể cả ảnh đại diện) trước khi sử dụng các chức năng khác. Các ô còn thiếu được đánh dấu màu đỏ.'
                  : 'Please complete your full profile (including profile photo) before using other features. Missing fields are highlighted in red.'}
              </p>
            </div>
          )}
          {profileReminder && profileMissingCount === 0 && (
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

      {/* Mobile bottom nav — nhãn rút gọn 1 dòng, không để chữ dài xuống hàng làm lệch thanh */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-flow-col auto-cols-fr h-14">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium relative whitespace-nowrap
                ${isActive ? 'text-[#3BB8EB]' : 'text-slate-400 hover:text-slate-600'}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-[#3BB8EB]' : ''}`} />
                  <span className="leading-none">{item.shortLabel[lang === 'vi' ? 'vi' : 'en']}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#3BB8EB] rounded-full" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <Modal
        open={showProfileCompletionModal && (profileMissingCount || 0) > 0}
        onClose={dismissProfileCompletionModal}
        title={lang === 'vi' ? 'Yêu cầu trước khi điểm danh' : 'Required before attendance'}
        size="sm"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={dismissProfileCompletionModal}>
              {lang === 'vi' ? 'Đóng thông báo' : 'Close'}
            </Button>
            <Button
              onClick={openProfileFromReminder}
              className="bg-[#2196F3] hover:bg-[#1976D2] focus:ring-[#2196F3]"
            >
              {lang === 'vi' ? 'Cập nhật hồ sơ ngay' : 'Complete profile now'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      >
        <div className="space-y-5">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
              <CircleAlert className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 text-balance">
                {lang === 'vi'
                  ? 'Hoàn thiện hồ sơ để mở chức năng điểm danh'
                  : 'Complete your profile to unlock attendance'}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {lang === 'vi'
                  ? `Hồ sơ của bạn còn thiếu ${profileMissingCount || 0} mục bắt buộc. Sau khi lưu đủ thông tin, hệ thống sẽ tự động mở Điểm danh và các chức năng khác.`
                  : `Your profile is missing ${profileMissingCount || 0} required fields. Attendance and other features will unlock automatically after you save all required information.`}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
            <p className="text-xs font-semibold text-slate-500">
              {lang === 'vi' ? 'Các mục cần bổ sung' : 'Information to add'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REQUIRED_TEACHER_FIELDS
                .filter((field) => profileMissingFields.includes(field.key))
                .slice(0, 4)
                .map((field) => (
                  <span key={field.key} className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100">
                    {lang === 'vi' ? field.label : field.labelEn}
                  </span>
                ))}
              {profileMissingFields.length > 4 && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  +{profileMissingFields.length - 4} {lang === 'vi' ? 'mục khác' : 'more'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 px-3.5 py-3 text-emerald-800 ring-1 ring-emerald-100">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs leading-5">
              {lang === 'vi'
                ? 'Không cần liên hệ Admin. Trạng thái được kiểm tra và cập nhật tự động ngay sau khi bạn lưu hồ sơ.'
                : 'No Admin approval is needed. Your access updates automatically after you save the completed profile.'}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
