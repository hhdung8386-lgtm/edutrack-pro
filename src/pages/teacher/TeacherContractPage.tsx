import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { toast } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { FileText, Download, ShieldCheck, Clock, MapPin, Laptop } from 'lucide-react'

const TERMS_CONTENT = `ĐIỀU KHOẢN SỬ DỤNG (TERMS OF SERVICE)

HỘ KINH DOANH GIA SƯ TOÀN NĂNG
Mã số hộ kinh doanh: 8612642576-001
Địa chỉ trụ sở: 78/20 Hoàng Văn Hợp, Phường An Lạc, Thành phố Hồ Chí Minh
Người đại diện: Nguyễn Thu Trang
Điện thoại: 090.696.6691

Điều 1. Phạm vi điều chỉnh và đối tượng áp dụng

Điều khoản sử dụng này quy định các quyền và nghĩa vụ giữa Hộ kinh doanh Gia sư Toàn Năng và người dùng khi truy cập, đăng ký tài khoản hoặc sử dụng hệ thống, nền tảng hoặc dịch vụ do Hộ kinh doanh cung cấp. Người dùng trong phạm vi điều khoản này bao gồm nhưng không giới hạn ở gia sư, học viên, nhân sự, cộng tác viên và các đối tác có liên quan.

Việc người dùng thực hiện đăng ký tài khoản, truy cập hoặc sử dụng bất kỳ chức năng nào của hệ thống được hiểu là người dùng đã đọc, hiểu đầy đủ và đồng ý bị ràng buộc bởi toàn bộ nội dung của Điều khoản sử dụng này. Người dùng đồng ý rằng hành vi tích chọn xác nhận hoặc bất kỳ hình thức chấp thuận điện tử nào khác đều có giá trị pháp lý tương đương với việc ký kết văn bản bằng chữ ký tay theo quy định của pháp luật hiện hành.

Điều 2. Tài khoản người dùng và trách nhiệm quản lý

Người dùng có trách nhiệm cung cấp thông tin đăng ký chính xác, đầy đủ và cập nhật khi có thay đổi. Người dùng có nghĩa vụ bảo mật thông tin tài khoản, bao gồm tên đăng nhập, mật khẩu và các thông tin xác thực khác.

Mọi hoạt động phát sinh từ tài khoản của người dùng, bao gồm nhưng không giới hạn ở việc đăng nhập, tương tác, trao đổi thông tin, thực hiện giao dịch hoặc sử dụng các chức năng của hệ thống, đều được mặc định là do chính người dùng thực hiện. Người dùng không được viện dẫn việc bị lộ tài khoản, bị truy cập trái phép hoặc bất kỳ lý do tương tự nào để từ chối trách nhiệm đối với các hành vi phát sinh từ tài khoản của mình.

Điều 3. Nguyên tắc sử dụng hệ thống

Người dùng cam kết sử dụng hệ thống một cách trung thực, minh bạch và đúng mục đích. Người dùng không được phép thực hiện các hành vi nhằm lách, né hoặc làm sai lệch cơ chế vận hành của hệ thống.
Cụ thể, người dùng không được trực tiếp hoặc gián tiếp liên hệ riêng với khách hàng được giới thiệu thông qua hệ thống nhằm thực hiện giao dịch ngoài nền tảng. Người dùng không được phép chuyển hướng khách hàng, thỏa thuận riêng, hoặc sử dụng thông tin có được từ hệ thống để phục vụ lợi ích cá nhân hoặc bên thứ ba mà không có sự chấp thuận bằng văn bản của Hộ kinh doanh.

Điều 4. Ghi nhận và giá trị của dữ liệu điện tử

Người dùng đồng ý rằng toàn bộ dữ liệu được hệ thống ghi nhận trong quá trình sử dụng, bao gồm nhưng không giới hạn ở thời gian truy cập, địa chỉ IP, thiết bị sử dụng, lịch sử thao tác, nội dung trao đổi, dữ liệu hành vi và các thông tin liên quan khác, có thể được sử dụng làm bằng chứng hợp lệ trong quá trình xử lý khiếu nại hoặc tranh chấp.

Người dùng xác nhận từ bỏ quyền khiếu nại về tính hợp lệ, tính chính xác hoặc giá trị pháp lý của các dữ liệu điện tử này, trừ trường hợp có bằng chứng rõ ràng chứng minh sai sót từ phía hệ thống.

Điều 5. Các hành vi bị nghiêm cấm

Người dùng không được thực hiện bất kỳ hành vi nào gây phương hại đến hoạt động của hệ thống hoặc quyền lợi hợp pháp của Hộ kinh doanh, bao gồm việc tiết lộ thông tin khách hàng, dữ liệu nội bộ, quy trình vận hành hoặc tài liệu chưa được công bố.

Người dùng không được phép trao đổi, cung cấp hoặc chia sẻ thông tin liên hệ cá nhân nhằm mục đích thực hiện giao dịch ngoài hệ thống. Các hành vi gian lận tài chính, sử dụng trái phép dữ liệu, lôi kéo khách hàng ra khỏi nền tảng hoặc gây thiệt hại về tài chính, uy tín cho hệ thống đều bị xem là vi phạm nghiêm trọng.

Điều 6. Quyền của Hộ kinh doanh

Hộ kinh doanh có quyền giám sát, kiểm tra và ghi nhận toàn bộ hoạt động của người dùng trên hệ thống nhằm đảm bảo tính an toàn và minh bạch.

Trong trường hợp phát hiện dấu hiệu vi phạm hoặc rủi ro tiềm ẩn, Hộ kinh doanh có quyền tạm ngưng hoặc chấm dứt quyền truy cập của người dùng, tạm giữ hoặc từ chối thanh toán, thu hồi các quyền lợi liên quan mà không cần thông báo trước.

Hộ kinh doanh có quyền điều chỉnh, cập nhật hoặc thay đổi nội dung điều khoản sử dụng và các chính sách liên quan nhằm phù hợp với tình hình thực tế và quy định pháp luật.

Điều 7. Trách nhiệm bồi thường
Người dùng đồng ý chịu trách nhiệm bồi thường toàn bộ thiệt hại phát sinh do hành vi vi phạm của mình gây ra, bao gồm thiệt hại trực tiếp và gián tiếp như tổn thất doanh thu, chi phí vận hành, chi phí đào tạo, thiệt hại về uy tín và các cơ hội kinh doanh bị mất.

Mức bồi thường có thể được xác định dựa trên giá trị thiệt hại thực tế hoặc theo mức ước tính hợp lý do Hộ kinh doanh đưa ra, trong đó có thể bao gồm mức bồi thường tối thiểu tương đương ba lần giá trị thiệt hại ước tính.

Điều 8. Bảo mật thông tin và quyền sở hữu

Toàn bộ dữ liệu, nội dung, tài liệu, quy trình và hệ thống kỹ thuật thuộc quyền sở hữu hợp pháp của Hộ kinh doanh. Người dùng không được phép sao chép, phân phối, khai thác hoặc sử dụng các thông tin này ngoài phạm vi được cho phép.

Nghĩa vụ bảo mật của người dùng có hiệu lực trong suốt thời gian sử dụng hệ thống và tiếp tục kéo dài ít nhất mười hai tháng kể từ thời điểm chấm dứt sử dụng hoặc chấm dứt hợp tác.

Điều 9. Không cạnh tranh

Trong thời gian sử dụng hệ thống và trong vòng mười hai tháng kể từ thời điểm chấm dứt, người dùng không được phép trực tiếp hoặc gián tiếp cung cấp dịch vụ cho khách hàng có được từ hệ thống hoặc sử dụng dữ liệu, kinh nghiệm và quy trình vận hành của hệ thống để phục vụ cho hoạt động cạnh tranh.

Điều 10. Chấm dứt và hậu quả pháp lý

Hộ kinh doanh có quyền chấm dứt quyền sử dụng của người dùng ngay lập tức trong trường hợp phát hiện vi phạm hoặc có dấu hiệu gây thiệt hại. Việc chấm dứt không làm mất đi các nghĩa vụ còn tồn tại của người dùng, bao gồm nghĩa vụ bồi thường, bảo mật và các nghĩa vụ pháp lý khác.

Điều 11. Giới hạn trách nhiệm

Hộ kinh doanh không chịu trách nhiệm đối với các thiệt hại gián tiếp, mất lợi nhuận hoặc mất dữ liệu phát sinh từ việc sử dụng hệ thống, trừ trường hợp có lỗi trực tiếp từ phía hệ thống theo quy định pháp luật.

Điều 12. Giải quyết tranh chấp

Mọi tranh chấp phát sinh sẽ được ưu tiên giải quyết thông qua thương lượng và hòa giải. Trường hợp không đạt được thỏa thuận, tranh chấp sẽ được giải quyết tại Tòa án có thẩm quyền tại Thành phố Hồ Chí Minh.

Điều 13. Hiệu lực và sửa đổi
Điều khoản sử dụng này có hiệu lực kể từ thời điểm người dùng xác nhận đồng ý và có thể được sửa đổi, bổ sung bất kỳ lúc nào. Việc người dùng tiếp tục sử dụng hệ thống sau khi có thay đổi được hiểu là đã chấp nhận các nội dung cập nhật.

CHÍNH SÁCH BẢO MẬT (PRIVACY POLICY)
Điều 1. Nguyên tắc thu thập thông tin

Hệ thống thu thập thông tin cá nhân và dữ liệu sử dụng của người dùng nhằm phục vụ cho hoạt động vận hành, cải thiện chất lượng dịch vụ và đảm bảo an toàn hệ thống. Các thông tin này có thể bao gồm thông tin định danh, thông tin liên hệ và dữ liệu phát sinh trong quá trình sử dụng.

Điều 2. Mục đích sử dụng thông tin

Thông tin thu thập được sử dụng cho mục đích quản lý tài khoản, cung cấp dịch vụ, xử lý giao dịch, nâng cao trải nghiệm người dùng, phát hiện và ngăn chặn hành vi gian lận, cũng như phục vụ cho việc giải quyết tranh chấp khi cần thiết.

Điều 3. Lưu trữ và bảo mật

Dữ liệu của người dùng được lưu trữ trên hệ thống và được bảo vệ bằng các biện pháp kỹ thuật và quản lý phù hợp nhằm hạn chế truy cập trái phép, mất mát hoặc rò rỉ thông tin.

Điều 4. Chia sẻ thông tin

Hộ kinh doanh cam kết không bán hoặc trao đổi dữ liệu người dùng cho bên thứ ba. Việc chia sẻ thông tin chỉ được thực hiện trong trường hợp có sự đồng ý của người dùng, theo yêu cầu của cơ quan nhà nước có thẩm quyền hoặc nhằm phục vụ cho hoạt động vận hành hợp pháp của hệ thống.

Điều 5. Quyền của người dùng đối với dữ liệu

Người dùng có quyền yêu cầu truy cập, chỉnh sửa hoặc xóa thông tin cá nhân của mình. Tuy nhiên, trong một số trường hợp cần thiết, hệ thống có thể tiếp tục lưu trữ dữ liệu nhằm phục vụ cho việc đối soát, giải quyết tranh chấp hoặc tuân thủ quy định pháp luật.

Điều 6. Dữ liệu hành vi và theo dõi

Người dùng đồng ý rằng hệ thống có thể ghi nhận và phân tích dữ liệu hành vi trong quá trình sử dụng nhằm phát hiện các hành vi vi phạm, đảm bảo an toàn và tối ưu hiệu suất hệ thống. Các dữ liệu này có thể được sử dụng làm căn cứ xử lý khi có tranh chấp.

Điều 7. Hiệu lực

Chính sách bảo mật này có thể được cập nhật, sửa đổi theo thời gian và có hiệu lực kể từ thời điểm được công bố. Việc người dùng tiếp tục sử dụng hệ thống sau khi có thay đổi được xem là đã chấp nhận các nội dung cập nhật.`;

export function TeacherContractPage() {
  const { teacherId } = useAuthStore()
  const { t } = useLanguageStore()
  const [submitting, setSubmitting] = useState(false)
  const [contracts, setContracts] = useState<any[]>([])
  
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [isAgreed, setIsAgreed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!teacherId) return
    const q = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
    const unsub = onSnapshot(q, (snap) => {
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)))
    })
    return unsub
  }, [teacherId])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    // Consider it scrolled to bottom if within 50px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 50) {
      setHasScrolledToBottom(true)
    }
  }

  const handleDownloadToS = () => {
    const element = document.createElement("a");
    const file = new Blob([TERMS_CONTENT], {type: 'text/plain;charset=utf-8'});
    element.href = URL.createObjectURL(file);
    element.download = "Dieu_Khoan_Su_Dung_Gia_Su_Toan_Nang.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  const onSubmit = async () => {
    if (!isAgreed) {
      toast.error('Vui lòng đồng ý với các điều khoản')
      return
    }
    
    setSubmitting(true)
    try {
      // Fetch IP with error handling
      let ipAddress = 'Không xác định'
      try {
        const response = await fetch('https://api.ipify.org?format=json')
        if (response.ok) {
          const data = await response.json()
          ipAddress = data.ip
        }
      } catch (err) {
        console.error('Không thể lấy địa chỉ IP:', err)
        // IP not critical enough to stop the whole process if adblocker blocks it
      }

      const userAgent = navigator.userAgent;

      // Fetch teacher name for admin display
      let teacherName = 'Giáo viên'
      try {
        const tSnap = await getDoc(doc(db, 'teachers', teacherId!))
        if (tSnap.exists()) teacherName = tSnap.data().name || teacherName
      } catch {}

      await addDoc(collection(db, 'contracts'), {
        teacherId,
        teacherName,
        type: 'terms_of_service',
        status: 'agreed',
        agreedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        ipAddress,
        userAgent,
        termsVersion: "2026-05-03",
      })
      
      toast.success('Xác nhận điều khoản thành công!')
      // Reset form not needed since hasAgreedBefore will hide the UI
    } catch (e: any) {
      toast.error('Có lỗi xảy ra: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Check if they have already agreed or have an old contract
  const hasAgreedBefore = contracts.some(c => c.type === 'terms_of_service' || c.status === 'agreed' || c.status === 'pending' || c.status === 'approved')

  return (
    <div className="max-w-3xl mx-auto space-y-6 pt-2 lg:pt-6 pb-20 animate-fade-in">
      <div className="bg-gradient-to-r from-[#3BB8EB] to-[#2196F3] rounded-2xl p-6 text-white shadow-lg shadow-sky-200/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <h1 className="text-2xl font-bold relative z-10">{t('contract.title')}</h1>
        <p className="text-sm text-sky-100 mt-1 relative z-10">
          {t('contract.scroll_hint')}
        </p>
      </div>

      {!hasAgreedBefore && (
        <Card className="hover:shadow-xl transition-all duration-300 border-sky-100/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#3BB8EB]" />
          <div className="space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                <FileText className="w-5 h-5 text-[#3BB8EB]" />
                Nội dung Điều khoản & Chính sách
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadToS} className="text-xs bg-white shrink-0">
                <Download className="w-4 h-4 mr-2" />
                Tải về bản sao (.TXT)
              </Button>
            </div>

            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="bg-white border border-slate-200 rounded-xl p-4 h-[400px] overflow-y-auto text-sm text-slate-700 leading-relaxed shadow-inner scroll-smooth"
            >
              <div className="whitespace-pre-wrap">
                {TERMS_CONTENT.split('\n').map((line, i) => {
                  const trimmed = line.trim()
                  const isBoldHeading = /^(Điều \d+\.|ĐIỀU KHOẢN|CHÍNH SÁCH BẢO MẬT|HỘ KINH DOANH)/.test(trimmed)
                  return isBoldHeading ? (
                    <span key={i} className="font-bold text-slate-900">{line}{'\n'}</span>
                  ) : (
                    <span key={i}>{line}{'\n'}</span>
                  )
                })}
              </div>
            </div>

            {!hasScrolledToBottom && (
              <div className="text-center p-2.5 bg-amber-50 text-amber-700 rounded-lg text-sm border border-amber-200 animate-pulse font-medium">
                Vui lòng lướt đọc xuống cuối văn bản để có thể đánh dấu xác nhận.
              </div>
            )}

            <div className={`p-4 rounded-xl border transition-all duration-300 ${hasScrolledToBottom ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200 opacity-60 pointer-events-none'}`}>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="mt-0.5 relative flex items-center justify-center shrink-0">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer peer transition-all"
                    checked={isAgreed}
                    onChange={(e) => setIsAgreed(e.target.checked)}
                    disabled={!hasScrolledToBottom}
                  />
                </div>
                <span className="text-sm font-medium text-slate-800 select-none">
                  Tôi xác nhận đã đọc, hiểu và đồng ý với Điều khoản sử dụng và Chính sách bảo mật, đồng thời chịu trách nhiệm với mọi hoạt động phát sinh từ tài khoản.
                </span>
              </label>
            </div>

            <Button 
              fullWidth 
              size="lg" 
              onClick={onSubmit} 
              loading={submitting}
              disabled={!isAgreed}
              className="mt-4 shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 h-12"
            >
              <ShieldCheck className="w-5 h-5 mr-2" />
              Đồng ý và Xác nhận
            </Button>
          </div>
        </Card>
      )}

      {contracts.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Lịch sử hồ sơ</h2>
          <div className="space-y-3">
            {contracts.map(c => (
              <Card key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:-translate-y-1 hover:shadow-md transition-all duration-300 border-emerald-200 bg-emerald-50/30">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0 mt-1 sm:mt-0">
                    <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-900">
                      Đã xác nhận Điều khoản dịch vụ
                    </p>
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {c.agreedAt ? c.agreedAt.toDate().toLocaleString('vi-VN') : (c.createdAt ? c.createdAt.toDate().toLocaleString('vi-VN') : 'Đang xử lý...')}
                      </p>
                      {c.ipAddress && (
                        <p className="text-xs text-slate-600 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          IP: <span className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{c.ipAddress}</span>
                        </p>
                      )}
                      {c.userAgent && (
                        <p className="text-xs text-slate-600 flex items-start gap-1.5">
                          <Laptop className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-[10px] text-slate-500 break-all leading-tight">{c.userAgent}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <StatusBadge status={c.status === 'agreed' ? 'approved' : c.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
