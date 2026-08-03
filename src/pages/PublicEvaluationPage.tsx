import { useEffect, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import { Button } from '@/components/ui/Button'
import { AudioLines, BookOpen, BookOpenCheck, CalendarDays, ChartNoAxesCombined, CheckCircle2, ClipboardList, Headphones, MessageCircle, NotebookPen, Printer, UsersRound } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { EVALUATION_ROUTE_TITLES, getCourseOption, normalizeCourseLabel, TUTOR_SKILL_OPTIONS, type CourseOption, type EvaluationFormType } from '@/lib/evaluationOptions'

interface Evaluation {
  id: string
  studentName: string
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
  imageUrl?: string
}

const RESULT_LABELS = {
  direct: 'Phù hợp đăng ký ngay',
  more_advice: 'Cần tư vấn thêm về lộ trình học',
  re_evaluate: 'Hẹn đánh giá lại sau khi ôn tập',
}

const ENGLISH_SKILLS_MAP = {
  listening: 'Nghe (Listening)',
  speaking: 'Nói (Speaking)',
  reading: 'Đọc - Hiểu (Reading)',
  pronunciation: 'Phát âm (Pronunciation)',
  vocabulary: 'Từ vựng (Vocabulary)',
  grammar: 'Ngữ pháp (Grammar)',
  communication: 'Phản xạ giao tiếp (Communication)',
}

const OTHER_SKILLS_MAP = {
  backgroundKnowledge: 'Kiến thức nền',
  receptiveness: 'Mức độ tiếp thu',
  analyticalThinking: 'Tư duy & Phân tích',
  problemSolving: 'Kỹ năng giải bài tập',
  application: 'Khả năng vận dụng',
  concentration: 'Mức độ tập trung',
  accuracy: 'Độ chính xác khi làm bài',
}

const RADAR_LABELS: Record<string, string> = {
  listening: 'Nghe',
  speaking: 'Nói',
  reading: 'Đọc hiểu',
  pronunciation: 'Phát âm',
  vocabulary: 'Từ vựng',
  grammar: 'Ngữ pháp',
  communication: 'Phản xạ',
  backgroundKnowledge: 'Kiến thức nền',
  receptiveness: 'Tiếp thu',
  analyticalThinking: 'Phân tích',
  problemSolving: 'Giải bài',
  application: 'Vận dụng',
  concentration: 'Tập trung',
  accuracy: 'Chính xác',
}

function getSkillVisual(skill: string) {
  const visuals = {
    listening: { Icon: Headphones, color: '#2F80ED', tint: '#EAF3FF' },
    speaking: { Icon: MessageCircle, color: '#2F80ED', tint: '#EAF3FF' },
    reading: { Icon: BookOpen, color: '#2F80ED', tint: '#EAF3FF' },
    pronunciation: { Icon: AudioLines, color: '#55B85B', tint: '#ECF9ED' },
    vocabulary: { Icon: BookOpenCheck, color: '#F28C18', tint: '#FFF4E6' },
    grammar: { Icon: NotebookPen, color: '#F28C18', tint: '#FFF4E6' },
    communication: { Icon: UsersRound, color: '#55B85B', tint: '#ECF9ED' },
  } as const

  return visuals[skill as keyof typeof visuals] || { Icon: ClipboardList, color: '#2F80ED', tint: '#EAF3FF' }
}

function CourseRoadmap({ course, recommendedLevel }: { course: CourseOption; recommendedLevel?: number }) {
  if (!course.levelOptions?.length) return null
  const courseLevels = course.levelOptions
  const mobileColumns = Math.min(courseLevels.length, 5)
  const desktopColumns = Math.min(courseLevels.length, 6)
  const gridStyle = {
    '--roadmap-mobile-columns': mobileColumns,
    '--roadmap-desktop-columns': desktopColumns,
    '--roadmap-print-columns': courseLevels.length,
  } as CSSProperties

  return (
    <div className="evaluation-print-roadmap mt-4 rounded-2xl border border-amber-100 bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">Lộ trình cấp độ</p>
        {recommendedLevel !== undefined && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold text-amber-800">
            Bắt đầu: {course.levelOptions.find((level) => level.value === recommendedLevel)?.label}
          </span>
        )}
      </div>
      <div className="course-roadmap-grid" style={gridStyle}>
        {courseLevels.map((level) => {
          const isRecommended = level.value === recommendedLevel
          return (
            <div key={level.value} className="flex min-w-0 flex-col items-center text-center">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-[10px] font-black sm:h-11 sm:w-11 ${isRecommended ? 'border-amber-400 bg-amber-300 text-amber-950 shadow-[0_6px_14px_rgba(240,168,0,0.28)]' : 'border-sky-100 bg-white text-slate-700'}`}>
                {level.label.replace('Level ', 'L')}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PublicEvaluationPage() {
  const { id } = useParams<{ id: string }>()
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    const fetchDoc = async () => {
      try {
        const snap = await getDoc(doc(db, 'evaluations', id))
        if (snap.exists()) {
          setEvaluation({ id: snap.id, ...snap.data() } as Evaluation)
        } else {
          setError(true)
        }
      } catch (err) {
        console.error('Error fetching evaluation:', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchDoc()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error || !evaluation) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-3xl border border-slate-200 shadow-xl">
          <h1 className="text-5xl font-extrabold text-rose-500 mb-4">404</h1>
          <p className="text-lg font-bold text-slate-800 mb-2">Không tìm thấy kết quả đánh giá</p>
          <p className="text-sm text-slate-500 mb-6">Đường link chia sẻ không tồn tại hoặc đã bị xóa khỏi hệ thống.</p>
          <Button onClick={() => window.location.href = 'https://www.123english.edu.vn'}>Quay lại trang chủ</Button>
        </div>
      </div>
    )
  }

  const skillsMap = evaluation.type === 'english' ? ENGLISH_SKILLS_MAP : OTHER_SKILLS_MAP
  const chartData = Object.entries(skillsMap).map(([key, label]) => ({
    subject: RADAR_LABELS[key] || label,
    A: evaluation.skills[key] || 5,
    fullMark: 9,
  }))

  const dateString = evaluation.createdAt?.seconds
    ? new Date(evaluation.createdAt.seconds * 1000).toLocaleDateString('vi-VN')
    : new Date().toLocaleDateString('vi-VN')
  const recommendedCurriculum = evaluation.selectedLevels?.length
    ? evaluation.selectedLevels.map((courseLabel) => {
      const normalizedCourseLabel = normalizeCourseLabel(courseLabel)
      const course = getCourseOption(normalizedCourseLabel)
      const selectedLevel = evaluation.selectedCourseLevels?.[normalizedCourseLabel] ?? evaluation.selectedCourseLevels?.[courseLabel]
      const selectedLevelLabel = course?.levelOptions?.find((level) => level.value === selectedLevel)?.label
      return selectedLevelLabel ? `${normalizedCourseLabel} - bắt đầu từ ${selectedLevelLabel}` : normalizedCourseLabel
    }).join(', ')
    : evaluation.proposedCurriculum
  const selectedTutorSkills = (evaluation.tutorSkills || []).filter((skill) => TUTOR_SKILL_OPTIONS.includes(skill as typeof TUTOR_SKILL_OPTIONS[number]))

  return (
    <div className="evaluation-mobile-theme evaluation-print-root min-h-screen bg-white py-5 sm:py-12 print:bg-white print:py-0">
      <div className="evaluation-print-container max-w-5xl mx-auto px-4 sm:px-6 print:px-0">
        
        {/* Header toolbar */}
        <div className="mb-5 flex items-center justify-between gap-3 sm:mb-8 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <Logo clickable={false} className="h-8 w-auto max-w-[142px] sm:h-10 sm:max-w-[178px]" />
            <div className="hidden border-l border-slate-200 pl-3 sm:block">
              <p className="text-xs font-black text-slate-900">Phiếu đánh giá năng lực</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">123English</p>
            </div>
          </div>
          <Button variant="outline" aria-label="In kết quả hoặc lưu PDF" onClick={() => window.print()} className="min-h-10 shrink-0 rounded-xl border-slate-200 px-3 shadow-sm sm:px-4">
            <Printer className="w-4 h-4" strokeWidth={2} />
            <span className="hidden sm:inline">In kết quả / Lưu PDF</span>
          </Button>
        </div>

        {/* Evaluation Card Wrapper */}
        <div className="evaluation-print-sheet bg-white rounded-[28px] border border-brand-200 shadow-[0_16px_40px_rgba(240,168,0,0.10)] overflow-hidden p-5 sm:p-12 print:border-none print:shadow-none print:p-0">
          
          {/* Top Banner Branding */}
          <div className="evaluation-print-header mb-7 flex items-start gap-3 border-b border-slate-100 pb-6 sm:mb-10 sm:gap-4 sm:pb-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0B8] text-[#A86A00] sm:h-12 sm:w-12">
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#A86A00] sm:text-[11px]">Phiếu đánh giá năng lực đầu vào</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {evaluation.studentName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#2F80ED]" strokeWidth={2} />Ngày đánh giá: {dateString}</span>
                <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-[#2F80ED]" strokeWidth={2} />Thang điểm 1-9</span>
              </div>
            </div>
          </div>

          {/* Section 1: Biểu đồ & Bảng điểm */}
          <div className="evaluation-print-analysis grid grid-cols-1 items-start gap-4 lg:grid-cols-12 lg:gap-6 mb-12 sm:mb-16">
            
            {/* Heptagram Chart */}
            <section className="evaluation-print-panel flex min-w-0 flex-col lg:col-span-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(35,87,160,0.06)] sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#2F80ED]">
                  <ChartNoAxesCombined className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Biểu đồ phân tích kỹ năng</h3>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">Mức độ năng lực theo thang điểm từ 1 đến 9.</p>
                </div>
              </div>
              
              <div className="evaluation-print-chart mx-auto mt-3 h-[270px] min-w-0 w-full max-w-[360px] sm:mt-4 sm:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="65%" data={chartData}>
                    <PolarGrid stroke="#E2E8F0" strokeWidth={1} />
                    <PolarAngleAxis 
                      dataKey="subject" 
                      tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }}
                    />
                    <PolarRadiusAxis 
                      domain={[0, 9]} 
                      tick={false} 
                      axisLine={false}
                    />
                    <Radar
                      name="Điểm đánh giá"
                      dataKey="A"
                      stroke="#F2B705"
                      strokeWidth={2.5}
                      fill="#FFD43B"
                      fillOpacity={0.48}
                      isAnimationActive={false}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <p className="evaluation-print-chart-note mt-1 text-center text-[11px] leading-relaxed text-slate-400 sm:mt-2">
                Tên kỹ năng được rút gọn để biểu đồ luôn dễ đọc trên mọi màn hình.
              </p>
            </section>

            {/* Scorecard table list */}
            <section className="evaluation-print-panel lg:col-span-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(35,87,160,0.06)] sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF3FF] text-[#2F80ED]">
                  <ClipboardList className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Chi tiết điểm đánh giá</h3>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">Từng kỹ năng được trình bày cùng biểu tượng dễ nhận biết.</p>
                </div>
              </div>
              
              <div className="evaluation-print-score-list mt-4 space-y-2.5">
                {Object.entries(skillsMap).map(([key, label]) => {
                  const val = evaluation.skills[key] || 5
                  const visual = getSkillVisual(key)
                  const SkillIcon = visual.Icon
                  return (
                    <div 
                      key={key} 
                      className="evaluation-print-score-row flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white p-3 transition-colors hover:border-sky-100 sm:gap-3.5 sm:p-3.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: visual.tint, color: visual.color }}>
                        <SkillIcon className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <span className="min-w-0 flex-1 text-xs font-bold leading-5 text-slate-700 sm:text-sm">{label}</span>
                      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                        <div className="h-2 w-12 overflow-hidden rounded-full bg-slate-100 sm:w-24">
                          <div 
                            className="h-full rounded-full"
                            style={{ backgroundColor: visual.color, width: `${(val / 9) * 100}%` }}
                          />
                        </div>
                        <span className="inline-flex min-w-9 items-baseline justify-end gap-0.5 text-sm font-black" style={{ color: visual.color }}>
                          {val}<span className="text-[10px] text-slate-400">/9</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {evaluation.lessonComment?.trim() && (
              <section className="evaluation-print-comment rounded-3xl border border-amber-200 bg-white p-4 text-left shadow-[0_8px_24px_rgba(240,168,0,0.07)] lg:col-span-12 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0B8] text-[#A86A00]">
                    <MessageCircle className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-black text-slate-900">Nhận xét buổi học</h4>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600 lg:columns-2 lg:gap-8">{evaluation.lessonComment}</p>
                  </div>
                </div>
              </section>
            )}
          </div>

          <div className={`evaluation-print-journey grid grid-cols-1 gap-6 border-t border-slate-100 pt-8 sm:gap-8 sm:pt-10 ${evaluation.imageUrl ? 'evaluation-print-journey--with-photo lg:grid-cols-12' : ''}`}>
          {/* Section 1.5: Ảnh kỷ niệm buổi học thử (nếu có) */}
          {evaluation.imageUrl && (
            <div className="evaluation-print-photo flex min-w-0 flex-col items-center lg:col-span-5 lg:items-start">
              <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">
                Hình ảnh lớp học đầu vào
              </h3>
              <div className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-slate-150 bg-slate-50 p-2 shadow-sm">
                <img 
                  src={evaluation.imageUrl} 
                  alt="Ảnh lớp học" 
                  className="evaluation-print-photo-image w-full h-auto rounded-[18px] object-cover"
                />
              </div>
              <p className="mt-3 text-center text-xs font-bold italic text-slate-500 lg:text-left">
                Hình ảnh gia sư và học viên chụp chung trong buổi đánh giá năng lực đầu vào
              </p>
            </div>
          )}

          {/* Section 2: Lộ trình đề xuất */}
          <div className={`evaluation-print-route min-w-0 ${evaluation.imageUrl ? 'lg:col-span-7' : ''}`}>
            <h2 className="text-xs font-black tracking-widest text-indigo-600 uppercase mb-6">
              {EVALUATION_ROUTE_TITLES[evaluation.formType]}
            </h2>
            
            {evaluation.formType === 'tutor' ? (
              /* Tutor Form detail view */
              <div className="space-y-6">
                <p className="text-slate-600 text-sm leading-relaxed">
                  123English cung cấp dịch vụ gia sư 1 kèm 1 theo chương trình của Bộ Giáo dục và Đào tạo, chương trình song ngữ, quốc tế và các khóa luyện thi. Sau buổi đánh giá, gia sư tư vấn chương trình đề xuất dưới đây:
                </p>
                {selectedTutorSkills.length > 0 && (
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-3">Kỹ năng cần tập trung</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedTutorSkills.map((skill) => (
                        <div key={skill} className="flex gap-3 p-4 bg-indigo-50/30 border border-indigo-100/50 rounded-2xl">
                          <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                          <p className="text-sm text-slate-800 font-bold">{skill}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(evaluation.tutorSubjects || {}).map(([key, subVal]) => {
                    if (!subVal) return null
                    let label = ''
                    if (key === 'moet') label = 'Chương trình Bộ GD&ĐT (Môn)'
                    if (key === 'tichHop') label = 'Chương trình Tích hợp (Môn)'
                    if (key === 'nangCao') label = 'Chương trình Nâng cao & HSG (Môn)'
                    if (key === 'songNgu') label = 'Chương trình Song ngữ (Môn)'
                    if (key === 'quocTe') label = 'Chương trình Quốc tế (Môn)'
                    if (key === 'khac') label = 'Khác'
                    
                    return (
                      <div key={key} className="flex gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                        <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-slate-400 font-bold uppercase">{label}</p>
                          <p className="text-sm text-slate-800 font-semibold mt-0.5">{subVal}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* Language/Communication course level options checkmarks */
              <div className="space-y-6">
                <p className="text-slate-600 text-sm leading-relaxed">
                  Chương trình Tiếng Anh gồm nhiều cấp độ chuyên biệt từ cơ bản đến nâng cao. Gia sư đề xuất học viên tham gia học bắt đầu từ:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {evaluation.selectedLevels.map((lvl) => {
                    const courseLabel = normalizeCourseLabel(lvl)
                    const course = getCourseOption(courseLabel)
                    const selectedLevel = evaluation.selectedCourseLevels?.[courseLabel] ?? evaluation.selectedCourseLevels?.[lvl]
                    return (
                    <div key={lvl} className={`p-4 bg-white border border-amber-100 rounded-2xl ${evaluation.selectedLevels.length === 1 ? 'md:col-span-2' : ''}`}>
                      <div className="flex gap-3">
                      <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-slate-800 font-bold">{courseLabel}</p>
                        {course?.description && <p className="mt-1 text-xs leading-5 text-slate-600">{course.description}</p>}
                      </div>
                      </div>
                      {course && <CourseRoadmap course={course} recommendedLevel={selectedLevel} />}
                    </div>
                  )})}
                  {evaluation.customLevelText && (
                    <div className="flex gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl md:col-span-2">
                      <CheckCircle2 className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase">Giáo trình riêng theo yêu cầu</p>
                        <p className="text-sm text-slate-800 font-semibold mt-0.5">{evaluation.customLevelText}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Section 3: Kết luận & Khuyến nghị */}
          <div className="evaluation-print-summary mt-8 border-t border-slate-100 pt-8 sm:mt-10 sm:pt-10">
            <h2 className="text-xs font-black tracking-widest text-indigo-600 uppercase mb-8">
              III. KẾT LUẬN & KHUYẾN NGHỊ
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              
              {/* Left Column: Kết quả & Lịch đề xuất */}
              <div className="evaluation-print-summary-left lg:col-span-5 flex flex-col gap-6">
                
                {/* Result Block */}
                <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <span className="print:hidden">Kết quả đánh giá đầu vào</span><span className="hidden print:inline">Kết quả</span>
                  </span>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping" />
                    <span className="text-base font-extrabold text-indigo-950">
                      {RESULT_LABELS[evaluation.evaluationResult]}
                    </span>
                  </div>
                </div>

                {/* Proposal Frequency */}
                <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Khuyến nghị lịch học
                  </span>
                  <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium"><span className="print:hidden">Tần suất đề xuất:</span><span className="hidden print:inline">Tần suất:</span></span>
                      <span className="font-extrabold text-slate-800">{evaluation.sessionsPerWeek} buổi/tuần</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium"><span className="print:hidden">Thời lượng đề xuất:</span><span className="hidden print:inline">Thời lượng:</span></span>
                      <span className="font-extrabold text-slate-800">{evaluation.minutesPerSession} phút/buổi</span>
                    </div>
                  </div>
                </div>

                {/* Proposed Textbook */}
                {recommendedCurriculum && (
                  <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-2xl">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      Giáo trình đề xuất
                    </span>
                    <p className="mt-2 text-sm font-extrabold text-slate-800">
                      {recommendedCurriculum}
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Mục tiêu chi tiết */}
              <div className="evaluation-print-summary-goals lg:col-span-7 p-6 sm:p-8 bg-indigo-50/10 border border-indigo-100/30 rounded-3xl flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">
                    Mục tiêu sau khóa học
                  </span>
                  
                  <div className="mt-4 text-sm text-slate-600 leading-relaxed space-y-2 whitespace-pre-line font-medium">
                    {evaluation.postCourseGoals || 'Chưa thiết lập mục tiêu.'}
                  </div>
                </div>
                
                <p className="text-[10px] font-bold text-slate-400 mt-8">
                  * Khuyến nghị duy trì lịch học đều đặn để nâng cao phản xạ tự nhiên tốt nhất.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
