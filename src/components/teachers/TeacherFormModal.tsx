import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, addDoc, updateDoc, doc, getDocs, query,
  where, serverTimestamp, setDoc
} from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, secondaryAuth, generateUniqueCode } from '@/lib/firebase'
import { Teacher, Subject } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { Upload, X } from 'lucide-react'
import { parseVietnameseNumber, formatVietnameseNumberInput } from '@/pages/admin/SubjectsPage'

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
  const [subjectSearch, setSubjectSearch] = useState('')
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})



  // Interview profile states
  const [yob, setYob] = useState<string>(teacher?.yob ? String(teacher.yob) : '')
  const [livingArea, setLivingArea] = useState(teacher?.livingArea || '')
  const [degreeType, setDegreeType] = useState(teacher?.degreeType || 'Đại học')
  const [university, setUniversity] = useState(teacher?.university || '')
  const [major, setMajor] = useState(teacher?.major || '')
  const [gradYear, setGradYear] = useState(teacher?.gradYear || '')
  const [gpa, setGpa] = useState(teacher?.gpa || '')
  const [academicAwards, setAcademicAwards] = useState(teacher?.academicAwards || '')
  const [scholarship, setScholarship] = useState(teacher?.scholarship || '')

  const [ielts, setIelts] = useState(teacher?.ielts || '')
  const [toeic, setToeic] = useState(teacher?.toeic || '')
  const [toefl, setToefl] = useState(teacher?.toefl || '')
  const [cefr, setCefr] = useState<string[]>(teacher?.cefr || [])
  const [tesolTefl, setTesolTefl] = useState(teacher?.tesolTefl || '')
  const [pedagogicalCert, setPedagogicalCert] = useState(teacher?.pedagogicalCert || '')
  const [otherCerts, setOtherCerts] = useState(teacher?.otherCerts || '')

  const [teachingYears, setTeachingYears] = useState<string>(teacher?.teachingYears ? String(teacher.teachingYears) : '')
  const [studentsTaughtCount, setStudentsTaughtCount] = useState<string>(teacher?.studentsTaughtCount ? String(teacher.studentsTaughtCount) : '')
  const [studentAgesTaught, setStudentAgesTaught] = useState(teacher?.studentAgesTaught || '')
  const [teachingFormats, setTeachingFormats] = useState<string[]>(teacher?.teachingFormats || [])
  const [studentResults, setStudentResults] = useState(teacher?.studentResults || '')
  const [strengths, setStrengths] = useState<string[]>(teacher?.strengths || [])
  const [otherStrengths, setOtherStrengths] = useState(teacher?.otherStrengths || '')

  const [languagesTaught, setLanguagesTaught] = useState<string[]>(teacher?.languagesTaught || [])
  const [academicSubjectsTaught, setAcademicSubjectsTaught] = useState<string[]>(teacher?.academicSubjectsTaught || [])
  const [generatedCode, setGeneratedCode] = useState('')

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

  useEffect(() => {
    if (!isEdit && !generatedCode) {
      generateUniqueCode('teacher')
        .then((code) => {
          setGeneratedCode(code)
          setNewUsername(code)
        })
        .catch((err) => {
          console.error(err)
          toast.error('Không thể sinh mã tài khoản giáo viên')
        })
    }
  }, [isEdit, generatedCode])



  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    let firstErrorFieldId = ''

    if (!isEdit && !newUsername.trim()) {
      newErrors.username = 'Vui lòng nhập tên tài khoản'
      if (!firstErrorFieldId) firstErrorFieldId = 'field-username'
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

      const interviewData = {
        yob: yob ? Number(yob) : null,
        livingArea: livingArea || '',
        degreeType: degreeType || '',
        university: university || '',
        major: major || '',
        gradYear: gradYear || '',
        gpa: gpa || '',
        academicAwards: academicAwards || '',
        scholarship: scholarship || '',
        ielts: ielts || '',
        toeic: toeic || '',
        toefl: toefl || '',
        cefr: cefr || [],
        tesolTefl: tesolTefl || '',
        pedagogicalCert: pedagogicalCert || '',
        otherCerts: otherCerts || '',
        teachingYears: teachingYears ? Number(teachingYears) : null,
        studentsTaughtCount: studentsTaughtCount ? Number(studentsTaughtCount) : null,
        studentAgesTaught: studentAgesTaught || '',
        teachingFormats: teachingFormats || [],
        studentResults: studentResults || '',
        strengths: strengths || [],
        otherStrengths: otherStrengths || '',
        languagesTaught: languagesTaught || [],
        academicSubjectsTaught: academicSubjectsTaught || [],
      }

      if (isEdit && teacher) {
        let photoURL = teacher.photoURL
        if (photoFile) photoURL = await uploadPhoto(teacher.id, photoFile)

        await updateDoc(doc(db, 'teachers', teacher.id), {
          name: finalName || teacher.name,
          level: data.level,
          bio: data.bio || '',
          subjectIds: selectedSubjects,
          subjectNames,
          ...interviewData,
          photoURL,
          updatedAt: serverTimestamp(),
        })
        toast.success('Đã cập nhật giáo viên')
      } else {
        // CREATE mode - Admin creates account for teacher
        if (!newUsername) {
          toast.error('Vui lòng điền Tên tài khoản')
          return
        }

        let code = generatedCode || newUsername
        if (!code) {
          try {
            code = await generateUniqueCode('teacher')
          } catch (err: any) {
            toast.error('Không thể sinh mã giáo viên, vui lòng thử lại')
            return
          }
        }

        const finalEmail = newUsername.includes('@') ? newUsername : `${newUsername}@edutrackpro.app`
        const FIXED_PASSWORD = '1234560'

        let finalUid: string
        try {
          const credential = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, FIXED_PASSWORD)
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
          ...interviewData,
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
      size="xl"
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700 font-medium">
                ℹ️ <strong>Mật khẩu cố định:</strong> Tất cả giáo viên sẽ dùng mật khẩu <strong>1234560</strong>
              </p>
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
                const rateVal = s.pricePerMinute
                const levelInput = document.querySelector<HTMLInputElement>('input[name="level"]')
                const currentLevel = parseFloat(levelInput?.value || '1')
                const estSalary = 50 * rateVal * (currentLevel || 0)
                return (
                  <div key={id} className="flex justify-between items-center">
                    <span>{s.name} ({formatVietnameseNumberInput(rateVal)}đ/p):</span>
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

        {/* Interview Profile Fields */}
        <div className="border-t border-slate-200 pt-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Hồ sơ phỏng vấn gia sư</h3>
          
          {/* Section 1: Thông tin cá nhân & Học vấn */}
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">1. Thông tin cá nhân & Học vấn</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Năm sinh</label>
                <input
                  type="number"
                  placeholder="Ví dụ: 1998"
                  value={yob}
                  onChange={e => setYob(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Khu vực sinh sống</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Cầu Giấy, Hà Nội"
                  value={livingArea}
                  onChange={e => setLivingArea(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Học vị / Trình độ</label>
                <select
                  value={degreeType}
                  onChange={e => setDegreeType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Đại học">Đại học</option>
                  <option value="Cao đẳng">Cao đẳng</option>
                  <option value="Thạc sĩ">Thạc sĩ</option>
                  <option value="Tiến sĩ">Tiến sĩ</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Trường ĐH/CĐ</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Đại học Ngoại thương"
                  value={university}
                  onChange={e => setUniversity(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chuyên ngành</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Tiếng Anh thương mại"
                  value={major}
                  onChange={e => setMajor(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Năm tốt nghiệp / Năm học</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 2022 hoặc Sinh viên năm 3"
                  value={gradYear}
                  onChange={e => setGradYear(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">GPA</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 3.6/4.0 hoặc 8.5/10"
                  value={gpa}
                  onChange={e => setGpa(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Học bổng</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Học bổng khuyến học kỳ II"
                  value={scholarship}
                  onChange={e => setScholarship(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Thành tích học tập nổi bật</label>
              <textarea
                placeholder="Nhập thành tích học tập nổi bật..."
                rows={2}
                value={academicAwards}
                onChange={e => setAcademicAwards(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Section 2: Chứng chỉ */}
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">2. Chứng chỉ</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">IELTS</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 7.5"
                  value={ielts}
                  onChange={e => setIelts(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">TOEIC</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 850"
                  value={toeic}
                  onChange={e => setToeic(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">TOEFL</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 100"
                  value={toefl}
                  onChange={e => setToefl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">TESOL / TEFL</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 120 hours"
                  value={tesolTefl}
                  onChange={e => setTesolTefl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chứng chỉ sư phạm</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Nghiệp vụ sư phạm..."
                  value={pedagogicalCert}
                  onChange={e => setPedagogicalCert(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">Khung tham chiếu CEFR</label>
              <div className="flex gap-4 flex-wrap">
                {['B1', 'B2', 'C1', 'C2'].map(lvl => (
                  <label key={lvl} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cefr.includes(lvl)}
                      onChange={e => {
                        if (e.target.checked) {
                          setCefr(prev => [...prev, lvl])
                        } else {
                          setCefr(prev => prev.filter(x => x !== lvl))
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    {lvl}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Chứng chỉ khác</label>
              <textarea
                placeholder="Nhập các chứng chỉ khác nếu có..."
                rows={2}
                value={otherCerts}
                onChange={e => setOtherCerts(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Section 2.5: Lĩnh vực & Môn học giảng dạy */}
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 space-y-4">
            <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Lĩnh vực & Môn học giảng dạy</h4>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">Ngoại ngữ có thể giảng dạy</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'Tiếng Anh Giao Tiếp',
                  'Tiếng Anh Trẻ Em',
                  'Tiếng Anh Thiếu Niên',
                  'Tiếng Anh Người Đi Làm',
                  'Cambridge Starters/Movers/Flyers/KET/PET',
                  'IELTS',
                  'TOEIC',
                  'TOEFL',
                  'Tiếng Trung (HSK)',
                  'Tiếng Nhật (JLPT)',
                  'Tiếng Hàn (TOPIK)'
                ].map(lang => (
                  <label key={lang} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={languagesTaught.includes(lang)}
                      onChange={e => {
                        if (e.target.checked) {
                          setLanguagesTaught(prev => [...prev, lang])
                        } else {
                          setLanguagesTaught(prev => prev.filter(x => x !== lang))
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    {lang}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">Gia sư Văn Hóa & Học Thuật</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'Toán Học',
                  'Vật Lý',
                  'Hóa Học',
                  'Sinh Học',
                  'Ngữ Văn',
                  'Lịch Sử',
                  'Địa Lý',
                  'Tin Học',
                  'Khoa Học Tự Nhiên',
                  'Tiếng Việt',
                  'Luyện Thi Chuyển Cấp',
                  'Luyện Thi THPT Quốc Gia',
                  'Chương Trình Quốc Tế SAT/ACT'
                ].map(subj => (
                  <label key={subj} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={academicSubjectsTaught.includes(subj)}
                      onChange={e => {
                        if (e.target.checked) {
                          setAcademicSubjectsTaught(prev => [...prev, subj])
                        } else {
                          setAcademicSubjectsTaught(prev => prev.filter(x => x !== subj))
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    {subj}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Kinh nghiệm & Ưu điểm */}
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">3. Kinh nghiệm & Ưu điểm</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Số năm kinh nghiệm</label>
                <input
                  type="number"
                  placeholder="Ví dụ: 3"
                  value={teachingYears}
                  onChange={e => setTeachingYears(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Số học viên đã dạy</label>
                <input
                  type="number"
                  placeholder="Ví dụ: 15"
                  value={studentsTaughtCount}
                  onChange={e => setStudentsTaughtCount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Độ tuổi HS từng dạy</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 6-12 tuổi"
                  value={studentAgesTaught}
                  onChange={e => setStudentAgesTaught(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">Hình thức dạy chính</label>
              <div className="flex gap-4">
                {['online', 'offline'].map(format => (
                  <label key={format} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 cursor-pointer capitalize">
                    <input
                      type="checkbox"
                      checked={teachingFormats.includes(format)}
                      onChange={e => {
                        if (e.target.checked) {
                          setTeachingFormats(prev => [...prev, format])
                        } else {
                          setTeachingFormats(prev => prev.filter(x => x !== format))
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    {format === 'online' ? 'Online' : 'Offline'}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Thành tích học viên đạt được</label>
              <textarea
                placeholder="Ví dụ: Học viên đỗ chuyên Anh, tăng band điểm IELTS..."
                rows={2}
                value={studentResults}
                onChange={e => setStudentResults(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">Ưu điểm nổi bật</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'pronunciation', label: 'Phát âm chuẩn' },
                  { key: 'patience', label: 'Kiên nhẫn' },
                  { key: 'lesson_plans', label: 'Có giáo án riêng' },
                  { key: 'close_followup', label: 'Theo sát học viên' },
                  { key: 'progress_reports', label: 'Báo cáo tiến độ định kỳ' },
                  { key: 'tools_proficiency', label: 'Sử dụng Zoom/Meet thành thạo' }
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={strengths.includes(item.key)}
                      onChange={e => {
                        if (e.target.checked) {
                          setStrengths(prev => [...prev, item.key])
                        } else {
                          setStrengths(prev => prev.filter(x => x !== item.key))
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Ưu điểm khác</label>
              <textarea
                placeholder="Nhập ưu điểm khác nếu có..."
                rows={2}
                value={otherStrengths}
                onChange={e => setOtherStrengths(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}
