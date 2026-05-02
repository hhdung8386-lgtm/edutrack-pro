import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, addDoc, updateDoc, doc, getDocs, query,
  where, serverTimestamp, setDoc
} from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, auth, secondaryAuth, generateTeacherCode } from '@/lib/firebase'
import { Teacher, Subject } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { Upload, X } from 'lucide-react'

const schema = z.object({
  name: z.string().optional().default(''),
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

  // Auth combined flow states
  const [authMode, setAuthMode] = useState<'CREATE' | 'LINK'>('CREATE')
  const [candidates, setCandidates] = useState<{ uid: string, email: string, name?: string, username?: string }[]>([])
  const [selectedUid, setSelectedUid] = useState<string>('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const isEdit = !!teacher

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
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

    if (!isEdit) {
      getDocs(collection(db, 'users')).then((snap) => {
        const docs = snap.docs.map(d => d.data() as { uid: string, email: string, teacherId?: string, role?: string, name?: string, username?: string })
        const available = docs.filter(u => !u.teacherId && u.email && u.role !== 'admin')
        setCandidates(available)
        if (available.length > 0) {
          setSelectedUid(available[0].uid)
        }
      })
    }
  }, [isEdit])

  useEffect(() => {
    if (!isEdit && authMode === 'LINK' && selectedUid) {
      const cand = candidates.find(c => c.uid === selectedUid)
      if (cand) {
        setValue('name', cand.name || cand.username || cand.email.split('@')[0])
      }
    }
  }, [authMode, selectedUid, candidates, isEdit, setValue])

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
          const MAX = 400
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
      // Derive name: from form (CREATE mode) or from linked candidate (LINK mode)
      let finalName = data.name || ''
      if (!isEdit && authMode === 'LINK' && selectedUid) {
        const cand = candidates.find(c => c.uid === selectedUid)
        if (cand) {
          finalName = cand.name || cand.username || cand.email.split('@')[0]
        }
      }
      if (!isEdit && authMode === 'CREATE' && !finalName.trim()) {
        toast.error('Vui lòng nhập tên giáo viên')
        return
      }
      if (!finalName.trim()) finalName = 'Giáo viên mới'

      const subjectNames = selectedSubjects.map((id) => subjects.find((s) => s.id === id)?.name || '')

      if (isEdit && teacher) {
        let photoURL = teacher.photoURL
        if (photoFile) photoURL = await uploadPhoto(teacher.id, photoFile)

        await updateDoc(doc(db, 'teachers', teacher.id), {
          name: finalName,
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
        let finalUid = selectedUid
        let finalEmail = ''

        if (authMode === 'CREATE') {
          if (!newUsername || !newPassword) {
            toast.error('Vui lòng điền Tên tài khoản và Mật khẩu cho giáo viên mới')
            return
          }
          finalEmail = newUsername.includes('@') ? newUsername : `${newUsername}@edutrackpro.app`
          try {
            const credential = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, newPassword)
            await secondaryAuth.signOut()
            finalUid = credential.user.uid

            await setDoc(doc(db, 'users', finalUid), {
              uid: finalUid,
              email: finalEmail,
              username: newUsername,
              role: 'teacher',
              createdAt: serverTimestamp(),
            })
          } catch (err: any) {
            if (err.code === 'auth/email-already-in-use') {
              toast.error('Tài khoản này đã tồn tại!')
            } else {
              toast.error('Có lỗi xảy ra khi tạo tài khoản')
            }
            return
          }
        } else {
          if (!selectedUid) {
            toast.error('Vui lòng chọn tài khoản liên kết')
            return
          }
          const cand = candidates.find(c => c.uid === selectedUid)
          finalEmail = cand?.email || ''
        }

        let photoURL = ''
        if (photoFile) photoURL = await uploadPhoto(finalUid, photoFile)

        // Create teacher doc
        const teacherRef = await addDoc(collection(db, 'teachers'), {
          code,
          name: finalName,
          level: data.level,
          bio: data.bio || '',
          subjectIds: selectedSubjects,
          subjectNames,
          photoURL,
          status: 'active',
          createdAt: serverTimestamp(),
        })

        // Link teacherId to user doc
        await updateDoc(doc(db, 'users', finalUid), {
          role: 'teacher',
          teacherId: teacherRef.id
        })

        toast.success(`Đã tạo giáo viên thành công!`)
      }
      onClose()
    } catch (err: any) {
      console.error(err)
      if (err.code === 'auth/email-already-in-use') {
        toast.error('Email này đã được sử dụng')
      } else {
        toast.error('Có lỗi xảy ra: ' + err.message)
      }
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
          <Button
            type="button"
            loading={isSubmitting}
            onClick={handleSubmit(onSubmit as any, (errs) => {
              const msgs = Object.values(errs).map((e: any) => e?.message).filter(Boolean).join(', ')
              toast.error(msgs || 'Vui lòng kiểm tra lại thông tin')
            })}
          >
            {isEdit ? 'Lưu thay đổi' : 'Tạo giáo viên'}
          </Button>
        </div>
      }
    >
      <form id="teacher-form" className="space-y-4">

        {/* Auth section */}
        {!isEdit && (
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-4">
            <h4 className="font-medium text-indigo-900 flex items-center gap-2">
              Tài khoản liên kết <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">Bắt buộc</span>
            </h4>

            <div className="flex bg-white p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${authMode === 'CREATE' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                onClick={() => setAuthMode('CREATE')}
              >
                Tạo mới
              </button>
              <button
                type="button"
                className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${authMode === 'LINK' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                onClick={() => setAuthMode('LINK')}
              >
                Chọn có sẵn
              </button>
            </div>

            {authMode === 'LINK' && (
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    placeholder="Tìm kiếm tài khoản..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={searchQuery}
                    onChange={e => {
                      const newQuery = e.target.value
                      setSearchQuery(newQuery)
                      const newFiltered = candidates.filter(c => {
                        const displayStr = c.username || c.email.split('@')[0]
                        const searchStr = `${displayStr} ${c.name || ''}`.toLowerCase()
                        return searchStr.includes(newQuery.toLowerCase())
                      })
                      if (newFiltered.length > 0 && !newFiltered.find(c => c.uid === selectedUid)) {
                        setSelectedUid(newFiltered[0].uid)
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Chọn tài khoản đã đăng ký</label>
                  <select
                    title="Chọn tài khoản đã đăng ký"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={selectedUid}
                    onChange={e => setSelectedUid(e.target.value)}
                  >
                    {candidates.length === 0 && <option value="" disabled>Không có tài khoản nào chờ liên kết</option>}
                    {candidates
                      .filter(c => {
                        const displayStr = c.username || c.email.split('@')[0]
                        const searchStr = `${displayStr} ${c.name || ''}`.toLowerCase()
                        return searchStr.includes(searchQuery.toLowerCase())
                      })
                      .map(c => {
                        const displayStr = c.username || c.email.split('@')[0]
                        return (
                          <option key={c.uid} value={c.uid}>
                            {displayStr} {c.name ? `- ${c.name}` : ''}
                          </option>
                        )
                      })}
                  </select>
                </div>
              </div>
            )}

            {authMode === 'CREATE' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Tên tài khoản</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    placeholder="Ví dụ: giasu1"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Mật khẩu</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    placeholder="Nhập mật khẩu..."
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Photo upload */}
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500">
                <Upload className="w-6 h-6" />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">Ảnh giáo viên</p>
            <label className="cursor-pointer text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              Chọn ảnh...
            </label>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden w-32">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        </div>

        <div className={!isEdit && authMode === 'LINK' ? 'hidden' : ''}>
          <Input
            label="Tên giáo viên *"
            placeholder="Nguyễn Thị B"
            error={errors.name?.message}
            {...register('name')}
          />
        </div>

        {/* Subject multi-select */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Môn dạy</label>
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
                <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{s.name}</span>
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
