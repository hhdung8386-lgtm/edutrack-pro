import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, addDoc, updateDoc, doc, getDoc, getDocs, query,
  where, serverTimestamp, setDoc
} from 'firebase/firestore'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { db, secondaryAuth, generateUniqueCode } from '@/lib/firebase'
import { generateUniqueEnglishName } from '@/lib/nameGenerator'
import { Teacher, Subject, TeacherCertificate, TeacherDirectoryCategory } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { AlertTriangle, Download, Eye, GraduationCap, Info, MapPin, MonitorUp, RefreshCw, TestTube2, Upload, X } from 'lucide-react'
import { formatVietnameseNumberInput } from '@/lib/countryPricing'
import { uploadLessonImage, uploadErrorMessage } from '@/lib/imageUploader'
import { ImageLightbox } from '@/components/shared/ImageLightbox'
import { getTeacherPointsPer25Minutes, normalizePointsPer25Minutes } from '@/lib/points'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'
import { getTeacherCertificateCompliance } from '@/lib/teacherProfile'
import { downloadImage } from '@/lib/downloadImage'

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

export function TeacherFormModal({ teacher, onClose, defaultCategory = 'online' }: { teacher?: Teacher; onClose: () => void; defaultCategory?: TeacherDirectoryCategory }) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(teacher?.subjectIds || [])
  const [selectedBranchId, setSelectedBranchId] = useState(teacher?.branchId || '')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>(teacher?.photoURL || '')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [photoDownloading, setPhotoDownloading] = useState(false)

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
  // Mặc định TICK sẵn (kể cả GV cũ chưa có field) — trung tâm đào tạo toàn bộ gia sư.
  // Chỉ khi admin chủ động bỏ tick mới lưu false.
  const [trainedAt123English, setTrainedAt123English] = useState(teacher?.trainedAt123English !== false)
  const [certUploadingIndex, setCertUploadingIndex] = useState<number | null>(null)
  const [certImageView, setCertImageView] = useState<string | null>(null)

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
  const [bookingPriority, setBookingPriority] = useState<string>(teacher?.bookingPriority ? String(teacher.bookingPriority) : '0')
  const [studentPointsPer25, setStudentPointsPer25] = useState<string>(String(getTeacherPointsPer25Minutes(teacher)))
  const [studentAgesTaught, setStudentAgesTaught] = useState(teacher?.studentAgesTaught || '')
  const [teachingFormats, setTeachingFormats] = useState<string[]>(() => {
    const savedFormats = teacher?.teachingFormats || []
    if (savedFormats.length > 0) return savedFormats
    if (teacher?.isTester || defaultCategory === 'tester') return []
    return [defaultCategory]
  })
  const [isTester, setIsTester] = useState(teacher?.isTester ?? defaultCategory === 'tester')
  const [studentResults, setStudentResults] = useState(teacher?.studentResults || '')
  const [strengths, setStrengths] = useState<string[]>(teacher?.strengths || [])
  const [otherStrengths, setOtherStrengths] = useState(teacher?.otherStrengths || '')

  const [languagesTaught, setLanguagesTaught] = useState<string[]>(teacher?.languagesTaught || [])
  const [academicSubjectsTaught, setAcademicSubjectsTaught] = useState<string[]>(teacher?.academicSubjectsTaught || [])
  const [generatedCode, setGeneratedCode] = useState('')

  const isEdit = !!teacher
  const certificateCompliance = getTeacherCertificateCompliance({ certificates })

  // Upload ảnh chứng chỉ lên Firebase Storage (thay vì nhét base64 vào Firestore —
  // base64 vừa làm phình document (nguy cơ vượt 1MB) vừa không mở/xem được ở tab mới)
  const handleCertUpload = async (index: number, file: File) => {
    setCertUploadingIndex(index)
    try {
      const pathId = teacher?.id || newUsername || generatedCode || 'pending-teacher'
      const url = await uploadLessonImage(pathId, file)
      setCertificates(prev => prev.map((c, i) => i === index ? { ...c, fileURL: url } : c))
    } catch (err) {
      console.error(err)
      toast.error(uploadErrorMessage(err, 'vi'))
    } finally {
      setCertUploadingIndex(null)
    }
  }

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
          toast.error('Không thể sinh mã tài khoản gia sư')
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
      newErrors.name = 'Vui lòng nhập tên gia sư'
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

  const handleDownloadPhoto = async () => {
    if (!teacher?.photoURL || photoDownloading) return
    setPhotoDownloading(true)
    try {
      await downloadImage(teacher.photoURL, `anh-gia-su-${teacher.code || teacher.name}`)
    } catch (error) {
      console.error('Download teacher photo failed:', error)
      toast.error('Không thể tải ảnh gia sư xuống. Vui lòng thử lại.')
    } finally {
      setPhotoDownloading(false)
    }
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
    if (teachingFormats.length === 0 && !isTester) {
      toast.error('Vui lòng chọn ít nhất một nhóm: online, offline hoặc tester')
      return
    }

    const countryMap: Record<string, number> = {
      VN: 7,
      PH: 8,
      ZA: 2,
      JP: 9,
      KR: 9,
      US_EST: -5,
      US_PST: -8,
    }
    const timezoneOffset = countryMap[data.country || 'VN'] ?? 7
    const normalizedStudentPoints = normalizePointsPer25Minutes(studentPointsPer25)

    try {
      const finalName = data.name?.trim() || ''

      const subjectNames = selectedSubjects.map((id) => subjects.find((s) => s.id === id)?.name || '')
      const branch = selectedBranchId ? branches.find((b) => b.id === selectedBranchId) : null

      const interviewData = {
        yob: yob ? Number(yob) : null,
        livingArea: livingArea || '',
        trainedAt123English: !!trainedAt123English,
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
        bookingPriority: Math.max(0, Number(bookingPriority) || 0),
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
            toast.error(`Tên tài khoản "${newUsername}" đã được sử dụng bởi gia sư khác!`)
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
            // Fallback: if auth provisioning failed completely, update the first found user doc.
            // KHÔNG lọc role=='teacher' — doc có thể đã bị đánh dấu 'inactive_teacher' từ lần đổi
            // nickname trước; nếu bỏ sót, GV sẽ kẹt 403 vĩnh viễn (bug thực tế của GV Nikolas).
            const userQuery = query(collection(db, 'users'), where('teacherId', '==', teacher.id))
            const userSnap = await getDocs(userQuery)
            if (!userSnap.empty) {
              const userDoc = userSnap.docs[0]
              await updateDoc(userDoc.ref, {
                username: newUsername,
                email: finalEmail,
                role: 'teacher',
              })
            }
          }
        }

        await updateDoc(doc(db, 'teachers', teacher.id), {
          code: newUsername || teacher.code,
          name: finalName || teacher.name,
          level: data.level,
          pointsPer25Minutes: normalizedStudentPoints,
          bio: data.bio || '',
          country: data.country || 'VN',
          timezoneOffset,
          gender: gender,
          subjectIds: selectedSubjects,
          subjectNames,
          branchId: selectedBranchId || '',
          branchName: branch?.name || '',
          isTester,
          ...interviewData,
          photoURL,
          updatedAt: serverTimestamp(),
        })
        toast.success('Đã cập nhật gia sư')
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
            toast.error('Không thể sinh mã gia sư, vui lòng thử lại')
            return
          }
        }

        const finalEmail = newUsername.includes('@') ? newUsername : `${newUsername}@edutrackpro.app`
        const FIXED_PASSWORD = '1234560'

        let finalUid: string
        let isRecycledNicknameAccount = false
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
            // Firebase Authentication vẫn giữ email sau khi gia sư nghỉ dạy.
            // Chỉ tái sử dụng tài khoản nếu hồ sơ quyền đã được khóa đúng trạng thái;
            // tuyệt đối không chiếm nickname của tài khoản đang hoạt động.
            try {
              const credential = await signInWithEmailAndPassword(secondaryAuth, finalEmail, FIXED_PASSWORD)
              finalUid = credential.user.uid
              await secondaryAuth.signOut()

              const existingUserSnap = await getDoc(doc(db, 'users', finalUid))
              if (!existingUserSnap.exists() || existingUserSnap.data().role !== 'inactive_teacher') {
                toast.error('Nickname này đang thuộc một tài khoản hoạt động!')
                return
              }
              isRecycledNicknameAccount = true
            } catch (reuseErr) {
              console.error('Failed to recycle released teacher nickname:', reuseErr)
              try { await secondaryAuth.signOut() } catch { /* no-op */ }
              toast.error('Nickname đã có tài khoản xác thực và chưa thể thu hồi an toàn')
              return
            }
          } else {
            toast.error('Có lỗi xảy ra khi tạo tài khoản')
            return
          }
        }

        let photoURL = ''
        if (photoFile) photoURL = await uploadPhoto(finalUid, photoFile)

        // Create teacher doc
        const teacherRef = await addDoc(collection(db, 'teachers'), {
          code,
          name: finalName || 'Gia sư mới',
          level: data.level,
          pointsPer25Minutes: normalizedStudentPoints,
          bio: data.bio || '',
          country: data.country || 'VN',
          timezoneOffset,
          gender: gender,
          subjectIds: selectedSubjects,
          subjectNames,
          branchId: selectedBranchId || '',
          branchName: branch?.name || '',
          isTester,
          ...interviewData,
          photoURL,
          status: 'active',
          createdAt: serverTimestamp(),
        })

        // Link teacherId to user doc
        await updateDoc(doc(db, 'users', finalUid), {
          uid: finalUid,
          email: finalEmail,
          username: newUsername,
          role: 'teacher',
          teacherId: teacherRef.id,
          loginDisabledAt: null,
          loginDisabledReason: '',
          recycledAt: isRecycledNicknameAccount ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        })

        toast.success(`Đã tạo gia sư thành công!`)
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
    <>
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isEdit ? 'Chỉnh sửa gia sư' : 'Thêm gia sư mới'}
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
            {isEdit ? 'Lưu thay đổi' : 'Tạo gia sư'}
          </Button>
        </div>
      }
    >
      <form id="teacher-form" className="space-y-4">

        <div className="rounded-xl border border-brand-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="sm:max-w-[260px]">
              <h4 className="text-sm font-bold text-slate-900">Phân loại hồ sơ</h4>
              <p className="mt-1 text-xs leading-5 text-slate-500">Có thể chọn nhiều nhóm. Gia sư sẽ xuất hiện ở tất cả trang tương ứng.</p>
            </div>
            <div className="grid w-full grid-cols-1 gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto sm:min-w-[430px] sm:grid-cols-3">
              {([
                { value: 'online', label: 'Gia sư online', icon: MonitorUp, checked: teachingFormats.includes('online') },
                { value: 'offline', label: 'Gia sư offline', icon: MapPin, checked: teachingFormats.includes('offline') },
                { value: 'tester', label: 'Gia sư tester', icon: TestTube2, checked: isTester },
              ] as const).map((option) => {
                const Icon = option.icon
                return (
                  <label
                    key={option.value}
                    className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition active:scale-[0.98] ${option.checked ? 'bg-brand-400 text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                  >
                    <input
                      type="checkbox"
                      checked={option.checked}
                      onChange={(event) => {
                        if (option.value === 'tester') {
                          setIsTester(event.target.checked)
                          return
                        }
                        setTeachingFormats((current) => event.target.checked
                          ? [...new Set([...current, option.value])]
                          : current.filter((format) => format !== option.value))
                      }}
                      className="h-4 w-4 rounded border-slate-400 text-amber-500 focus:ring-amber-400"
                    />
                    <Icon className="h-4 w-4" />
                    <span className="whitespace-nowrap">{option.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

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
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sinh tên
                </button>
              </div>
              {localErrors.username ? (
                <p className="text-[10px] text-red-500 mt-1">{localErrors.username}</p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1">
                  {isEdit ? (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      Thay đổi tên này sẽ đổi tài khoản đăng nhập của gia sư.
                    </span>
                  ) : 'Gia sư dùng tên này để đăng nhập vào hệ thống.'}
                </p>
              )}
            </div>
          </div>

          {!isEdit && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700 font-medium">
                <Info className="mr-1 inline h-3.5 w-3.5" />
                <strong>Mật khẩu cố định:</strong> Tất cả gia sư sẽ dùng mật khẩu <strong>1234560</strong>
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
            <p className="text-sm font-medium text-slate-600 mb-1">Ảnh gia sư</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="cursor-pointer text-xs font-semibold text-indigo-500 transition-colors hover:text-indigo-700">
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                Chọn ảnh...
              </label>
              {teacher?.photoURL && (
                <button
                  type="button"
                  onClick={handleDownloadPhoto}
                  disabled={photoDownloading}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 transition hover:text-sky-800 disabled:cursor-wait disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  {photoDownloading ? 'Đang tải...' : 'Tải ảnh xuống'}
                </button>
              )}
            </div>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden w-32">
                <div className={`h-full bg-indigo-500 rounded-full transition-all ${uploadProgress === 10 ? 'w-[10%]' : uploadProgress === 50 ? 'w-[50%]' : uploadProgress === 100 ? 'w-full' : 'w-0'}`} />
              </div>
            )}
          </div>
        </div>

        <Input
          id="field-name"
          label="Tên gia sư *"
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
            <option value="ZA">Nam Phi / South Africa (GMT+2)</option>
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

        <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
          <label htmlFor="student-points-per-25" className="block text-sm font-semibold text-slate-700">
            Chi phí quỹ học viên (kim cương / 25 phút)
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Chỉ dùng để trừ kim cương phía học viên. Thời lượng dạy và lương gia sư vẫn tính theo đúng 25/50 phút thực tế.
          </p>
          <div className="mt-3 flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200">
            <input
              id="student-points-per-25"
              type="number"
              min="1"
              step="1"
              value={studentPointsPer25}
              onChange={(event) => setStudentPointsPer25(event.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
            />
            <span className="flex items-center gap-1 whitespace-nowrap text-sm font-bold text-sky-700"><DiamondPointsIcon className="h-4 w-4 text-violet-600" /> / 25 phút</span>
          </div>
        </div>

        <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
          <label htmlFor="booking-priority" className="block text-sm font-semibold text-slate-700">
            Thứ tự ưu tiên gợi ý đặt lịch
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Nhập 1 để ưu tiên cao nhất, 2 cho vị trí tiếp theo. Nhập 0 nếu không ghim. Hệ thống vẫn kiểm tra môn học và lịch rảnh trước khi hiển thị.
          </p>
          <input
            id="booking-priority"
            type="number"
            min="0"
            step="1"
            value={bookingPriority}
            onChange={(event) => setBookingPriority(event.target.value)}
            className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
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

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Tỉnh / Thành phố (sinh sống)</label>
                <input
                  type="text"
                  placeholder="Ví dụ: TP. Hồ Chí Minh, Hà Nội, Đà Nẵng..."
                  value={livingArea}
                  onChange={e => setLivingArea(e.target.value)}
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

            {/* Xác nhận đã hoàn thành chương trình đào tạo gia sư nội bộ */}
            <label className={`flex items-start gap-3 cursor-pointer rounded-xl border p-3 transition-colors ${trainedAt123English ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <input
                type="checkbox"
                checked={trainedAt123English}
                onChange={e => setTrainedAt123English(e.target.checked)}
                className="mt-0.5 h-4.5 w-4.5 h-[18px] w-[18px] rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="flex items-start gap-2">
                <GraduationCap className={`w-4 h-4 mt-0.5 flex-shrink-0 ${trainedAt123English ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Hoàn thành Chương trình Đào tạo Gia sư tại Nội Bộ Trung Tâm</span>
                  <span className="block text-xs text-slate-500 mt-0.5">Thời lượng đào tạo: 60 giờ</span>
                </span>
              </span>
            </label>
          </div>

          {/* Section 2: Chứng chỉ */}
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">2. Chứng chỉ</h4>
              <span className="text-xs text-slate-500 font-medium">Tổng số: {certificates.length}</span>
            </div>

            <div className={`rounded-xl border p-3 ${certificateCompliance.isCertificateComplete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-xs font-extrabold text-slate-800">Ảnh chứng chỉ bắt buộc</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className={`rounded-lg bg-white px-3 py-2 text-xs font-bold ring-1 ${certificateCompliance.hasForeignLanguageImage ? 'text-emerald-700 ring-emerald-200' : 'text-rose-700 ring-rose-200'}`}>
                  Năng lực chuyên môn: {certificateCompliance.hasForeignLanguageImage ? 'Đã có ảnh' : 'Chưa có ảnh'}
                </div>
                <div className={`rounded-lg bg-white px-3 py-2 text-xs font-bold ring-1 ${certificateCompliance.hasPedagogicalImage ? 'text-emerald-700 ring-emerald-200' : 'text-rose-700 ring-rose-200'}`}>
                  Sư phạm: {certificateCompliance.hasPedagogicalImage ? 'Đã có ảnh' : 'Chưa có ảnh'}
                </div>
              </div>
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
                        <option value="foreign_language">Năng lực chuyên môn</option>
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
                        <button
                          type="button"
                          onClick={() => setCertImageView(cert.fileURL || null)}
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Xem ảnh
                        </button>
                        <button
                          type="button"
                          onClick={() => setCertificates(prev => prev.map((c, i) => i === index ? { ...c, fileURL: '' } : c))}
                          className="text-xs text-rose-500 hover:text-rose-600 font-semibold hover:underline"
                        >
                          Xóa ảnh
                        </button>
                      </div>
                    ) : (
                      <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${certUploadingIndex === index ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 hover:bg-indigo-100/80 text-indigo-600'}`}>
                        {certUploadingIndex === index
                          ? <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />}
                        {certUploadingIndex === index ? 'Đang tải...' : 'Tải ảnh lên'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={certUploadingIndex !== null}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) handleCertUpload(index, file)
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
    {certImageView && <ImageLightbox src={certImageView} onClose={() => setCertImageView(null)} alt="Ảnh chứng chỉ" />}
    </>
  )
}
