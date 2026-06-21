import { ShieldCheck } from 'lucide-react'
import { PublicNav } from '@/components/layout/PublicNav'

export function ChuongTrinhHocPage() {
  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden">
      <PublicNav />

      {/* HERO — 32% */}
      <section className="grid grid-cols-1 lg:grid-cols-[42%_58%] flex-[0_0_32%] min-h-0 bg-[#FFFBF0]">
        <div className="flex flex-col justify-center px-6 md:px-12 lg:px-20 min-w-0">
          <div className="max-w-[560px]">
            <span className="inline-flex w-fit items-center px-4 py-1 border border-[#FFC107] rounded-full text-[12px] font-semibold text-[#FFC107] mb-2.5">
              Chương trình học
            </span>
            <h1 className="text-[clamp(20px,2.2vw,32px)] font-extrabold leading-[1.15] text-slate-900">
              Lộ trình học bài bản<br />
              <span className="text-[#FFC107]">Phát triển toàn diện</span>
            </h1>
            <p className="text-[clamp(11px,0.85vw,13px)] text-slate-600 leading-relaxed mt-2.5">
              Các chương trình được thiết kế theo chuẩn quốc tế,<br />
              phù hợp với từng độ tuổi và mục tiêu học tập.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <div className="text-[12px] font-bold text-slate-900">Chuẩn quốc tế</div>
                <div className="text-[10.5px] text-slate-500 mt-0.5">Theo khung CEFR</div>
              </div>
              <div>
                <div className="text-[12px] font-bold text-slate-900">Lộ trình rõ ràng</div>
                <div className="text-[10.5px] text-slate-500 mt-0.5">Từ cơ bản đến nâng cao</div>
              </div>
              <div>
                <div className="text-[12px] font-bold text-slate-900">Cá nhân hóa</div>
                <div className="text-[10.5px] text-slate-500 mt-0.5">Phù hợp từng học viên</div>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-hidden h-full">
          <img src="/chuongtrinhhoc.png" alt="Chương trình học" className="w-full h-full object-cover object-center block" />
        </div>
      </section>

      {/* PROGRAMS — flex-1 (cards có nhiều không gian nhất) */}
      <section className="flex-1 min-h-0 flex flex-col px-6 md:px-12 lg:px-20 py-2.5">
        <div className="text-center shrink-0">
          <h2 className="text-[clamp(14px,1.35vw,20px)] font-extrabold text-slate-900">
            Chương trình học dành cho <span className="text-[#FFC107]">mọi độ tuổi</span>
          </h2>
          <div className="w-10 h-[3px] bg-[#FFC107] rounded-full mx-auto mt-1" />
        </div>

        <div className="grid grid-cols-5 gap-3 flex-1 min-h-0 mt-2.5 max-w-7xl w-full mx-auto">
          {[
            { img: '/4to6.png',     age: '4 - 6 tuổi',   color: 'bg-emerald-500',  title: 'Tiếng Anh Mầm Non',     desc: 'Học qua trò chơi, bài hát sinh động.' },
            { img: '/6to9.png',     age: '6 - 9 tuổi',   color: 'bg-amber-500',    title: 'Tiếng Anh Thiếu Nhi',   desc: 'Phát triển 4 kỹ năng nghe-nói-đọc-viết.' },
            { img: '/9to13.png',    age: '9 - 13 tuổi',  color: 'bg-blue-500',     title: 'Tiếng Anh Thiếu Niên',  desc: 'Xây dựng ngữ pháp và từ vựng vững chắc.' },
            { img: '/13to18.png',   age: '13 - 18 tuổi', color: 'bg-purple-500',   title: 'Tiếng Anh Trung Học',   desc: 'Luyện thi và phát triển tư duy phản biện.' },
            { img: '/nguoilon.png', age: 'Người lớn',    color: 'bg-orange-500',   title: 'Tiếng Anh Người Lớn',   desc: 'Giao tiếp tự tin trong công việc.' },
          ].map((c, i) => (
            <article key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-shadow min-h-0">
              <div className="basis-[50%] shrink-0 overflow-hidden bg-slate-50">
                <img src={c.img} alt={c.title} className="w-full h-full object-cover object-center block" />
              </div>
              <div className="basis-[50%] grow min-h-0 px-3 py-2.5 flex flex-col">
                <span className={`inline-flex w-fit items-center px-2 py-[1px] rounded-full text-[9.5px] font-bold text-white ${c.color}`}>
                  {c.age}
                </span>
                <h3 className="text-[12.5px] font-bold text-slate-900 leading-tight mt-1.5 line-clamp-1">{c.title}</h3>
                <p className="text-[10.5px] text-slate-500 leading-snug mt-1 line-clamp-1">{c.desc}</p>
                <a href="#" className="text-[10.5px] font-semibold text-[#FFC107] hover:underline mt-auto pt-1.5">Tìm hiểu thêm →</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* STATS — compact */}
      <div className="grid grid-cols-4 gap-4 shrink-0 bg-[#FFFBF0] border-t border-slate-100 px-6 md:px-12 lg:px-20 py-2">
        {[
          { num: '15+',     lbl: 'Năm kinh nghiệm đào tạo tiếng Anh' },
          { num: '10.000+', lbl: 'Học viên đã và đang đồng hành' },
          { num: '50+',     lbl: 'Giáo viên nước ngoài giàu kinh nghiệm' },
          { num: '4.9/5',   lbl: 'Đánh giá trung bình từ học viên & phụ huynh' },
        ].map((s, i) => (
          <div key={i} className="text-center">
            <div className="text-[clamp(15px,1.5vw,22px)] font-extrabold text-[#FFC107] leading-none">{s.num}</div>
            <div className="text-[10.5px] text-slate-600 mt-0.5 leading-tight">{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* FOOTER — compact */}
      <footer className="border-t border-slate-200 bg-white py-2 shrink-0">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            © 2026 Hộ kinh doanh Gia Sư Toàn Năng
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-500 font-medium">
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Chính sách bảo mật</span>
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Điều khoản sử dụng</span>
            <div className="w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-black transition-colors font-bold text-[9px]">f</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
