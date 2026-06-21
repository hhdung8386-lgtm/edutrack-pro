import { useState } from 'react'
import { 
  Check, VolumeX, UserCheck, HelpCircle, Ear, CreditCard, Brain, 
  ChevronRight, Award, ChevronDown, Phone, Globe, Star, Users, ShieldCheck,
  Gift, Calendar, Rocket
} from 'lucide-react'

interface TeensLandingProps {
  onSignupSuccess: (programName: string) => void;
  onOpenSearchModal: () => void;
}

export function TeensLanding({ onSignupSuccess, onOpenSearchModal }: TeensLandingProps) {
  // Local states for forms
  const [heroName, setHeroName] = useState('')
  const [heroPhone, setHeroPhone] = useState('')
  const [footerName, setFooterName] = useState('')
  const [footerPhone, setFooterPhone] = useState('')

  // Local state for FAQ accordion
  const [faqIndex, setFaqIndex] = useState<number | null>(null)

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!heroPhone) return
    onSignupSuccess('Tiếng Anh Thiếu Niên (Đăng ký học thử)')
    setHeroName('')
    setHeroPhone('')
  }

  const handleFooterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!footerPhone) return
    onSignupSuccess('Tiếng Anh Teens (Đăng ký từ chân trang)')
    setFooterName('')
    setFooterPhone('')
  }

  return (
    <div className="min-h-screen bg-[#FFFDF7] overflow-x-hidden relative font-jakarta">
      
      {/* SECTION 1: HERO SECTION */}
      <section id="trang-chu" className="pt-8 pb-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-gradient-to-b from-slate-50 via-white to-white relative overflow-hidden">
        <div className="absolute top-10 left-[45%] text-green-300 font-bold text-3xl animate-bounce pointer-events-none select-none">★</div>
        <div className="absolute top-32 left-10 text-blue-200 font-bold text-xl pointer-events-none select-none">✦</div>
        <div className="absolute bottom-20 right-10 text-green-200 font-bold text-2xl pointer-events-none select-none">✦</div>

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Column */}
          <div className="flex flex-col justify-center h-full">
            <div className="self-start px-4 py-1.5 bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] font-quicksand font-bold text-xs rounded-full uppercase tracking-wider shadow-sm mb-6">
              Chương Trình Tiếng Anh Thiếu Niên & Mất Gốc
            </div>
            
            <h1 className="font-quicksand font-extrabold text-3xl sm:text-4xl lg:text-[44px] leading-[1.15] text-slate-800 tracking-tight">
              MẤT GỐC TIẾNG ANH?<br />
              <span className="text-[#2563EB] font-black drop-shadow-sm font-quicksand uppercase">HỌC LẠI TỪ ĐẦU,</span><br />
              <span className="text-[#10B981] font-black drop-shadow-sm font-quicksand uppercase">TỰ TIN GIAO TIẾP</span>
            </h1>

            <ul className="mt-6 space-y-3.5 font-jakarta font-semibold text-slate-600 text-sm">
              {[
                'Lộ trình cá nhân hóa cho người mất gốc',
                'Học online, hiệu quả — Học trực tuyến',
                'Học phí từ đầu, học lại'
              ].map((bullet, idx) => (
                <li key={idx} className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-5 h-5 bg-[#10B981] text-white rounded-full flex items-center justify-center shadow-sm">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {/* Device and method badges */}
            <div className="flex flex-wrap gap-4 mt-8 font-jakarta font-bold text-[11px] text-slate-500">
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                <Globe className="w-4 h-4 text-blue-500" />
                <span>Học trực tuyến</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                <Phone className="w-4 h-4 text-green-500" />
                <span>Thiết bị: Điện thoại, PC, Laptop</span>
              </div>
            </div>

            {/* Hero Quick Form */}
            <form onSubmit={handleHeroSubmit} className="mt-8 flex flex-col sm:flex-row items-stretch gap-2 bg-white p-2 rounded-2xl border border-slate-200/60 shadow-md max-w-xl w-full">
              <input 
                type="text" 
                value={heroName}
                onChange={(e) => setHeroName(e.target.value)}
                placeholder="Tên của bạn *"
                required
                className="w-full sm:flex-[1.2] px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#2563EB] focus:bg-white font-semibold text-slate-800 transition-all duration-200"
              />
              <input 
                type="tel" 
                value={heroPhone}
                onChange={(e) => setHeroPhone(e.target.value)}
                placeholder="Số điện thoại *"
                required
                className="w-full sm:flex-[1] px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#2563EB] focus:bg-white font-semibold text-slate-800 transition-all duration-200"
              />
              <button 
                type="submit"
                className="w-full sm:w-auto px-6 py-3 bg-[#10B981] hover:bg-[#0d9468] active:scale-[0.98] text-white font-quicksand font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all duration-200 shadow-sm shrink-0 whitespace-nowrap"
              >
                Đăng ký &gt;
              </button>
            </form>
            
            <div className="mt-3 text-[11px] text-[#059669] font-bold tracking-wide flex items-center gap-1">
              <span>● Không áp lực điểm số</span>
              <span className="text-slate-300">|</span>
              <span>● Không áp lực học phí</span>
            </div>
          </div>

          {/* Right Column */}
          <div className="relative flex justify-center items-center py-6 lg:py-0">
            {/* Comic Speech Bubble */}
            <div className="absolute top-8 left-4 bg-white px-5 py-2.5 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-2 animate-bounce z-10">
              <span className="text-xs font-black text-[#2563EB] tracking-wide uppercase font-quicksand">I can speak English!</span>
            </div>

            {/* Main Kid Image */}
            <div className="rounded-[2.5rem] overflow-hidden border-[6px] border-white shadow-2xl bg-[#F8FAFC] max-w-[420px] w-full relative">
              <img 
                src="/hero_teens.jpg" 
                alt="Học sinh học tiếng anh online" 
                className="w-full h-auto block"
              />
              
              {/* Floating blue circular badge */}
              <div className="absolute bottom-4 right-4 bg-[#2563EB] text-white w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 shadow-lg border-2 border-white select-none">
                <span className="text-2xl font-black font-quicksand leading-none">25</span>
                <span className="text-[7.5px] font-bold text-center leading-tight mt-1 uppercase font-jakarta">Phút mỗi ngày hiệu quả vượt trội</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 2: PROBLEMS SECTION */}
      <section id="van-de" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-sm sm:text-base text-[#059669] tracking-widest uppercase mb-10">
            — BẠN CÓ ĐANG GẶP NHỮNG VẤN ĐỀ NÀY? —
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-10">
            {[
              { title: 'Học nhiều năm nhưng vẫn không nói được', icon: VolumeX, color: 'text-rose-500 bg-rose-50 border-rose-100' },
              { title: 'Sợ nói tiếng Anh, ngại ngùng khi gặp người nước ngoài', icon: UserCheck, color: 'text-amber-500 bg-amber-50 border-amber-100' },
              { title: 'Mất căn bản ngữ pháp, không biết bắt đầu từ đâu', icon: HelpCircle, color: 'text-blue-500 bg-blue-50 border-blue-100' },
              { title: 'Nghe, nói chậm, sợ sai khi giao tiếp', icon: Ear, color: 'text-indigo-500 bg-indigo-50 border-indigo-100' },
              { title: 'Học phí cao, không hiệu quả, tốn thời gian', icon: CreditCard, color: 'text-emerald-500 bg-emerald-50 border-emerald-100' },
              { title: 'Học từ vựng, ngữ pháp máy móc, nhanh quên', icon: Brain, color: 'text-purple-500 bg-purple-50 border-purple-100' }
            ].map((prob, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 hover:border-blue-300 hover:shadow-md transition-all duration-300 flex flex-col items-center text-center group">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-5 border ${prob.color} transition-transform duration-500 group-hover:scale-110`}>
                  <prob.icon className="w-5.5 h-5.5" />
                </div>
                <h4 className="font-quicksand font-extrabold text-xs sm:text-[13px] text-slate-700 leading-relaxed">{prob.title}</h4>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* SECTION 3: SUITABILITY SECTION */}
      <section id="phu-hop" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-[#F8FAFC] border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          
          {/* Left column - Mockup Phone */}
          <div className="relative flex justify-center py-6 lg:py-0">
            <div className="max-w-[340px] w-full relative">
              {/* Rocket icon floating (Lucide icon, positioned relative to phone container to prevent overlap cut-off) */}
              <div className="absolute -top-5 -left-5 w-10 h-10 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center shadow-md animate-bounce pointer-events-none z-10">
                <Rocket className="w-5 h-5 text-amber-500" />
              </div>
              <img 
                src="/mobile_call_mockup.png" 
                alt="Video call học tiếng Anh" 
                className="w-full h-auto drop-shadow-xl select-none"
              />
            </div>
          </div>

          {/* Right column - Checklist */}
          <div>
            <h2 className="font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight leading-tight mb-8">
              VÌ SAO 123ENGLISH<br />
              <span className="text-[#2563EB] font-black uppercase">PHÙ HỢP CHO THIẾU NIÊN & MẤT GỐC?</span>
            </h2>

            <ul className="space-y-5 font-jakarta text-slate-600 text-sm">
              {[
                'Học mọi lúc, mọi nơi, linh hoạt thời gian. Chỉ cần 25 phút mỗi ngày, học trên điện thoại, máy tính, tablet.',
                'Lộ trình cá nhân hóa từ cơ bản đến nâng cao. Đo lường trình độ và mục tiêu riêng, giúp tiến bộ nhanh chóng.',
                'Phương pháp học thực tế, dễ áp dụng. Thực hành tương tác giao tiếp 1-1, phản xạ tự nhiên.',
                'Giáo viên giàu kinh nghiệm, bằng cấp quốc tế. Dạy tận tâm, sửa lỗi nhanh chóng, đồng hành cùng bạn.'
              ].map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 bg-[#2563EB] text-white rounded-full flex items-center justify-center mt-0.5 shadow-sm">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                  <span className="font-semibold">{bullet}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10">
              <a 
                href="#dang-ky-form"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#2563EB] hover:bg-blue-700 text-white font-quicksand font-extrabold rounded-full text-center shadow-lg transition-all duration-300 uppercase tracking-wider text-xs"
              >
                Học thử miễn phí &gt;
              </a>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 4: TIMELINE ROADMAP */}
      <section id="lo-trinh" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight mb-12">
            123ENGLISH GIÚP BẠN LẤY LẠI GỐC TIẾNG ANH NHƯ THẾ NÀO?
          </h2>

          <div className="grid md:grid-cols-4 gap-6 items-center">
            {[
              { step: '1', title: 'Kiểm tra trình độ miễn phí', desc: 'Xác định rõ điểm mạnh, điểm yếu.' },
              { step: '2', title: 'Xây dựng lộ trình riêng', desc: 'Cá nhân hóa theo mục tiêu và thời gian của bạn.' },
              { step: '3', title: 'Học 1 kèm 1 cùng giáo viên', desc: 'Tương tác trực tiếp, sửa lỗi ngay lập tức.' },
              { step: '4', title: 'Theo dõi & đánh giá sự tiến bộ', desc: 'Luyện tập đều đặn để đạt mục tiêu nhanh hơn.' }
            ].map((item, idx) => (
              <div key={idx} className="relative flex flex-col items-center">
                
                {/* Card container */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300 text-center w-full min-h-[180px] flex flex-col items-center justify-center relative shadow-sm">
                  <div className="w-10 h-10 bg-[#2563EB] text-white rounded-full flex items-center justify-center font-quicksand font-extrabold text-lg mb-4 shadow-sm">
                    {item.step}
                  </div>
                  <h4 className="font-quicksand font-black text-xs sm:text-sm text-slate-800 mb-2 uppercase tracking-wide">{item.title}</h4>
                  <p className="font-jakarta font-semibold text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
                </div>

                {/* Arrow overlay */}
                {idx < 3 && (
                  <div className="hidden md:block absolute top-1/2 -translate-y-1/2 -right-4 translate-x-1/2 z-10 text-slate-300">
                    <ChevronRight className="w-6 h-6 stroke-[3]" />
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* SECTION 5: COMMITMENT SECTION */}
      <section id="cam-ket" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-blue-50/10 border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex flex-col gap-1 items-center uppercase">
            <span>CAM KẾT KẾT QUẢ</span>
            <span className="text-xs sm:text-sm text-slate-400 font-bold tracking-widest normal-case font-jakarta mt-2">Luyện nói - Tiếng Anh song ngữ toàn diện hiệu quả và năng động</span>
          </h2>

          <div className="grid lg:grid-cols-3 gap-8 items-center mt-12">
            
            {/* Left Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-full">
              <h3 className="font-quicksand font-black text-sm text-[#059669] uppercase tracking-wider mb-6 flex items-center gap-2 border-b pb-3">
                <span className="w-1.5 h-5 bg-[#059669] rounded-full inline-block" /> BẠN SẼ NHẬN ĐƯỢC
              </h3>
              <ul className="space-y-4 font-jakarta font-semibold text-xs sm:text-sm text-slate-600">
                {[
                  'Tự tin giao tiếp thực tế.',
                  'Phản xạ chuẩn, giao tiếp tự nhiên.',
                  'Nghe hiểu nhanh, phản xạ tức thì.',
                  'Từ vựng phong phú & chuẩn ngữ pháp.'
                ].map((pt, pIdx) => (
                  <li key={pIdx} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Center Circle */}
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-48 h-48 rounded-full border-[10px] border-white shadow-xl bg-[#2563EB] text-white flex flex-col items-center justify-center p-6 select-none relative animate-pulse-soft">
                <span className="text-4xl sm:text-5xl font-black font-quicksand leading-none">98%</span>
                <span className="text-[10px] font-extrabold uppercase mt-2 font-jakarta text-blue-100 tracking-wide">Học viên hài lòng và đạt kết quả</span>
              </div>
              <div className="mt-4 font-quicksand font-bold text-xs text-slate-500 uppercase tracking-wider bg-white py-2 px-4 rounded-full shadow-sm border border-slate-100">
                Hơn 5.000+ học viên đạt kết quả mong đợi
              </div>
            </div>

            {/* Right Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-full">
              <h3 className="font-quicksand font-black text-sm text-[#2563EB] uppercase tracking-wider mb-6 flex items-center gap-2 border-b pb-3">
                <span className="w-1.5 h-5 bg-[#2563EB] rounded-full inline-block" /> BẠN ĐƯỢC HỖ TRỢ
              </h3>
              <ul className="space-y-4 font-jakarta font-semibold text-xs sm:text-sm text-slate-600">
                {[
                  'Giáo viên giàu kinh nghiệm. Hỗ trợ 1-1 tận tâm.',
                  'Kho tài liệu hơn 10.000+ bài học. Học mọi lúc, mọi nơi.',
                  'Luyện tập 24/7. Thực hành linh hoạt.',
                  'Ưu đãi học phí đặc biệt. Nhiều chương trình hấp dẫn.'
                ].map((pt, pIdx) => (
                  <li key={pIdx} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* Bottom Badges */}
          <div className="grid md:grid-cols-[35%_35%_30%] gap-4 items-center mt-12 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 border-r last:border-0 border-slate-100 pr-2">
              <div className="w-9 h-9 rounded-full bg-[#ECFDF5] text-emerald-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="font-quicksand font-black text-xs text-slate-800 block uppercase">CAM KẾT CHẤT LƯỢNG</span>
                <span className="text-[10px] text-slate-400 font-semibold leading-none">Hoàn tiền nếu không hài lòng trong 7 ngày đầu</span>
              </div>
            </div>

            <div className="flex items-center gap-3 border-r last:border-0 border-slate-100 pr-2">
              <div className="w-9 h-9 rounded-full bg-[#EFF6FF] text-blue-600 flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <span className="font-quicksand font-black text-xs text-slate-800 block uppercase">98% ĐẠT KẾT QUẢ</span>
                <span className="text-[10px] text-slate-400 font-semibold leading-none">Tiến bộ rõ rệt sau mỗi khóa học</span>
              </div>
            </div>

            <div className="text-right">
              <a 
                href="#dang-ky-form"
                className="w-full inline-block px-5 py-3.5 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-bold rounded-xl text-center text-xs uppercase tracking-wider shadow-sm transition-all duration-300"
              >
                Đăng ký học - Bắt đầu ngay &gt;
              </a>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 6: TEACHERS SECTION */}
      <section id="giao-vien" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex flex-col gap-1 items-center uppercase mb-12">
            <span>ĐỘI NGŨ GIÁO VIÊN</span>
            <span className="text-xs sm:text-sm text-slate-400 font-bold tracking-widest normal-case font-jakarta mt-2">Giàu kinh nghiệm - Nhiệt huyết - Tận tâm</span>
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { name: 'Teacher Amelia', country: 'Canada', rating: '4.9', count: '232 đánh giá', img: '/t6.jpg', flagColor: 'bg-red-500' },
              { name: 'Teacher Mark', country: 'Philippines', rating: '4.8', count: '195 đánh giá', img: '/t3.jpg', flagColor: 'bg-blue-600' },
              { name: 'Teacher Lisa', country: 'USA', rating: '4.9', count: '178 đánh giá', img: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop&crop=faces', flagColor: 'bg-blue-800' },
              { name: 'Teacher Jones', country: 'Philippines', rating: '4.8', count: '267 đánh giá', img: '/t7.jpg', flagColor: 'bg-blue-600' },
              { name: 'Teacher Grace', country: 'Philippines', rating: '4.9', count: '254 đánh giá', img: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&h=150&fit=crop&crop=faces', flagColor: 'bg-blue-600' },
              { name: 'Teacher Ryan', country: 'Philippines', rating: '4.7', count: '112 đánh giá', img: '/t4.jpg', flagColor: 'bg-blue-600' }
            ].map((teacher, idx) => (
              <div key={idx} className="bg-[#F8FAFC] p-4.5 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all duration-300 flex flex-col items-center text-center shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-md mb-3.5 bg-slate-100">
                  <img src={teacher.img} alt={teacher.name} className="w-full h-full object-cover" />
                </div>
                <h4 className="font-quicksand font-black text-xs sm:text-[13px] text-slate-800 leading-tight mb-1">{teacher.name}</h4>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold mb-2">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${teacher.flagColor} border border-white`} />
                  <span>{teacher.country}</span>
                </div>
                <div className="flex items-center gap-1 mt-auto bg-white px-2 py-1 rounded-full border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                  <span className="text-amber-400 font-bold text-[9px]">★</span>
                  <span className="text-slate-700 font-bold text-[10px]">{teacher.rating}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-400 text-[8px] font-bold shrink-0">{teacher.count}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Counter banner below */}
          <div className="grid md:grid-cols-[35%_35%_30%] gap-4 items-center mt-12 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 border-r last:border-0 border-slate-200/80 pr-2">
              <div className="w-9 h-9 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="font-quicksand font-black text-xs text-slate-800 block uppercase">HỌC VIÊN ĐÃ ĐỒNG HÀNH</span>
                <span className="text-sm font-black text-[#F97316] leading-none">4.500.000+ học viên</span>
              </div>
            </div>

            <div className="flex items-center gap-3 border-r last:border-0 border-slate-200/80 pr-2">
              <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <span className="font-quicksand font-black text-xs text-slate-800 block uppercase">ĐƯỢC TIN DÙNG BỞI</span>
                <span className="text-[10px] text-slate-400 font-semibold leading-normal">Nhiều doanh nghiệp và cá nhân hàng đầu</span>
              </div>
            </div>

            <div className="text-right">
              <a 
                href="#dang-ky-form"
                className="w-full inline-block px-5 py-3.5 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-bold rounded-xl text-center text-xs uppercase tracking-wider shadow-sm transition-all duration-300"
              >
                Đăng ký học - Nhận ưu đãi ngay &gt;
              </a>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 7: STUDENT TESTIMONIALS */}
      <section id="danh-gia" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-slate-50/30 border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex flex-col gap-1 items-center uppercase mb-12">
            <span>HỌC VIÊN NÓI GÌ VỀ 123ENGLISH?</span>
          </h2>

          <div className="grid lg:grid-cols-3 gap-6 mt-10">
            {[
              { name: 'anh Tuấn', text: 'Sau 3 tháng học tại 123English, em đã tự tin giao tiếp tiếng Anh với người nước ngoài, đạt điểm cao trong kỳ thi học kỳ và không còn sợ môn tiếng Anh trên lớp nữa!', stars: 5, img: '/t1.jpg' },
              { name: 'anh Minh', text: 'Phương pháp học thực tế, dễ tiếp thu và rất vui vẻ. Em đã cải thiện kỹ năng nghe nói rất nhiều và tự tin thuyết trình trước lớp bằng tiếng Anh.', stars: 5, img: '/t2.jpg' },
              { name: 'Hằng Lâm', text: 'Lịch học 1-1 linh hoạt giúp em dễ dàng sắp xếp với lịch học dày đặc trên trường. Thầy cô sửa lỗi phát âm rất kỹ, em tiến bộ rõ rệt!', stars: 5, img: '/t5.jpg' }
            ].map((testi, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 hover:shadow-lg transition-all duration-300 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
                    <div className="flex items-center gap-3">
                      <img src={testi.img} alt={testi.name} className="w-10 h-10 rounded-full object-cover border-2 border-slate-100" />
                      <h4 className="font-jakarta font-bold text-sm text-slate-800 leading-none">{testi.name}</h4>
                    </div>
                    <div className="flex gap-0.5 text-amber-400">
                      {Array.from({ length: testi.stars }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed italic">"{testi.text}"</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* SECTION 8: PERKS VS VOUCHERS */}
      <section id="uu-dai" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-8 items-stretch">
          
          {/* Left Column (Blue Accent) */}
          <div className="bg-[#EFF6FF]/60 p-6 sm:p-8 rounded-[2.5rem] border border-blue-100 flex flex-col justify-between shadow-sm">
            <div>
              <h3 className="font-quicksand font-black text-lg text-[#2563EB] uppercase tracking-wider mb-6 pb-3 border-b border-blue-200/50">
                LẤY LẠI GỐC TIẾNG ANH CÙNG <span className="text-[#10B981]">123ENGLISH</span>
              </h3>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mb-6">Sau khóa học bạn sẽ tự tin giao tiếp, học tập</p>
              
              <ul className="space-y-4 font-jakarta font-semibold text-xs sm:text-sm text-slate-700">
                {[
                  'Tự tin giao tiếp trong các tình huống hàng ngày',
                  'Nâng cao kỹ năng làm việc và thuyết trình',
                  'Phản xạ nhanh, nghe nói tự nhiên',
                  'Tiết kiệm thời gian và chi phí học tập'
                ].map((item, pIdx) => (
                  <li key={pIdx} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="bg-white p-4 rounded-2xl border border-blue-100 text-center shadow-sm">
                <span className="font-quicksand font-black text-2xl text-[#2563EB] block">98%</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase leading-tight mt-1 block">Học viên hài lòng sau lộ trình học</span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-blue-100 text-center shadow-sm">
                <span className="font-quicksand font-black text-2xl text-[#10B981] block">5.000+</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase leading-tight mt-1 block">Học viên đạt kết quả tốt tự tin sử dụng</span>
              </div>
            </div>
          </div>

          {/* Right Column (Orange Accent) */}
          <div className="bg-[#FFFBEB]/60 p-6 sm:p-8 rounded-[2.5rem] border border-amber-100 flex flex-col justify-between shadow-sm">
            <div>
              <h3 className="font-quicksand font-black text-lg text-[#D97706] uppercase tracking-wider mb-6 pb-3 border-b border-amber-200/50">
                ƯU ĐÃI DÀNH CHO HỌC VIÊN MỚI
              </h3>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mb-6">Những quà tặng và hỗ trợ độc quyền từ trung tâm</p>
              
              <div className="space-y-4 font-jakarta">
                {[
                  { title: 'Voucher học phí', desc: 'đến 30-50%', icon: Gift, color: 'text-rose-500 bg-rose-50 border-rose-100' },
                  { title: 'Tặng buổi học thử', desc: '1 kèm 1 cùng giáo viên', icon: Calendar, color: 'text-amber-500 bg-amber-50 border-amber-100' },
                  { title: 'Quà tặng độc quyền', desc: 'từ 123English', icon: Award, color: 'text-blue-500 bg-blue-50 border-blue-100' }
                ].map((reward, rIdx) => (
                  <div key={rIdx} className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-amber-100/45 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${reward.color}`}>
                      <reward.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-quicksand font-black text-xs text-slate-800 block uppercase tracking-wide">{reward.title}</span>
                      <span className="text-xs text-slate-400 font-bold mt-0.5">{reward.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-8 text-center bg-white p-3 rounded-2xl border border-amber-100/40">
              <span className="text-[10px] text-[#b45309] font-bold">Lưu ý: Ưu đãi chỉ áp dụng cho đăng ký trong tháng này</span>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 9: ASSESSMENT BANNER */}
      <section id="kiem-tra" className="py-12 px-4 sm:px-6 md:px-12 lg:px-20 bg-gradient-to-r from-[#FBBF24] to-[#F59E0B] text-slate-900 scroll-mt-20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div>
            <h2 className="font-quicksand font-black text-xl sm:text-2xl text-slate-900 tracking-tight leading-none uppercase">
              TRÌNH ĐỘ TIẾNG ANH CỦA BẠN ĐANG Ở ĐÂU?
            </h2>
            <p className="font-jakarta font-bold text-xs sm:text-sm text-slate-800/90 mt-2 leading-relaxed">
              Làm bài kiểm tra ngắn để biết lộ trình học phù hợp nhất với bạn
            </p>
          </div>
          <button 
            onClick={onOpenSearchModal}
            className="w-full md:w-auto px-8 py-4 bg-[#2563EB] hover:bg-blue-700 text-white font-quicksand font-extrabold rounded-xl text-center text-xs uppercase tracking-wider shadow-md transition-all duration-300"
          >
            Kiểm tra trình độ ngay &gt;
          </button>
        </div>
      </section>

      {/* SECTION 10: PRESS */}
      <section id="bao-chi" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex flex-col gap-1 items-center uppercase mb-12">
            <span>BÁO CHÍ NÓI GÌ VỀ 123ENGLISH?</span>
          </h2>

          <div className="grid lg:grid-cols-3 gap-6">
            {[
              { title: 'THANH NIÊN', text: '123English - giải pháp học tiếng Anh hiệu quả hàng đầu dành cho học sinh mất gốc.' },
              { title: 'DÂN TRÍ', text: 'Học tiếng Anh hiệu quả và tiết kiệm chi phí cùng lộ trình cá nhân hóa tại 123English.' },
              { title: 'KÊNH 14', text: 'Mẹo lấy lại gốc tiếng Anh nhanh chóng cho học sinh và người đi làm bận rộn.' }
            ].map((media, idx) => (
              <div key={idx} className="bg-[#F8FAFC] p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-all duration-300 flex flex-col items-center text-center shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-quicksand font-black text-[9px] mb-4 border border-blue-100">
                  NEWS
                </div>
                <span className="font-quicksand font-black text-xs text-[#2563EB] uppercase tracking-wider mb-2">{media.title}</span>
                <p className="font-jakarta font-semibold text-xs text-slate-500 leading-relaxed italic">"{media.text}"</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* SECTION 11: PARTNERS */}
      <section id="doi-tac" className="py-12 px-4 sm:px-6 md:px-12 lg:px-20 bg-slate-50/50 border-t border-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-center font-quicksand font-bold text-xs text-slate-400 uppercase tracking-widest mb-8">CÁC ĐỐI TÁC</h3>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-60">
            {['HDBank', 'VinID', 'SAMSUNG', 'Standard Chartered', 'VIB'].map((partner, idx) => (
              <span key={idx} className="font-quicksand font-black text-base md:text-lg text-slate-700 tracking-wider hover:opacity-100 transition-opacity cursor-default uppercase">{partner}</span>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 12: ACCORDION FAQS */}
      <section id="cau-hoi" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          
          <h2 className="text-center font-quicksand font-extrabold text-2xl sm:text-3xl text-slate-800 tracking-tight flex items-center justify-center gap-2 mb-10 uppercase">
            <HelpCircle className="w-8 h-8 text-[#2563EB]" />
            CÂU HỎI THƯỜNG GẶP
          </h2>

          <div className="space-y-3 font-jakarta font-bold text-sm">
            {[
              { q: 'Tôi bị mất gốc hoàn toàn, học khóa học này có theo kịp không?', a: 'Hoàn toàn được. Lộ trình học 1 kèm 1 được thiết kế riêng bắt đầu từ những kiến thức căn bản nhất, giáo viên sẽ đi theo tốc độ tiếp thu của bạn, giúp bạn xây lại nền tảng vững chắc.', idx: 0 },
              { q: 'Lịch học có linh hoạt không? Tôi đi học/đi làm bận rộn có tự sắp xếp được không?', a: 'Lịch học cực kỳ linh hoạt từ 8:00 đến 23:00 hàng ngày. Bạn có thể tự chọn khung giờ rảnh và đăng ký trước với giáo viên qua ứng dụng học tập.', idx: 1 },
              { q: 'Phương pháp 25 phút mỗi ngày có thực sự hiệu quả so với học trực tiếp 1-2 tiếng?', a: 'Nghiên cứu chỉ ra rằng 25 phút tập trung tương tác 1 kèm 1 trực tiếp có hiệu quả hơn nhiều so với 90 phút học nhóm thụ động. Việc luyện phản xạ đều đặn mỗi ngày giúp não bộ ghi nhớ tốt hơn.', idx: 2 },
              { q: 'Trung tâm có cam kết đầu ra bằng văn bản không?', a: 'Có. 123English cam kết đầu ra bằng văn bản rõ ràng. Nếu học viên đi học đầy đủ và làm bài tập theo lộ trình mà không tiến bộ, trung tâm cam kết hoàn học phí hoặc hỗ trợ học lại miễn phí.', idx: 3 },
              { q: 'Tôi có thể đổi giáo viên nếu cảm thấy không hợp phương pháp không?', a: 'Được. Bạn có thể yêu cầu đổi giáo viên bất kỳ lúc nào nếu cảm thấy không hài lòng hoặc không phù hợp với phong cách giảng dạy, bộ phận học vụ sẽ hỗ trợ ngay lập tức.', idx: 4 }
            ].map((faq) => (
              <div key={faq.idx} className="bg-white border border-slate-100 rounded-2xl overflow-hidden transition-all duration-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => setFaqIndex(faqIndex === faq.idx ? null : faq.idx)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-slate-50 transition-colors text-slate-800 font-semibold"
                >
                  <span className="text-xs sm:text-sm">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${faqIndex === faq.idx ? 'rotate-180 text-[#2563EB]' : ''}`} />
                </button>
                {faqIndex === faq.idx && (
                  <div className="px-5 pb-5 pt-1 text-slate-500 font-medium text-xs leading-relaxed border-t border-slate-50 bg-[#EFF6FF]/20">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* SECTION 13: FOOTER SIGNUP BANNER */}
      <section id="dang-ky-form" className="py-16 px-4 sm:px-6 md:px-12 lg:px-20 bg-white border-t border-slate-50">
        <div className="max-w-7xl mx-auto bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-[2.5rem] p-8 sm:p-12 relative overflow-hidden shadow-xl text-white border border-blue-500/30">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 right-20 w-52 h-52 bg-blue-600/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="max-w-7xl mx-auto grid lg:grid-cols-[60%_40%] gap-8 items-center relative z-10">
            
            {/* Left Side */}
            <div>
              <span className="inline-block px-3 py-1 bg-white/10 text-white font-extrabold text-[10px] rounded-full uppercase tracking-wider mb-3 font-quicksand">
                Chương trình lấy lại gốc tiếng anh
              </span>
              <h3 className="font-quicksand font-extrabold text-2xl sm:text-3xl leading-tight">
                Đăng ký học thử miễn phí ngay!
              </h3>
              <p className="mt-2 text-xs sm:text-sm font-semibold opacity-80 leading-relaxed max-w-md">
                Lấy lại gốc tiếng Anh nhanh chóng, tự tin giao tiếp chỉ sau một lộ trình học.
              </p>
              
              <div className="mt-6 flex flex-col gap-2 font-jakarta font-bold text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>Hotline hỗ trợ 24/7: 1900 633 876</span>
                </div>
              </div>
            </div>

            {/* Right Side: Form */}
            <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 text-slate-800">
              <form onSubmit={handleFooterSubmit} className="space-y-3">
                <input 
                  type="text" 
                  required
                  value={footerName}
                  onChange={(e) => setFooterName(e.target.value)}
                  placeholder="Họ và tên của bạn *"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#2563EB] font-medium text-slate-900"
                />
                <input 
                  type="tel" 
                  required
                  value={footerPhone}
                  onChange={(e) => setFooterPhone(e.target.value)}
                  placeholder="Số điện thoại liên hệ *"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-[#2563EB] font-medium text-slate-900"
                />
                <button 
                  type="submit"
                  className="w-full py-4 bg-[#10B981] hover:bg-[#0d9468] text-white font-quicksand font-extrabold rounded-xl transition-all duration-300 text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-sm"
                >
                  ĐĂNG KÝ HỌC THỬ MIỄN PHÍ &gt;
                </button>
              </form>
            </div>

          </div>
        </div>
      </section>
    </div>
  )
}
