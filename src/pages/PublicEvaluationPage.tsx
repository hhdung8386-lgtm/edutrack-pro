import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { GraduationCap, Calendar, User, Printer, CheckCircle2, ChevronRight } from 'lucide-react'

interface Evaluation {
  id: string
  studentName: string
  teacherName: string
  type: 'english' | 'other'
  skills: Record<string, number>
  formType: 'adult_comm' | 'tutor' | 'kids_a' | 'kids_b' | 'academic'
  selectedLevels: string[]
  customLevelText?: string
  tutorSubjects?: Record<string, string>
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

const FORM_TITLES = {
  adult_comm: 'LỘ TRÌNH HỌC ĐỀ XUẤT TIẾNG ANH GIAO TIẾP NGƯỜI LỚN',
  tutor: 'LỘ TRÌNH HỌC ĐỀ XUẤT GIA SƯ',
  kids_a: 'LỘ TRÌNH HỌC ĐỀ XUẤT TIẾNG ANH GIAO TIẾP TRẺ EM (TIME TO TALK)',
  kids_b: 'LỘ TRÌNH HỌC ĐỀ XUẤT TIẾNG ANH GIAO TIẾP TRẺ EM (MAGIC PHONICS/SMART KIDS)',
  academic: 'LỘ TRÌNH HỌC ĐỀ XUẤT TIẾNG ANH HỌC THUẬT',
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
    subject: label,
    A: evaluation.skills[key] || 5,
    fullMark: 9,
  }))

  const dateString = evaluation.createdAt?.seconds
    ? new Date(evaluation.createdAt.seconds * 1000).toLocaleDateString('vi-VN')
    : new Date().toLocaleDateString('vi-VN')

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-8 sm:py-12 print:bg-white print:py-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 print:px-0">
        
        {/* Header toolbar */}
        <div className="flex justify-between items-center mb-8 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">123English</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hệ thống Đánh giá</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => window.print()} className="rounded-2xl border-slate-200 shadow-sm gap-2">
            <Printer className="w-4 h-4" />
            In kết quả / Lưu PDF
          </Button>
        </div>

        {/* Evaluation Card Wrapper */}
        <div className="bg-white rounded-[32px] border border-slate-200/80 shadow-[0_16px_40px_rgba(0,0,0,0.02)] overflow-hidden p-8 sm:p-12 print:border-none print:shadow-none print:p-0">
          
          {/* Top Banner Branding */}
          <div className="border-b border-slate-100 pb-8 mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="inline-block text-[11px] font-extrabold tracking-widest text-indigo-600 bg-indigo-50 px-3.5 py-1.5 rounded-full mb-3 uppercase">
                Phiếu Đánh Giá Năng Lực Đầu Vào
              </span>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                {evaluation.studentName}
              </h1>
            </div>
          </div>

          {/* Section 1: Biểu đồ & Bảng điểm */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center mb-16">
            
            {/* Heptagram Chart */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-6">
                Biểu đồ Phân tích Kỹ năng (Radar Chart)
              </h3>
              
              <div className="w-full h-[320px] max-w-[360px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
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
                      stroke="#06B6D4"
                      strokeWidth={2}
                      fill="#06B6D4"
                      fillOpacity={0.15}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-400 mt-4 text-center leading-relaxed">
                Biểu đồ thể hiện mức độ tỏa năng lực từ mốc 1 đến 9 của từng kỹ năng.
              </p>
            </div>

            {/* Scorecard table list */}
            <div className="lg:col-span-6">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-6">
                Chi tiết điểm đánh giá năng lực
              </h3>
              
              <div className="space-y-3">
                {Object.entries(skillsMap).map(([key, label]) => {
                  const val = evaluation.skills[key] || 5
                  return (
                    <div 
                      key={key} 
                      className="flex items-center justify-between p-3.5 bg-slate-50/50 hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all duration-150"
                    >
                      <span className="text-sm font-bold text-slate-700">{label}</span>
                      <div className="flex items-center gap-3">
                        {/* Progressive Bar */}
                        <div className="w-24 h-2 bg-slate-200/60 rounded-full overflow-hidden hidden sm:block">
                          <div 
                            className="h-full bg-cyan-500 rounded-full" 
                            style={{ width: `${(val / 9) * 100}%` }}
                          />
                        </div>
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 font-extrabold text-sm">
                          {val}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Section 1.5: Ảnh kỷ niệm buổi học thử (nếu có) */}
          {evaluation.imageUrl && (
            <div className="border-t border-slate-100 pt-10 pb-10 flex flex-col items-center">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-6">
                Hình ảnh lớp học đầu vào
              </h3>
              <div className="relative max-w-lg w-full bg-slate-50 border border-slate-150 rounded-[24px] overflow-hidden p-2 shadow-sm">
                <img 
                  src={evaluation.imageUrl} 
                  alt="Ảnh lớp học" 
                  className="w-full h-auto rounded-[18px] object-cover" 
                />
              </div>
              <p className="text-xs font-bold text-slate-500 mt-3 italic text-center">
                Hình ảnh giáo viên và học viên chụp chung trong buổi đánh giá năng lực đầu vào
              </p>
            </div>
          )}

          {/* Section 2: Lộ trình đề xuất */}
          <div className="border-t border-slate-100 pt-12 mb-12">
            <h2 className="text-xs font-black tracking-widest text-indigo-600 uppercase mb-6">
              {FORM_TITLES[evaluation.formType]}
            </h2>
            
            {evaluation.formType === 'tutor' ? (
              /* Tutor Form detail view */
              <div className="space-y-6">
                <p className="text-slate-600 text-sm leading-relaxed">
                  123English cung cấp dịch vụ gia sư 1 kèm 1 theo chương trình của Bộ Giáo dục và Đào tạo, chương trình song ngữ, quốc tế và các khóa luyện thi. Sau buổi đánh giá, giáo viên tư vấn chương trình đề xuất dưới đây:
                </p>
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
                  Chương trình Tiếng Anh gồm nhiều cấp độ chuyên biệt từ cơ bản đến nâng cao. Giáo viên đề xuất học viên tham gia học bắt đầu từ:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {evaluation.selectedLevels.map((lvl) => (
                    <div key={lvl} className="flex gap-3 p-4 bg-indigo-50/30 border border-indigo-100/50 rounded-2xl">
                      <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-slate-800 font-bold">{lvl}</p>
                      </div>
                    </div>
                  ))}
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

          {/* Section 3: Kết luận & Khuyến nghị */}
          <div className="border-t border-slate-100 pt-12">
            <h2 className="text-xs font-black tracking-widest text-indigo-600 uppercase mb-8">
              III. KẾT LUẬN & KHUYẾN NGHỊ
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              
              {/* Left Column: Kết quả & Lịch đề xuất */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                
                {/* Result Block */}
                <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Kết quả đánh giá đầu vào
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
                      <span className="text-slate-500 font-medium">Tần suất đề xuất:</span>
                      <span className="font-extrabold text-slate-800">{evaluation.sessionsPerWeek} buổi/tuần</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium">Thời lượng đề xuất:</span>
                      <span className="font-extrabold text-slate-800">{evaluation.minutesPerSession} phút/buổi</span>
                    </div>
                  </div>
                </div>

                {/* Proposed Textbook */}
                {evaluation.proposedCurriculum && (
                  <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-2xl">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      Giáo trình đề xuất
                    </span>
                    <p className="mt-2 text-sm font-extrabold text-slate-800">
                      {evaluation.proposedCurriculum}
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Mục tiêu chi tiết */}
              <div className="lg:col-span-7 p-6 sm:p-8 bg-indigo-50/10 border border-indigo-100/30 rounded-3xl flex flex-col justify-between">
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
