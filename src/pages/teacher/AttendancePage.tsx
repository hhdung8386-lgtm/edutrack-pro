import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { formatVND, getToday, MINUTE_PRESETS } from '@/lib/constants'
import { Search, X, Upload, AlertTriangle, CheckCircle } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'

const schema = z.object({
  date: z.string().min(1),
  comment: z.string().optional(),
  homework: z.string().optional(),
  book: z.string()
    .min(1, 'Vui lòng nhập sách học')
    .refine(
      (val) => val.trim().split(/\s+/).filter(Boolean).length <= 20,
      { message: 'Tên sách không được quá 20 từ' }
    )
    .refine(
      (val) => {
        const lower = val.toLowerCase();
        return !lower.includes('http://') && 
               !lower.includes('https://') && 
               !lower.includes('drive.google.com') && 
               !lower.includes('docs.google.com');
      },
      { message: 'Chỉ nhập tên sách, không gửi link/liên kết' }
    ),
})
type FormData = z.infer<typeof schema>

export function AttendancePage() {
  const { user, teacherId } = useAuthStore()
  const { t } = useLanguageStore()
  const [code, setCode] = useState('')
  const [student, setStudent] = useState<Student | null>(null)
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [selectedMinutes, setSelectedMinutes] = useState<number>(50)
  const [images, setImages] = useState<{ url: string; storageURL: string; uploading: boolean }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [teacherData, setTeacherData] = useState<{ name: string; code: string; subjectName?: string; level: number } | null>(null)
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'with_permission' | 'without_permission'>('present')

  const today = getToday()

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: today },
  })

  const searchStudent = async () => {
    if (!code.trim()) return
    setSearching(true)
    setNotFound(false)
    setStudent(null)

    try {
      const q = query(collection(db, 'students'), where('code', '==', code.trim().toUpperCase()))
      const snap = await getDocs(q)
      if (snap.empty) {
        setNotFound(true)
      } else {
        const s = { id: snap.docs[0].id, ...snap.docs[0].data() } as Student
        setStudent(s)
        if (teacherId) {
          const tSnap = await getDoc(doc(db, 'teachers', teacherId))
          if (tSnap.exists()) {
            const td = tSnap.data()
            const subjectSnap = td.subjectIds?.length
              ? await getDoc(doc(db, 'subjects', s.subjectId))
              : null
            setTeacherData({
              name: td.name, code: td.code, level: td.level,
              subjectName: subjectSnap?.data()?.name,
            })
          }
        }
      }
    } finally {
      setSearching(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (images.length + files.length > 5) {
      toast.warning(t('attendance.max_images'))
      return
    }

    for (const file of files) {
      const canvas = document.createElement('canvas')
      const img = document.createElement('img')
      const url = URL.createObjectURL(file)
      img.src = url

      await new Promise((resolve) => { img.onload = resolve })
      const MAX = 800
      let { width, height } = img
      if (width > MAX) { height = (height * MAX) / width; width = MAX }
      if (height > MAX) { width = (width * MAX) / height; height = MAX }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      const preview = canvas.toDataURL('image/jpeg', 0.6)
      setImages((prev) => [...prev, { url: preview, storageURL: preview, uploading: false }])
      URL.revokeObjectURL(url)
    }
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleAttendanceStatus = (status: 'present' | 'with_permission' | 'without_permission') => {
    setAttendanceStatus(status)
    if (status === 'present') {
      setSelectedMinutes(50)
      setValue('book', '')
    } else if (status === 'with_permission') {
      setSelectedMinutes(0)
      setValue('book', 'Học viên vắng')
    } else if (status === 'without_permission') {
      setSelectedMinutes(25)
      setValue('book', 'Học viên vắng')
    }
  }

  const onSubmit = async (data: FormData) => {
    if (!student || !teacherId) return
    if (images.some((i) => i.uploading)) {
      toast.warning(t('attendance.uploading'))
      return
    }

    setSubmitting(true)
    try {
      const [tSnap, sSnap] = await Promise.all([
        getDoc(doc(db, 'teachers', teacherId)),
        getDoc(doc(db, 'subjects', student.subjectId)),
      ])
      const teacher = tSnap.data()!
      const subject = sSnap.data()

      const mps = student.minutesPerSession || 50
      const currentRemainingMinutes =
        student.remainingMinutes ?? (student.remainingSessions * mps)

      await addDoc(collection(db, 'lessons'), {
        studentId: student.id,
        studentCode: student.code,
        studentName: student.name,
        teacherId,
        teacherCode: teacher.code,
        teacherName: teacher.name,
        subjectId: student.subjectId,
        subjectName: student.subjectName || teacherData?.subjectName || '',
        date: data.date,
        minutes: selectedMinutes,
        comment: data.comment || '',
        homework: data.homework || '',
        book: data.book || '',
        imageURLs: images.map((i) => i.storageURL).filter(Boolean),
        attendanceStatus,
        status: 'pending',
        sessionsBeforeApproval: student.remainingSessions,
        sessionsAfterApproval: student.remainingSessions,
        minutesBeforeApproval: currentRemainingMinutes,
        minutesAfterApproval: currentRemainingMinutes,
        teacherLevel: teacher.level ?? 1,
        pricePerMinute: subject?.pricePerMinute ?? 0,
        salary: 0,
        createdAt: serverTimestamp(),
      })

      setSubmitted(true)
      toast.success(t('attendance.submit_success'))
      setTimeout(() => {
        setSubmitted(false)
        setStudent(null)
        setCode('')
        setImages([])
        reset({ date: today, comment: '', homework: '', book: '' })
        setSelectedMinutes(50)
        setAttendanceStatus('present')
      }, 2000)
    } catch (err) {
      console.error(err)
      toast.error(t('attendance.submit_fail'))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{t('attendance.submitted')}</h2>
        <p className="text-slate-500 text-sm">{t('attendance.wait_admin')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 pt-2 lg:pt-6 pb-4 animate-fade-in">
      <div className="bg-gradient-to-r from-[#3BB8EB] to-[#2196F3] rounded-2xl p-6 text-white shadow-lg shadow-sky-200/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <h1 className="text-2xl font-bold relative z-10">{t('attendance.title')}</h1>
        <p className="text-sm text-sky-100 mt-1 relative z-10">{t('attendance.subtitle')}</p>
      </div>

      {/* Student code */}
      <Card className="hover:shadow-lg transition-all duration-300 border-sky-100/50">
        <label htmlFor="student-code" className="block text-sm font-medium text-slate-600 mb-2">{t('attendance.student_code')}</label>
        <div className="flex gap-2">
          <input
            id="student-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && searchStudent()}
            placeholder="VD: HS8X2K91"
            className="flex-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400
              px-4 py-3 text-xl font-mono font-bold tracking-widest uppercase
              focus:outline-none focus:ring-2 focus:ring-[#3BB8EB] min-h-[56px]"
            autoCapitalize="characters"
            autoCorrect="off"
          />
          {code && (
            <button onClick={() => { setCode(''); setStudent(null); setNotFound(false) }}
              className="p-3 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Clear">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <Button fullWidth size="lg" className="mt-3 bg-[#3BB8EB] hover:bg-[#2da8db]" loading={searching} onClick={searchStudent}>
          <Search className="w-5 h-5" />
          {t('attendance.search')}
        </Button>
      </Card>

      {notFound && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
          <p className="text-rose-600 font-medium">{t('attendance.not_found')}</p>
          <p className="text-slate-500 text-sm mt-1">"{code}"</p>
        </div>
      )}

      {student && (
        <>
          <Card className={`transition-all duration-300 transform animate-fade-in-up ${student.remainingSessions <= 0 ? 'border-rose-200 bg-rose-50' : 'border-sky-100 hover:shadow-lg'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-slate-900">{student.name}</p>
                <p className="font-mono text-sm text-[#3BB8EB] mt-0.5">{student.code}</p>
                <p className="text-sm text-slate-500 mt-1">{student.subjectName}</p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${
                  student.remainingSessions === 0 ? 'text-rose-500' :
                  student.remainingSessions <= 3 ? 'text-amber-500' : 'text-emerald-500'
                }`}>{student.remainingSessions}</p>
                <p className="text-xs text-slate-500">{t('attendance.remaining')}</p>
                {(() => {
                  const mps = student.minutesPerSession || 50
                  const remaining = student.remainingMinutes ?? student.remainingSessions * mps
                  return (
                    <p className={`text-[11px] mt-0.5 ${remaining <= 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {remaining} phút
                    </p>
                  )
                })()}
              </div>
            </div>
          </Card>

          {student.remainingSessions <= 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-700">{t('attendance.exhausted_title')}</p>
                <p className="text-sm text-rose-600 mt-1">{t('attendance.exhausted_subtitle')}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="attendance-date" className="block text-sm font-medium text-slate-600 mb-1.5">{t('attendance.date')}</label>
                <input id="attendance-date" type="date" max={today}
                  className="w-full rounded-lg bg-white border border-slate-200 text-slate-900 px-4 py-3 text-sm min-h-[48px] focus:outline-none focus:ring-2 focus:ring-[#3BB8EB]"
                  {...register('date')} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">{t('attendance.status')}</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAttendanceStatus('present')}
                    className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                      attendanceStatus === 'present'
                        ? 'bg-emerald-500 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300 hover:text-slate-900'
                    }`}>
                    {t('attendance.present')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAttendanceStatus('with_permission')}
                    className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                      attendanceStatus === 'with_permission'
                        ? 'bg-amber-500 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-amber-300 hover:text-slate-900'
                    }`}>
                    {t('attendance.excused')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAttendanceStatus('without_permission')}
                    className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                      attendanceStatus === 'without_permission'
                        ? 'bg-rose-500 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-rose-300 hover:text-slate-900'
                    }`}>
                    {t('attendance.unexcused')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">{t('attendance.duration')} ({t('attendance.minutes')})</label>
                <div className="grid grid-cols-4 gap-2">
                  {MINUTE_PRESETS.map((min) => (
                    <button key={min} type="button" onClick={() => setSelectedMinutes(min)} disabled={attendanceStatus !== 'present'}
                      className={`py-3 rounded-xl text-sm font-bold transition-all ${
                        selectedMinutes === min
                          ? 'bg-[#3BB8EB] text-white shadow-lg scale-105'
                          : 'bg-white text-slate-500 border border-slate-200 hover:border-[#3BB8EB]/50 hover:text-slate-900'
                      } ${attendanceStatus !== 'present' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {min}'
                    </button>
                  ))}
                </div>
                {attendanceStatus !== 'present' && (
                  <p className="text-xs text-slate-500 mt-2">
                    {attendanceStatus === 'with_permission'
                      ? t('attendance.excused_info')
                      : t('attendance.unexcused_info')}
                  </p>
                )}
              </div>

              <Input
                label="Tên sách (Bắt buộc)"
                placeholder="VD: Family and Friends 2"
                hint="Chỉ viết tên sách, tối đa 20 từ (Không gửi link Drive/tài liệu)"
                error={errors.book?.message}
                {...register('book')}
              />

              <Textarea label={t('attendance.comment')} placeholder={t('attendance.comment_placeholder')} rows={3} {...register('comment')} />
              <Textarea label={t('attendance.homework')} placeholder={t('attendance.homework_placeholder')} rows={2} {...register('homework')} />

              {/* Images */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">{t('attendance.images')} ({images.length}/5)</label>
                <div className="flex gap-2 flex-wrap">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                      {img.uploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {!img.uploading && (
                        <button type="button" onClick={() => removeImage(i)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center"
                          aria-label={`Remove image ${i + 1}`}>
                          <X className="w-3 h-3 text-white" />
                        </button>
                      )}
                    </div>
                  ))}
                  {images.length < 5 && (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-[#3BB8EB] transition-colors">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} aria-label="Upload images" />
                      <Upload className="w-5 h-5 text-slate-400" />
                    </label>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 text-sm border border-slate-200">
                <p className="text-slate-600 font-medium">
                  {student.name} · {student.subjectName} · {selectedMinutes} {t('attendance.minutes')} · {watch('date')}
                </p>
              </div>

              <Button type="submit" fullWidth size="lg" loading={submitting} className="sticky bottom-4 mt-2 bg-[#3BB8EB] hover:bg-[#2da8db]">
                {t('attendance.submit')}
              </Button>
            </form>
        </>
      )}
    </div>
  )
}
