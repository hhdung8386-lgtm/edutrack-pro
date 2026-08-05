import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, getDoc, runTransaction, getDocs, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { toast } from '@/stores/toastStore'
import { ClipboardCheck, Search, Copy, Trash2, Edit3, X, ExternalLink, Check, Hourglass, XCircle, Wallet } from 'lucide-react'
import { EVALUATION_FORM_LABELS, getCourseOptions, normalizeCourseLabel, normalizeSelectedCourseLevels, TUTOR_SKILL_OPTIONS, type EvaluationFormType } from '@/lib/evaluationOptions'
import { EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY, formatMoney, getCurrentMonth } from '@/lib/constants'
import { useAuthStore } from '@/stores/authStore'

interface Evaluation {
  id: string
  studentName: string
  teacherId: string
  teacherName: string
  type: 'english' | 'other'
  skills: Record<string, number>
  lessonComment?: string
  formType: EvaluationFormType
  selectedLevels: string[]
  selectedCourseLevels?: Record<string, number>
  customLevelText?: string
  tutorSubjects?: Record<string, string>
  tutorSkills?: string[]
  evaluationResult: 'direct' | 'more_advice' | 're_evaluate'
  sessionsPerWeek: number
  minutesPerSession: number
  proposedCurriculum: string
  postCourseGoals: string
  createdAt?: any
  updatedAt?: any
  imageUrl?: string
  /** Phiếu cũ chưa có field này -> coi như 'pending' để admin duyệt, KHÔNG mất dữ liệu. */
  status?: 'pending' | 'approved' | 'rejected'
  approvedAt?: any
  approvedBy?: string
  rejectedReason?: string
  /** Doc payroll đã tạo khi duyệt — dùng để chống cộng tiền 2 lần và để thu hồi. */
  rewardPayrollId?: string
  rewardAmount?: number
  /** Tháng bảng lương đã nhận khoản thưởng (phiếu cũ chưa có -> suy từ approvedAt). */
  rewardMonth?: string
}

/** Đổi Timestamp/Date/số của Firestore về `YYYY-MM`, không đọc được thì trả '' */
function monthOfTimestamp(value: unknown): string {
  const raw = value as { toDate?: () => Date; seconds?: number } | Date | undefined
  let date: Date | null = null
  if (raw instanceof Date) date = raw
  else if (typeof raw?.toDate === 'function') date = raw.toDate()
  else if (typeof raw?.seconds === 'number') date = new Date(raw.seconds * 1000)
  if (!date || Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Tháng bảng lương nhận khoản thưởng của một phiếu đánh giá.
 *
 * Phải theo tháng của BUỔI DẠY THỬ (phiếu được gia sư gửi), KHÔNG theo tháng
 * duyệt — nếu không, phiếu tháng 7 duyệt sang tháng 8 sẽ rơi vào bảng lương
 * tháng 8 và giáo vụ mở tháng 7 sẽ tưởng là "không được cộng vào lương".
 */
function evaluationRewardMonth(evaluation: { createdAt?: unknown }): string {
  return monthOfTimestamp(evaluation.createdAt) || getCurrentMonth()
}

type EvalStatus = 'pending' | 'approved' | 'rejected'
const evalStatusOf = (e: Evaluation): EvalStatus => e.status === 'approved' ? 'approved' : e.status === 'rejected' ? 'rejected' : 'pending'

const RESULT_LABELS = {
  direct: 'Phù hợp đăng ký ngay',
  more_advice: 'Cần tư vấn thêm lộ trình',
  re_evaluate: 'Hẹn đánh giá lại sau',
}

const DEFAULT_GOALS = {
  adult_comm: `Sau khi hoàn thành lộ trình được đề xuất, học viên có thể:
- Giao tiếp tự tin hơn trong các tình huống hằng ngày và môi trường làm việc.
- Sử dụng đa dạng cấu trúc câu và từ vựng phù hợp với từng chủ đề.
- Cải thiện phát âm, ngữ điệu và khả năng nghe hiểu.
- Nâng cao phản xạ giao tiếp, giảm phụ thuộc vào việc dịch từ tiếng Việt sang tiếng Anh.
- Tạo nền tảng để tiếp tục học các khóa giao tiếp nâng cao hoặc Business English.`,
  
  tutor: `Sau khi hoàn thành lộ trình được đề xuất, học viên có thể:
- Củng cố và nắm vững toàn bộ kiến thức cơ bản trong chương trình học.
- Nâng cao kỹ năng tư duy toán học/tự nhiên/xã hội và phân tích giải đề thi.
- Cải thiện điểm số trên lớp và chuẩn bị tốt cho các kỳ thi học kỳ/chuyển cấp.
- Hình thành thói quen tự giác, tập trung và rèn luyện kỹ năng làm bài thi chính xác.`,
  
  kids_a: `Sau khi hoàn thành lộ trình được đề xuất, học viên có thể:
- Làm quen và sử dụng thành thạo từ vựng, mẫu câu giao tiếp đơn giản theo chủ đề.
- Tự tin tương tác phản xạ Nghe - Nói tự nhiên với gia sư nước ngoài/Việt Nam.
- Cải thiện kỹ năng đọc hiểu truyện ngắn và viết câu tiếng Anh cơ bản.
- Phát triển niềm yêu thích ngôn ngữ và xây dựng nền tảng ngữ âm vững chắc.`,
  
  kids_b: `Sau khi hoàn thành lộ trình được đề xuất, học viên có thể:
- Giao tiếp tự tin hơn trong các tình huống hằng ngày và môi trường học tập.
- Sử dụng đa dạng cấu trúc câu và từ vựng phù hợp với từng chủ đề.
- Cải thiện phát âm, ngữ điệu và khả năng nghe hiểu.
- Nâng cao phản xạ giao tiếp, giảm phụ thuộc vào việc dịch từ tiếng Việt sang tiếng Anh.
- Tạo nền tảng để tiếp tục học các khóa giao tiếp nâng cao.`,
  
  academic: `Sau khi hoàn thành lộ trình được đề xuất, học viên có thể:
- Giao tiếp tự tin hơn trong các tình huống hằng ngày và môi trường làm việc chuyên nghiệp.
- Sử dụng đa dạng cấu trúc câu nâng cao và từ vựng phong phú phù hợp với định hướng thi cử.
- Cải thiện phát âm, ngữ điệu chuẩn xác và nâng cao khả năng nghe hiểu học thuật.
- Nâng cao phản xạ giao tiếp, giảm phụ thuộc vào việc dịch từ tiếng Việt sang tiếng Anh.
- Xây dựng nền tảng vững chắc để tiếp tục ôn luyện và chinh phục mục tiêu điểm số các kỳ thi quốc tế.`
}

const DEFAULT_CURRICULUM = {
  adult_comm: 'Topic Conversation – Intermediate',
  tutor: 'Chương trình SGK chuẩn Bộ GD&ĐT',
  kids_a: '123English Kids Curriculum',
  kids_b: 'Magic Phonics & Smart Kids Series',
  academic: 'Cambridge Standard Prep / IELTS Pathway',
}

export default function AdminEvaluationsPage() {
  const { user } = useAuthStore()
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | EvalStatus>('pending')
  const [processingId, setProcessingId] = useState<string | null>(null)
  
  const [showForm, setShowForm] = useState(false)
  const [editingEval, setEditingEval] = useState<Evaluation | null>(null)

  // Form State fields
  const [studentName, setStudentName] = useState('')
  const [lessonComment, setLessonComment] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [subjectType, setSubjectType] = useState<'english' | 'other'>('english')
  
  // Skills 1 to 9
  const [skills, setSkills] = useState<Record<string, number>>({
    listening: 5, speaking: 5, reading: 5, pronunciation: 5, vocabulary: 5, grammar: 5, communication: 5,
    backgroundKnowledge: 5, receptiveness: 5, analyticalThinking: 5, problemSolving: 5, application: 5, concentration: 5, accuracy: 5
  })

  const [formType, setFormType] = useState<Evaluation['formType']>('adult_comm')
  const [selectedLevels, setSelectedLevels] = useState<string[]>([])
  const [selectedCourseLevels, setSelectedCourseLevels] = useState<Record<string, number>>({})
  const [customLevelText, setCustomLevelText] = useState('')
  const [tutorSkills, setTutorSkills] = useState<string[]>([])
  
  // Tutor fields
  const [tutorSubjects, setTutorSubjects] = useState<Record<string, string>>({
    moet: '', tichHop: '', nangCao: '', songNgu: '', quocTe: '', khac: ''
  })

  const [evaluationResult, setEvaluationResult] = useState<Evaluation['evaluationResult']>('direct')
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3)
  const [minutesPerSession, setMinutesPerSession] = useState(50)
  const [proposedCurriculum, setProposedCurriculum] = useState(DEFAULT_CURRICULUM.adult_comm)
  const [postCourseGoals, setPostCourseGoals] = useState(DEFAULT_GOALS.adult_comm)
  const [imageUrl, setImageUrl] = useState('')
  const [compressing, setCompressing] = useState(false)

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_WIDTH = 600
          let width = img.width
          let height = img.height

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width)
            width = MAX_WIDTH
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            const compressed = canvas.toDataURL('image/jpeg', 0.7)
            resolve(compressed)
          } else {
            resolve(event.target?.result as string)
          }
        }
        img.onerror = (err) => reject(err)
      }
      reader.onerror = (err) => reject(err)
    })
  }

  useEffect(() => {
    const q = collection(db, 'evaluations')
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Evaluation))
      items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setEvaluations(items)
      setLoading(false)
    })
    return unsub
  }, [])

  // Automatically update prefilled goals and curriculum when formType changes
  useEffect(() => {
    if (!editingEval) {
      setProposedCurriculum(DEFAULT_CURRICULUM[formType])
      setPostCourseGoals(DEFAULT_GOALS[formType])
      setSelectedLevels([])
      setSelectedCourseLevels({})
      setCustomLevelText('')
      
      // Auto adjust default duration per session based on selected formType recommendations
      if (formType === 'kids_a' || formType === 'kids_b') {
        setMinutesPerSession(25)
      } else {
        setMinutesPerSession(50)
      }
    }
  }, [formType, editingEval])

  const handleOpenEdit = (evalDoc: Evaluation) => {
    setEditingEval(evalDoc)
    setStudentName(evalDoc.studentName)
    setLessonComment(evalDoc.lessonComment || '')
    setTeacherName(evalDoc.teacherName || '')
    setSubjectType(evalDoc.type)
    setSkills({ ...skills, ...evalDoc.skills })
    setFormType(evalDoc.formType)
    setSelectedLevels((evalDoc.selectedLevels || []).map(normalizeCourseLabel))
    setSelectedCourseLevels(normalizeSelectedCourseLevels(evalDoc.selectedCourseLevels))
    setCustomLevelText(evalDoc.customLevelText || '')
    setTutorSkills(evalDoc.tutorSkills || [])
    setTutorSubjects(evalDoc.tutorSubjects || { moet: '', tichHop: '', nangCao: '', songNgu: '', quocTe: '', khac: '' })
    setEvaluationResult(evalDoc.evaluationResult)
    setSessionsPerWeek(evalDoc.sessionsPerWeek)
    setMinutesPerSession(evalDoc.minutesPerSession)
    setProposedCurriculum(evalDoc.proposedCurriculum)
    setPostCourseGoals(evalDoc.postCourseGoals)
    setImageUrl(evalDoc.imageUrl || '')
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentName.trim()) {
      toast.error('Vui lòng nhập tên học viên')
      return
    }
    if (lessonComment.trim().length < 100) {
      toast.error('Nhận xét buổi học phải có ít nhất 100 ký tự')
      return
    }
    if (!editingEval) return
    const courseMissingStartLevel = formType === 'tutor'
      ? undefined
      : getCourseOptions(formType).find((course) => (
        selectedLevels.includes(course.label)
        && course.levelOptions?.length
        && selectedCourseLevels[course.label] === undefined
      ))
    if (courseMissingStartLevel) {
      toast.error(`Vui lòng chọn cấp độ bắt đầu cho ${courseMissingStartLevel.label}`)
      return
    }

    const payload: Partial<Evaluation> = {
      studentName: studentName.trim(),
      lessonComment: lessonComment.trim(),
      teacherName: teacherName.trim() || editingEval.teacherName,
      type: subjectType,
      skills: subjectType === 'english' 
        ? {
            listening: skills.listening,
            speaking: skills.speaking,
            reading: skills.reading,
            pronunciation: skills.pronunciation,
            vocabulary: skills.vocabulary,
            grammar: skills.grammar,
            communication: skills.communication,
          }
        : {
            backgroundKnowledge: skills.backgroundKnowledge,
            receptiveness: skills.receptiveness,
            analyticalThinking: skills.analyticalThinking,
            problemSolving: skills.problemSolving,
            application: skills.application,
            concentration: skills.concentration,
            accuracy: skills.accuracy,
          },
      formType,
      selectedLevels: formType === 'tutor' ? [] : selectedLevels,
      selectedCourseLevels: formType === 'tutor' ? {} : selectedCourseLevels,
      customLevelText: formType === 'tutor' ? '' : customLevelText,
      tutorSubjects: formType === 'tutor' ? tutorSubjects : {},
      tutorSkills: formType === 'tutor' ? tutorSkills : [],
      evaluationResult,
      sessionsPerWeek,
      minutesPerSession,
      proposedCurriculum,
      postCourseGoals,
      imageUrl,
      updatedAt: serverTimestamp(),
    }

    try {
      await updateDoc(doc(db, 'evaluations', editingEval.id), payload)
      toast.success('Đã cập nhật phiếu đánh giá thành công')
      setShowForm(false)
    } catch (err) {
      console.error(err)
      toast.error('Lỗi khi lưu phiếu đánh giá')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa phiếu đánh giá này?')) return
    try {
      await deleteDoc(doc(db, 'evaluations', id))
      toast.success('Đã xóa phiếu đánh giá')
    } catch (err) {
      console.error(err)
      toast.error('Lỗi khi xóa phiếu đánh giá')
    }
  }

  const copyShareLink = (id: string) => {
    const url = `${window.location.origin}/evaluation/${id}`
    navigator.clipboard.writeText(url)
    toast.success('Đã sao chép link chia sẻ cho phụ huynh')
  }

  /**
   * Duyệt phiếu đánh giá -> cộng thưởng cho gia sư.
   * Chạy trong transaction và kiểm tra lại trạng thái ngay trước khi ghi để
   * KHÔNG BAO GIỜ cộng tiền hai lần (kể cả khi bấm nhanh nhiều lần / 2 tab).
   * Khoản thưởng ghi vào `payroll` dạng 'adjustment' nên tự vào bảng lương tháng.
   */
  const handleApprove = async (evaluation: Evaluation) => {
    if (!evaluation.teacherId) {
      toast.error('Phiếu này không gắn với gia sư nào nên không thể cộng thưởng')
      return
    }
    setProcessingId(evaluation.id)
    try {
      const teacherSnap = await getDoc(doc(db, 'teachers', evaluation.teacherId))
      const teacherLevel = teacherSnap.exists() ? (teacherSnap.data()?.level ?? 1) : 1
      const teacherName = evaluation.teacherName || (teacherSnap.exists() ? teacherSnap.data()?.name : '') || 'Gia sư'
      const month = evaluationRewardMonth(evaluation)

      await runTransaction(db, async (tx) => {
        const evalRef = doc(db, 'evaluations', evaluation.id)
        const evalSnap = await tx.get(evalRef)
        if (!evalSnap.exists()) throw new Error('EVAL_NOT_FOUND')
        const current = evalSnap.data() as Evaluation
        if (current.status === 'approved') throw new Error('ALREADY_APPROVED')

        const payrollRef = doc(collection(db, 'payroll'))
        tx.set(payrollRef, {
          teacherId: evaluation.teacherId,
          teacherName,
          lessonId: '',
          type: 'adjustment',
          adjustmentNote: `Đánh giá học sinh mới: ${evaluation.studentName || 'Không rõ tên'}`,
          amount: EVALUATION_REWARD_AMOUNT,
          minutes: 0,
          pricePerMinute: 0,
          level: teacherLevel,
          month,
          currency: EVALUATION_REWARD_CURRENCY,
          paid: false,
          createdBy: user?.uid || 'admin',
          evaluationId: evaluation.id,
          createdAt: serverTimestamp(),
        })

        tx.update(evalRef, {
          status: 'approved',
          approvedAt: serverTimestamp(),
          approvedBy: user?.uid || 'admin',
          rewardPayrollId: payrollRef.id,
          rewardAmount: EVALUATION_REWARD_AMOUNT,
          // Ghi lại tháng đã cộng để giáo vụ biết mở bảng lương tháng nào
          rewardMonth: month,
          rejectedReason: '',
          updatedAt: serverTimestamp(),
        })
      })

      const reward = formatMoney(EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)
      // Phiếu cũ duyệt trễ sẽ rơi vào tháng cũ — nói rõ để giáo vụ mở đúng bảng lương,
      // tránh tình trạng "đã duyệt mà không thấy cộng ở đâu".
      toast.success(month === getCurrentMonth()
        ? `Đã duyệt và cộng ${reward} vào lương tháng ${month} của ${teacherName}`
        : `Đã duyệt và cộng ${reward} vào lương THÁNG ${month} của ${teacherName} (theo tháng của buổi dạy thử, không phải tháng này) — nhớ mở bảng lương tháng ${month} để chi trả.`)
    } catch (err: any) {
      console.error('approve evaluation failed', err)
      if (err?.message === 'ALREADY_APPROVED') toast.warning('Phiếu này đã được duyệt trước đó — không cộng tiền lần nữa')
      else if (err?.message === 'EVAL_NOT_FOUND') toast.error('Phiếu đánh giá không tồn tại')
      else toast.error('Không thể duyệt phiếu, vui lòng thử lại')
    } finally {
      setProcessingId(null)
    }
  }

  /** Từ chối phiếu (không cộng tiền). Nếu phiếu đã duyệt thì thu hồi khoản thưởng chưa thanh toán. */
  const handleReject = async (evaluation: Evaluation) => {
    const reason = window.prompt('Lý do từ chối phiếu đánh giá này?', evaluation.rejectedReason || '')
    if (reason === null) return
    setProcessingId(evaluation.id)
    try {
      // Nếu trước đó đã duyệt & cộng tiền -> chỉ thu hồi khi khoản đó CHƯA thanh toán.
      if (evaluation.rewardPayrollId) {
        const payrollRef = doc(db, 'payroll', evaluation.rewardPayrollId)
        const paySnap = await getDoc(payrollRef)
        if (paySnap.exists()) {
          if (paySnap.data()?.paid === true) {
            toast.error('Khoản thưởng của phiếu này đã được thanh toán — không thể thu hồi tự động. Vui lòng điều chỉnh thủ công ở trang Lương gia sư.')
            setProcessingId(null)
            return
          }
          await updateDoc(payrollRef, {
            voided: true,
            amount: 0,
            voidedAt: serverTimestamp(),
            voidedBy: user?.uid || 'admin',
          })
        }
      }
      await updateDoc(doc(db, 'evaluations', evaluation.id), {
        status: 'rejected',
        rejectedReason: reason.trim(),
        rewardAmount: 0,
        updatedAt: serverTimestamp(),
      })
      toast.success('Đã từ chối phiếu đánh giá')
    } catch (err) {
      console.error('reject evaluation failed', err)
      toast.error('Không thể từ chối phiếu, vui lòng thử lại')
    } finally {
      setProcessingId(null)
    }
  }

  const statusCounts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 }
    evaluations.forEach((e) => { c[evalStatusOf(e)]++ })
    return c
  }, [evaluations])

  const filtered = evaluations.filter(e => {
    const matchSearch = e.studentName.toLowerCase().includes(search.toLowerCase()) ||
      (e.teacherName || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || evalStatusOf(e) === statusFilter
    return matchSearch && matchStatus
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="evaluation-mobile-theme max-w-6xl mx-auto space-y-6">
      
      {/* Title Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-indigo-600" />
          Quản lý đánh giá học sinh mới
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Duyệt phiếu đánh giá của gia sư — mỗi phiếu được duyệt sẽ cộng{' '}
          <span className="font-bold text-emerald-600">{formatMoney(EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)}</span>{' '}
          vào bảng lương tháng của gia sư đó
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <Input
          placeholder="Tìm theo tên học sinh hoặc gia sư..."
          leftIcon={<Search className="w-4 h-4" />}
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          className="w-full max-w-md"
        />
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'pending' as const, label: 'Chờ duyệt', count: statusCounts.pending, cls: 'bg-amber-500 text-white', idle: 'text-amber-700 bg-amber-50 hover:bg-amber-100' },
            { key: 'approved' as const, label: 'Đã duyệt', count: statusCounts.approved, cls: 'bg-emerald-600 text-white', idle: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' },
            { key: 'rejected' as const, label: 'Từ chối', count: statusCounts.rejected, cls: 'bg-rose-600 text-white', idle: 'text-rose-700 bg-rose-50 hover:bg-rose-100' },
            { key: 'all' as const, label: 'Tất cả', count: evaluations.length, cls: 'bg-slate-800 text-white', idle: 'text-slate-700 bg-slate-100 hover:bg-slate-200' },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${statusFilter === tab.key ? tab.cls : tab.idle}`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        {statusCounts.pending > 0 && (
          <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Có {statusCounts.pending} phiếu chờ duyệt — tổng tiền sẽ cộng nếu duyệt hết:{' '}
            {formatMoney(statusCounts.pending * EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)}
          </p>
        )}
      </div>

      {/* Main List */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-slate-200">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-800 font-bold text-sm">Chưa tìm thấy kết quả đánh giá nào</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <Card key={item.id} className="p-6 border-slate-200/80 hover:border-indigo-200/60 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-extrabold text-slate-850 text-base">{item.studentName}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      {EVALUATION_FORM_LABELS[item.formType]}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge variant={item.type === 'english' ? 'info' : 'warning'}>
                      {item.type === 'english' ? 'Tiếng Anh' : 'Khác'}
                    </Badge>
                    {(() => {
                      const st = evalStatusOf(item)
                      const meta = st === 'approved'
                        ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Check, text: 'Đã duyệt' }
                        : st === 'rejected'
                          ? { cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle, text: 'Từ chối' }
                          : { cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Hourglass, text: 'Chờ duyệt' }
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
                          <meta.Icon className="w-3 h-3" />{meta.text}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-y-2 text-xs border-t border-slate-100 pt-4">
                  <span className="text-slate-400">Gia sư đánh giá:</span>
                  <span className="font-bold text-slate-700 text-right">{item.teacherName || 'Chưa rõ'}</span>
                  
                  <span className="text-slate-400">Kết quả đề xuất:</span>
                  <span className="font-bold text-slate-700 text-right">{RESULT_LABELS[item.evaluationResult]}</span>
                  
                  <span className="text-slate-400">Lịch học khuyến nghị:</span>
                  <span className="font-bold text-slate-700 text-right">
                    {item.sessionsPerWeek}b/tuần ({item.minutesPerSession}')
                  </span>
                </div>
              </div>

              {/* Khu vực duyệt & thưởng */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                {evalStatusOf(item) === 'approved' ? (
                  <div className="flex items-center justify-between gap-2">
                    {/* Nêu rõ THÁNG đã cộng — phiếu duyệt trễ tháng vẫn tra được đúng bảng lương.
                        Phiếu duyệt trước bản vá này chưa có rewardMonth -> suy ra từ ngày duyệt. */}
                    {(() => {
                      const rewardMonth = item.rewardMonth || monthOfTimestamp(item.approvedAt)
                      return (
                        <p className="text-xs font-bold text-emerald-700 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <Wallet className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>
                            Đã cộng {formatMoney(item.rewardAmount ?? EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)} vào lương
                          </span>
                          {rewardMonth && (
                            <Link
                              to={`/admin/payroll?month=${rewardMonth}`}
                              className="underline decoration-emerald-400 underline-offset-2 hover:text-emerald-900"
                              title="Mở bảng lương đúng tháng đã cộng khoản này"
                            >
                              tháng {rewardMonth}
                            </Link>
                          )}
                        </p>
                      )
                    })()}
                    <button
                      type="button"
                      disabled={processingId === item.id}
                      onClick={() => handleReject(item)}
                      className="text-[11px] font-bold text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Huỷ duyệt
                    </button>
                  </div>
                ) : evalStatusOf(item) === 'rejected' ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-rose-700 min-w-0 truncate">
                      Đã từ chối{item.rejectedReason ? `: ${item.rejectedReason}` : ''}
                    </p>
                    <Button size="sm" loading={processingId === item.id} onClick={() => handleApprove(item)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                      <Check className="w-3.5 h-3.5 mr-1" />Duyệt lại
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-600">
                      Duyệt để cộng <span className="font-bold text-emerald-600">{formatMoney(EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)}</span> cho gia sư
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={processingId === item.id}
                        onClick={() => handleReject(item)}
                        className="rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Từ chối
                      </button>
                      <Button size="sm" loading={processingId === item.id} onClick={() => handleApprove(item)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                        <Check className="w-3.5 h-3.5 mr-1" />Duyệt
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                <Button size="sm" variant="outline" onClick={() => copyShareLink(item.id)} className="gap-1 rounded-xl">
                  <Copy className="w-3.5 h-3.5" />
                  Link phụ huynh
                </Button>
                
                <a 
                  href={`/evaluation/${item.id}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-850 px-3 py-2 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl transition-all"
                >
                  Xem
                  <ExternalLink className="w-3 h-3" />
                </a>

                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(item)} className="p-2 min-h-0 min-w-0">
                    <Edit3 className="w-4 h-4 text-slate-500" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} className="p-2 min-h-0 min-w-0">
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Slide-out Edit Form Overlay */}
      {showForm && editingEval && (
        <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
          <div className="evaluation-sheet w-full max-w-2xl h-full flex flex-col shadow-2xl animate-slide-left sm:rounded-l-[28px]">
            
            {/* Form Header */}
            <div className="p-6 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  Chỉnh sửa phiếu đánh giá (ADMIN)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chỉnh sửa trực tiếp toàn bộ dữ liệu báo cáo đánh giá của học viên
                </p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:text-slate-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
              
              {/* Section 1: Học viên & Môn học */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-indigo-500 tracking-wider">I. Thông tin chung</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">Tên học sinh</label>
                    <Input 
                      placeholder="Nguyễn Văn A..." 
                      value={studentName}
                      onChange={(e: any) => setStudentName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">Tên gia sư phụ trách</label>
                    <Input 
                      placeholder="Họ tên gia sư..."
                      value={teacherName}
                      onChange={(e: any) => setTeacherName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-bold text-slate-600">Loại kĩ năng đánh giá</label>
                    <div className="flex gap-2 min-h-[40px]">
                      {(['english', 'other'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            setSubjectType(t)
                            if (t === 'other') setFormType('tutor')
                            else setFormType('adult_comm')
                          }}
                          className={`flex-1 rounded-xl text-sm font-semibold border transition-all ${
                            subjectType === t
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {t === 'english' ? 'Tiếng Anh' : 'Môn học khác'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Nhận xét buổi học</label>
                  <textarea
                    rows={4}
                    required
                    minLength={100}
                    value={lessonComment}
                    onChange={(event) => setLessonComment(event.target.value)}
                    className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-amber-300"
                    placeholder="Ví dụ: Học viên tiếp thu tốt, chủ động giao tiếp và cần luyện thêm phát âm..."
                  />
                  <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
                    <span className="text-slate-400">Tối thiểu 100 ký tự để nhận xét đủ rõ ràng.</span>
                    <span className={lessonComment.trim().length >= 100 ? 'text-emerald-600' : 'text-amber-700'}>
                      {lessonComment.trim().length}/100
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Biểu đồ kỹ năng */}
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <h3 className="text-xs font-black uppercase text-indigo-500 tracking-wider">II. Chấm điểm 7 kĩ năng (Thất giác 1-9)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  {subjectType === 'english' ? (
                    // English Skills
                    <>
                      {[
                        { key: 'listening', label: 'Nghe (Listening)' },
                        { key: 'speaking', label: 'Nói (Speaking)' },
                        { key: 'reading', label: 'Đọc - Hiểu (Reading)' },
                        { key: 'pronunciation', label: 'Phát âm (Pronunciation)' },
                        { key: 'vocabulary', label: 'Từ vựng (Vocabulary)' },
                        { key: 'grammar', label: 'Ngữ pháp (Grammar)' },
                        { key: 'communication', label: 'Phản xạ giao tiếp (Communication)' }
                      ].map((item) => (
                        <div key={item.key} className="space-y-1 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                          <div className="flex justify-between text-xs font-bold text-slate-600">
                            <span>{item.label}</span>
                            <span className="text-indigo-600 font-extrabold">{skills[item.key]} / 9</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="9"
                            step="1"
                            value={skills[item.key]}
                            onChange={(e) => setSkills({ ...skills, [item.key]: Number(e.target.value) })}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>
                      ))}
                    </>
                  ) : (
                    // Other Skills
                    <>
                      {[
                        { key: 'backgroundKnowledge', label: 'Kiến thức nền' },
                        { key: 'receptiveness', label: 'Mức độ tiếp thu' },
                        { key: 'analyticalThinking', label: 'Tư duy & Phân tích' },
                        { key: 'problemSolving', label: 'Kỹ năng giải bài tập' },
                        { key: 'application', label: 'Khả năng vận dụng' },
                        { key: 'concentration', label: 'Mức độ tập trung' },
                        { key: 'accuracy', label: 'Độ chính xác khi làm bài' }
                      ].map((item) => (
                        <div key={item.key} className="space-y-1 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                          <div className="flex justify-between text-xs font-bold text-slate-600">
                            <span>{item.label}</span>
                            <span className="text-indigo-600 font-extrabold">{skills[item.key]} / 9</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="9"
                            step="1"
                            value={skills[item.key]}
                            onChange={(e) => setSkills({ ...skills, [item.key]: Number(e.target.value) })}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Section 3: Lộ trình học đề xuất */}
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <h3 className="text-xs font-black uppercase text-indigo-500 tracking-wider">III. Chọn Lộ trình học</h3>
                
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Hình thức / Form lộ trình đề xuất</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {subjectType === 'english' ? (
                      <>
                        <option value="adult_comm">{EVALUATION_FORM_LABELS.adult_comm}</option>
                        <option value="kids_a">{EVALUATION_FORM_LABELS.kids_a}</option>
                        <option value="kids_b">{EVALUATION_FORM_LABELS.kids_b}</option>
                        <option value="academic">{EVALUATION_FORM_LABELS.academic}</option>
                      </>
                    ) : (
                      <option value="tutor">Gia sư các môn học khác</option>
                    )}
                  </select>
                </div>

                {/* Sub-form checkboxes */}
                {formType === 'tutor' ? (
                  /* Tutor checklist & text inputs */
                  <div className="space-y-4 bg-slate-50/50 p-4 border border-slate-150 rounded-2xl">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cấu hình chi tiết Môn học Gia sư</p>

                    <fieldset className="space-y-3">
                      <legend className="text-xs font-bold text-slate-600">Kỹ năng cần tập trung</legend>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {TUTOR_SKILL_OPTIONS.map((skill) => {
                          const isChecked = tutorSkills.includes(skill)
                          return (
                            <label key={skill} className="flex items-center gap-3 min-h-[46px] p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-indigo-50/40">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(event) => setTutorSkills((current) => (
                                  event.target.checked
                                    ? [...current, skill]
                                    : current.filter((item) => item !== skill)
                                ))}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-xs font-bold text-slate-700">{skill}</span>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                    
                    <div className="space-y-3">
                      {[
                        { key: 'moet', label: 'Chương trình Bộ Giáo dục & Đào tạo (Môn)' },
                        { key: 'tichHop', label: 'Chương trình Tích hợp (Môn)' },
                        { key: 'nangCao', label: 'Chương trình Nâng cao & Học sinh Giỏi (Môn)' },
                        { key: 'songNgu', label: 'Chương trình Song ngữ (Môn)' },
                        { key: 'quocTe', label: 'Chương trình Quốc tế (IGCSE/IB/AP/SAT... - Môn)' },
                        { key: 'khac', label: 'Khác (Môn / Ghi chú thêm)' }
                      ].map((item) => (
                        <div key={item.key} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          <span className="text-xs font-semibold text-slate-600 sm:w-1/2">{item.label}</span>
                          <Input 
                            placeholder="Tên môn học (Ví dụ: Toán, Lý...)" 
                            value={tutorSubjects[item.key]}
                            onChange={(e: any) => setTutorSubjects({ ...tutorSubjects, [item.key]: e.target.value })}
                            className="flex-1"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* English levels checkboxes */
                  <div className="space-y-4 bg-slate-50/50 p-4 border border-slate-150 rounded-2xl">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cấp độ/Level đề xuất</p>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {getCourseOptions(formType).map((option) => {
                        const isChecked = selectedLevels.includes(option.label)
                        return (
                          <div key={option.label} className="overflow-hidden bg-white border border-slate-200 rounded-xl">
                            <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-amber-50/60">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLevels((current) => [...current, option.label])
                                  } else {
                                    setSelectedLevels((current) => current.filter((item) => item !== option.label))
                                    setSelectedCourseLevels((current) => {
                                      const next = { ...current }
                                      delete next[option.label]
                                      return next
                                    })
                                  }
                                }}
                                className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-400"
                              />
                              <span className="min-w-0 text-xs font-bold text-slate-700">{option.label}</span>
                            </label>
                            {isChecked && (
                              <div className="px-4 pb-4 border-t border-amber-100">
                                {option.description && <p className="pt-3 text-xs leading-5 text-slate-600">{option.description}</p>}
                                {option.levelOptions?.length ? (
                                  <div className="pt-3">
                                    <p className="mb-2 text-xs font-bold text-slate-700">Chọn cấp độ bắt đầu đề xuất</p>
                                    <div className="flex flex-wrap gap-2">
                                      {option.levelOptions.map((level) => {
                                        const isRecommended = selectedCourseLevels[option.label] === level.value
                                        return (
                                          <button
                                            key={level.value}
                                            type="button"
                                            onClick={() => setSelectedCourseLevels((current) => ({ ...current, [option.label]: level.value }))}
                                            className={`min-h-9 rounded-full border px-3 text-xs font-extrabold transition-colors ${isRecommended ? 'evaluation-primary' : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50'}`}
                                            aria-pressed={isRecommended}
                                          >
                                            {level.label}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="pt-3 text-xs font-medium text-slate-500">Giáo trình này không chia thành cấp độ khởi đầu riêng.</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="space-y-1 mt-4">
                      <label className="text-xs font-bold text-slate-600">Giáo trình riêng theo yêu cầu (Ghi thêm nếu có)</label>
                      <Input 
                        placeholder="Nhập giáo trình riêng..." 
                        value={customLevelText}
                        onChange={(e: any) => setCustomLevelText(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Kết luận & Khuyến nghị */}
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <h3 className="text-xs font-black uppercase text-indigo-500 tracking-wider">IV. Kết luận & Khuyến nghị</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">Kết quả đánh giá</label>
                    <select
                      value={evaluationResult}
                      onChange={(e) => setEvaluationResult(e.target.value as any)}
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="direct">Phù hợp đăng ký ngay</option>
                      <option value="more_advice">Cần tư vấn thêm lộ trình</option>
                      <option value="re_evaluate">Hẹn đánh giá lại sau</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">Tần suất học đề xuất</label>
                    <select
                      value={sessionsPerWeek}
                      onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={2}>02 buổi/tuần</option>
                      <option value={3}>03 buổi/tuần (Khuyến nghị)</option>
                      <option value={4}>04 buổi/tuần</option>
                      <option value={5}>05 buổi/tuần</option>
                      <option value={6}>06 buổi/tuần</option>
                      <option value={7}>07 buổi/tuần</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">Thời lượng mỗi buổi</label>
                    <select
                      value={minutesPerSession}
                      onChange={(e) => setMinutesPerSession(Number(e.target.value))}
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={25}>25 phút</option>
                      <option value={50}>50 phút (Khuyến nghị)</option>
                      <option value={100}>100 phút</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">Ảnh kỷ niệm buổi học thử (Gia sư & Học sinh)</label>
                  <div className="flex flex-col sm:flex-row gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-150">
                    <input 
                      type="file" 
                      accept="image/*" 
                      id="eval-photo-upload-admin"
                      className="hidden" 
                      onChange={async (e: any) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          try {
                            setCompressing(true)
                            const base64 = await compressImage(file)
                            setImageUrl(base64)
                          } catch (err) {
                            console.error(err)
                            toast.error('Lỗi khi nén ảnh')
                          } finally {
                            setCompressing(false)
                          }
                        }
                      }}
                    />
                    <label 
                      htmlFor="eval-photo-upload-admin"
                      className="cursor-pointer bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm"
                    >
                      {compressing ? 'Đang nén ảnh...' : 'Chọn ảnh từ thiết bị'}
                    </label>
                    {imageUrl && (
                      <div className="relative w-20 h-20 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
                        <img src={imageUrl} alt="Lớp học" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="absolute top-0.5 right-0.5 p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Mục tiêu sau khóa học (Tự do chỉnh sửa)</label>
                  <textarea
                    rows={6}
                    value={postCourseGoals}
                    onChange={(e: any) => setPostCourseGoals(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Nhập các mục tiêu cụ thể..."
                  />
                </div>
              </div>

            </form>

            {/* Form Footer */}
            <div className="evaluation-sheet-footer p-4 sm:p-6 border-t border-slate-200 flex justify-end gap-2 shrink-0 bg-slate-50">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">
                Hủy
              </Button>
              <Button type="button" onClick={handleSave} className="evaluation-primary rounded-2xl">
                Lưu kết quả
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
