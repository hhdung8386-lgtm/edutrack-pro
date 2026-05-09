import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, addDoc, updateDoc, doc, getDocs, query,
  where, serverTimestamp, setDoc
} from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, secondaryAuth, generateTeacherCode } from '@/lib/firebase'
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

  // Auth fields for creating new teacher account
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [subjectSearch, setSubjectSearch] = useState('')
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

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

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    let firstErrorFieldId = ''

    if (!isEdit && !newUsername.trim()) {
      newErrors.username = 'Vui lòng nhập tên tài khoản'
      if (!firstErrorFieldId) firstErrorFieldId = 'field-username'
    }

    if (!isEdit) {
      if (!newPassword) {
        newErrors.password = 'Vui lòng nhập mật khẩu'
        if (!firstErrorFieldId) firstErrorFieldId = 'field-password'
      } else if (newPassword.length < 6) {
        newErrors.password = 'Mật khẩu tối thiểu 6 ký tự'
        if (!firstErrorFieldId) firstErrorFieldId = 'field-password'
      }
    }

    const formEl = document.getElementById('teacher-form') as HTMLFormElement
    const nameInput = formEl?.querySelector<HTMLInputElement>('input[name="name"]')
    const levelInput = formEl?.querySelector<HTMLInputElement>('input[name="level"]')
    
    const nameVal = nameInput?.value || ''
    if (!nameVal.trim()) {
      newErrors.name = 'Vui lòng nhập tên giáo viên'
      if (!firstErrorFieldId) firstErrorFieldId = 'field-name'
    }

    if (selectedSubjects.length === 0) {
      newErrors.subjects = 'Vui lòng chọn môn dạy'
      if (!firstErrorFieldId) firstErrorFieldId = 'field-subjects'
    }

    const levelVal = parseFloat(levelInput?.value || '0')
    if (isNaN(levelVal) || levelVal <= 0) {
      newErrors.level = 'Vui lòng nhập hệ số lương'
      if (!firstErrorFieldId) firstErrorFieldId = 'field-level'
    }

    setLocalErrors(newErrors)

    if (firstErrorFieldId) {
      const el = document.getElementById(firstErrorFieldId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus()
      }
      return false
    }

    return true
  }

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
      const finalName = data.name?.trim() || ''



      const subjectNames = selectedSubjects.map((id) => subjects.find((s) => s.id === id)?.name || '')

      if (isEdit && teacher) {
        let photoURL = teacher.photoURL
        if (photoFile) photoURL = await uploadPhoto(teacher.id, photoFile)

        await updateDoc(doc(db, 'teachers', teacher.id), {
          name: finalName || teacher.name,
          level: data.level,
          bio: data.bio || '',
          subjectIds: selectedSubjects,
          subjectNames,
          photoURL,
          updatedAt: serverTimestamp(),
        })
        toast.success('Đã cập nhật giáo viên')
      } else {
        // CREATE mode - Admin creates account for teacher
        if (!newUsername || !newPassword) {
          toast.error('Vui lòng điền Tên tài khoản và Mật khẩu')
          return
        }

        const code = generateTeacherCode()
        const finalEmail = newUsername.includes('@') ? newUsername : `${newUsername}@edutrackpro.app`

        let finalUid: string
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

        let photoURL = ''
        if (photoFile) photoURL = await uploadPhoto(finalUid, photoFile)

        // Create teacher doc
        const teacherRef = await addDoc(collection(db, 'teachers'), {
          code,
          name: finalName || 'Giáo viên mới',
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

  const watchLevel = register('level')

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
            onClick={async () => {
              if (!validateForm()) return
              const formEl = document.getElementById('teacher-form') as HTMLFormElement
              const nameInput = formEl?.querySelector<HTMLInputElement>('input[name="name"]')
              const levelInput = formEl?.querySelector<HTMLInputElement>('input[name="level"]')
              const bioInput = formEl?.querySelector<HTMLTextAreaElement>('textarea[name="bio"]')
              
              const nameVal = nameInput?.value || ''
              const levelVal = parseFloat(levelInput?.value || '1')
              const bioVal = bioInput?.value || ''
              
              await onSubmit({ name: nameVal, level: levelVal, bio: bioVal })
            }}
          >
            {isEdit ? 'Lưu thay đổi' : 'Tạo giáo viên'}
          </Button>
        </div>
      }
    >
      <form id="teacher-form" className="space-y-4">

        {/* Account creation section - only for new teachers */}
        {!isEdit && (
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-4">
            <h4 className="font-medium text-indigo-900 flex items-center gap-2">
              Tạo tài khoản giáo viên <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">Bắt buộc</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Tên tài khoản *</label>
                <input
                  id="field-username"
                  type="text"
                  required
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${localErrors.username ? 'border-red-500' : 'border-slate-300'}`}
                  placeholder="Ví dụ: giasu1"
                  value={newUsername}
                  onChange={e => {
                    setNewUsername(e.target.value)
                    if (localErrors.username) setLocalErrors(prev => ({ ...prev, username: '' }))
                  }}
                />
                {localErrors.username ? (
                  <p className="text-[10px] text-red-500 mt-1">{localErrors.username}</p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">Giáo viên đăng nhập bằng tên này</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Mật khẩu *</label>
                <input
                  id="field-password"
                  type="text"
                  required
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${localErrors.password ? 'border-red-500' : 'border-slate-300'}`}
                  placeholder="Tối thiểu 6 ký tự"
                  value={newPassword}
                  onChange={e => {
                    setNewPassword(e.target.value)
                    if (localErrors.password) setLocalErrors(prev => ({ ...prev, password: '' }))
                  }}
                />
                {localErrors.password && <p className="mt-1.5 text-xs text-red-500">{localErrors.password}</p>}
              </div>
            </div>
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
                <div className={`h-full bg-indigo-500 rounded-full transition-all ${uploadProgress === 10 ? 'w-[10%]' : uploadProgress === 50 ? 'w-[50%]' : uploadProgress === 100 ? 'w-full' : 'w-0'}`} />
              </div>
            )}
          </div>
        </div>

        <Input
          id="field-name"
          label="Tên giáo viên *"
          placeholder="Nguyễn Thị B"
          error={localErrors.name}
          {...(() => {
            const { onChange, ...rest } = register('name')
            return {
              ...rest,
              onChange: (e: any) => {
                onChange(e)
                if (localErrors.name) setLocalErrors(prev => ({ ...prev, name: '' }))
              }
            }
          })()}
        />

        {/* Subject multi-select with Search */}
        <div className="relative">
          <label className="block text-sm font-medium text-slate-600 mb-2">Môn dạy *</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedSubjects.map((id) => {
              const s = subjects.find(sub => sub.id === id)
              if (!s) return null
              return (
                <div key={id} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md text-sm">
                  <span>{s.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSubjects(prev => prev.filter(x => x !== id))}
                    className="hover:text-indigo-900"
                    aria-label="Xóa môn"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
          
          <div className="relative">
            <input
              id="field-subjects"
              type="text"
              placeholder="Tìm và chọn môn học..."
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${localErrors.subjects ? 'border-red-500' : 'border-slate-300'}`}
              value={subjectSearch}
              onChange={e => {
                setSubjectSearch(e.target.value)
                setIsSubjectDropdownOpen(true)
                if (localErrors.subjects) setLocalErrors(prev => ({ ...prev, subjects: '' }))
              }}
              onFocus={() => setIsSubjectDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsSubjectDropdownOpen(false), 200)}
            />
            {localErrors.subjects && <p className="mt-1.5 text-xs text-red-500">{localErrors.subjects}</p>}
            {isSubjectDropdownOpen && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {subjects.filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500 text-center">Không tìm thấy môn học</div>
                ) : (
                  subjects.filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(s => (
                    <div
                      key={s.id}
                      className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                      onClick={() => {
                        if (!selectedSubjects.includes(s.id)) {
                          setSelectedSubjects(prev => [...prev, s.id])
                        }
                        setSubjectSearch('')
                        setIsSubjectDropdownOpen(false)
                        if (localErrors.subjects) setLocalErrors(prev => ({ ...prev, subjects: '' }))
                      }}
                    >
                      <span className="font-medium text-slate-700">{s.name}</span>
                      <span className="text-xs text-slate-500">{s.pricePerMinute.toLocaleString('vi-VN')}đ/phút</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <Input
            id="field-level"
            label="Hệ số lương (Level) *"
            type="number"
            step="0.1"
            min="0.5"
            max="3.0"
            error={localErrors.level}
            {...(() => {
              const { onChange, ...rest } = register('level')
              return {
                ...rest,
                onChange: (e: any) => {
                  onChange(e)
                  if (localErrors.level) setLocalErrors(prev => ({ ...prev, level: '' }))
                }
              }
            })()}
          />
          <div className="text-xs text-slate-500 mt-2 space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="font-medium text-slate-600 mb-1">Ước tính lương (1 ca 50 phút):</p>
            {selectedSubjects.length === 0 ? (
              <p className="italic text-slate-400">Vui lòng chọn môn dạy để xem ước tính</p>
            ) : (
              selectedSubjects.map(id => {
                const s = subjects.find(sub => sub.id === id)
                if (!s) return null
                const levelInput = document.querySelector<HTMLInputElement>('input[name="level"]')
                const currentLevel = parseFloat(levelInput?.value || '1')
                const estSalary = 50 * s.pricePerMinute * (currentLevel || 0)
                return (
                  <div key={id} className="flex justify-between items-center">
                    <span>{s.name} ({s.pricePerMinute.toLocaleString('vi-VN')}đ/p):</span>
                    <span className="font-medium text-indigo-600">
                      {estSalary.toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                )
              })
            )}
          </div>
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
