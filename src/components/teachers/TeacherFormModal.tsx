import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, addDoc, updateDoc, doc, getDocs, query,
  where, serverTimestamp,
} from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, auth, generateTeacherCode } from '@/lib/firebase'
import { Teacher, Subject } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { Upload, X } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, 'Tên tối thiểu 2 ký tự'),
  level: z.coerce.number().min(0.5).max(3),
  bio: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function TeacherFormModal({ teacher, onClose }: { teacher?: Teacher; onClose: () => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(teacher?.subjectIds || [])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>(teacher?.photoURL || '')
  const [uploadProgress, setUploadProgress] = useState(0)
  const isEdit = !!teacher

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    // @ts-ignore
    resolver: zodResolver(schema),
    defaultValues: teacher ? {
      name: teacher.name,
      level: teacher.level,
      bio: teacher.bio,
    } : { level: 1.0 },
  })

  useEffect(() => {
    getDocs(query(collection(db, 'subjects'), where('status', '==', 'active'))).then((snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    })
  }, [])

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const uploadPhoto = async (teacherId: string, file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      setUploadProgress(10)
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (e) => {
        const img = new Image()
        img.src = e.target?.result as string
        img.onload = () => {
          setUploadProgress(50)
          const canvas = document.createElement('canvas')
          const MAX = 400 // Small size for avatar
          let { width, height } = img
          if (width > MAX) { height = (height * MAX) / width; width = MAX }
          if (height > MAX) { width = (width * MAX) / height; height = MAX }
          canvas.width = width; canvas.height = height
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
          setUploadProgress(100)
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.onerror = reject
      }
      reader.onerror = reject
    })
  }

  const onSubmit = async (data: FormData) => {
    try {
      const subjectNames = selectedSubjects.map((id) => subjects.find((s) => s.id === id)?.name || '')

      if (isEdit && teacher) {
        let photoURL = teacher.photoURL
        if (photoFile) photoURL = await uploadPhoto(teacher.id, photoFile)

        await updateDoc(doc(db, 'teachers', teacher.id), {
          name: data.name,
          level: data.level,
          bio: data.bio || '',
          subjectIds: selectedSubjects,
          subjectNames,
          photoURL,
          updatedAt: serverTimestamp(),
        })
        toast.success('Đã cập nhật giáo viên')
      } else {
        const code = generateTeacherCode()
        const email = `${code.toLowerCase()}@edutrackpro.app`

        // Create Firebase Auth account
        const credential = await createUserWithEmailAndPassword(auth, email, code)
        const uid = credential.user.uid

        let photoURL = ''
        if (photoFile) photoURL = await uploadPhoto(uid, photoFile)

        // Create teacher doc
        const teacherRef = await addDoc(collection(db, 'teachers'), {
          code,
          name: data.name,
          level: data.level,
          bio: data.bio || '',
          subjectIds: selectedSubjects,
          subjectNames,
          photoURL,
          status: 'active',
          createdAt: serverTimestamp(),
        })

        // Create user doc
        await addDoc(collection(db, 'users'), {
          uid,
          email,
          role: 'teacher',
          teacherId: teacherRef.id,
          createdAt: serverTimestamp(),
        })

        toast.success(`Đã tạo giáo viên — Mã: ${code} | Email: ${email}`)
      }
      onClose()
    } catch (err: unknown) {
      console.error(err)
      toast.error('Có lỗi xảy ra')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa giáo viên' : 'Thêm giáo viên mới'}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button form="teacher-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Lưu thay đổi' : 'Tạo giáo viên'}
          </Button>
        </div>
      }
    >
      <form id="teacher-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        {/* Photo upload */}
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-700 flex-shrink-0">
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500">
                <Upload className="w-6 h-6" />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300 mb-1">Ảnh giáo viên</p>
            <label className="cursor-pointer text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              Chọn ảnh...
            </label>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden w-32">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        </div>

        <Input
          label="Tên giáo viên *"
          placeholder="Nguyễn Thị B"
          error={errors.name?.message}
          {...register('name')}
        />

        {/* Subject multi-select */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Môn dạy</label>
          <div className="space-y-2">
            {subjects.map((s) => (
              <label key={s.id} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectedSubjects.includes(s.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedSubjects((prev) => [...prev, s.id])
                    else setSelectedSubjects((prev) => prev.filter((id) => id !== s.id))
                  }}
                  className="w-4 h-4 rounded accent-indigo-500"
                />
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{s.name}</span>
                <span className="text-xs text-slate-500">{s.pricePerMinute.toLocaleString('vi-VN')}đ/phút</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Input
            label="Hệ số lương (Level) *"
            type="number"
            step="0.1"
            min="0.5"
            max="3.0"
            error={errors.level?.message}
            {...register('level')}
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Ví dụ: 50 phút × 4.000đ × 1.2 = 240.000đ
          </p>
        </div>

        <Textarea
          label="Giới thiệu"
          placeholder="Mô tả kinh nghiệm và chuyên môn..."
          rows={3}
          {...register('bio')}
        />
      </form>
    </Modal>
  )
}
