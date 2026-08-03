import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LessonReportForm } from '@/components/lessons/LessonReportForm'
import {
  LessonReportDraft, emptyLessonReport,
  validateLessonReport, composeLessonComment, lessonReportFields,
} from '@/components/lessons/lessonReport'
import { Card } from '@/components/ui/Card'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { getToday, MINUTE_PRESETS } from '@/lib/constants'
import { Search, X, Upload, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { uploadLessonImage, uploadErrorMessage } from '@/lib/imageUploader'
import { calculateLessonPoints, getTeacherPointsPer25Minutes } from '@/lib/points'

const schema = z.object({
  date: z.string().min(1),
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
  const { teacherId } = useAuthStore()
  const { t, lang } = useLanguageStore()
  const [code, setCode] = useState('')
  const [student, setStudent] = useState<Student | null>(null)
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  // Học viên tra ra nhưng bị CHẶN điểm danh (hết buổi / bảo lưu) — giữ lại trên màn hình
  // để gia sư & giáo vụ nhìn thấy rõ lý do, không bị trôi mất như toast.
  const [blockedStudent, setBlockedStudent] = useState<{ name: string; code: string; reason: 'expired' | 'reserved' } | null>(null)
  const [selectedMinutes, setSelectedMinutes] = useState<number>(50)
  const [images, setImages] = useState<{ url: string; storageURL: string; uploading: boolean }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'with_permission' | 'without_permission'>('present')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [report, setReport] = useState<LessonReportDraft>(emptyLessonReport())

  const getErrorMessage = (errKey?: string) => {
    if (!errKey) return undefined
    if (lang === 'en') {
      if (errKey === 'Vui lòng nhập sách học') return 'Please enter the book/material name'
      if (errKey === 'Tên sách không được quá 20 từ') return 'Book/material name must not exceed 20 words'
      if (errKey === 'Chỉ nhập tên sách, không gửi link/liên kết') return 'Enter only the book/material name, do not send links or URLs'
    }
    return errKey
  }

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
    setBlockedStudent(null)

    try {
      const q = query(collection(db, 'students'), where('code', '==', code.trim().toUpperCase()))
      const snap = await getDocs(q)
      if (snap.empty) {
        setNotFound(true)
      } else {
        const s = { id: snap.docs[0].id, ...snap.docs[0].data() } as Student
        if (s.status === 'reserved') {
          setBlockedStudent({ name: s.name, code: s.code, reason: 'reserved' })
          setSearching(false)
          return
        }
        // CHẶN CỨNG: học viên đã hết buổi thì không được điểm danh dưới bất kỳ hình thức nào.
        const totalRemainingMinutes = s.subjects && s.subjects.length > 0
          ? s.subjects.reduce((sum, sub) => sum + (sub.remainingMinutes || 0), 0)
          : (s.remainingMinutes ?? ((s.remainingSessions || 0) * (s.minutesPerSession || 50)))
        if (s.status === 'expired' || totalRemainingMinutes <= 0) {
          setBlockedStudent({ name: s.name, code: s.code, reason: 'expired' })
          setSearching(false)
          return
        }
        setStudent(s)

        const subjects = s.subjects && s.subjects.length > 0
          ? s.subjects
          : s.subjectId
            ? [{
                subjectId: s.subjectId,
                subjectName: s.subjectName || 'Chưa rõ',
                totalSessions: s.totalSessions || 0,
                usedSessions: s.usedSessions || 0,
                remainingSessions: s.remainingSessions || 0,
                minutesPerSession: s.minutesPerSession || 50,
                totalMinutes: s.totalMinutes ?? (s.totalSessions * (s.minutesPerSession || 50)),
                usedMinutes: s.usedMinutes ?? ((s.usedSessions || 0) * (s.minutesPerSession || 50)),
                remainingMinutes: s.remainingMinutes ?? ((s.remainingSessions || 0) * (s.minutesPerSession || 50)),
                pricePerMinute: 0,
              }]
            : []
        setSelectedSubjectId(subjects[0]?.subjectId || '')

      }
    } finally {
      setSearching(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (images.length + files.length > 20) {
      toast.warning('Tối đa 20 hình ảnh minh chứng')
      return
    }

    if (!teacherId) return

    for (const file of files) {
      const localPreviewUrl = URL.createObjectURL(file)
      
      // Thêm ảnh vào state dạng đang tải lên
      setImages((prev) => [...prev, { url: localPreviewUrl, storageURL: '', uploading: true }])

      // Upload ngầm lên Firebase Storage
      uploadLessonImage(teacherId, file).then((downloadURL) => {
        setImages((prev) =>
          prev.map((item) =>
            item.url === localPreviewUrl ? { ...item, storageURL: downloadURL, uploading: false } : item
          )
        )
      }).catch((err) => {
        console.error(err)
        toast.error(uploadErrorMessage(err, lang === 'vi' ? 'vi' : 'en'))
        setImages((prev) => prev.filter((item) => item.url !== localPreviewUrl))
      })
    }
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  // Khi form không hợp lệ (vd thiếu tên sách), báo rõ lý do — tránh cảm giác "bấm nút không hoạt động"
  const onSubmitInvalid = (errs: Record<string, { message?: string } | undefined>) => {
    const first = Object.values(errs).find(Boolean)
    toast.warning(first?.message || (lang === 'vi' ? 'Vui lòng kiểm tra lại thông tin điểm danh' : 'Please review the attendance form'))
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

    // Form báo cáo chi tiết chỉ bắt buộc khi học viên có mặt
    const isPresent = attendanceStatus === 'present'
    if (isPresent) {
      const errKey = validateLessonReport(report)
      if (errKey) {
        toast.warning(t(errKey))
        return
      }
    }

    setSubmitting(true)
    try {
      const subjects = student.subjects && student.subjects.length > 0
        ? student.subjects
        : student.subjectId
          ? [{
              subjectId: student.subjectId,
              subjectName: student.subjectName || 'Chưa rõ',
              totalSessions: student.totalSessions || 0,
              usedSessions: student.usedSessions || 0,
              remainingSessions: student.remainingSessions || 0,
              minutesPerSession: student.minutesPerSession || 50,
              totalMinutes: student.totalMinutes ?? (student.totalSessions * (student.minutesPerSession || 50)),
              usedMinutes: student.usedMinutes ?? ((student.usedSessions || 0) * (student.minutesPerSession || 50)),
              remainingMinutes: student.remainingMinutes ?? ((student.remainingSessions || 0) * (student.minutesPerSession || 50)),
              pricePerMinute: 0,
            }]
          : []

      const selectedPkg = subjects.find(s => s.subjectId === selectedSubjectId)
      if (!selectedPkg) {
        toast.error('Môn học được chọn không hợp lệ')
        return
      }

      const [tSnap, sSnap, freshStudentSnap] = await Promise.all([
        getDoc(doc(db, 'teachers', teacherId)),
        getDoc(doc(db, 'subjects', selectedSubjectId)),
        getDoc(doc(db, 'students', student.id)),
      ])

      // CHỐT CHẶN CUỐI: đọc lại hồ sơ học viên MỚI NHẤT ngay trước khi ghi,
      // phòng trường hợp quỹ buổi vừa bị dùng hết ở nơi khác trong lúc gia sư
      // đang mở form. Hết buổi -> từ chối mọi hình thức điểm danh.
      if (!freshStudentSnap.exists()) {
        toast.error('Không tìm thấy hồ sơ học viên')
        return
      }
      const freshStudent = freshStudentSnap.data() as Student
      if (freshStudent.status === 'reserved') {
        toast.error('Học viên đang bảo lưu — không thể điểm danh.')
        return
      }
      const freshSubjects = freshStudent.subjects && freshStudent.subjects.length > 0
        ? freshStudent.subjects
        : []
      const freshPkg = freshSubjects.find(s => s.subjectId === selectedSubjectId)
      const freshRemaining = freshPkg
        ? (freshPkg.remainingMinutes || 0)
        : (freshStudent.remainingMinutes ?? ((freshStudent.remainingSessions || 0) * (freshStudent.minutesPerSession || 50)))
      if (freshStudent.status === 'expired' || freshRemaining <= 0) {
        toast.error('Gói học hiện không đủ điều kiện ghi nhận buổi này. Vui lòng liên hệ giáo vụ để được kiểm tra.')
        return
      }

      const teacher = tSnap.data()!
      const subject = sSnap.data()
      const pointsPer25Minutes = getTeacherPointsPer25Minutes(teacher)
      const lessonPoints = calculateLessonPoints(selectedMinutes, pointsPer25Minutes)
      if (freshRemaining < lessonPoints) {
        toast.error('Gói học hiện không đủ điều kiện ghi nhận buổi này. Vui lòng liên hệ giáo vụ để được kiểm tra.')
        return
      }

      const currentRemainingMinutes = selectedPkg.remainingMinutes
      const remainingSessions25 = Math.floor(currentRemainingMinutes / 25)

      await addDoc(collection(db, 'lessons'), {
        studentId: student.id,
        studentCode: student.code,
        studentName: student.name,
        teacherId,
        teacherCode: teacher.code,
        teacherName: teacher.name,
        subjectId: selectedSubjectId,
        subjectName: selectedPkg.subjectName,
        date: data.date,
        minutes: selectedMinutes,
        points: lessonPoints,
        pointsPer25Minutes,
        // Ghép báo cáo có cấu trúc thành `comment` để các màn hình cũ hiển thị được;
        // đồng thời lưu bản có cấu trúc (pages/report/rating) bên dưới.
        comment: isPresent ? composeLessonComment(report) : '',
        homework: isPresent ? report.homework.trim() : '',
        book: data.book || '',
        ...(isPresent
          ? lessonReportFields(report)
          : { pages: '', report: null, rating: null }),
        imageURLs: images.map((i) => i.storageURL).filter(Boolean),
        attendanceStatus,
        status: 'pending',
        sessionsBeforeApproval: remainingSessions25,
        sessionsAfterApproval: remainingSessions25,
        minutesBeforeApproval: currentRemainingMinutes,
        minutesAfterApproval: currentRemainingMinutes,
        teacherLevel: teacher.level ?? 1,
        pricePerMinute: subject?.pricePerMinute ?? 0,
        currency: subject?.currency || 'VND',
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
        reset({ date: today, book: '' })
        setReport(emptyLessonReport())
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
            <button onClick={() => { setCode(''); setStudent(null); setNotFound(false); setBlockedStudent(null) }}
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

      {/* Note cố định: học viên tìm thấy nhưng KHÔNG được điểm danh */}
      {blockedStudent && (
        <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold text-rose-700">
                {blockedStudent.reason === 'expired'
                  ? 'Gói học hiện không thể điểm danh'
                  : 'Học viên đang BẢO LƯU — không thể điểm danh'}
              </p>
              <p className="mt-1 text-sm font-semibold text-rose-800">
                {blockedStudent.name} <span className="font-mono text-xs">({blockedStudent.code})</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-rose-600 font-semibold">
                {blockedStudent.reason === 'expired'
                  ? 'Hệ thống chưa cho phép ghi nhận buổi dạy cho học viên này. Vui lòng liên hệ giáo vụ để kiểm tra trạng thái gói học.'
                  : 'Học viên đang trong thời gian bảo lưu. Vui lòng liên hệ giáo vụ để mở lại trước khi điểm danh.'}
              </p>
              <button
                type="button"
                onClick={() => { setCode(''); setBlockedStudent(null) }}
                className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
              >
                Tra mã học viên khác
              </button>
            </div>
          </div>
        </div>
      )}

      {notFound && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
          <p className="text-rose-600 font-medium">{t('attendance.not_found')}</p>
          <p className="text-slate-500 text-sm mt-1">"{code}"</p>
        </div>
      )}

      {student && (() => {
        const subjects = student.subjects && student.subjects.length > 0
          ? student.subjects
          : student.subjectId
            ? [{
                subjectId: student.subjectId,
                subjectName: student.subjectName || 'Chưa rõ',
                totalSessions: student.totalSessions || 0,
                usedSessions: student.usedSessions || 0,
                remainingSessions: student.remainingSessions || 0,
                minutesPerSession: student.minutesPerSession || 50,
                totalMinutes: student.totalMinutes ?? (student.totalSessions * (student.minutesPerSession || 50)),
                usedMinutes: student.usedMinutes ?? ((student.usedSessions || 0) * (student.minutesPerSession || 50)),
                remainingMinutes: student.remainingMinutes ?? ((student.remainingSessions || 0) * (student.minutesPerSession || 50)),
                pricePerMinute: 0,
              }]
            : []

        const selectedPkg = subjects.find(s => s.subjectId === selectedSubjectId) || subjects[0]
        const remainingMinutes = selectedPkg ? selectedPkg.remainingMinutes : 0
        const isOutOfMinutes = remainingMinutes <= 0

        return (
          <>
            <Card className={`transition-all duration-300 transform animate-fade-in-up ${isOutOfMinutes ? 'border-rose-200 bg-rose-50/50' : 'border-sky-100 hover:shadow-lg'}`}>
              <div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{student.name}</p>
                  <p className="font-mono text-sm text-[#3BB8EB] mt-0.5">{student.code}</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">
                    Gói đang chọn: <span className="text-indigo-600">{selectedPkg?.subjectName || 'Chưa chọn'}</span>
                  </p>
                  {student.classroomURL && (
                    <div className="mt-3">
                      <a
                        href={student.classroomURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:text-indigo-800 hover:bg-indigo-100 text-xs font-bold rounded-lg transition-colors"
                      >
                        Vào phòng học
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  {selectedPkg?.curriculumLink && (
                    <div className="mt-2.5">
                      <a
                        href={selectedPkg.curriculumLink.startsWith('http') ? selectedPkg.curriculumLink : `https://${selectedPkg.curriculumLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 text-xs font-bold rounded-lg transition-colors"
                      >
                        Mở giáo trình học
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  {selectedPkg?.timetableNote && (
                    <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200/50 rounded-xl">
                      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Note timetable học viên:</span>
                      <p className="text-xs text-slate-700 font-medium mt-1 whitespace-pre-wrap">{selectedPkg.timetableNote}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Subject Package Dropdown inside Card */}
              {subjects.length > 0 && (
                <div className="space-y-1.5 mt-4 pt-3 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-500">CHỌN GÓI MÔN HỌC ĐIỂM DANH *</label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white font-medium text-slate-700 shadow-sm"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.subjectId} value={sub.subjectId}>
                        {sub.subjectName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </Card>

            {isOutOfMinutes ? (
              <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-5 flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-700">Gói học hiện không thể điểm danh</p>
                  <p className="text-xs text-rose-600 mt-1 leading-normal font-semibold">
                    Hệ thống chưa cho phép ghi nhận buổi dạy dưới bất kỳ hình thức nào
                    (có mặt, vắng có phép hay vắng không phép). Vui lòng liên hệ giáo vụ để kiểm tra trạng thái gói học.
                  </p>
                  {subjects.length > 1 && (
                    <p className="text-xs text-rose-700 mt-2 font-bold">
                      Bạn có thể chọn môn học khác phía trên nếu buổi dạy thuộc một gói khác.
                    </p>
                  )}
                </div>
              </div>
            ) : (
            <form onSubmit={handleSubmit(onSubmit, onSubmitInvalid)} className="space-y-4">
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
                label={t('attendance.book_label')}
                placeholder={t('attendance.book_placeholder')}
                hint={t('attendance.book_hint')}
                error={getErrorMessage(errors.book?.message)}
                {...register('book')}
              />

              {attendanceStatus === 'present' && (
                <LessonReportForm value={report} onChange={setReport} />
              )}

              {/* Images */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">{t('attendance.images')} ({images.length}/20)</label>
                <div className="flex gap-2 flex-wrap">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                      {img.uploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {/* Cho phép gỡ ảnh cả khi đang tải — nếu upload bị kẹt, gia sư vẫn tự gỡ để gửi điểm danh */}
                      <button type="button" onClick={() => removeImage(i)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center"
                        aria-label={`Remove image ${i + 1}`}>
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {images.length < 20 && (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-[#3BB8EB] transition-colors">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} aria-label="Upload images" />
                      <Upload className="w-5 h-5 text-slate-400" />
                    </label>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 text-sm border border-slate-200">
                <p className="text-slate-600 font-medium">
                  {student.name} · {selectedPkg?.subjectName || student.subjectName} · {selectedMinutes} {t('attendance.minutes')} · {watch('date')}
                </p>
              </div>

              <Button type="submit" fullWidth size="lg" loading={submitting} className="sticky bottom-4 mt-2 bg-[#3BB8EB] hover:bg-[#2da8db]">
                {t('attendance.submit')}
              </Button>
            </form>
            )}
          </>
        )
      })()}
    </div>
  )
}
