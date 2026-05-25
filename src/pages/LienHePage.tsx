import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Phone, Globe, ShieldCheck } from 'lucide-react'

export function LienHePage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', subject: '', message: '' })
  const onChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden">
      {/* NAV */}
      <nav className="bg-white border-b border-slate-100 py-3 px-6 md:px-12 lg:px-20 shrink-0 relative z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-12">
            <div className="flex items-center gap-2" />
            <div className="hidden lg:flex items-center gap-8 text-sm font-semibold text-slate-600">
              <Link to="/login" className="hover:text-[#FFC107] transition-colors pb-1">Trang chủ</Link>
              <Link to="/chuong-trinh-hoc" className="hover:text-[#FFC107] transition-colors pb-1">Chương trình học</Link>
              <Link to="/lien-he" className="text-slate-900 border-b-2 border-[#FFC107] pb-1">Liên hệ</Link>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <a href="tel:0906966691" className="hidden sm:flex items-center gap-2 font-bold text-slate-800 hover:text-[#FFC107] transition-colors text-sm">
              <Phone className="w-4 h-4 text-[#FFC107]" />
              090.696.6691
            </a>
            <button className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors">
              <Globe className="w-4 h-4" />
              EN
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="grid grid-cols-1 lg:grid-cols-[46%_54%] flex-[0_0_36%] min-h-0 bg-[#FFFBF0]">
        <div className="flex flex-col justify-center px-6 md:px-12 lg:px-20 gap-2.5 min-w-0">
          <div className="max-w-[560px]">
            <div className="text-[12px] font-bold text-[#FFC107] tracking-wide mb-2">Liên hệ với chúng tôi</div>
            <h1 className="text-[clamp(20px,2.4vw,34px)] font-extrabold leading-[1.15] text-slate-900">
              Chúng tôi luôn sẵn sàng<br />
              <span className="text-[#FFC107]">đồng hành cùng bạn</span>
            </h1>
            <p className="text-[clamp(11.5px,0.9vw,13.5px)] text-slate-600 leading-relaxed mt-3">
              Nếu bạn có bất kỳ câu hỏi, thắc mắc hay cần tư vấn về chương trình học,<br />
              đội ngũ 123 English luôn sẵn lòng hỗ trợ bạn nhanh chóng và tận tâm nhất.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div>
                <div className="text-[12px] font-bold text-slate-900">Tư vấn tận tâm</div>
                <div className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">Đội ngũ tư vấn viên chuyên nghiệp</div>
              </div>
              <div>
                <div className="text-[12px] font-bold text-slate-900">Hỗ trợ nhanh chóng</div>
                <div className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">Phản hồi trong vòng 24 giờ</div>
              </div>
              <div>
                <div className="text-[12px] font-bold text-slate-900">Bảo mật thông tin</div>
                <div className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">Cam kết bảo mật tuyệt đối</div>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-hidden h-full bg-[#FFFBF0] flex items-center justify-center">
          <img
            src="/lienhe.png"
            alt="Liên hệ"
            className="w-full h-full object-contain object-center block"
          />
        </div>
      </section>

      {/* CONTENT */}
      <section className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[38%_62%] overflow-hidden">
        {/* LEFT - info */}
        <div className="flex flex-col justify-center px-6 md:px-12 lg:px-20 py-3 gap-2.5 border-r border-slate-100 min-w-0 overflow-hidden">
          <h2 className="text-[clamp(14px,1.25vw,17px)] font-extrabold text-slate-900">Thông tin liên hệ</h2>

          <div className="space-y-2">
            <div>
              <div className="text-[10.5px] text-slate-500 font-medium">Hotline</div>
              <div className="text-[14px] font-bold text-[#FFC107] leading-tight">090.696.6691</div>
              <div className="text-[10.5px] text-slate-500 leading-tight">Thứ 2 - Chủ nhật: 8:00 - 21:00</div>
            </div>
            <div>
              <div className="text-[10.5px] text-slate-500 font-medium">Email</div>
              <div className="text-[12.5px] font-bold text-slate-900 leading-tight">support@123english.vn</div>
              <div className="text-[10.5px] text-slate-500 leading-tight">Phản hồi trong vòng 24 giờ</div>
            </div>
            <div>
              <div className="text-[10.5px] text-slate-500 font-medium">Địa chỉ</div>
              <div className="text-[12px] font-bold text-slate-900 leading-snug">123 Đường số 1, Khu đô thị Sala</div>
              <div className="text-[10.5px] text-slate-500 leading-tight">Phường An Lợi Đông, TP. Thủ Đức, TP. HCM</div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="text-[10.5px] text-slate-500 font-medium">Facebook</div>
                <div className="text-[11.5px] font-bold text-slate-900 truncate">facebook.com/123english.vn</div>
              </div>
              <div>
                <div className="text-[10.5px] text-slate-500 font-medium">Website</div>
                <div className="text-[11.5px] font-bold text-slate-900 truncate">www.123english.vn</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT - form */}
        <div className="flex flex-col justify-center px-6 md:px-12 lg:px-20 py-3 gap-2.5 min-w-0 overflow-hidden">
          <h2 className="text-[clamp(14px,1.25vw,17px)] font-extrabold text-slate-900">Gửi tin nhắn cho chúng tôi</h2>

          <form
            onSubmit={(e) => { e.preventDefault(); alert('Cảm ơn bạn đã gửi tin nhắn!') }}
            className="grid grid-cols-2 gap-2.5"
          >
            <input
              required value={form.name} onChange={onChange('name')}
              placeholder="Họ và tên của bạn *"
              className="col-span-1 px-3.5 py-2.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#FFC107] placeholder-slate-400"
            />
            <input
              required value={form.phone} onChange={onChange('phone')}
              placeholder="Số điện thoại *"
              className="col-span-1 px-3.5 py-2.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#FFC107] placeholder-slate-400"
            />
            <input
              type="email" value={form.email} onChange={onChange('email')}
              placeholder="Email của bạn"
              className="col-span-2 px-3.5 py-2.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#FFC107] placeholder-slate-400"
            />
            <select
              value={form.subject} onChange={onChange('subject')}
              className="col-span-2 px-3.5 py-2.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#FFC107] text-slate-700 bg-white"
            >
              <option value="">Chọn chủ đề</option>
              <option>Tư vấn chương trình học</option>
              <option>Học phí & ưu đãi</option>
              <option>Lịch học & thời gian</option>
              <option>Phản hồi & khiếu nại</option>
              <option>Khác</option>
            </select>
            <textarea
              value={form.message} onChange={onChange('message')}
              placeholder="Nội dung tin nhắn của bạn..."
              rows={2}
              className="col-span-2 px-3.5 py-2.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#FFC107] placeholder-slate-400 resize-none"
            />
            <div className="col-span-2 flex items-center gap-4">
              <button
                type="submit"
                className="px-7 py-2.5 bg-[#FFC107] hover:bg-[#FFB300] text-slate-900 font-bold text-[13px] rounded-lg transition-colors whitespace-nowrap"
              >
                Gửi tin nhắn
              </button>
              <p className="text-[11px] text-slate-500 leading-snug">
                Thông tin của bạn được bảo mật và chỉ sử dụng để hỗ trợ.
              </p>
            </div>
          </form>
        </div>
      </section>

      {/* FOOTER — match LoginPage style */}
      <footer className="border-t border-slate-200 bg-white py-3 shrink-0">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            © 2026 Hộ kinh doanh Gia Sư Toàn Năng
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-500 font-medium">
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Chính sách bảo mật</span>
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Điều khoản sử dụng</span>
            <a href="https://facebook.com/123englishinvietnam" target="_blank" rel="noopener noreferrer" className="w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-black transition-colors font-bold text-[9px]">f</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
