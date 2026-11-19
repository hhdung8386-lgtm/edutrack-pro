import { areCoursePackagesUnchanged, getStudentSubjects, repriceCourseForSale } from '@/lib/studentCourseLedger'
import { useAuthStore } from '@/stores/authStore'
import { planCourseSaleBookingReprice } from '@/lib/courseSaleBookings'
import { getCanonicalSubjectRate } from '@/lib/countryPricing'
import { isGroupClass } from '@/lib/groupClasses'
import { createCourseSubjectId, getCatalogSubjectId } from '@/lib/courseIdentity'
import {
  COURSE_SALE_BASE_POINTS_PER_25_MINUTES,
  MANUAL_PROMO_DISCOUNT_OPTIONS,
  courseSaleDiamonds,
  courseSalePricePerMinute,
  manualPromoPointsPer25Minutes,
  normalizeManualPromoDiscount,
} from '@/lib/manualPromoDiscount'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { doc, getDoc, getDocs, collection, query, where, serverTimestamp, runTransaction, type DocumentReference } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, Subject, StudentSubject, type BookingRequest } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { BookOpen, Check, ChevronDown, Globe2, Plus, Search, Trash2 } from 'lucide-react'
import { sortSubjectsByName } from '@/lib/subjectSorting'
import { isSelectableSubject } from '@/lib/subjectLifecycle'
import { formatPricePerMinute } from '@/lib/constants'
import { MAX_ADDITIONAL_CURRICULUM_LINKS, parseAdditionalCurriculumRows } from '@/lib/curriculumLinks'

const schema = z.object({
  subjectId: z.string().min(1, 'Chọn môn học'),
  totalMinutes: z.coerce.number().finite().min(1, 'Tối thiểu 1 kim cương'),
  promoDiscountPercent: z.coerce.number().refine((value) => value === 0 || (MANUAL_PROMO_DISCOUNT_OPTIONS as readonly number[]).includes(value), 'Chọn mức giảm hợp lệ'),
  curriculumLink: z.string().optional(),
  supplementaryCurriculumLink: z.string().optional(),
  timetableNote: z.string().optional(),
  paymentContent: z.string().optional(),
  paymentDate: z.string().optional(),
  paymentNote: z.string().optional(),
  studentRequests: z.array(z.string()).default([]),
  focusSkills: z.array(z.string()).default([]),
})

type FormData = z.infer<typeof schema>

function todayInputDate() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function inputDateToDisplay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

const STUDENT_REQUESTS_OPTIONS = [
  'Nói chậm hơn, to, rõ.',
  'Sử dụng 100% tiếng Anh (chỉ giải thích bằng tiếng Việt khi cần)',
  'Sửa phát âm, ngữ pháp khi nói.',
  'Cho học viên nói nhiều, chủ động khơi gợi.',
  'Giao nhiều bài tập về nhà.',
  'Không giao bài tập về nhà.',
  'Ôn lại bài cũ nhiều hơn.',
  'Giảng chậm và kỹ hơn khi gặp phần khó.',
  'Cho học viên tự làm bài nhiều hơn.',
  'Sửa lỗi ngay khi học viên làm sai.',
  'Cho thêm ví dụ minh họa.',
  'Kiểm tra lại xem học viên đã hiểu bài chưa.',
  'Tăng bài tập trong buổi học.',
  'Tăng trò chơi / hoạt động tương tác.'
]

type FocusSkillGroup = {
  key: 'foreignLanguage' | 'other'
  label: string
  icon: typeof Globe2
  options: string[]
}

const LEGACY_FOCUS_SKILLS_OPTIONS = ['Nghe', 'Nói', 'Đọc', 'Viết', 'Ngữ Pháp']

const FOCUS_SKILL_GROUPS: FocusSkillGroup[] = [
  {
    key: 'foreignLanguage',
    label: 'Ngoại ngữ — Kỹ năng trọng tâm',
    icon: Globe2,
    options: [
      'Nghe – Từ vựng',
      'Nói – Giao tiếp – Phát âm',
      'Đọc – Hiểu',
      'Viết – Ngữ pháp',
    ],
  },
  {
    key: 'other',
    label: 'Môn khác — Kỹ năng trọng tâm',
    icon: BookOpen,
    options: [
      'Lý thuyết – Ghi nhớ',
      'Giải bài tập – Thực hành',
      'Phân tích – Tư duy',
      'Trình bày – Diễn giải',
      'Vận dụng – Nâng cao',
      'Ôn tập – Kiểm tra',
    ],
  },
]

interface Props {
  student: Student
  editingSubjectId?: string // If present, edit mode; otherwise, add mode
  onClose: () => void
  onAddToOwnedCourse?: (subjectId: string) => void
}

export function SubjectPackageModal({ student, editingSubjectId, onClose, onAddToOwnedCourse }: Props) {
  const [subjectsList, setSubjectsList] = useState<Subject[]>([])
  const [loading, setLoading] = useState(false)
  const [subjectSearch, setSubjectSearch] = useState('')
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false)
  const [selectedRequests, setSelectedRequests] = useState<string[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const isEdit = !!editingSubjectId
  const [newCourseToken] = useState(() => crypto.randomUUID().replace(/-/g, ''))

  // Freeze the form baseline, including a materialized legacy wallet. A live
  // snapshot must never turn stale form amounts into an accepted overwrite.
  const [currentSubjects] = useState(() => getStudentSubjects(student))

  // Find the package being edited
  const editingPkg = isEdit
    ? currentSubjects.find(s => s.subjectId === editingSubjectId)
    : null

  // Khởi tạo một lần: snapshot học viên về giữa chừng không được xoá dòng admin đang nhập.
  const [additionalLinkRows, setAdditionalLinkRows] = useState<string[]>(() => editingPkg?.additionalCurriculumLinks || [])
  const [invalidLinkRows, setInvalidLinkRows] = useState<number[]>([])

  useEffect(() => {
    if (editingPkg) {
      setSelectedRequests(editingPkg.studentRequests || [])
      setSelectedSkills(editingPkg.focusSkills || [])
    }
  }, [editingPkg])

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: editingPkg
      ? {
          subjectId: getCatalogSubjectId(editingPkg.subjectId),
          promoDiscountPercent: editingPkg.promoDiscountPercent || 0,
          totalMinutes: editingPkg.totalMinutes,
          curriculumLink: editingPkg.curriculumLink || '',
          supplementaryCurriculumLink: editingPkg.supplementaryCurriculumLink || '',
          timetableNote: editingPkg.timetableNote || '',
          paymentContent: '',
          paymentDate: todayInputDate(),
          paymentNote: '',
          studentRequests: editingPkg.studentRequests || [],
          focusSkills: editingPkg.focusSkills || [],
        }
      : {
          subjectId: '',
          promoDiscountPercent: 0,
          totalMinutes: 500,
          curriculumLink: '',
          supplementaryCurriculumLink: '',
          timetableNote: '',
          paymentContent: 'Thanh toán đợt 1',
          paymentDate: todayInputDate(),
          paymentNote: '',
          studentRequests: [],
          focusSkills: [],
        },
  })

  const watchedSubjectId = watch('subjectId')
  const selectedSubject = subjectsList.find((subject) => subject.id === watchedSubjectId)
  const isTransferringSubject = Boolean(isEdit && editingSubjectId && watchedSubjectId !== getCatalogSubjectId(editingSubjectId))
  // Khóa mới: ô kim cương là giá gốc; chọn SALE thì quỹ ghi vào khóa tự giảm theo
  // đúng mức trừ mỗi ca, số phút học giữ nguyên (300 KC gốc, -30% → 216 KC).
  const watchedPromoPercent = normalizeManualPromoDiscount(watch('promoDiscountPercent'))
  const watchedBaseDiamonds = Number(watch('totalMinutes')) || 0
  const appliesSaleToNewFund = !isEdit && watchedPromoPercent > 0
  const saleFundDiamonds = courseSaleDiamonds(watchedBaseDiamonds, watchedPromoPercent)
  const salePointsPer25 = manualPromoPointsPer25Minutes(COURSE_SALE_BASE_POINTS_PER_25_MINUTES, watchedPromoPercent)
  const originalPromoPercent = normalizeManualPromoDiscount(editingPkg?.promoDiscountPercent)
  const editedSaleChanged = isEdit && !!editingPkg && watchedPromoPercent !== originalPromoPercent
  // Sửa khóa: quy lại kim cương theo SALE (phút giữ nguyên). Chỉ đề xuất khi khóa
  // đang/đã là SALE để không đụng khóa thường có đơn giá riêng (vd 35 KC/25 phút).
  const salePreview = useMemo(() => {
    if (!isEdit || !editingPkg || isTransferringSubject) return null
    if (watchedPromoPercent === 0 && originalPromoPercent === 0) return null
    try {
      const result = repriceCourseForSale({
        student: { ...student, subjects: currentSubjects },
        subjectId: editingPkg.subjectId,
        discountPercent: watchedPromoPercent,
      })
      return result.totalAfter === result.totalBefore ? null : { result, error: '' }
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : 'Chưa quy đổi được kim cương' }
    }
  }, [currentSubjects, editingPkg, isEdit, isTransferringSubject, originalPromoPercent, student, watchedPromoPercent])
  // Mặc định: đổi mức SALE thì tự giảm kim cương; mức không đổi (khóa nhập sai trước đây) thì giáo vụ tự tick.
  const [saleFundChoice, setSaleFundChoice] = useState<boolean | null>(null)
  useEffect(() => { setSaleFundChoice(null) }, [watchedPromoPercent])
  const applySaleToFund = Boolean(salePreview?.result) && (saleFundChoice ?? editedSaleChanged)
  const user = useAuthStore((state) => state.user)

  // Ca đã xếp tay giá thường của khóa (chưa học xong) để áp SALE cùng lúc.
  const [bookingContext, setBookingContext] = useState<{
    bookings: BookingRequest[]
    approvedLessonIds: Set<string>
    teacherLevels: Record<string, number>
  } | null>(null)
  const [bookingContextError, setBookingContextError] = useState('')
  const editingCourseId = isEdit ? editingPkg?.subjectId || '' : ''
  useEffect(() => {
    if (!editingCourseId) return
    let cancelled = false
    Promise.all([
      getDocs(query(collection(db, 'bookingRequests'), where('studentId', '==', student.id))),
      getDocs(query(collection(db, 'lessons'), where('studentId', '==', student.id))),
    ]).then(async ([bookingSnap, lessonSnap]) => {
      const bookings = bookingSnap.docs.map((item) => ({ id: item.id, ...item.data() }) as BookingRequest)
        .filter((booking) => booking.subjectId === editingCourseId)
      const approvedLessonIds = new Set(lessonSnap.docs.filter((item) => item.data().status === 'approved').map((item) => item.id))
      const teacherIds = Array.from(new Set(bookings.map((booking) => booking.teacherId).filter(Boolean)))
      const levels = await Promise.all(teacherIds.map(async (teacherId) => {
        const teacher = await getDoc(doc(db, 'teachers', teacherId))
        return [teacherId, Number(teacher.data()?.level) > 0 ? Number(teacher.data()?.level) : 1] as const
      }))
      if (!cancelled) setBookingContext({ bookings, approvedLessonIds, teacherLevels: Object.fromEntries(levels) })
    }).catch((error) => {
      console.error(error)
      if (!cancelled) setBookingContextError('Chưa tải được lịch đã xếp của khóa này, nên chưa áp SALE cho ca đã xếp được.')
    })
    return () => { cancelled = true }
  }, [editingCourseId, student.id])
  const [saleBookingBatchId] = useState(() => doc(collection(db, 'bookingRequests')).id)
  const saleBookingPlan = useMemo(() => {
    if (!bookingContext || !editingPkg || isTransferringSubject || watchedPromoPercent <= 0) return null
    const plan = planCourseSaleBookingReprice({
      bookings: bookingContext.bookings,
      course: editingPkg,
      discountPercent: watchedPromoPercent,
      approvedLessonIds: bookingContext.approvedLessonIds,
      teacherLevels: bookingContext.teacherLevels,
      batchId: saleBookingBatchId,
    })
    return plan.updates.length > 0 || plan.missingPriceBookingIds.length > 0 ? plan : null
  }, [bookingContext, editingPkg, isTransferringSubject, saleBookingBatchId, watchedPromoPercent])
  const [saleBookingChoice, setSaleBookingChoice] = useState<boolean | null>(null)
  useEffect(() => { setSaleBookingChoice(null) }, [watchedPromoPercent])
  // Khóa SALE mà còn ca giá thường gần như luôn là sót: mặc định tick, giáo vụ bỏ tick nếu cố ý.
  const applySaleToBookings = Boolean(saleBookingPlan?.updates.length) && (saleBookingChoice ?? true)
  const transferableMinutes = editingPkg?.remainingMinutes || 0
  const transferredSessions = Math.round((transferableMinutes / 25) * 100) / 100
  const filteredSubjects = subjectsList.filter((subject) =>
    subject.name.toLocaleLowerCase('vi').includes(subjectSearch.trim().toLocaleLowerCase('vi')),
  )

  const subjectIdsKey = student.subjects?.map(s => s.subjectId).join(',') || ''

  useEffect(() => {
    // Fetch all active subjects
    getDocs(query(collection(db, 'subjects'), where('status', '==', 'active')))
      .then((snap) => {
        const list = sortSubjectsByName(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)).filter(isSelectableSubject),
        )
        setSubjectsList(list)
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải danh sách môn học')
      })
  }, [isEdit, editingSubjectId, student.id, subjectIdsKey, currentSubjects])

  const onSubmit = async (data: FormData) => {
    const { links: additionalCurriculumLinks, invalidRows } = parseAdditionalCurriculumRows(additionalLinkRows)
    setInvalidLinkRows(invalidRows)
    if (invalidRows.length > 0) {
      toast.error('Có link giáo trình thêm chưa đúng, vui lòng kiểm tra lại')
      return
    }
    setLoading(true)
    try {
      const minutesPerSession = 25
      const studentRef = doc(db, 'students', student.id)
      // Optimistic transaction: never overwrite a package changed by attendance,
      // a top-up, or another administrator while this form was open.
      await runTransaction(db, async (transaction) => {
        const studentSnapshot = await transaction.get(studentRef)
        if (!studentSnapshot.exists()) throw new Error('Hồ sơ học viên không còn tồn tại')
        const freshStudent = studentSnapshot.data() as Student
        if (isEdit && !editingPkg) throw new Error('Khóa học không còn tồn tại; hãy mở lại hồ sơ')
        if (!areCoursePackagesUnchanged(getStudentSubjects(freshStudent), currentSubjects)) {
          throw new Error('Khóa học vừa thay đổi. Vui lòng đóng và mở lại form để lưu trên dữ liệu mới nhất.')
        }
        const catalogSnapshot = await transaction.get(doc(db, 'subjects', data.subjectId))
        if (!catalogSnapshot.exists() || !isSelectableSubject(catalogSnapshot.data())) {
          throw new Error('Môn học đã tạm dừng hoặc bị xóa; hãy chọn lại môn học')
        }
        const catalogRate = getCanonicalSubjectRate(catalogSnapshot.data())
        if (data.promoDiscountPercent > 0) {
          const existingRate = editingPkg && data.subjectId === getCatalogSubjectId(editingPkg.subjectId)
            ? getCanonicalSubjectRate(editingPkg) : null
          const rate = existingRate && existingRate.price > 0 ? existingRate : catalogRate
          if (isGroupClass(freshStudent) || !(rate.price > 0) || (rate.currency || 'VND').toUpperCase() !== 'VND') {
            throw new Error('Ưu đãi SALE cần khóa 1 kèm 1 có đơn giá VND. Vui lòng kiểm tra cấu hình môn học.')
          }
        }
        const updatedSubjects = getStudentSubjects(freshStudent)
        const courseSettings = { promoDiscountPercent: data.promoDiscountPercent }
        const matchingCourses = updatedSubjects.filter((pkg) => getCatalogSubjectId(pkg.subjectId) === data.subjectId)
        const needsNewCourse = !isEdit || data.subjectId !== getCatalogSubjectId(editingSubjectId!)
        const newCourseId = needsNewCourse && matchingCourses.length ? createCourseSubjectId(data.subjectId, newCourseToken) : data.subjectId
        const nextCourseNumber = Math.max(1, ...matchingCourses.map((pkg) => Number(/ · Khóa (\d+)$/.exec(pkg.subjectName)?.[1]) || 1)) + 1
        const newCourseName = (name: string) => matchingCourses.length ? `${name} · Khóa ${nextCourseNumber}` : name
        let bookingSubjectTransfer: {
          refs: DocumentReference[]
          subjectId: string
          subjectName: string
        } | null = null
        const today = new Date()
        const dateString = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

        const adjustBatches = (
          currentBatches: any[] | undefined,
          newTotal: number,
          originalTotal: number
        ) => {
          const rawBatches = (currentBatches && currentBatches.length > 0)
            ? currentBatches
            : [{ id: '1', createdAt: dateString, totalSessions: originalTotal }]

          const delta = newTotal - originalTotal
          if (delta === 0) return rawBatches

          if (delta > 0) {
            return [
              ...rawBatches,
              { id: String(rawBatches.length + 1), createdAt: dateString, totalSessions: delta }
            ]
          } else {
            let toRemove = -delta
            const result = []
            for (let i = rawBatches.length - 1; i >= 0; i--) {
              const batch = rawBatches[i]
              if (toRemove > 0) {
                if (batch.totalSessions > toRemove) {
                  result.unshift({ ...batch, totalSessions: batch.totalSessions - toRemove })
                  toRemove = 0
                } else {
                  toRemove -= batch.totalSessions
                }
              } else {
                result.unshift(batch)
              }
            }
            if (result.length === 0) {
              return [{ id: '1', createdAt: dateString, totalSessions: newTotal }]
            }
            return result.map((b, idx) => ({ ...b, id: String(idx + 1) }))
          }
        }

        if (isEdit && editingPkg) {
          // Edit mode
          const index = updatedSubjects.findIndex(s => s.subjectId === editingSubjectId)
          if (index !== -1) {
            const prevPkg = updatedSubjects[index]
            const selectedSubjectObj = { id: catalogSnapshot.id, ...catalogSnapshot.data() } as Subject
            const isSubjectChanged = data.subjectId !== getCatalogSubjectId(editingSubjectId!)

            if (isSubjectChanged) {
              if (!selectedSubjectObj) throw new Error('Môn học mới không hợp lệ')

              if (prevPkg.usedMinutes > 0) {
                if (prevPkg.remainingMinutes <= 0) {
                  throw new Error('Gói môn cũ không còn kim cương để chuyển sang môn mới')
                }

                const historicalSessions = prevPkg.usedSessions || Math.round(
                  (prevPkg.usedMinutes / (prevPkg.minutesPerSession || 50)) * 100,
                ) / 100
                const newSessions = Math.round((prevPkg.remainingMinutes / minutesPerSession) * 100) / 100

                updatedSubjects[index] = {
                  ...prevPkg,
                  totalSessions: historicalSessions,
                  remainingSessions: 0,
                  totalMinutes: prevPkg.usedMinutes,
                  remainingMinutes: 0,
                  batches: adjustBatches(prevPkg.batches, historicalSessions, prevPkg.totalSessions)
                }
                updatedSubjects.push({
                  subjectId: newCourseId,
                  subjectName: newCourseName(selectedSubjectObj.name),
                  totalSessions: newSessions,
                  usedSessions: 0,
                  remainingSessions: newSessions,
                  minutesPerSession: minutesPerSession,
                  totalMinutes: prevPkg.remainingMinutes,
                  usedMinutes: 0,
                  remainingMinutes: prevPkg.remainingMinutes,
                  pricePerMinute: catalogRate.price,
                  currency: catalogRate.currency,
                  batches: [{
                    id: '1',
                    createdAt: dateString,
                    totalSessions: newSessions
                  }],
                  ...courseSettings,
                  curriculumLink: data.curriculumLink || '',
                  supplementaryCurriculumLink: data.supplementaryCurriculumLink || '',
                  additionalCurriculumLinks,
                  timetableNote: data.timetableNote || '',
                  studentRequests: selectedRequests,
                  focusSkills: selectedSkills
                })
              } else {
                const newTotalMinutes = data.totalMinutes
                const calculatedTotalSessions = Math.round(newTotalMinutes / minutesPerSession)
                updatedSubjects[index] = {
                  ...prevPkg,
                  subjectId: newCourseId,
                  subjectName: newCourseName(selectedSubjectObj.name),
                  pricePerMinute: catalogRate.price,
                  currency: catalogRate.currency,
                  totalSessions: calculatedTotalSessions,
                  remainingSessions: calculatedTotalSessions,
                  minutesPerSession: minutesPerSession,
                  totalMinutes: newTotalMinutes,
                  remainingMinutes: newTotalMinutes,
                  batches: adjustBatches(prevPkg.batches, calculatedTotalSessions, prevPkg.totalSessions),
                  ...courseSettings,
                  curriculumLink: data.curriculumLink || '',
                  supplementaryCurriculumLink: data.supplementaryCurriculumLink || '',
                  additionalCurriculumLinks,
                  timetableNote: data.timetableNote || '',
                  studentRequests: selectedRequests,
                  focusSkills: selectedSkills
                }
              }

              // Read by studentId only so the transfer never depends on a composite index.
              // The student package and every active booking are committed atomically below.
              if (editingSubjectId && data.subjectId !== getCatalogSubjectId(editingSubjectId) && selectedSubjectObj) {
                const bookingsSnap = await getDocs(query(
                  collection(db, 'bookingRequests'),
                  where('studentId', '==', student.id),
                ))
                const refs = bookingsSnap.docs
                  .filter((bookingDocument) => {
                    const booking = bookingDocument.data()
                    return booking.subjectId === editingSubjectId
                      && (booking.status === 'confirmed' || booking.status === 'pending')
                      && !booking.lessonId
                  })
                  .map((bookingDocument) => bookingDocument.ref)

                if (refs.length > 499) {
                  throw new Error('Học viên có quá nhiều lịch đang giữ chỗ; vui lòng liên hệ kỹ thuật để chuyển môn an toàn')
                }

                bookingSubjectTransfer = {
                  refs,
                  subjectId: newCourseId,
                  subjectName: newCourseName(selectedSubjectObj.name),
                }
              }
            } else {
              // This form edits metadata/default SALE. Quota changes belong to
              // payment entries, and must not re-round legacy 50-minute counters.
              updatedSubjects[index] = {
                ...prevPkg,
                ...(data.promoDiscountPercent > 0 && getCanonicalSubjectRate(prevPkg).price <= 0
                  ? { pricePerMinute: catalogRate.price, currency: catalogRate.currency }
                  : {}),
                ...courseSettings,
                curriculumLink: data.curriculumLink || '',
                supplementaryCurriculumLink: data.supplementaryCurriculumLink || '',
                additionalCurriculumLinks,
                timetableNote: data.timetableNote || '',
                studentRequests: selectedRequests,
                focusSkills: selectedSkills
              }
            }
          }
        } else {
          // Add mode
          const selectedSubjectObj = { id: catalogSnapshot.id, ...catalogSnapshot.data() } as Subject

          // Ô nhập là kim cương giá gốc (= phút học). Khóa SALE ghi quỹ đã giảm theo
          // mức trừ mỗi ca; không giảm thì quỹ = số đã nhập như trước.
          const fundDiamonds = courseSaleDiamonds(data.totalMinutes, data.promoDiscountPercent)
          if (!(fundDiamonds > 0)) throw new Error('Tổng số kim cương không hợp lệ')
          const calculatedTotalSessions = Math.round(fundDiamonds / minutesPerSession)
          const newPkg: StudentSubject = {
            subjectId: newCourseId,
            subjectName: newCourseName(selectedSubjectObj.name),
            totalSessions: calculatedTotalSessions,
            usedSessions: 0,
            remainingSessions: calculatedTotalSessions,
            minutesPerSession: minutesPerSession,
            totalMinutes: fundDiamonds,
            usedMinutes: 0,
            remainingMinutes: fundDiamonds,
            pricePerMinute: catalogRate.price,
            currency: catalogRate.currency,
            batches: [{
              id: '1',
              createdAt: dateString,
              totalSessions: calculatedTotalSessions,
              kind: 'payment',
              learningMinutes: data.totalMinutes,
              diamonds: fundDiamonds,
              content: data.paymentContent?.trim() || 'Thanh toán đợt 1',
              paymentDate: inputDateToDisplay(data.paymentDate) || dateString,
              note: data.paymentNote?.trim() || '',
            }],
            ...courseSettings,
            curriculumLink: data.curriculumLink || '',
            supplementaryCurriculumLink: data.supplementaryCurriculumLink || '',
            additionalCurriculumLinks,
            timetableNote: data.timetableNote || '',
            studentRequests: selectedRequests,
            focusSkills: selectedSkills
          }

          updatedSubjects.push(newPkg)
        }



        // Metadata/default SALE edits have no financial transition. Preserve
        // all stored aggregate counters, status and hold fields verbatim.
        if (isEdit && data.subjectId === getCatalogSubjectId(editingSubjectId!)) {
          if ((applySaleToFund || applySaleToBookings) && editingPkg) {
            // Không chặn khi lịch đang giữ vượt quỹ mới: giáo vụ đối soát quỹ buổi sau.
            const pctNow = normalizeManualPromoDiscount(data.promoDiscountPercent)
            const repriceInput = { student: { ...freshStudent, subjects: updatedSubjects }, subjectId: editingPkg.subjectId, discountPercent: pctNow }
            // Mọi lệnh đọc trước lệnh ghi (quy tắc transaction Firestore).
            const fundDraft = applySaleToFund ? repriceCourseForSale(repriceInput) : null
            const linkedSnapshots = fundDraft
              ? await Promise.all(fundDraft.changes.map((change) => transaction.get(doc(db, 'topUpTransactions', change.batchId))))
              : []
            const plannedIds = applySaleToBookings ? saleBookingPlan?.updates.map((update) => update.id) || [] : []
            if (plannedIds.length > 450) throw new Error('Khóa có quá nhiều ca cần áp SALE trong một lần; vui lòng liên hệ kỹ thuật.')
            const bookingSnapshots = await Promise.all(plannedIds.map((id) => transaction.get(doc(db, 'bookingRequests', id))))

            // Đợt tạo từ giao dịch nạp tự động giữ nguyên để không lệch sổ giao dịch.
            const lockedBatchIds = linkedSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => snapshot.id)
            const fundResult = applySaleToFund ? repriceCourseForSale({ ...repriceInput, lockedBatchIds }) : null
            // Tính lại trên dữ liệu ca mới nhất: ca vừa được nhả/duyệt sẽ tự bị loại.
            const bookingResult = applySaleToBookings && bookingContext
              ? planCourseSaleBookingReprice({
                  bookings: bookingSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as BookingRequest),
                  course: { ...editingPkg, ...(updatedSubjects.find((pkg) => pkg.subjectId === editingPkg.subjectId) || {}) },
                  discountPercent: pctNow,
                  approvedLessonIds: bookingContext.approvedLessonIds,
                  teacherLevels: bookingContext.teacherLevels,
                  batchId: saleBookingBatchId,
                })
              : null

            const heldBefore = Number(freshStudent.reservedMinutes ?? freshStudent.heldMinutes ?? 0) || 0
            const heldAfter = Math.max(0, heldBefore + (bookingResult?.heldDelta || 0))
            transaction.update(studentRef, {
              ...(fundResult
                ? {
                    subjects: fundResult.subjects,
                    ...fundResult.totals,
                    subjectId: fundResult.primarySubject?.subjectId || '',
                    subjectName: fundResult.primarySubject?.subjectName || '',
                    minutesPerSession: fundResult.primarySubject?.minutesPerSession || 25,
                    status: fundResult.status,
                  }
                : { subjects: updatedSubjects }),
              ...(bookingResult && bookingResult.heldDelta !== 0 ? { reservedMinutes: heldAfter, heldMinutes: heldAfter } : {}),
              updatedAt: serverTimestamp(),
            })
            bookingResult?.updates.forEach((update) => {
              transaction.update(doc(db, 'bookingRequests', update.id), {
                ...update.fields,
                coursePromoRepricedAt: serverTimestamp(),
                coursePromoRepricedBy: user?.uid || '',
                updatedAt: serverTimestamp(),
              })
            })
            transaction.set(doc(collection(db, 'adminLogs')), {
              adminId: user?.uid || '',
              action: 'REPRICE_COURSE_SALE',
              targetType: 'student',
              targetId: student.id,
              changes: {
                subjectId: editingPkg.subjectId,
                subjectName: editingPkg.subjectName,
                promoDiscountPercentBefore: originalPromoPercent,
                promoDiscountPercentAfter: pctNow,
                ...(fundResult ? {
                  totalDiamondsBefore: fundResult.totalBefore,
                  totalDiamondsAfter: fundResult.totalAfter,
                  remainingDiamondsAfter: fundResult.remainingAfter,
                  batches: fundResult.changes,
                  lockedBatchIds,
                } : {}),
                ...(bookingResult ? {
                  manualPromoBatchId: `manual-promo-${saleBookingBatchId}`,
                  bookings: bookingResult.updates.map((update) => ({ id: update.id, pointsBefore: update.pointsBefore, pointsAfter: update.pointsAfter, ratePerMinute: update.fields.classHuntCompensation.ratePerMinute })),
                  heldBefore,
                  heldAfter,
                } : {}),
              },
              createdAt: serverTimestamp(),
            })
            return
          }
          transaction.update(studentRef, {
            subjects: updatedSubjects,
            updatedAt: serverTimestamp(),
          })
          return
        }

        // Recalculate aggregates only when adding/transferring course funds.
        const aggTotalSessions = updatedSubjects.reduce((sum, s) => sum + s.totalSessions, 0)
        const aggUsedSessions = updatedSubjects.reduce((sum, s) => sum + s.usedSessions, 0)
        const aggRemainingSessions = updatedSubjects.reduce((sum, s) => sum + s.remainingSessions, 0)
        const aggTotalMinutes = updatedSubjects.reduce((sum, s) => sum + s.totalMinutes, 0)
        const aggUsedMinutes = updatedSubjects.reduce((sum, s) => sum + s.usedMinutes, 0)
        const aggRemainingMinutes = updatedSubjects.reduce((sum, s) => sum + s.remainingMinutes, 0)

        // Legacy fields point to a package that can still fund upcoming lessons.
        const primarySubject = updatedSubjects.find((pkg) => pkg.remainingMinutes > 0) || updatedSubjects[0] || null

        transaction.update(studentRef, {
          subjects: updatedSubjects,
          totalSessions: aggTotalSessions,
          usedSessions: aggUsedSessions,
          remainingSessions: aggRemainingSessions,
          totalMinutes: aggTotalMinutes,
          usedMinutes: aggUsedMinutes,
          remainingMinutes: aggRemainingMinutes,
          // Legacy fields mapping to primary subject
          subjectId: primarySubject ? primarySubject.subjectId : '',
          subjectName: primarySubject ? primarySubject.subjectName : '',
          minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 25,
          status: freshStudent.status === 'reserved' || freshStudent.status === 'inactive' ? freshStudent.status : aggRemainingMinutes <= 0 ? 'expired' : 'active',
          updatedAt: serverTimestamp(),
        })

        bookingSubjectTransfer?.refs.forEach((bookingRef) => {
          transaction.update(bookingRef, {
            subjectId: bookingSubjectTransfer.subjectId,
            subjectName: bookingSubjectTransfer.subjectName,
            updatedAt: serverTimestamp(),
          })
        })
      })

      toast.success(isTransferringSubject
        ? 'Đã chuyển số kim cương còn lại sang môn mới'
        : isEdit
          ? [
              'Đã cập nhật khóa học',
              applySaleToFund && salePreview?.result ? `kim cương ${salePreview.result.totalBefore.toLocaleString('vi-VN')} → ${salePreview.result.totalAfter.toLocaleString('vi-VN')}` : '',
              applySaleToBookings && saleBookingPlan ? `áp SALE cho ${saleBookingPlan.updates.length} ca đã xếp` : '',
            ].filter(Boolean).join(', ')
          : data.promoDiscountPercent > 0
            ? `Đã thêm khóa SALE -${data.promoDiscountPercent}%: ${courseSaleDiamonds(data.totalMinutes, data.promoDiscountPercent).toLocaleString('vi-VN')} kim cương cho ${Number(data.totalMinutes).toLocaleString('vi-VN')} phút học`
            : 'Đã thêm khóa học mới')
      onClose()
    } catch (err) {
      console.error(err)
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : ''
      toast.error(code.includes('permission-denied')
        ? 'Tài khoản không có quyền lưu khóa học. Vui lòng liên hệ quản trị viên.'
        : code.includes('unavailable')
          ? 'Chưa kết nối được hệ thống. Vui lòng kiểm tra mạng rồi thử lại.'
          : err instanceof Error ? err.message : 'Lỗi khi lưu thông tin môn học')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!loading) onClose() }}
      title={isEdit ? 'Chỉnh sửa khóa học' : 'Thêm khóa học mới'}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Hủy</Button>
          <Button form="subject-pkg-form" type="submit" loading={loading}>
            {isEdit ? 'Lưu thay đổi' : 'Thêm khóa học'}
          </Button>
        </div>
      }
    >
      <form id="subject-pkg-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Môn học *</label>
          <div className="relative">
            <input type="hidden" {...register('subjectId')} />
            <button
              type="button"
              onClick={() => setSubjectMenuOpen((open) => !open)}
              className="flex min-h-[46px] w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 text-left text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-indigo-500"
              aria-expanded={subjectMenuOpen}
            >
              <span className={selectedSubject ? 'font-medium' : 'text-slate-500'}>
                {selectedSubject
                  ? `${selectedSubject.name} (${formatPricePerMinute(selectedSubject.pricePerMinute || 0, selectedSubject.currency)})`
                  : editingPkg?.subjectName || '-- Chọn môn học --'}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${subjectMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {subjectMenuOpen && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 p-2">
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      autoFocus
                      value={subjectSearch}
                      onChange={(event) => setSubjectSearch(event.target.value)}
                      placeholder="Tìm tên môn học..."
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {filteredSubjects.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">Không tìm thấy môn học.</p>
                  ) : filteredSubjects.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => {
                        setValue('subjectId', subject.id, { shouldValidate: true })
                        setSubjectMenuOpen(false)
                        setSubjectSearch('')
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
                    >
                      <span>
                        <span className="block font-medium text-slate-800">{subject.name}</span>
                        <span className="text-xs text-slate-500">
                          {formatPricePerMinute(subject.pricePerMinute || 0, subject.currency)}
                        </span>
                      </span>
                      {watchedSubjectId === subject.id && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                    </button>
                  ))}

                </div>
              </div>
            )}
          </div>
          {errors.subjectId && <p className="mt-1.5 text-xs text-rose-400">{errors.subjectId.message}</p>}
          {isTransferringSubject && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {editingPkg?.usedMinutes
                ? `Lịch sử đã học vẫn thuộc môn cũ. Hệ thống chỉ chuyển ${transferableMinutes.toLocaleString('vi-VN')} kim cương còn lại sang môn mới.`
                : 'Gói chưa phát sinh buổi học nên hệ thống sẽ đổi trực tiếp sang môn mới.'}
            </p>
          )}
        </div>

        {isTransferringSubject && editingPkg && editingPkg.usedMinutes > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <p className="text-xs font-medium text-slate-500">Quỹ chuyển sang môn mới</p>
            <p className="mt-1 font-semibold text-slate-800">
              {transferableMinutes.toLocaleString('vi-VN')} kim cương · tương đương {transferredSessions.toLocaleString('vi-VN')} buổi
            </p>
          </div>
        ) : (
          <Input
            label={isEdit ? 'Tổng số kim cương *' : 'Tổng số kim cương (giá gốc) *'}
            type="number"
            placeholder="500"
            error={errors.totalMinutes?.message}
            disabled={isEdit && !isTransferringSubject}
            {...register('totalMinutes')}
          />
        )}
        {isEdit && !isTransferringSubject && (
          <p className="-mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-800">
            Sửa số phút hoặc kim cương tại từng đợt trong “Chi tiết khóa học” để lịch sử và quỹ còn lại được đồng bộ an toàn.
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="course-sale" className="block text-sm font-medium text-slate-600">Ưu đãi của khóa học</label>
          <select id="course-sale" {...register('promoDiscountPercent')} className={`min-h-[46px] w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:ring-indigo-500 ${watchedPromoPercent > 0 ? 'border-rose-300 font-semibold text-rose-700' : 'border-slate-300'}`}>
            <option value={0}>Khóa thông thường — Không giảm</option>
            {MANUAL_PROMO_DISCOUNT_OPTIONS.map((percent) => <option key={percent} value={percent}>Khóa SALE — Giảm {percent}%</option>)}
          </select>
          {appliesSaleToNewFund && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800" aria-live="polite">
              <p className="text-xs font-medium text-rose-700">Kim cương ghi vào khóa sau ưu đãi</p>
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-bold">
                <span className="text-slate-400 line-through">{watchedBaseDiamonds.toLocaleString('vi-VN')}</span>
                <span className="text-lg text-rose-700">{saleFundDiamonds.toLocaleString('vi-VN')} kim cương</span>
                <span className="text-xs font-semibold">(giảm {watchedPromoPercent}%)</span>
              </p>
              <p className="mt-1 text-xs leading-5">
                Học viên vẫn học đủ {watchedBaseDiamonds.toLocaleString('vi-VN')} phút; mỗi ca 25 phút trừ {salePointsPer25} kim cương thay vì {COURSE_SALE_BASE_POINTS_PER_25_MINUTES}.
              </p>
            </div>
          )}
          {salePreview?.result && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800" aria-live="polite">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={applySaleToFund}
                  onChange={(event) => setSaleFundChoice(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                />
                <span>
                  <span className="block text-xs font-semibold text-rose-700">
                    {watchedPromoPercent > 0 ? `Giảm kim cương theo SALE -${watchedPromoPercent}%` : 'Trả kim cương về giá gốc (bỏ SALE)'}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-bold">
                    <span className="text-slate-400 line-through">{salePreview.result.totalBefore.toLocaleString('vi-VN')}</span>
                    <span className="text-lg text-rose-700">{salePreview.result.totalAfter.toLocaleString('vi-VN')} kim cương</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5">
                    Số phút học của từng đợt giữ nguyên; còn lại sau khi đổi: {salePreview.result.remainingAfter.toLocaleString('vi-VN')} kim cương. Nếu lịch đã đặt vượt quỹ mới, hệ thống vẫn lưu, giáo vụ xử lý ở phần đối soát quỹ buổi.
                  </span>
                </span>
              </label>
            </div>
          )}
          {saleBookingPlan && saleBookingPlan.updates.length > 0 && (() => {
            const held = saleBookingPlan.updates.filter((update) => update.holding)
            const settled = saleBookingPlan.updates.length - held.length
            const heldBefore = held.reduce((sum, update) => sum + update.pointsBefore, 0)
            const heldAfter = held.reduce((sum, update) => sum + update.pointsAfter, 0)
            const regularPrice = Number(editingPkg?.pricePerMinute) || 0
            const salePrice = courseSalePricePerMinute(regularPrice, watchedPromoPercent, editingPkg?.currency)
            return (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={applySaleToBookings}
                    onChange={(event) => setSaleBookingChoice(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-rose-700">
                      Áp SALE -{watchedPromoPercent}% cho {saleBookingPlan.updates.length} ca đã xếp giá thường (chưa duyệt)
                    </span>
                    {held.length > 0 && (
                      <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-bold">
                        <span className="text-xs font-semibold">{held.length} ca đang giữ:</span>
                        <span className="text-slate-400 line-through">{heldBefore.toLocaleString('vi-VN')}</span>
                        <span className="text-rose-700">{heldAfter.toLocaleString('vi-VN')} kim cương</span>
                      </span>
                    )}
                    <span className="mt-1 block text-xs leading-5">
                      Lương gia sư các ca này: <span className="line-through">{regularPrice.toLocaleString('vi-VN')}đ</span> → {salePrice.toLocaleString('vi-VN')}đ/phút (gia sư cấp 1).
                      {settled > 0 ? ` Gồm ${settled} ca của buổi đang chờ duyệt hoặc bị từ chối: duyệt lại sẽ tính giá SALE.` : ''} Ca Class Hunting và buổi đã duyệt giữ nguyên.
                    </span>
                  </span>
                </label>
              </div>
            )
          })()}
          {saleBookingPlan && saleBookingPlan.missingPriceBookingIds.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {saleBookingPlan.missingPriceBookingIds.length} ca chưa áp SALE được vì khóa chưa có đơn giá VND.
            </p>
          )}
          {bookingContextError && watchedPromoPercent > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{bookingContextError}</p>
          )}
          {salePreview?.error && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{salePreview.error}</p>
          )}
          {editedSaleChanged && !applySaleToFund && !applySaleToBookings && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              Chỉ đổi ưu đãi cho lịch xếp mới (Class Hunting, xếp lớp thủ công). Quỹ kim cương giữ nguyên.
            </p>
          )}
          <p className="text-xs leading-5 text-slate-500">Tự áp dụng khi tạo Class Hunting hoặc xếp lớp thủ công. Giáo vụ vẫn có thể chọn mức ưu đãi khác khi xếp lớp. Lịch đã đặt giữ nguyên mức đã chốt.</p>
          {errors.promoDiscountPercent && <p className="text-xs text-rose-500">{errors.promoDiscountPercent.message}</p>}
          {!isEdit && currentSubjects.some((pkg) => getCatalogSubjectId(pkg.subjectId) === watchedSubjectId) && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-800">Học viên đã có môn này. Thêm mới sẽ tạo khóa riêng với quỹ kim cương, ưu đãi và lịch sử riêng. Để nạp thêm vào khóa cũ, dùng “Thêm đợt thanh toán” trong chi tiết khóa.</p>
          )}
          {!isEdit && onAddToOwnedCourse && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {currentSubjects.filter((pkg) => getCatalogSubjectId(pkg.subjectId) === watchedSubjectId).map((pkg) => (
                <button key={pkg.subjectId} type="button" disabled={loading} onClick={() => onAddToOwnedCourse(pkg.subjectId)} className="min-h-9 text-left text-xs font-semibold text-indigo-700 underline underline-offset-4 hover:text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  Thêm đợt vào {pkg.subjectName}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-4 bg-slate-50/50">
          <label className="block text-sm font-bold text-slate-700">Kỹ năng trọng tâm (Tick chọn)</label>
          <div className="space-y-4">
            {FOCUS_SKILL_GROUPS.map((group) => {
              const GroupIcon = group.icon
              return (
                <div key={group.key} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                    <GroupIcon className="h-4 w-4 text-indigo-600" />
                    {group.label}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.options.map((skill) => {
                      const checked = selectedSkills.includes(skill)
                      return (
                        <label key={skill} className="flex items-start gap-2 text-sm text-slate-600 font-medium cursor-pointer hover:text-slate-900 select-none">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSkills((prev) => prev.includes(skill) ? prev : [...prev, skill])
                              } else {
                                setSelectedSkills((prev) => prev.filter((s) => s !== skill))
                              }
                            }}
                            className="mt-0.5 rounded border-slate-350 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{skill}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {selectedSkills.some((skill) => LEGACY_FOCUS_SKILLS_OPTIONS.includes(skill)) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="mb-2 text-xs font-bold text-amber-800">Kỹ năng đã lưu theo cấu hình cũ</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {LEGACY_FOCUS_SKILLS_OPTIONS.filter((skill) => selectedSkills.includes(skill)).map((skill) => (
                    <label key={skill} className="flex items-center gap-2 text-sm text-amber-900 font-medium cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked
                        onChange={() => setSelectedSkills((prev) => prev.filter((s) => s !== skill))}
                        className="rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{skill}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isEdit && (
          <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <p className="text-sm font-bold text-slate-800">Thông tin thanh toán đợt đầu</p>
            <Input
              label="Nội dung"
              placeholder="Thanh toán đợt 1"
              {...register('paymentContent')}
            />
            <Input
              label="Ngày thanh toán"
              type="date"
              {...register('paymentDate')}
            />
            <Input
              label="Ghi chú thanh toán"
              placeholder="Nhập ghi chú cần lưu (không bắt buộc)"
              {...register('paymentNote')}
            />
          </div>
        )}

        <Input
          label="Link giáo trình"
          placeholder="Nhập link giáo trình (không bắt buộc)"
          error={errors.curriculumLink?.message}
          {...register('curriculumLink')}
        />

        <Input
          label="Link giáo trình bổ trợ"
          placeholder="Nhập link giáo trình bổ trợ (không bắt buộc)"
          error={errors.supplementaryCurriculumLink?.message}
          {...register('supplementaryCurriculumLink')}
        />

        {additionalLinkRows.map((link, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label={`Link giáo trình thêm ${index + 1}`}
                placeholder="Nhập link giáo trình"
                value={link}
                autoFocus={index === additionalLinkRows.length - 1 && !link}
                error={invalidLinkRows.includes(index) ? 'Link chưa đúng, ví dụ: https://drive.google.com/...' : undefined}
                onChange={(event) => {
                  const value = event.target.value
                  setAdditionalLinkRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? value : row))
                  setInvalidLinkRows((rows) => rows.filter((rowIndex) => rowIndex !== index))
                }}
              />
            </div>
            <button
              type="button"
              aria-label={`Xóa link giáo trình thêm ${index + 1}`}
              title="Xóa dòng này"
              onClick={() => {
                setAdditionalLinkRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                setInvalidLinkRows([])
              }}
              className="mt-[26px] flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          disabled={additionalLinkRows.length >= MAX_ADDITIONAL_CURRICULUM_LINKS}
          onClick={() => setAdditionalLinkRows((rows) => [...rows, ''])}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 px-4 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Thêm giáo trình
        </button>

        {/* Checkbox list of student requests */}
        <div className="space-y-2 rounded-xl border border-slate-200 p-4 bg-slate-50/50">
          <label className="block text-sm font-bold text-slate-700">Yêu cầu từ học viên (Tick chọn)</label>
          <div className="space-y-2">
            {STUDENT_REQUESTS_OPTIONS.map((reqOption) => {
              const checked = selectedRequests.includes(reqOption)
              return (
                <label key={reqOption} className="flex items-start gap-2.5 text-sm text-slate-600 font-medium cursor-pointer hover:text-slate-900 select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRequests((prev) => [...prev, reqOption])
                      } else {
                        setSelectedRequests((prev) => prev.filter((r) => r !== reqOption))
                      }
                    }}
                    className="mt-1 rounded border-slate-350 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{reqOption}</span>
                </label>
              )
            })}
          </div>
        </div>

        <Input
          label="Note chung trên timetable"
          placeholder="Nhập ghi chú chung hiển thị trên timetable (không bắt buộc)"
          error={errors.timetableNote?.message}
          {...register('timetableNote')}
        />
      </form>
    </Modal>
  )
}
