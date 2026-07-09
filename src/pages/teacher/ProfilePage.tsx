import { useEffect, useState } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Teacher, Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import { toast } from '@/stores/toastStore'
import { Copy, CalendarDays, Wallet, HeadphonesIcon, GraduationCap, Globe } from 'lucide-react'

export function ProfilePage() {
  const { teacherId } = useAuthStore()
  const { t } = useLanguageStore()
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingTimezone, setUpdatingTimezone] = useState(false)
  const [bankName, setBankName] = useState('')
  const [bankAccountNo, setBankAccountNo] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')
  const [savingBank, setSavingBank] = useState(false)

  // Sync state when teacher data loads
  useEffect(() => {
    if (teacher) {
      setBankName(teacher.bankName || '')
      setBankAccountNo(teacher.bankAccountNo || '')
      setBankAccountName(teacher.bankAccountName || '')
    }
  }, [teacher])

  const handleSaveBank = async () => {
    if (!teacherId) return
    setSavingBank(true)
    try {
      await updateDoc(doc(db, 'teachers', teacherId), {
        bankName,
        bankAccountNo: bankAccountNo.replace(/\s+/g, ''),
        bankAccountName: bankAccountName.toUpperCase()
      })
      setTeacher(prev => prev ? { 
        ...prev, 
        bankName, 
        bankAccountNo: bankAccountNo.replace(/\s+/g, ''), 
        bankAccountName: bankAccountName.toUpperCase() 
      } : null)
      toast.success('Đã cập nhật thông tin tài khoản ngân hàng!')
    } catch (err) {
      console.error(err)
      toast.error('Không thể cập nhật thông tin ngân hàng')
    } finally {
      setSavingBank(false)
    }
  }

  useEffect(() => {
    if (!teacherId) return
    getDoc(doc(db, 'teachers', teacherId)).then((snap) => {
      if (snap.exists()) setTeacher({ id: snap.id, ...snap.data() } as Teacher)
      setLoading(false)
    })

    const month = getCurrentMonth()
    const q = query(
      collection(db, 'lessons'),
      where('teacherId', '==', teacherId)
    )
    return onSnapshot(q, (snap) => {
      setLessons(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Lesson))
          .filter((lesson) => lesson.status === 'approved' && lesson.date >= `${month}-01`)
      )
    })
  }, [teacherId])

  const handleTimezoneChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const countryCode = e.target.value
    if (!teacherId) return
    
    const countryMap: Record<string, number> = {
      VN: 7,
      PH: 8,
      JP: 9,
      KR: 9,
      US_EST: -5,
      US_PST: -8,
    }
    const offset = countryMap[countryCode] ?? 7

    setUpdatingTimezone(true)
    try {
      await updateDoc(doc(db, 'teachers', teacherId), {
        country: countryCode,
        timezoneOffset: offset,
      })
      
      setTeacher(prev => prev ? { ...prev, country: countryCode, timezoneOffset: offset } : null)
      toast.success('Đã cập nhật quốc gia & múi giờ thành công!')
    } catch (err) {
      console.error(err)
      toast.error('Có lỗi xảy ra khi cập nhật múi giờ')
    } finally {
      setUpdatingTimezone(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (!teacher) return <p className="text-slate-500 text-center py-20">{t('profile.not_found')}</p>

  const monthSalary = lessons.reduce((sum, l) => sum + (l.salary || 0), 0)
  const trackingUrl = `${window.location.origin}/tracking?teacher=${teacher.code}`

  const copyLink = () => {
    navigator.clipboard.writeText(trackingUrl)
    toast.success(t('profile.copied'))
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-8 animate-fade-in">
      {/* Header section with gradient cover */}
      <div className="relative pt-6">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-[#3BB8EB] via-[#2196F3] to-[#1976D2] rounded-b-3xl shadow-lg shadow-sky-200/50" />
        
        <div className="relative px-4 pt-12">
          <Card className="shadow-xl shadow-sky-100/50 border-0">
            <div className="flex flex-col items-center text-center">
              <div className="relative -mt-16 mb-4">
                {teacher.photoURL ? (
                  <img src={teacher.photoURL} alt={teacher.name} className="w-24 h-24 rounded-2xl object-cover shadow-lg border-4 border-white" />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-sky-100 border-4 border-white shadow-lg flex items-center justify-center text-3xl font-bold text-[#3BB8EB]">
                    {teacher.name[0]}
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 bg-[#3BB8EB] text-white text-[10px] font-bold px-2 py-1 rounded-lg border-2 border-white shadow-sm">
                  {t('profile.level')} {teacher.level}
                </div>
              </div>

              <h2 className="text-2xl font-bold text-slate-900">{teacher.name}</h2>
              <div className="flex flex-col items-center gap-1 mt-2.5 justify-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('profile.username')}</p>
                <span className="font-mono text-sm font-extrabold text-indigo-650 bg-indigo-50/50 px-3.5 py-1 rounded-lg border border-indigo-150">{teacher.code}</span>
              </div>

              {(teacher.subjectNames?.length ?? 0) > 0 && (
                <div className="flex gap-2 flex-wrap justify-center mt-4">
                  {(teacher.subjectNames ?? []).map((s) => (
                    <div key={s} className="flex items-center gap-1.5 text-xs font-medium bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full">
                      <GraduationCap className="w-3.5 h-3.5" />
                      {s}
                    </div>
                  ))}
                </div>
              )}

              {teacher.bio && (
                <p className="mt-5 text-sm text-slate-600 leading-relaxed max-w-sm mx-auto italic">"{teacher.bio}"</p>
              )}

              <Button variant="outline" className="mt-6 w-full sm:w-auto rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700" onClick={copyLink}>
                <Copy className="w-4 h-4 mr-2" />
                {t('profile.copy_link')}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="px-4 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider ml-1 mt-2">{t('profile.this_month')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="flex flex-col items-center justify-center py-6 border-0 shadow-md shadow-slate-200/50 hover:scale-[1.02] transition-transform">
            <div className="w-12 h-12 bg-sky-50 rounded-full flex items-center justify-center mb-3">
              <CalendarDays className="w-6 h-6 text-[#3BB8EB]" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900">{lessons.length}</p>
            <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">{t('profile.lessons_taught')}</p>
          </Card>
          
          <Card className="flex flex-col items-center justify-center py-6 border-0 shadow-md shadow-slate-200/50 hover:scale-[1.02] transition-transform bg-gradient-to-b from-white to-emerald-50/30">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
              <Wallet className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-xl sm:text-2xl font-extrabold text-emerald-600">{formatVND(monthSalary)}</p>
            <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">{t('profile.income')}</p>
          </Card>
        </div>

        {/* Lựa chọn Quốc gia & Múi giờ */}
        <Card className="p-5 border-0 shadow-md shadow-slate-200/50">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-4">
            <Globe className="w-4 h-4 text-[#3BB8EB]" />
            Quốc gia & Múi giờ (Country & Timezone)
          </h3>
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-500 uppercase">Chọn quốc gia của bạn / Select your country</label>
            <select
              value={teacher.country || 'VN'}
              onChange={handleTimezoneChange}
              disabled={updatingTimezone}
              className="w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[44px]"
            >
              <option value="VN">Việt Nam (GMT+7)</option>
              <option value="PH">Philippines (GMT+8)</option>
              <option value="JP">Nhật Bản / Japan (GMT+9)</option>
              <option value="KR">Hàn Quốc / Korea (GMT+9)</option>
              <option value="US_EST">Mỹ / USA (EST - GMT-5)</option>
              <option value="US_PST">Mỹ / USA (PST - GMT-8)</option>
            </select>
            <p className="text-[11px] text-slate-400 leading-normal">
              * Hệ thống sẽ tự động đồng bộ hóa toàn bộ lịch trống (OPEN) và lịch học trên thời khóa biểu theo đúng múi giờ quốc gia bạn chọn.
            </p>
          </div>
        </Card>

        {/* Thông tin tài khoản ngân hàng */}
        <Card className="p-5 border-0 shadow-md shadow-slate-200/50">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-4">
            <Wallet className="w-4 h-4 text-emerald-600" />
            Thông tin thanh toán (Bank Account)
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tên ngân hàng / Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder="Ví dụ: Vietcombank, Techcombank..."
                className="w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Số tài khoản / Account Number</label>
              <input
                type="text"
                value={bankAccountNo}
                onChange={e => setBankAccountNo(e.target.value.replace(/\s+/g, ''))}
                placeholder="Nhập số tài khoản ngân hàng"
                className="w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tên chủ tài khoản / Account Holder Name</label>
              <input
                type="text"
                value={bankAccountName}
                onChange={e => setBankAccountName(e.target.value.toUpperCase())}
                placeholder="Ví dụ: NGUYEN VAN A"
                className="w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[44px]"
              />
            </div>
            <Button
              type="button"
              loading={savingBank}
              onClick={handleSaveBank}
              className="w-full rounded-xl bg-[#2196F3] hover:bg-[#1976D2] text-white font-bold py-2.5 shadow-md shadow-sky-200/50"
            >
              Lưu thông tin thanh toán
            </Button>
          </div>
        </Card>

        <div className="mt-8 bg-sky-50 border border-sky-100 rounded-2xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <HeadphonesIcon className="w-5 h-5 text-[#3BB8EB]" />
          </div>
          <div>
            <p className="text-sm font-bold text-sky-900">{t('profile.need_help')}</p>
            <p className="text-sm text-sky-700/80 mt-1 leading-relaxed">{t('profile.contact_admin')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
