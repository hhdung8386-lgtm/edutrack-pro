import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { toast } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { ClipboardCheck, Plus, Copy, Trash2, Edit3, X, ExternalLink } from 'lucide-react'
import {
  getCourseDescriptionForLanguage,
  getCourseOptions,
  getEvaluationFormLabel,
  getTutorSkillLabel,
  normalizeCourseLabel,
  normalizeSelectedCourseLevels,
  TUTOR_SKILL_OPTIONS,
  type EvaluationDisplayLanguage,
  type EvaluationFormType,
} from '@/lib/evaluationOptions'
import { EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY, formatMoney } from '@/lib/constants'

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
  /** Phiếu cũ chưa có field này -> hiểu là đang chờ admin duyệt. */
  status?: 'pending' | 'approved' | 'rejected'
  rejectedReason?: string
  rewardAmount?: number
}

type EvalStatus = 'pending' | 'approved' | 'rejected'
const evalStatusOf = (e: Evaluation): EvalStatus => e.status === 'approved' ? 'approved' : e.status === 'rejected' ? 'rejected' : 'pending'

const RESULT_LABELS: Record<EvaluationDisplayLanguage, Record<Evaluation['evaluationResult'], string>> = {
  vi: {
    direct: 'Phù hợp đăng ký ngay',
    more_advice: 'Cần tư vấn thêm lộ trình',
    re_evaluate: 'Hẹn đánh giá lại sau',
  },
  en: {
    direct: 'Ready to enroll',
    more_advice: 'Needs further learning-path advice',
    re_evaluate: 'Schedule another evaluation',
  },
}

const DEFAULT_GOALS: Record<EvaluationDisplayLanguage, Record<EvaluationFormType, string>> = {
  vi: {
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
- Xây dựng nền tảng vững chắc để tiếp tục ôn luyện và chinh phục mục tiêu điểm số các kỳ thi quốc tế.`,
  },
  en: {
    adult_comm: `After completing the recommended learning path, the student will be able to:
- Communicate more confidently in everyday and workplace situations.
- Use a wider range of sentence structures and topic-appropriate vocabulary.
- Improve pronunciation, intonation and listening comprehension.
- Respond more naturally without relying heavily on translation.
- Build a foundation for advanced communication or Business English courses.`,
    tutor: `After completing the recommended learning path, the student will be able to:
- Consolidate and master the core knowledge in their school curriculum.
- Strengthen mathematical, scientific or social-science thinking and test analysis.
- Improve school performance and prepare effectively for term or transition exams.
- Develop independent study habits, concentration and accurate test-taking skills.`,
    kids_a: `After completing the recommended learning path, the student will be able to:
- Use topic-based vocabulary and simple communication patterns confidently.
- Respond naturally in listening and speaking activities with Vietnamese or international tutors.
- Improve short-text reading comprehension and basic English writing.
- Build enthusiasm for English and a strong phonics foundation.`,
    kids_b: `After completing the recommended learning path, the student will be able to:
- Communicate more confidently in everyday and learning situations.
- Use a wider range of sentence structures and topic-based vocabulary.
- Improve pronunciation, intonation and listening comprehension.
- Respond more naturally without relying heavily on translation.
- Build a foundation for higher-level communication courses.`,
    academic: `After completing the recommended learning path, the student will be able to:
- Communicate confidently in everyday, academic and professional situations.
- Use advanced structures and a broader exam-focused vocabulary.
- Improve accurate pronunciation, intonation and academic listening comprehension.
- Respond more naturally without relying heavily on translation.
- Build a strong foundation for international exam preparation and target scores.`,
  },
}

const DEFAULT_CURRICULUM: Record<EvaluationDisplayLanguage, Record<EvaluationFormType, string>> = {
  vi: {
    adult_comm: 'Topic Conversation – Intermediate',
    tutor: 'Chương trình SGK chuẩn Bộ GD&ĐT',
    kids_a: '123English Kids Curriculum',
    kids_b: 'Magic Phonics & Smart Kids Series',
    academic: 'Cambridge Standard Prep / IELTS Pathway',
  },
  en: {
    adult_comm: 'Topic Conversation – Intermediate',
    tutor: 'Vietnamese MOET Standard Curriculum',
    kids_a: '123English Kids Curriculum',
    kids_b: 'Magic Phonics & Smart Kids Series',
    academic: 'Cambridge Standard Prep / IELTS Pathway',
  },
}

export default function TeacherEvaluationsPage() {
  const { teacherId } = useAuthStore()
  const { lang } = useLanguageStore()
  const tr = (vi: string, en: string) => lang === 'vi' ? vi : en
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEval, setEditingEval] = useState<Evaluation | null>(null)

  // Form State fields
  const [studentName, setStudentName] = useState('')
  const [lessonComment, setLessonComment] = useState('')
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
  // Capture the language used when a form is opened. Switching the global
  // language while typing only translates UI copy; it never replaces form data.
  const [formLanguage, setFormLanguage] = useState<EvaluationDisplayLanguage>(lang)
  const [proposedCurriculum, setProposedCurriculum] = useState(DEFAULT_CURRICULUM[lang].adult_comm)
  const [postCourseGoals, setPostCourseGoals] = useState(DEFAULT_GOALS[lang].adult_comm)
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
    if (!teacherId) {
      queueMicrotask(() => setLoading(false))
      return
    }
    const q = query(collection(db, 'evaluations'), where('teacherId', '==', teacherId))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Evaluation))
        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        setEvaluations(items)
        setLoading(false)
      },
      (error) => {
        console.error('Unable to load teacher evaluations:', error)
        setLoading(false)
        toast.error(lang === 'vi' ? 'Không thể tải danh sách đánh giá' : 'Unable to load evaluations')
      },
    )
    return unsub
  }, [teacherId, lang])

  // Automatically update prefilled goals and curriculum when formType changes
  useEffect(() => {
    if (!editingEval) {
      setProposedCurriculum(DEFAULT_CURRICULUM[formLanguage][formType])
      setPostCourseGoals(DEFAULT_GOALS[formLanguage][formType])
      setSelectedLevels([])
      setSelectedCourseLevels({})
      setCustomLevelText('')
      setTutorSkills([])
      
      // Auto adjust default duration per session based on selected formType recommendations
      if (formType === 'kids_a' || formType === 'kids_b') {
        setMinutesPerSession(25)
      } else {
        setMinutesPerSession(50)
      }
    }
  }, [formType, editingEval, formLanguage])

  const handleOpenCreate = () => {
    setFormLanguage(lang)
    setEditingEval(null)
    setStudentName('')
    setLessonComment('')
    setSubjectType('english')
    setSkills({
      listening: 5, speaking: 5, reading: 5, pronunciation: 5, vocabulary: 5, grammar: 5, communication: 5,
      backgroundKnowledge: 5, receptiveness: 5, analyticalThinking: 5, problemSolving: 5, application: 5, concentration: 5, accuracy: 5
    })
    setFormType('adult_comm')
    setSelectedLevels([])
    setSelectedCourseLevels({})
    setCustomLevelText('')
    setTutorSkills([])
    setTutorSubjects({ moet: '', tichHop: '', nangCao: '', songNgu: '', quocTe: '', khac: '' })
    setEvaluationResult('direct')
    setSessionsPerWeek(3)
    setMinutesPerSession(50)
    setProposedCurriculum(DEFAULT_CURRICULUM[lang].adult_comm)
    setPostCourseGoals(DEFAULT_GOALS[lang].adult_comm)
    setImageUrl('')
    setShowForm(true)
  }

  const handleOpenEdit = (evalDoc: Evaluation) => {
    setFormLanguage(lang)
    setEditingEval(evalDoc)
    setStudentName(evalDoc.studentName)
    setLessonComment(evalDoc.lessonComment || '')
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
      toast.error(tr('Vui lòng nhập tên học viên', 'Please enter the student name'))
      return
    }
    if (lessonComment.trim().length < 100) {
      toast.error(tr('Nhận xét buổi học phải có ít nhất 100 ký tự', 'The lesson feedback must contain at least 100 characters'))
      return
    }
    const courseMissingStartLevel = formType === 'tutor'
      ? undefined
      : getCourseOptions(formType).find((course) => (
        selectedLevels.includes(course.label)
        && course.levelOptions?.length
        && selectedCourseLevels[course.label] === undefined
      ))
    if (courseMissingStartLevel) {
      toast.error(tr(
        `Vui lòng chọn cấp độ bắt đầu cho ${courseMissingStartLevel.label}`,
        `Please select a recommended starting level for ${courseMissingStartLevel.label}`,
      ))
      return
    }
    // Ảnh buổi học là bắt buộc: phải có mặt cả gia sư và học sinh.
    if (!imageUrl) {
      toast.error(tr(
        'Vui lòng tải lên ảnh buổi học có mặt gia sư và học sinh',
        'Please upload a lesson photo showing both the teacher and the student',
      ))
      return
    }

    const payload: Partial<Evaluation> = {
      studentName: studentName.trim(),
      lessonComment: lessonComment.trim(),
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
      if (editingEval) {
        await updateDoc(doc(db, 'evaluations', editingEval.id), payload)
        toast.success(tr('Đã cập nhật phiếu đánh giá', 'Evaluation updated'))
      } else {
        // Find teacher display name
        const teacherSnap = await getDoc(doc(db, 'teachers', teacherId!))
        const teacherName = teacherSnap.exists() ? (teacherSnap.data()?.name || 'Gia sư') : 'Gia sư'
        
        await addDoc(collection(db, 'evaluations'), {
          ...payload,
          teacherId,
          teacherName,
          // Phiếu mới luôn chờ admin duyệt; duyệt xong hệ thống cộng thưởng vào lương.
          status: 'pending',
          createdAt: serverTimestamp(),
        })
        toast.success(tr(
          'Đã gửi phiếu đánh giá — chờ admin duyệt để được cộng thưởng',
          'Evaluation submitted — the reward will be added after admin approval',
        ))
      }
      setShowForm(false)
    } catch (err) {
      console.error(err)
      toast.error(tr('Lỗi khi lưu phiếu đánh giá', 'Unable to save the evaluation'))
    }
  }

  const handleDelete = async (id: string) => {
    // Phiếu đã duyệt đã phát sinh khoản thưởng trong bảng lương -> không cho gia sư
    // tự xoá, tránh để lại bản ghi lương mồ côi không đối chiếu được.
    const target = evaluations.find((e) => e.id === id)
    if (target && evalStatusOf(target) === 'approved') {
      toast.warning(tr(
        'Phiếu đã được duyệt và đã cộng thưởng nên không thể xoá. Vui lòng liên hệ admin nếu cần điều chỉnh.',
        'This evaluation has been approved and rewarded, so it cannot be deleted. Contact an admin if it needs to be changed.',
      ))
      return
    }
    if (!confirm(tr('Bạn có chắc chắn muốn xóa phiếu đánh giá này?', 'Are you sure you want to delete this evaluation?'))) return
    try {
      await deleteDoc(doc(db, 'evaluations', id))
      toast.success(tr('Đã xóa phiếu đánh giá', 'Evaluation deleted'))
    } catch (err) {
      console.error(err)
      toast.error(tr('Lỗi khi xóa phiếu đánh giá', 'Unable to delete the evaluation'))
    }
  }

  const copyShareLink = async (id: string) => {
    const url = `${window.location.origin}/evaluation/${id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(tr('Đã sao chép link chia sẻ cho phụ huynh', 'Parent share link copied'))
    } catch (error) {
      console.error('Unable to copy evaluation link:', error)
      toast.error(tr('Không thể sao chép liên kết', 'Unable to copy the link'))
    }
  }

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
      <div className="flex flex-col items-stretch gap-4 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 shrink-0" />
            {tr('Đánh giá học sinh mới', 'New student evaluations')}
          </h1>
          <p className="text-xs leading-5 text-slate-500 mt-1">
            {tr(
              'Quản lý và thiết lập biểu đồ năng lực kèm đề xuất lộ trình học cho học sinh mới',
              'Create skill profiles and recommended learning paths for new students',
            )}
          </p>
          <p className="mt-2 inline-block rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold leading-5 text-emerald-700">
            {tr(
              `Mỗi phiếu đánh giá được admin duyệt sẽ được cộng ${formatMoney(EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)} vào lương của bạn`,
              `Each admin-approved evaluation adds ${formatMoney(EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)} to your payroll`,
            )}
          </p>
        </div>
        <Button onClick={handleOpenCreate} fullWidth className="evaluation-primary min-h-12 shrink-0 rounded-2xl px-5 font-bold whitespace-nowrap sm:w-auto sm:min-h-[44px]">
          <Plus className="w-5 h-5" />
          {tr('Tạo đánh giá mới', 'Create evaluation')}
        </Button>
      </div>

      {/* Main List */}
      {evaluations.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-slate-200">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-800 font-bold text-sm">{tr('Chưa có kết quả đánh giá nào', 'No evaluations yet')}</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {tr(
              'Nhấp nút "Tạo đánh giá mới" ở góc trên bên phải để bắt đầu thiết lập phiếu đánh giá đầu tiên.',
              'Select “Create evaluation” above to prepare the first student evaluation.',
            )}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evaluations.map((item) => (
            <Card key={item.id} className="p-6 border-slate-200/80 hover:border-indigo-200/60 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-extrabold text-slate-850 text-base">{item.studentName}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      {getEvaluationFormLabel(item.formType, lang)}
                    </p>
                  </div>
                  <Badge variant={item.type === 'english' ? 'info' : 'warning'}>
                    {item.type === 'english' ? tr('Tiếng Anh', 'English') : tr('Khác', 'Other subject')}
                  </Badge>
                </div>

                {/* Trạng thái duyệt & tiền thưởng */}
                {(() => {
                  const st = evalStatusOf(item)
                  if (st === 'approved') return (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-xs font-bold text-emerald-700">
                        {tr(
                          `✓ Đã duyệt — cộng ${formatMoney(item.rewardAmount ?? EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)} vào lương`,
                          `✓ Approved — ${formatMoney(item.rewardAmount ?? EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)} added to payroll`,
                        )}
                      </p>
                    </div>
                  )
                  if (st === 'rejected') return (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-xs font-bold text-rose-700">
                        {tr('Bị từ chối', 'Rejected')}{item.rejectedReason ? `: ${item.rejectedReason}` : ''}
                      </p>
                      <p className="text-[11px] text-rose-600 mt-0.5">
                        {tr('Bạn có thể chỉnh sửa và liên hệ admin duyệt lại.', 'You may edit it and ask an admin to review it again.')}
                      </p>
                    </div>
                  )
                  return (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-bold text-amber-700">
                        {tr(
                          `Chờ admin duyệt — được cộng ${formatMoney(EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)} sau khi duyệt`,
                          `Awaiting admin approval — ${formatMoney(EVALUATION_REWARD_AMOUNT, EVALUATION_REWARD_CURRENCY)} will be added after approval`,
                        )}
                      </p>
                    </div>
                  )
                })()}

                <div className="mt-4 grid grid-cols-2 gap-y-2 text-xs border-t border-slate-100 pt-4">
                  <span className="text-slate-400">{tr('Kết quả đề xuất:', 'Recommendation:')}</span>
                  <span className="font-bold text-slate-700 text-right">{RESULT_LABELS[lang][item.evaluationResult]}</span>
                  
                  <span className="text-slate-400">{tr('Lịch học khuyến nghị:', 'Recommended schedule:')}</span>
                  <span className="font-bold text-slate-700 text-right">
                    {lang === 'vi'
                      ? `${item.sessionsPerWeek}b/tuần (${item.minutesPerSession}')`
                      : `${item.sessionsPerWeek} sessions/week (${item.minutesPerSession} min)`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100">
                <Button size="sm" variant="outline" onClick={() => copyShareLink(item.id)} className="gap-1 rounded-xl">
                  <Copy className="w-3.5 h-3.5" />
                  {tr('Link phụ huynh', 'Parent link')}
                </Button>
                
                <a 
                  href={`/evaluation/${item.id}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-850 px-3 py-2 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl transition-all"
                  aria-label={tr(`Xem đánh giá của ${item.studentName}`, `View ${item.studentName}'s evaluation`)}
                >
                  {tr('Xem', 'View')}
                  <ExternalLink className="w-3 h-3" />
                </a>

                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(item)} className="p-2 min-h-0 min-w-0" aria-label={tr('Chỉnh sửa phiếu đánh giá', 'Edit evaluation')}>
                    <Edit3 className="w-4 h-4 text-slate-500" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} className="p-2 min-h-0 min-w-0" aria-label={tr('Xóa phiếu đánh giá', 'Delete evaluation')}>
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Slide-out Form Overlay */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
          <div className="evaluation-sheet w-full max-w-2xl h-full flex flex-col shadow-2xl animate-slide-left sm:rounded-l-[28px]" role="dialog" aria-modal="true" aria-labelledby="teacher-evaluation-form-title">
            
            {/* Form Header */}
            <div className="p-6 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h2 id="teacher-evaluation-form-title" className="text-lg font-black text-slate-900">
                  {editingEval
                    ? tr('Cập nhật phiếu đánh giá', 'Update evaluation')
                    : tr('Tạo phiếu đánh giá mới', 'Create a new evaluation')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {tr(
                    'Điền các thông tin và kỹ năng của học viên để tạo báo cáo năng lực',
                    'Enter the student’s information and skill levels to create a competency report',
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:text-slate-700 transition-colors" aria-label={tr('Đóng biểu mẫu', 'Close form')}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
              
              {/* Section 1: Học viên & Môn học */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-indigo-500 tracking-wider">{tr('I. Thông tin học viên', 'I. Student information')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">{tr('Tên học sinh mới', 'New student name')}</label>
                    <Input 
                      placeholder={tr('Ví dụ: Nguyễn Văn A...', 'Example: Alex Nguyen...')}
                      value={studentName}
                      onChange={(e: any) => setStudentName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">{tr('Loại kỹ năng đánh giá', 'Evaluation subject')}</label>
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
                          aria-pressed={subjectType === t}
                        >
                          {t === 'english' ? tr('Tiếng Anh', 'English') : tr('Môn học khác', 'Other subject')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">{tr('Nhận xét buổi học', 'Lesson feedback')}</label>
                  <textarea
                    rows={4}
                    required
                    minLength={100}
                    value={lessonComment}
                    onChange={(event) => setLessonComment(event.target.value)}
                    className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-amber-300"
                    placeholder={tr(
                      'Ví dụ: Học viên tiếp thu tốt, chủ động giao tiếp và cần luyện thêm phát âm...',
                      'Example: The student learned quickly, communicated proactively and needs more pronunciation practice...',
                    )}
                  />
                  <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
                    <span className="text-slate-400">{tr('Tối thiểu 100 ký tự để nhận xét đủ rõ ràng.', 'Write at least 100 characters to provide useful feedback.')}</span>
                    <span className={lessonComment.trim().length >= 100 ? 'text-emerald-600' : 'text-amber-700'}>
                      {lessonComment.trim().length}/100
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Biểu đồ kỹ năng */}
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <h3 className="text-xs font-black uppercase text-indigo-500 tracking-wider">{tr('II. Chấm điểm 7 kĩ năng (Thất giác 1-9)', 'II. Rate 7 skills (1–9 radar scale)')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  {subjectType === 'english' ? (
                    // English Skills
                    <>
                      {[
                        { key: 'listening', label: tr('Nghe (Listening)', 'Listening') },
                        { key: 'speaking', label: tr('Nói (Speaking)', 'Speaking') },
                        { key: 'reading', label: tr('Đọc - Hiểu (Reading)', 'Reading comprehension') },
                        { key: 'pronunciation', label: tr('Phát âm (Pronunciation)', 'Pronunciation') },
                        { key: 'vocabulary', label: tr('Từ vựng (Vocabulary)', 'Vocabulary') },
                        { key: 'grammar', label: tr('Ngữ pháp (Grammar)', 'Grammar') },
                        { key: 'communication', label: tr('Phản xạ giao tiếp (Communication)', 'Communication response') }
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
                            aria-label={item.label}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>
                      ))}
                    </>
                  ) : (
                    // Other Skills
                    <>
                      {[
                        { key: 'backgroundKnowledge', label: tr('Kiến thức nền', 'Background knowledge') },
                        { key: 'receptiveness', label: tr('Mức độ tiếp thu', 'Receptiveness') },
                        { key: 'analyticalThinking', label: tr('Tư duy & Phân tích', 'Analytical thinking') },
                        { key: 'problemSolving', label: tr('Kỹ năng giải bài tập', 'Problem solving') },
                        { key: 'application', label: tr('Khả năng vận dụng', 'Application') },
                        { key: 'concentration', label: tr('Mức độ tập trung', 'Concentration') },
                        { key: 'accuracy', label: tr('Độ chính xác khi làm bài', 'Accuracy') }
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
                            aria-label={item.label}
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
                <h3 className="text-xs font-black uppercase text-indigo-500 tracking-wider">{tr('III. Chọn Lộ trình học', 'III. Select a learning path')}</h3>
                
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">{tr('Hình thức / Form lộ trình đề xuất', 'Recommended program type')}</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {subjectType === 'english' ? (
                      <>
                        <option value="adult_comm">{getEvaluationFormLabel('adult_comm', lang)}</option>
                        <option value="kids_a">{getEvaluationFormLabel('kids_a', lang)}</option>
                        <option value="kids_b">{getEvaluationFormLabel('kids_b', lang)}</option>
                        <option value="academic">{getEvaluationFormLabel('academic', lang)}</option>
                      </>
                    ) : (
                      <option value="tutor">{tr('Gia sư các môn học khác', 'Other-subject tutoring')}</option>
                    )}
                  </select>
                </div>

                {/* Sub-form checkboxes */}
                {formType === 'tutor' ? (
                  /* Tutor checklist & text inputs */
                  <div className="space-y-4 bg-slate-50/50 p-4 border border-slate-150 rounded-2xl">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{tr('Cấu hình chi tiết Môn học Gia sư', 'Tutoring subject details')}</p>

                    <fieldset className="space-y-3">
                      <legend className="text-xs font-bold text-slate-600">{tr('Kỹ năng cần tập trung', 'Skills to focus on')}</legend>
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
                              <span className="text-xs font-bold text-slate-700">{getTutorSkillLabel(skill, lang)}</span>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                    
                    <div className="space-y-3">
                      {[
                        { key: 'moet', label: tr('Chương trình Bộ Giáo dục & Đào tạo (Môn)', 'MOET curriculum (Subject)') },
                        { key: 'tichHop', label: tr('Chương trình Tích hợp (Môn)', 'Integrated curriculum (Subject)') },
                        { key: 'nangCao', label: tr('Chương trình Nâng cao & Học sinh Giỏi (Môn)', 'Advanced/Gifted curriculum (Subject)') },
                        { key: 'songNgu', label: tr('Chương trình Song ngữ (Môn)', 'Bilingual curriculum (Subject)') },
                        { key: 'quocTe', label: tr('Chương trình Quốc tế (IGCSE/IB/AP/SAT... - Môn)', 'International curriculum — IGCSE/IB/AP/SAT (Subject)') },
                        { key: 'khac', label: tr('Khác (Môn / Ghi chú thêm)', 'Other (Subject/additional notes)') }
                      ].map((item) => (
                        <div key={item.key} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          <span className="text-xs font-semibold text-slate-600 sm:w-1/2">{item.label}</span>
                          <Input 
                            placeholder={tr('Tên môn học (Ví dụ: Toán, Lý...)', 'Subject name (for example: Math, Physics...)')}
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
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{tr('Cấp độ/Level đề xuất', 'Recommended level')}</p>
                    
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
                                {getCourseDescriptionForLanguage(option.label, lang) && (
                                  <p className="pt-3 text-xs leading-5 text-slate-600">{getCourseDescriptionForLanguage(option.label, lang)}</p>
                                )}
                                {option.levelOptions?.length ? (
                                  <div className="pt-3">
                                    <p className="mb-2 text-xs font-bold text-slate-700">{tr('Chọn cấp độ bắt đầu đề xuất', 'Select the recommended starting level')}</p>
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
                                  <p className="pt-3 text-xs font-medium text-slate-500">{tr('Giáo trình này không chia thành cấp độ khởi đầu riêng.', 'This curriculum does not use separate starting levels.')}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="space-y-1 mt-4">
                      <label className="text-xs font-bold text-slate-600">{tr('Giáo trình riêng theo yêu cầu (Ghi thêm nếu có)', 'Custom requested curriculum (optional)')}</label>
                      <Input 
                        placeholder={tr('Nhập giáo trình riêng...', 'Enter a custom curriculum...')}
                        value={customLevelText}
                        onChange={(e: any) => setCustomLevelText(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Kết luận & Khuyến nghị */}
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <h3 className="text-xs font-black uppercase text-indigo-500 tracking-wider">{tr('IV. Kết luận & Khuyến nghị', 'IV. Conclusion and recommendation')}</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">{tr('Kết quả đánh giá', 'Evaluation result')}</label>
                    <select
                      value={evaluationResult}
                      onChange={(e) => setEvaluationResult(e.target.value as any)}
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="direct">{RESULT_LABELS[lang].direct}</option>
                      <option value="more_advice">{RESULT_LABELS[lang].more_advice}</option>
                      <option value="re_evaluate">{RESULT_LABELS[lang].re_evaluate}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">{tr('Tần suất học đề xuất', 'Recommended frequency')}</label>
                    <select
                      value={sessionsPerWeek}
                      onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {[2, 3, 4, 5, 6, 7].map((count) => (
                        <option key={count} value={count}>
                          {lang === 'vi'
                            ? `${String(count).padStart(2, '0')} buổi/tuần${count === 3 ? ' (Khuyến nghị)' : ''}`
                            : `${String(count).padStart(2, '0')} sessions/week${count === 3 ? ' (Recommended)' : ''}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600">{tr('Thời lượng mỗi buổi', 'Session duration')}</label>
                    <select
                      value={minutesPerSession}
                      onChange={(e) => setMinutesPerSession(Number(e.target.value))}
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={25}>{tr('25 phút', '25 minutes')}</option>
                      <option value={50}>{tr('50 phút (Khuyến nghị)', '50 minutes (Recommended)')}</option>
                      <option value={100}>{tr('100 phút', '100 minutes')}</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">
                    {tr('Ảnh buổi học', 'Lesson photo')} <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-[11px] font-medium leading-5 text-slate-500">
                    {lang === 'vi' ? (
                      <>Bắt buộc tải lên ảnh chụp buổi học có mặt cả <strong className="font-bold text-slate-700">gia sư và học sinh</strong>. Ảnh này được gửi kèm phiếu đánh giá cho phụ huynh.</>
                    ) : (
                      <>Upload a lesson photo showing <strong className="font-bold text-slate-700">both the teacher and the student</strong>. This photo is included in the parent evaluation.</>
                    )}
                  </p>
                  <div
                    className={`flex flex-col sm:flex-row gap-4 items-center rounded-2xl border p-4 ${
                      imageUrl ? 'border-slate-150 bg-slate-50' : 'border-rose-200 bg-rose-50/60'
                    }`}
                  >
                    <input 
                      type="file" 
                      accept="image/*" 
                      id="eval-photo-upload"
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
                            toast.error(tr('Lỗi khi nén ảnh', 'Unable to process the image'))
                          } finally {
                            setCompressing(false)
                          }
                        }
                      }}
                    />
                    <label 
                      htmlFor="eval-photo-upload"
                      className="cursor-pointer bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm"
                    >
                      {compressing
                        ? tr('Đang nén ảnh...', 'Processing image...')
                        : imageUrl
                          ? tr('Đổi ảnh khác', 'Choose another image')
                          : tr('Tải ảnh buổi học từ máy', 'Upload lesson photo')}
                    </label>
                    {imageUrl && (
                      <div className="relative w-20 h-20 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
                        <img src={imageUrl} alt={tr('Ảnh buổi học', 'Lesson preview')} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="absolute top-0.5 right-0.5 p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-colors"
                          aria-label={tr('Gỡ ảnh buổi học', 'Remove lesson photo')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">{tr('Mục tiêu sau khóa học (Tự do chỉnh sửa)', 'Post-course goals (Editable)')}</label>
                  <textarea
                    rows={6}
                    value={postCourseGoals}
                    onChange={(e: any) => setPostCourseGoals(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={tr('Nhập các mục tiêu cụ thể...', 'Enter specific learning goals...')}
                  />
                </div>
              </div>

            </form>

            {/* Form Footer */}
            <div className="evaluation-sheet-footer p-4 sm:p-6 border-t border-slate-200 flex justify-end gap-2 shrink-0 bg-slate-50">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">
                {tr('Hủy', 'Cancel')}
              </Button>
              <Button type="button" onClick={handleSave} className="evaluation-primary rounded-2xl">
                {tr('Lưu kết quả', 'Save evaluation')}
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
