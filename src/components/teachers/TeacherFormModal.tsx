import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, addDoc, updateDoc, doc, getDocs, query,
  where, serverTimestamp, setDoc
} from 'firebase/firestore'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { db, secondaryAuth, generateUniqueCode } from '@/lib/firebase'
import { generateUniqueEnglishName } from '@/lib/nameGenerator'
import { Teacher, Subject, TeacherCertificate } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { Upload, X } from 'lucide-react'
import { formatVietnameseNumberInput } from '@/pages/admin/SubjectsPage'

interface Branch {
  id: string
  name: string
  status: string
}

const DEFAULT_BRANCH_KEYWORD = 'binh tan'

const normalizeBranchName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

const schema = z.object({
  name: z.string().optional().default(''),
  level: z.coerce.number().min(0.5).max(3),
  bio: z.string().optional(),
  country: z.string().optional().default('VN'),
})

type FormData = z.infer<typeof schema>

export function TeacherFormModal({ teacher, onClose }: { teacher?: Teacher; onClose: () => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(teacher?.subjectIds || [])
  const [selectedBranchId, setSelectedBranchId] = useState(teacher?.branchId || '')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>(teacher?.photoURL || '')
  const [uploadProgress, setUploadProgress] = useState(0)

  // Auth fields for creating new teacher account
  const [newUsername, setNewUsername] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>(teacher?.gender || 'female')
  const [subjectSearch, setSubjectSearch] = useState('')
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const regenerateNickname = async (targetGender?: 'male' | 'female') => {
    try {
      const g = targetGender || gender
      const newName = await generateUniqueEnglishName(g)
      setGeneratedCode(newName)
      setNewUsername(newName)
      toast.success(`Sinh tên ${g === 'male' ? 'Nam' : 'Nữ'}: ${newName}`)
    } catch (err) {
      toast.error('Không thể sinh tên tiếng Anh mới')
    }
  }

  const handleGenderChange = (val: 'male' | 'female') => {
    setGender(val)
    if (!isEdit) {
      regenerateNickname(val)
    }
  }



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
  const [certificates, setCertificates] = useState<TeacherCertificate[]>(teacher?.certificates || [])

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

  const { register, formState: { isSubmitting } } = useForm<FormData>({
    // @ts-ignore
    resolver: zodResolver(schema),
    defaultValues: teacher ? {
      name: teacher.name,
      level: teacher.level,
      bio: teacher.bio,
      country: teacher.country || 'VN',
    } : { level: 1.0, country: 'VN' },
  })

  useEffect(() => {
    getDocs(query(collection(db, 'subjects'), where('status', '==', 'active'))).then((snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    })
  }, [])

  useEffect(() => {
    getDocs(query(collection(db, 'branches'), where('status', '==', 'active'))).then((snap) => {
      const activeBranches = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Branch))
      setBranches(activeBranches)

      setSelectedBranchId((currentBranchId: string) => {
        if (isEdit || currentBranchId) return currentBranchId
        const defaultBranch = activeBranches.find((branch) =>
          normalizeBranchName(branch.name).includes(DEFAULT_BRANCH_KEYWORD)
        )
        return defaultBranch?.id || currentBranchId
      })
    })
  }, [isEdit])

  useEffect(() => {
    if (isEdit && teacher) {
      setNewUsername(teacher.code || '')
      if (teacher.gender) {
        setGender(teacher.gender)
      }
    }
  }, [isEdit, teacher])

  useEffect(() => {
    if (!isEdit && !generatedCode) {
      generateUniqueEnglishName(gender)
        .then((code) => {
          setGeneratedCode(code)
          setNewUsername(code)
        })
        .catch((err) => {
          console.error(err)
          toast.error('Không thể sinh mã tài khoản giáo viên')
        })
    }
  }, [isEdit, generatedCode, gender])



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
    const countryMap: Record<string, number> = {
      VN: 7,
      PH: 8,
      JP: 9,
      KR: 9,
      US_EST: -5,
      US_PST: -8,
    }
    const timezoneOffset = countryMap[data.country || 'VN'] ?? 7

    try {
      const finalName = data.name?.trim() || ''

      const subjectNames = selectedSubjects.map((id) => subjects.find((s) => s.id === id)?.name || '')
      const branch = selectedBranchId ? branches.find((b) => b.id === selectedBranchId) : null

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
        certificates: certificates || [],
      }

      if (isEdit && teacher) {
        let photoURL = teacher.photoURL
        if (photoFile) photoURL = await uploadPhoto(teacher.id, photoFile)

        // If nickname changed, verify uniqueness
        if (newUsername && newUsername !== teacher.code) {
          const checkQuery = query(collection(db, 'teachers'), where('code', '==', newUsername))
          const checkSnap = await getDocs(checkQuery)
          if (!checkSnap.empty) {
            toast.error(`Tên tài khoản "${newUsername}" đã được sử dụng bởi giáo viên khác!`)
            return
          }
          const studentCheckQuery = query(collection(db, 'students'), where('code', '==', newUsername))
          const studentCheckSnap = await getDocs(studentCheckQuery)
          if (!studentCheckSnap.empty) {
            toast.error(`Tên tài khoản "${newUsername}" đã được học viên sử dụng!`)
            return
          }

          // Update users collection document to sync login and provision new auth account
          const finalEmail = newUsername.includes('@') ? newUsername : `${newUsername}@edutrackpro.app`
          const FIXED_PASSWORD = '1234560'
          let finalUid: string | null = null

          try {
            const credential = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, FIXED_PASSWORD)
            await secondaryAuth.signOut()
            finalUid = credential.user.uid
          } catch (err: any) {
            if (err.code === 'auth/email-already-in-use') {
              try {
                const credential = await signInWithEmailAndPassword(secondaryAuth, finalEmail, FIXED_PASSWORD)
                await secondaryAuth.signOut()
                finalUid = credential.user.uid
              } catch (signInErr) {
                console.error('Failed to sign in/get existing auth user:', signInErr)
              }
            } else {
              console.error('Failed to provision new auth account:', err)
            }
          }

          if (finalUid) {
            // Write the new users document
            await setDoc(doc(db, 'users', finalUid), {
              uid: finalUid,
              email: finalEmail,
              username: newUsername,
              role: 'teacher',
              teacherId: teacher.id,
              createdAt: serverTimestamp(),
            })

            // Mark old user documents as inactive to prevent duplicates
            const oldUserQuery = query(collection(db, 'users'), where('teacherId', '==', teacher.id), where('role', '==', 'teacher'))
            const oldUserSnap = await getDocs(oldUserQuery)
            for (const oldDoc of oldUserSnap.docs) {
              if (oldDoc.id !== finalUid) {
                await updateDoc(oldDoc.ref, { role: 'inactive_teacher' })
              }
            }
          } else {
            // Fallback: if auth provisioning failed completely, try to update the first found user doc
            const userQuery = query(collection(db, 'users'), where('teacherId', '==', teacher.id), where('role', '==', 'teacher'))
            const userSnap = await getDocs(userQuery)
            if (!userSnap.empty) {
              const userDoc = userSnap.docs[0]
              await updateDoc(userDoc.ref, {
                username: newUsername,
                email: finalEmail
              })
            }
          }
        }

        await updateDoc(doc(db, 'teachers', teacher.id), {
          code: newUsername || teacher.code,
          name: finalName || teacher.name,
          level: data.level,
          bio: data.bio || '',
          country: data.country || 'VN',
          timezoneOffset,
          gender: gender,
          subjectIds: selectedSubjects,
          subjectNames,
          branchId: selectedBranchId || '',
          branchName: branch?.name || '',
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

        let code = newUsername
        if (!code) {
          try {
            code = await generateUniqueEnglishName(gender)
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
          country: data.country || 'VN',
          timezoneOffset,
          gender: gender,
          subjectIds: selectedSubjects,
          subjectNames,
          branchId: selectedBranchId || '',
          branchName: branch?.name || '',
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
              const countrySelect = formEl?.querySelector<HTMLSelectElement>('select[name="country"]')
              
              const nameVal = nameInput?.value || ''
              const levelVal = parseFloat(levelInput?.value || '1')
              const bioVal = bioInput?.value || ''
              const countryVal = countrySelect?.value || 'VN'
              
              await onSubmit({ name: nameVal, level: levelVal, bio: bioVal, country: countryVal })
            }}
          >
            {isEdit ? 'Lưu thay đổi' : 'Tạo giáo viên'}
          </Button>
        </div>
      }
    >
      <form id="teacher-form" className="space-y-4">

        {/* Account & Gender section */}
        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-4">
          <h4 className="font-semibold text-indigo-900 text-sm flex items-center gap-2">
            Tài khoản đăng nhập & Giới tính
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gender Field */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Giới tính</label>
              <div className="flex items-center gap-4 mt-2">
                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="gender"
                    checked={gender === 'female'}
                    onChange={() => handleGenderChange('female')}
                    className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  Nữ
                </label>
                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="gender"
                    checked={gender === 'male'}
                    onChange={() => handleGenderChange('male')}
                    className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  Nam
                </label>
              </div>
            </div>

            {/* Username/Nickname Field */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tên tài khoản (Mã) *</label>
              <div className="flex gap-2">
                <input
                  id="field-username"
                  type="text"
                  required
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${localErrors.username ? 'border-red-500' : 'border-slate-300'}`}
                  placeholder="Ví dụ: giasu1"
                  value={newUsername}
                  onChange={e => {
                    setNewUsername(e.target.value.replace(/\s+/g, ''))
                    if (localErrors.username) setLocalErrors(prev => ({ ...prev, username: '' }))
                  }}
                />
                <button
                  type="button"
                  onClick={() => regenerateNickname(gender)}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                  title="Sinh tên ngẫu nhiên theo giới tính"
                >
                  🔄 Sinh tên
                </button>
              </div>
              {localErrors.username ? (
                <p className="text-[10px] text-red-500 mt-1">{localErrors.username}</p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1">
                  {isEdit 
                    ? '⚠️ Thay đổi tên này sẽ đổi tài khoản đăng nhập của giáo viên!'
                    : 'Giáo viên dùng tên này để đăng nhập vào hệ thống.'}
                </p>
              )}
            </div>
          </div>

          {!isEdit && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700 font-medium">
                ℹ️ <strong>Mật khẩu cố định:</strong> Tất cả giáo viên sẽ dùng mật khẩu <strong>1234560</strong>
              </p>
            </div>
          )}
        </div>

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

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Quốc gia & Múi giờ</label>
          <select
            name="country"
            defaultValue={teacher?.country || 'VN'}
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="VN">Việt Nam (GMT+7)</option>
            <option value="PH">Philippines (GMT+8)</option>
            <option value="JP">Nhật Bản / Japan (GMT+9)</option>
            <option value="KR">Hàn Quốc / Korea (GMT+9)</option>
            <option value="US_EST">Mỹ / USA (EST - GMT-5)</option>
            <option value="US_PST">Mỹ / USA (PST - GMT-8)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Chi nhánh</label>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">-- Chọn chi nhánh --</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
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
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">2. Chứng chỉ</h4>
              <span className="text-xs text-slate-500 font-medium">Tổng số: {certificates.length}</span>
            </div>
            
            <div className="space-y-4">
              {certificates.map((cert, index) => (
                <div key={index} className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-sm space-y-3 relative group transition-all">
                  <button
                    type="button"
                    onClick={() => setCertificates(prev => prev.filter((_, idx) => idx !== index))}
                    className="absolute top-2 right-2 text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                    title="Xóa chứng chỉ"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Loại chứng chỉ</label>
                      <select
                        value={cert.category}
                        onChange={e => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, category: e.target.value as any } : c))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="foreign_language">Ngoại ngữ</option>
                        <option value="pedagogical">Sư phạm</option>
                        <option value="other">Khác</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Trạng thái duyệt</label>
                      <select
                        value={cert.status}
                        onChange={e => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, status: e.target.value as any } : c))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="pending">Chờ duyệt</option>
                        <option value="approved">Đã duyệt</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Tên chứng chỉ</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: IELTS, TOEIC, CEFR..."
                        value={cert.title}
                        onChange={e => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, title: e.target.value } : c))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Điểm số / Xếp loại</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: 7.5, Khá, Xuất sắc..."
                        value={cert.score}
                        onChange={e => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, score: e.target.value } : c))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Image attachment / preview */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-slate-500">Ảnh đính kèm:</span>
                    {cert.fileURL ? (
                      <div className="flex items-center gap-3">
                        <a href={cert.fileURL} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold hover:underline">Xem ảnh</a>
                        <button
                          type="button"
                          onClick={() => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, fileURL: '' } : c))}
                          className="text-xs text-rose-500 hover:text-rose-600 font-semibold hover:underline"
                        >
                          Xóa ảnh
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100/80 rounded-lg text-xs font-bold text-indigo-600 cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        Tải ảnh lên
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
                                const img = new Image()
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
                                  setCertificates(prev => prev.map((c, idx) => idx === index ? { ...c, fileURL: dataUrl } : c))
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
            </div>

            <button
              type="button"
              onClick={() => setCertificates(prev => [...prev, { category: 'foreign_language', title: '', score: '', fileURL: '', status: 'pending' }])}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200/60 text-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 border border-slate-200 border-dashed transition-all"
            >
              + Thêm chứng chỉ mới
            </button>
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
