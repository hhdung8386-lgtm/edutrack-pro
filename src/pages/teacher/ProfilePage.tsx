import { useEffect, useState } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc } from 'firebase/firestore'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '@/lib/firebase'
import { Teacher, Lesson } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { formatVND, getCurrentMonth } from '@/lib/constants'
import { toast } from '@/stores/toastStore'
import { uploadLessonImage, uploadErrorMessage } from '@/lib/imageUploader'
import { missingTeacherFields } from '@/lib/teacherProfile'
import { Copy, CalendarDays, Wallet, HeadphonesIcon, GraduationCap, Globe, Upload, X, Trash2, Link, Play, Camera, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { TeacherCertificate } from '@/types'

export function ProfilePage() {
  const { teacherId } = useAuthStore()
  const { t, lang } = useLanguageStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setupRequired = searchParams.get('setupRequired') === 'true'
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingTimezone, setUpdatingTimezone] = useState(false)
  const [bankName, setBankName] = useState('')
  const [bankAccountNo, setBankAccountNo] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')
  const [savingBank, setSavingBank] = useState(false)

  // ─── Hồ sơ bắt buộc (setup gate) ───
  const [gender, setGender] = useState('')
  const [yob, setYob] = useState('')
  const [livingArea, setLivingArea] = useState('')
  const [degreeType, setDegreeType] = useState('')
  const [university, setUniversity] = useState('')
  const [major, setMajor] = useState('')
  const [teachingYears, setTeachingYears] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  // YouTube and Certificates States
  const [youtubeLink, setYoutubeLink] = useState('')
  const [savingYoutube, setSavingYoutube] = useState(false)
  const [certificates, setCertificates] = useState<TeacherCertificate[]>([])
  const [savingCerts, setSavingCerts] = useState(false)

  // Sync state when teacher data loads
  useEffect(() => {
    if (teacher) {
      setBankName(teacher.bankName || '')
      setBankAccountNo(teacher.bankAccountNo || '')
      setBankAccountName(teacher.bankAccountName || '')
      setYoutubeLink(teacher.youtubeLink || '')
      setCertificates(teacher.certificates || [])
      setGender(teacher.gender || '')
      setYob(teacher.yob ? String(teacher.yob) : '')
      setLivingArea(teacher.livingArea || '')
      setDegreeType(teacher.degreeType || '')
      setUniversity(teacher.university || '')
      setMajor(teacher.major || '')
      setTeachingYears(teacher.teachingYears ? String(teacher.teachingYears) : '')
    }
  }, [teacher])

  // Bản nháp hiện tại (đang gõ) để kiểm tra thiếu trường realtime
  const draftProfile: Partial<Teacher> = {
    ...(teacher || {}),
    photoURL: teacher?.photoURL || '',
    gender: (gender || undefined) as Teacher['gender'],
    yob: yob ? Number(yob) : undefined,
    livingArea,
    degreeType,
    university,
    major,
    teachingYears: teachingYears ? Number(teachingYears) : undefined,
    bankName,
    bankAccountNo,
    bankAccountName,
  }
  const missing = missingTeacherFields(draftProfile)
  const isMissing = (key: string) => missing.includes(key as keyof Teacher)
  // Viền đỏ ngay ô còn thiếu khi đã bấm lưu (hoặc khi bị bắt buộc hoàn thiện)
  const errCls = (key: string) =>
    (showErrors || setupRequired) && isMissing(key)
      ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40'
      : 'border-slate-200 bg-slate-50'

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !teacherId) return
    setPhotoUploading(true)
    try {
      const url = await uploadLessonImage(teacherId, file)
      await updateDoc(doc(db, 'teachers', teacherId), { photoURL: url })
      setTeacher(prev => prev ? { ...prev, photoURL: url } : prev)
      toast.success(lang === 'vi' ? 'Đã cập nhật ảnh đại diện!' : 'Profile photo updated!')
    } catch (err) {
      console.error(err)
      toast.error(uploadErrorMessage(err, lang === 'vi' ? 'vi' : 'en'))
    } finally {
      setPhotoUploading(false)
    }
  }

  const handleSaveRequiredProfile = async () => {
    if (!teacherId) return
    if (missing.length > 0) {
      setShowErrors(true)
      const labels = missing.slice(0, 4).join(', ')
      toast.warning(lang === 'vi'
        ? `Vui lòng điền đầy đủ các ô được đánh dấu đỏ (còn thiếu ${missing.length} mục)`
        : `Please fill all fields highlighted in red (${missing.length} missing)`)
      console.warn('Missing profile fields:', labels)
      return
    }
    setSavingProfile(true)
    try {
      await updateDoc(doc(db, 'teachers', teacherId), {
        gender,
        yob: Number(yob),
        livingArea: livingArea.trim(),
        degreeType: degreeType.trim(),
        university: university.trim(),
        major: major.trim(),
        teachingYears: Number(teachingYears),
        bankName: bankName.trim(),
        bankAccountNo: bankAccountNo.replace(/\s+/g, ''),
        bankAccountName: bankAccountName.toUpperCase(),
      })
      setTeacher(prev => prev ? {
        ...prev, gender: gender as Teacher['gender'], yob: Number(yob), livingArea, degreeType, university, major,
        teachingYears: Number(teachingYears), bankName, bankAccountNo, bankAccountName,
      } : prev)
      toast.success(lang === 'vi' ? 'Hồ sơ đã hoàn thiện! Bạn có thể sử dụng đầy đủ chức năng.' : 'Profile completed! All features unlocked.')
      if (setupRequired) navigate('/teacher/attendance')
    } catch (err) {
      console.error(err)
      toast.error(lang === 'vi' ? 'Không thể lưu hồ sơ, vui lòng thử lại' : 'Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }

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

  const handleSaveYoutube = async () => {
    if (!teacherId) return
    setSavingYoutube(true)
    try {
      await updateDoc(doc(db, 'teachers', teacherId), {
        youtubeLink: youtubeLink.trim()
      })
      setTeacher(prev => prev ? { ...prev, youtubeLink: youtubeLink.trim() } : null)
      toast.success('Đã cập nhật link giới thiệu Youtube!')
    } catch (err) {
      console.error(err)
      toast.error('Không thể cập nhật link Youtube')
    } finally {
      setSavingYoutube(false)
    }
  }

  const handleSaveCerts = async () => {
    if (!teacherId) return
    setSavingCerts(true)
    try {
      await updateDoc(doc(db, 'teachers', teacherId), {
        certificates
      })
      setTeacher(prev => prev ? { ...prev, certificates } : null)
      toast.success('Đã lưu danh sách bằng cấp/chứng chỉ thành công!')
    } catch (err) {
      console.error(err)
      toast.error('Không thể lưu bằng cấp/chứng chỉ')
    } finally {
      setSavingCerts(false)
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
        {/* ─── HOÀN THIỆN HỒ SƠ BẮT BUỘC ─── */}
        <Card className={`p-5 border-2 shadow-md ${missing.length > 0 ? 'border-rose-300 shadow-rose-100/50 bg-rose-50/20' : 'border-emerald-200 shadow-emerald-100/40 bg-emerald-50/20'}`}>
          <div className="flex items-start gap-3 mb-4">
            {missing.length > 0 ? (
              <span className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 w-[18px] h-[18px] text-rose-500" />
              </span>
            ) : (
              <span className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600" />
              </span>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {lang === 'vi' ? 'Hồ sơ giáo viên (bắt buộc)' : 'Teacher Profile (required)'}
              </h3>
              <p className={`text-xs mt-0.5 font-medium ${missing.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {missing.length > 0
                  ? (lang === 'vi' ? `Còn thiếu ${missing.length} mục — điền đầy đủ để sử dụng các chức năng khác.` : `${missing.length} fields missing — complete all to unlock other features.`)
                  : (lang === 'vi' ? 'Hồ sơ đã đầy đủ. Cảm ơn thầy/cô!' : 'Profile complete. Thank you!')}
              </p>
            </div>
          </div>

          {/* Avatar bắt buộc */}
          <div className={`flex items-center gap-4 p-3 rounded-xl border mb-4 ${(showErrors || setupRequired) && isMissing('photoURL') ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40' : 'border-slate-200 bg-white'}`}>
            {teacher.photoURL ? (
              <img src={teacher.photoURL} alt={teacher.name} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white shadow" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
                <Camera className="w-6 h-6 text-slate-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700">
                {lang === 'vi' ? 'Ảnh đại diện *' : 'Profile photo *'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {lang === 'vi' ? 'Ảnh rõ mặt, lịch sự — phụ huynh sẽ nhìn thấy ảnh này.' : 'Clear, professional photo — parents will see it.'}
              </p>
              {(showErrors || setupRequired) && isMissing('photoURL') && (
                <p className="text-[11px] font-bold text-rose-500 mt-1">{lang === 'vi' ? 'Chưa có ảnh đại diện!' : 'Photo is required!'}</p>
              )}
            </div>
            <label className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-1.5 flex-shrink-0 ${photoUploading ? 'bg-slate-100 text-slate-400' : 'bg-[#3BB8EB] hover:bg-[#2da8db] text-white shadow-sm shadow-sky-200'}`}>
              {photoUploading
                ? <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                : <Upload className="w-3.5 h-3.5" />}
              {teacher.photoURL ? (lang === 'vi' ? 'Đổi ảnh' : 'Change') : (lang === 'vi' ? 'Tải ảnh lên' : 'Upload')}
              <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={handleUploadAvatar} />
            </label>
          </div>

          {/* Các trường bắt buộc */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Giới tính *' : 'Gender *'}</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] ${errCls('gender')}`}>
                <option value="">{lang === 'vi' ? '-- Chọn --' : '-- Select --'}</option>
                <option value="female">{lang === 'vi' ? 'Nữ' : 'Female'}</option>
                <option value="male">{lang === 'vi' ? 'Nam' : 'Male'}</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Năm sinh *' : 'Year of birth *'}</label>
              <input type="number" value={yob} onChange={(e) => setYob(e.target.value)} placeholder="VD: 2000" min={1950} max={2010}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] ${errCls('yob')}`} />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Khu vực sinh sống *' : 'Living area *'}</label>
              <input type="text" value={livingArea} onChange={(e) => setLivingArea(e.target.value)} placeholder={lang === 'vi' ? 'VD: Quận 7, TP.HCM' : 'E.g: District 7, HCMC'}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] ${errCls('livingArea')}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Học vị / Học hàm *' : 'Degree *'}</label>
              <select value={degreeType} onChange={(e) => setDegreeType(e.target.value)}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] ${errCls('degreeType')}`}>
                <option value="">{lang === 'vi' ? '-- Chọn --' : '-- Select --'}</option>
                <option value="Sinh viên">{lang === 'vi' ? 'Sinh viên' : 'Student'}</option>
                <option value="Cao đẳng">{lang === 'vi' ? 'Cao đẳng' : 'College'}</option>
                <option value="Đại học">{lang === 'vi' ? 'Đại học' : 'Bachelor'}</option>
                <option value="Thạc sĩ">{lang === 'vi' ? 'Thạc sĩ' : 'Master'}</option>
                <option value="Tiến sĩ">{lang === 'vi' ? 'Tiến sĩ' : 'PhD'}</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Số năm kinh nghiệm *' : 'Teaching years *'}</label>
              <input type="number" value={teachingYears} onChange={(e) => setTeachingYears(e.target.value)} placeholder="VD: 3" min={1} max={50}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] ${errCls('teachingYears')}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Trường ĐH/CĐ *' : 'University *'}</label>
              <input type="text" value={university} onChange={(e) => setUniversity(e.target.value)} placeholder={lang === 'vi' ? 'VD: ĐH Sư Phạm TP.HCM' : 'E.g: HCMC University of Education'}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] ${errCls('university')}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Chuyên ngành *' : 'Major *'}</label>
              <input type="text" value={major} onChange={(e) => setMajor(e.target.value)} placeholder={lang === 'vi' ? 'VD: Ngôn ngữ Anh' : 'E.g: English Linguistics'}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] ${errCls('major')}`} />
            </div>
          </div>

          {/* Bank (bắt buộc, thuộc hồ sơ) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Ngân hàng *' : 'Bank *'}</label>
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Vietcombank..."
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] ${errCls('bankName')}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Số tài khoản *' : 'Account No. *'}</label>
              <input type="text" value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value.replace(/\s+/g, ''))} placeholder="0123456789"
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] tabular-nums ${errCls('bankAccountNo')}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{lang === 'vi' ? 'Chủ tài khoản *' : 'Holder name *'}</label>
              <input type="text" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value.toUpperCase())} placeholder="NGUYEN VAN A"
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 min-h-[42px] uppercase ${errCls('bankAccountName')}`} />
            </div>
          </div>

          <Button
            type="button"
            loading={savingProfile}
            onClick={handleSaveRequiredProfile}
            className={`w-full mt-4 rounded-xl font-bold py-2.5 shadow-md ${missing.length > 0 ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-200/60' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200/60'} text-white`}
          >
            {missing.length > 0
              ? (lang === 'vi' ? `Lưu hồ sơ (còn thiếu ${missing.length} mục)` : `Save profile (${missing.length} missing)`)
              : (lang === 'vi' ? 'Lưu hồ sơ' : 'Save profile')}
          </Button>
        </Card>

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

        {/* Link YouTube */}
        <Card className="p-5 border-0 shadow-md shadow-slate-200/50">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-4">
            <Play className="w-4 h-4 text-red-500 fill-red-500" />
            Link giới thiệu Youtube (YouTube Link)
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">YouTube Video URL</label>
              <input
                type="text"
                value={youtubeLink}
                onChange={e => setYoutubeLink(e.target.value)}
                placeholder="Ví dụ: https://www.youtube.com/watch?v=..."
                className="w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[44px]"
              />
            </div>
            <Button
              type="button"
              loading={savingYoutube}
              onClick={handleSaveYoutube}
              className="w-full rounded-xl bg-[#2196F3] hover:bg-[#1976D2] text-white font-bold py-2.5 shadow-md shadow-sky-200/50"
            >
              Lưu link Youtube
            </Button>
          </div>
        </Card>

        {/* Bằng cấp & Chứng chỉ */}
        <Card className="p-5 border-0 shadow-md shadow-slate-200/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              Bằng cấp & Chứng chỉ (Certificates)
            </h3>
            <span className="text-xs text-slate-500 font-medium">Tổng số: {certificates.length}</span>
          </div>

          <div className="space-y-4">
            {certificates.map((cert, index) => (
              <div key={index} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-3 relative">
                <button
                  type="button"
                  onClick={() => setCertificates(prev => prev.filter((_, idx) => idx !== index))}
                  className="absolute top-3 right-3 text-slate-400 hover:text-rose-500 transition-colors"
                  title={t('profile.delete_cert')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('profile.cert_category')}</label>
                    <select
                      value={cert.category}
                      onChange={e => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, category: e.target.value as any } : c))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-slate-700"
                    >
                      <option value="foreign_language">{t('profile.cert_lang')}</option>
                      <option value="pedagogical">{t('profile.cert_pedagogical')}</option>
                      <option value="other">{t('profile.cert_other')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('profile.cert_status')}</label>
                    <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      cert.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                      cert.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {cert.status === 'approved' ? t('profile.approved') : cert.status === 'rejected' ? t('profile.rejected') : t('profile.pending')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('profile.cert_title')}</label>
                    <input
                      type="text"
                      placeholder="VD: IELTS Academic"
                      value={cert.title}
                      onChange={e => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, title: e.target.value } : c))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('profile.cert_score')}</label>
                    <input
                      type="text"
                      placeholder="VD: 8.0 / Giỏi"
                      value={cert.score}
                      onChange={e => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, score: e.target.value } : c))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  {cert.fileURL ? (
                    <div className="flex items-center gap-3">
                      <a href={cert.fileURL} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline">{t('profile.view_image')}</a>
                      <button
                        type="button"
                        onClick={() => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, fileURL: '' } : c))}
                        className="text-xs text-rose-500 hover:text-rose-600 font-bold hover:underline"
                      >
                        {t('profile.delete_image')}
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-xs font-bold text-indigo-650 cursor-pointer transition-all">
                      <Upload className="w-3.5 h-3.5" />
                      {t('profile.upload_image')}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.readAsDataURL(file)
                            reader.onload = (ev) => {
                              const img = new window.Image()
                              img.src = ev.target?.result as string
                              img.onload = () => {
                                const canvas = document.createElement('canvas')
                                const MAX = 600
                                let { width, height } = img
                                if (width > MAX) { height = (height * MAX) / width; width = MAX }
                                if (height > MAX) { width = (width * MAX) / height; height = MAX }
                                canvas.width = width
                                canvas.height = height
                                canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
                                const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
                                setCertificates(prev => prev.map((c, idx) => idx === index ? { ...c, fileURL: dataUrl, status: 'pending' } : c))
                              }
                            }
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setCertificates(prev => [...prev, { category: 'foreign_language', title: '', score: '', fileURL: '', status: 'pending' }])}
              className="w-full py-2 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl text-xs font-bold text-indigo-650 hover:text-indigo-800 transition-colors"
            >
              + Thêm bằng cấp/chứng chỉ
            </button>

            <Button
              type="button"
              loading={savingCerts}
              onClick={handleSaveCerts}
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 shadow-md shadow-indigo-200/50"
            >
              Lưu danh sách bằng cấp
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
