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
import { formatVND, getToday, MINUTE_PRESETS } from '@/lib/constants'
import { Search, X, Upload, AlertTriangle, CheckCircle } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'

const schema = z.object({
  date: z.string().min(1),
  minutes: z.number(),
  comment: z.string().optional(),
  homework: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export function AttendancePage() {
  const { user, teacherId } = useAuthStore()
  const [code, setCode] = useState('')
  const [student, setStudent] = useState<Student | null>(null)
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [selectedMinutes, setSelectedMinutes] = useState<number>(50)
  const [images, setImages] = useState<{ url: string; storageURL: string; uploading: boolean }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [teacherData, setTeacherData] = useState<{ name: string; code: string; subjectName?: string; level: number } | null>(null)

  const today = getToday()

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { date: today, minutes: 50 },
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
        // Load teacher info
        if (teacherId) {
          const tSnap = await getDoc(doc(db, 'teachers', teacherId))
          if (tSnap.exists()) {
            const t = tSnap.data()
            const subjectSnap = t.subjectIds?.length
              ? await getDoc(doc(db, 'subjects', s.subjectId))
              : null
            setTeacherData({
              name: t.name,
              code: t.code,
              level: t.level,
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
      toast.warning('Tối đa 5 ảnh')
      return
    }

    for (const file of files) {
      // Compress image
      const canvas = document.createElement('canvas')
      const img = document.createElement('img')
      const url = URL.createObjectURL(file)
      img.src = url

      await new Promise((resolve) => { img.onload = resolve })
      // Compress image aggressively to fit in Firestore (1MB limit)
      const MAX = 800 // Smaller max size
      let { width, height } = img
      if (width > MAX) { height = (height * MAX) / width; width = MAX }
      if (height > MAX) { width = (width * MAX) / height; height = MAX }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      // Use higher compression for JPEG
      const preview = canvas.toDataURL('image/jpeg', 0.6)

      // Save base64 directly instead of uploading to Firebase Storage
      setImages((prev) => [...prev, { url: preview, storageURL: preview, uploading: false }])

      URL.revokeObjectURL(url)
    }
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const onSubmit = async (data: FormData) => {
    if (!student || !teacherId) return
    if (student.remainingSessions <= 0) {
      toast.error('Học viên đã hết buổi học')
      return
    }
    if (images.some((i) => i.uploading)) {
      toast.warning('Đang tải ảnh, vui lòng chờ')
      return
    }

    setSubmitting(true)
    try {
      const tSnap = await getDoc(doc(db, 'teachers', teacherId))
      const teacher = tSnap.data()!

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
        imageURLs: images.map((i) => i.storageURL).filter(Boolean),
        status: 'pending',
        sessionsBeforeApproval: student.remainingSessions,
        sessionsAfterApproval: student.remainingSessions,
        salary: 0,
        createdAt: serverTimestamp(),
      })

      setSubmitted(true)
      toast.success('Đã gửi điểm danh, chờ admin duyệt')
      setTimeout(() => {
        setSubmitted(false)
        setStudent(null)
        setCode('')
        setImages([])
        reset({ date: today, minutes: 50 })
        setSelectedMinutes(50)
      }, 2000)
    } catch (err) {
      console.error(err)
      toast.error('Gửi điểm danh thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Đã gửi điểm danh!</h2>
        <p className="text-slate-400 text-sm">Chờ admin duyệt...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 pt-2 lg:pt-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Điểm danh</h1>
        <p className="text-sm text-slate-400 mt-0.5">Nhập mã học viên để bắt đầu</p>
      </div>

      {/* Step 1: Student code input */}
      <Card>
        <label htmlFor="student-code" className="block text-sm font-medium text-slate-300 mb-2">Mã học viên</label>
        <div className="flex gap-2">
          <input
            id="student-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && searchStudent()}
            placeholder="VD: HS8X2K91"
            className="flex-1 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 placeholder-slate-500
              px-4 py-3 text-xl font-mono font-bold tracking-widest uppercase
              focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[56px]"
            autoCapitalize="characters"
            autoCorrect="off"
          />
          {code && (
            <button onClick={() => { setCode(''); setStudent(null); setNotFound(false) }}
              className="p-3 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Xóa mã học viên"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <Button fullWidth size="lg" className="mt-3" loading={searching} onClick={searchStudent}>
          <Search className="w-5 h-5" />
          Tìm học viên
        </Button>
      </Card>

      {notFound && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center">
          <p className="text-rose-400 font-medium">Không tìm thấy học viên</p>
          <p className="text-slate-500 text-sm mt-1">Mã "{code}" không tồn tại</p>
        </div>
      )}

      {student && (
        <>
          {/* Student info card */}
          <Card className={student.remainingSessions <= 0 ? 'border-rose-500/50' : ''}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-slate-100">{student.name}</p>
                <p className="font-mono text-sm text-indigo-400 mt-0.5">{student.code}</p>
                <p className="text-sm text-slate-400 mt-1">{student.subjectName}</p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${
                  student.remainingSessions === 0 ? 'text-rose-400' :
                  student.remainingSessions <= 3 ? 'text-amber-400' : 'text-emerald-400'
                }`}>{student.remainingSessions}</p>
                <p className="text-xs text-slate-500">buổi còn lại</p>
              </div>
            </div>
          </Card>

          {student.remainingSessions <= 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-300">Học viên đã hết khoá học</p>
                <p className="text-sm text-slate-400 mt-1">
                  {student.name} đã dùng hết {student.totalSessions} buổi.
                  Vui lòng liên hệ admin để gia hạn.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Date */}
              <div>
                <label htmlFor="attendance-date" className="block text-sm font-medium text-slate-300 mb-1.5">Ngày học</label>
                <input
                  id="attendance-date"
                  type="date"
                  max={today}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 text-slate-100 px-4 py-3 text-sm min-h-[48px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...register('date')}
                />
              </div>

              {/* Minutes preset buttons */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Số phút</label>
                <div className="grid grid-cols-4 gap-2">
                  {MINUTE_PRESETS.map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setSelectedMinutes(min)}
                      className={`py-3 rounded-xl text-sm font-bold transition-all
                        ${selectedMinutes === min
                          ? 'bg-indigo-500 text-white shadow-lg scale-105'
                          : 'bg-slate-800 text-slate-400 border border-slate-600 hover:border-indigo-500/50 hover:text-white'
                        }`}
                    >
                      {min}'
                    </button>
                  ))}
                </div>
              </div>

              <Textarea
                label="Nhận xét buổi học"
                placeholder="Học viên tiến bộ tốt, cần ôn luyện thêm..."
                rows={3}
                {...register('comment')}
              />

              <Textarea
                label="Bài tập về nhà"
                placeholder="Làm bài tập trang 45-47..."
                rows={2}
                {...register('homework')}
              />

              {/* Image upload */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Hình ảnh ({images.length}/5)
                </label>
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
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center"
                          aria-label={`Xóa ảnh ${i + 1}`}
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      )}
                    </div>
                  ))}
                  {images.length < 5 && (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                        capture="environment"
                        aria-label="Tải ảnh lên"
                      />
                      <Upload className="w-5 h-5 text-slate-500" />
                    </label>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-800 rounded-xl p-4 text-sm border border-slate-700">
                <p className="text-slate-300 font-medium">
                  {student.name} · {student.subjectName} · {selectedMinutes} phút · {watch('date')}
                </p>
              </div>

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={submitting}
                className="sticky bottom-4 mt-2"
              >
                Xác nhận điểm danh
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
