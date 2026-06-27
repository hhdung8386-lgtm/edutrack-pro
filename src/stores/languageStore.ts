import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Lang = 'vi' | 'en'

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string) => string
}

const translations: Record<string, Record<Lang, string>> = {
  // TeacherLayout
  'nav.attendance': { vi: 'Điểm danh', en: 'Attendance' },
  'nav.history': { vi: 'Lịch sử', en: 'History' },
  'nav.contract': { vi: 'Hợp đồng', en: 'Contract' },
  'nav.availability': { vi: 'Lịch rảnh', en: 'Availability' },
  'nav.schedules': { vi: 'Lịch dạy của tôi', en: 'My Schedules' },
  'nav.profile': { vi: 'Hồ sơ', en: 'Profile' },
  'nav.teacher': { vi: 'Giáo viên', en: 'Teacher' },
  'nav.signout': { vi: 'Đăng xuất', en: 'Sign out' },
  'nav.signed_out': { vi: 'Đã đăng xuất', en: 'Signed out' },

  // AttendancePage
  'attendance.title': { vi: 'Điểm danh', en: 'Attendance' },
  'attendance.subtitle': { vi: 'Nhập mã học viên để bắt đầu', en: 'Enter student code to start' },
  'attendance.student_code': { vi: 'Mã học viên', en: 'Student code' },
  'attendance.search': { vi: 'Tìm', en: 'Search' },
  'attendance.not_found': { vi: 'Không tìm thấy mã này', en: 'Student code not found' },
  'attendance.student_info': { vi: 'Thông tin học viên', en: 'Student info' },
  'attendance.remaining': { vi: 'buổi còn lại', en: 'sessions left' },
  'attendance.no_sessions': { vi: 'Học viên đã hết buổi học', en: 'No remaining sessions' },
  'attendance.exhausted_title': { vi: 'Học viên đã hết buổi', en: 'Student has no sessions left' },
  'attendance.exhausted_subtitle': { vi: 'Buổi học này sẽ được ghi nhận là nợ buổi.', en: 'This lesson will be recorded as a debt session.' },
  'attendance.date': { vi: 'Ngày', en: 'Date' },
  'attendance.duration': { vi: 'Thời lượng', en: 'Duration' },
  'attendance.minutes': { vi: 'phút', en: 'min' },
  'attendance.status': { vi: 'Tình trạng', en: 'Status' },
  'attendance.present': { vi: 'Có mặt', en: 'Present' },
  'attendance.excused': { vi: 'Vắng có phép', en: 'Absent with permission' },
  'attendance.unexcused': { vi: 'Vắng không phép', en: 'Absent without permission' },
  'attendance.excused_info': { vi: '✓ Vắng có phép: không cộng giờ', en: '✓ Excused absence: no minutes added' },
  'attendance.unexcused_info': { vi: '✓ Vắng không phép: cộng 25 phút mặc định', en: '✓ Unexcused absence: default 25 minutes added' },
  'attendance.comment': { vi: 'Nhận xét cho phụ huynh', en: 'Comment for parents' },
  'attendance.comment_placeholder': { vi: 'Bé học tốt, cần ôn thêm phần...', en: 'Student did well, needs to review...' },
  'attendance.homework': { vi: 'Bài tập về nhà', en: 'Homework' },
  'attendance.homework_placeholder': { vi: 'Làm bài tập 1-5 trang 20', en: 'Do exercises 1-5 page 20' },
  'attendance.images': { vi: 'Hình ảnh (tối đa 5)', en: 'Images (max 5)' },
  'attendance.add_images': { vi: 'Thêm ảnh', en: 'Add images' },
  'attendance.max_images': { vi: 'Tối đa 5 ảnh', en: 'Max 5 images' },
  'attendance.submit': { vi: 'Gửi điểm danh', en: 'Submit attendance' },
  'attendance.submitting': { vi: 'Đang gửi...', en: 'Submitting...' },
  'attendance.submitted': { vi: 'Đã gửi điểm danh!', en: 'Attendance submitted!' },
  'attendance.wait_admin': { vi: 'Chờ admin duyệt...', en: 'Waiting for admin approval...' },
  'attendance.submit_success': { vi: 'Đã gửi điểm danh, chờ admin duyệt', en: 'Attendance submitted, awaiting admin approval' },
  'attendance.submit_fail': { vi: 'Gửi điểm danh thất bại', en: 'Failed to submit attendance' },
  'attendance.uploading': { vi: 'Đang tải ảnh, vui lòng chờ', en: 'Uploading images, please wait' },
  'attendance.teacher_info': { vi: 'Giáo viên', en: 'Teacher' },
  'attendance.level': { vi: 'Cấp', en: 'Level' },

  // LessonHistoryPage
  'history.title': { vi: 'Lịch sử buổi dạy', en: 'Lesson history' },
  'history.lessons_taught': { vi: 'Buổi đã dạy', en: 'Lessons taught' },
  'history.total_minutes': { vi: 'Tổng phút', en: 'Total min' },
  'history.monthly_salary': { vi: 'Lương tháng này', en: 'Monthly salary' },
  'history.no_lessons': { vi: 'Không có buổi dạy nào', en: 'No lessons found' },
  'history.month_no_lessons': { vi: 'chưa có buổi dạy nào', en: 'has no lessons yet' },
  'history.pending': { vi: 'Chờ duyệt', en: 'Pending' },
  'history.comment': { vi: 'Nhận xét', en: 'Comment' },
  'history.homework': { vi: 'Bài tập', en: 'Homework' },
  'history.month_label': { vi: 'Tháng', en: 'Month' },

  // ProfilePage
  'profile.not_found': { vi: 'Không tìm thấy hồ sơ', en: 'Profile not found' },
  'profile.level': { vi: 'Cấp', en: 'Level' },
  'profile.copy_link': { vi: 'Sao chép link hồ sơ', en: 'Copy profile link' },
  'profile.copied': { vi: 'Đã sao chép link hồ sơ', en: 'Profile link copied' },
  'profile.this_month': { vi: 'Thống kê tháng này', en: 'This month stats' },
  'profile.lessons_taught': { vi: 'Buổi đã dạy', en: 'Lessons taught' },
  'profile.income': { vi: 'Thu nhập', en: 'Income' },
  'profile.need_help': { vi: 'Cần hỗ trợ từ Admin?', en: 'Need help from Admin?' },
  'profile.contact_admin': { vi: 'Mọi thay đổi về thông tin cá nhân vui lòng liên hệ Admin qua Zalo hoặc Hotline để được cập nhật.', en: 'For any profile changes, please contact Admin via Zalo or Hotline.' },

  // ContractPage
  'contract.title': { vi: 'Hợp đồng & Điều khoản', en: 'Contract & Terms' },
  'contract.status': { vi: 'Trạng thái', en: 'Status' },
  'contract.agreed': { vi: 'Đã đồng ý', en: 'Agreed' },
  'contract.not_agreed': { vi: 'Chưa đồng ý', en: 'Not agreed' },
  'contract.agree_btn': { vi: 'Tôi đồng ý với Điều khoản sử dụng', en: 'I agree to the Terms of Service' },
  'contract.confirm': { vi: 'Xác nhận đồng ý', en: 'Confirm agreement' },
  'contract.scroll_hint': { vi: 'Vui lòng cuộn đọc hết điều khoản để tiếp tục', en: 'Please scroll to read all terms to continue' },
  'contract.agreed_at': { vi: 'Đã đồng ý lúc', en: 'Agreed at' },
  'contract.ip': { vi: 'Địa chỉ IP', en: 'IP address' },
  'contract.device': { vi: 'Thiết bị', en: 'Device' },
  'contract.version': { vi: 'Phiên bản', en: 'Version' },

  // Availability
  'avail.title': { vi: 'Lịch rảnh của bạn', en: 'Your Availability' },
  'avail.subtitle': { vi: 'Đăng ký lịch rảnh hàng tuần để Admin sắp lịch dạy phù hợp', en: 'Register your weekly availability so Admin can schedule classes accordingly' },
  'avail.available': { vi: 'Rảnh', en: 'Available' },
  'avail.unavailable': { vi: 'Bận', en: 'Busy' },
  'avail.add_time': { vi: '+ Thêm khung giờ', en: '+ Add time slot' },
  'avail.remove_time': { vi: 'Xóa', en: 'Remove' },
  'avail.note': { vi: 'Ghi chú', en: 'Note' },
  'avail.note_placeholder': { vi: 'VD: Tháng 6 bận thi, nghỉ 2 tuần...', en: 'E.g., June is busy with exams, off for 2 weeks...' },
  'avail.save': { vi: 'Lưu lịch rảnh', en: 'Save availability' },
  'avail.saving': { vi: 'Đang lưu...', en: 'Saving...' },
  'avail.saved': { vi: 'Đã lưu lịch rảnh!', en: 'Availability saved!' },
  'avail.save_fail': { vi: 'Lưu thất bại', en: 'Failed to save' },
  'avail.last_updated': { vi: 'Đã lưu lúc', en: 'Last saved at' },
  'avail.not_set': { vi: 'Chưa cập nhật', en: 'Not set' },
  'avail.mon': { vi: 'Thứ 2', en: 'Mon' },
  'avail.tue': { vi: 'Thứ 3', en: 'Tue' },
  'avail.wed': { vi: 'Thứ 4', en: 'Wed' },
  'avail.thu': { vi: 'Thứ 5', en: 'Thu' },
  'avail.fri': { vi: 'Thứ 6', en: 'Fri' },
  'avail.sat': { vi: 'Thứ 7', en: 'Sat' },
  'avail.sun': { vi: 'CN', en: 'Sun' },
  'avail.start': { vi: 'Từ', en: 'From' },
  'avail.end': { vi: 'Đến', en: 'To' },

  // Teacher Detail (Admin)
  'td.title': { vi: 'Chi tiết giáo viên', en: 'Teacher Detail' },
  'td.not_found': { vi: 'Không tìm thấy giáo viên', en: 'Teacher not found' },
  'td.edit': { vi: 'Sửa', en: 'Edit' },
  'td.subjects': { vi: 'Môn dạy', en: 'Subjects' },
  'td.level': { vi: 'Level', en: 'Level' },
  'td.bio': { vi: 'Giới thiệu', en: 'Bio' },
  'td.stats_lessons': { vi: 'Buổi đã dạy', en: 'Lessons taught' },
  'td.stats_minutes': { vi: 'Tổng phút', en: 'Total minutes' },
  'td.stats_salary': { vi: 'Tổng lương', en: 'Total salary' },
  'td.availability': { vi: 'Lịch rảnh', en: 'Availability' },
  'td.classes': { vi: 'Lớp đang dạy', en: 'Active classes' },
  'td.history': { vi: 'Lịch sử buổi dạy', en: 'Lesson history' },
  'td.student': { vi: 'Học viên', en: 'Student' },
  'td.student_code': { vi: 'Mã HV', en: 'Code' },
  'td.total_sessions': { vi: 'Tổng buổi', en: 'Total' },
  'td.used_sessions': { vi: 'Đã học', en: 'Used' },
  'td.remaining': { vi: 'Còn lại', en: 'Left' },
  'td.date': { vi: 'Ngày', en: 'Date' },
  'td.minutes': { vi: 'Phút', en: 'Min' },
  'td.status': { vi: 'Trạng thái', en: 'Status' },
  'td.no_classes': { vi: 'Chưa có lớp nào', en: 'No classes yet' },
  'td.no_lessons': { vi: 'Chưa có buổi dạy nào', en: 'No lessons yet' },

  // Login Page
  'login.subtitle': { vi: 'Nền tảng quản lý #1 cho Gia sư', en: '#1 Management Platform for Tutors' },
  'login.title_part1': { vi: 'Nâng tầm', en: 'Elevate' },
  'login.title_part2': { vi: 'chất lượng giáo dục', en: 'education quality' },
  'login.desc': { vi: 'Theo dõi tiến độ, nhận bài tập & nhận xét từ giáo viên — tất cả trong một nền tảng.', en: 'Track progress, get homework & teacher feedback — all in one platform.' },
  'login.trust1': { vi: 'Gia sư chất lượng', en: 'Quality Tutors' },
  'login.trust2': { vi: 'Phụ huynh tin tưởng', en: 'Trusted by Parents' },
  'login.trust3': { vi: 'Chương trình chuẩn', en: 'Standard Curriculum' },
  'login.parent_title': { vi: 'Phụ huynh & Học sinh', en: 'Parents & Students' },
  'login.parent_desc': { vi: 'Xem bài tập, nhận xét & tiến độ học tập', en: 'View homework, feedback & progress' },
  'login.login_title': { vi: 'Đăng Nhập', en: 'Login' },
  'login.login_subtitle': { vi: 'Dành cho Giáo viên & Quản trị viên', en: 'For Teachers & Admins' },
  'login.username': { vi: 'Tài khoản', en: 'Username' },
  'login.username_ph': { vi: 'Ví dụ: nguyenvana', en: 'E.g. nguyenvana' },
  'login.password': { vi: 'Mật khẩu', en: 'Password' },
  'login.password_ph': { vi: 'Nhập mật khẩu', en: 'Enter password' },
  'login.btn_login': { vi: 'ĐĂNG NHẬP', en: 'LOGIN' },
  'login.footer': { vi: 'Tài khoản được cấp bởi Quản trị viên', en: 'Account provided by Administrator' },
  'login.err_incorrect': { vi: 'Tài khoản hoặc mật khẩu không đúng', en: 'Incorrect username or password' },
  'login.err_too_many': { vi: 'Quá nhiều lần thử. Vui lòng thử lại sau.', en: 'Too many attempts. Please try again later.' },
  'login.err_failed': { vi: 'Đăng nhập thất bại. Vui lòng thử lại.', en: 'Login failed. Please try again.' },
  'login.err_no_access': { vi: 'Tài khoản không có quyền truy cập', en: 'Account does not have access' },

  // WaitingApprovalPage
  'waiting.title': { vi: 'Đăng ký thành công! 🎉', en: 'Registration successful! 🎉' },
  'waiting.desc1': { vi: 'Tài khoản của bạn đang chờ Admin phê duyệt.', en: 'Your account is pending Admin approval.' },
  'waiting.desc2': { vi: 'Vui lòng liên hệ người phụ trách để được hỗ trợ nhanh nhất.', en: 'Please contact the person in charge for prompt support.' },
  'waiting.guide_title': { vi: 'Hướng dẫn nhanh', en: 'Quick Guide' },
  'waiting.step1': { vi: 'Liên hệ quản trị viên qua số điện thoại hoặc Zalo bên dưới', en: 'Contact admin via phone or Zalo below' },
  'waiting.step2': { vi: 'Thông báo tên tài khoản bạn vừa đăng ký', en: 'Provide the username you just registered' },
  'waiting.step3': { vi: 'Admin sẽ duyệt và bạn có thể đăng nhập sử dụng ngay', en: 'Admin will approve and you can log in immediately' },
  'waiting.call': { vi: 'Gọi ngay: 090.696.6691', en: 'Call now: 090.696.6691' },
  'waiting.logout': { vi: 'Đăng xuất', en: 'Sign out' },
  'waiting.check_again': { vi: 'Kiểm tra lại', en: 'Check again' },
  'waiting.account': { vi: 'Tài khoản', en: 'Account' },

  // Common
  'common.subject': { vi: 'Môn học', en: 'Subject' },

  // Landing Page
  'landing.hero_title1': { vi: 'Nâng tầm', en: 'Elevate' },
  'landing.hero_title2': { vi: 'chất lượng giáo dục', en: 'education quality' },
  'landing.hero_desc': { vi: 'Theo dõi tiến độ và nhận xét học tập dễ dàng, minh bạch.', en: 'Track learning progress and get transparent feedback easily.' },
  'landing.feat1_title': { vi: 'Theo dõi tiến độ', en: 'Track progress' },
  'landing.feat1_desc': { vi: 'Cập nhật kết quả học tập theo từng buổi học.', en: 'Get updated learning results after each session.' },
  'landing.feat2_title': { vi: 'Nhận xét chi tiết', en: 'Detailed feedback' },
  'landing.feat2_desc': { vi: 'Giáo viên nhận xét, đánh giá sau mỗi buổi học.', en: 'Teachers give feedback and reviews after each session.' },
  'landing.feat3_title': { vi: 'Kết nối dễ dàng', en: 'Easy connection' },
  'landing.feat3_desc': { vi: 'Thông tin minh bạch, gắn kết gia đình và giáo viên.', en: 'Transparent info connecting families and teachers.' },
  'landing.search_title': { vi: 'Tra cứu tiến độ học tập', en: 'Check learning progress' },
  'landing.search_subtitle': { vi: 'Dành cho phụ huynh / học sinh', en: 'For parents / students' },
  'landing.search_placeholder': { vi: 'Nhập mã học sinh', en: 'Enter student code' },
  'landing.search_hint': { vi: 'Mã học sinh được giáo viên cung cấp', en: 'Student code is provided by the teacher' },
  'landing.search_btn': { vi: 'Xem tiến độ', en: 'View progress' },
  'landing.search_safe': { vi: 'Không cần đăng nhập. Bảo mật & an toàn thông tin.', en: 'No login required. Secure & private.' },
  'landing.login_title': { vi: 'Đăng nhập hệ thống', en: 'System login' },
  'landing.login_subtitle': { vi: 'Dành cho giáo viên & admin', en: 'For teachers & admin' },
  'landing.login_teacher': { vi: 'Giáo viên', en: 'Teacher' },
  'landing.login_admin': { vi: 'Admin', en: 'Admin' },
  'landing.login_note': { vi: 'Chỉ dành cho giáo viên và quản trị hệ thống.', en: 'For teachers and system administrators only.' },
  'landing.nav_home': { vi: 'Trang chủ', en: 'Home' },
  'landing.nav_about': { vi: 'Giới thiệu', en: 'About' },
  'landing.nav_programs': { vi: 'Chương trình học', en: 'Programs' },
  'landing.nav_news': { vi: 'Tin tức', en: 'News' },
  'landing.nav_contact': { vi: 'Liên hệ', en: 'Contact' },
}

export const useLanguageStore = create<LangState>()(
  persist(
    (set, get) => ({
      lang: 'vi',
      setLang: (lang) => set({ lang }),
      t: (key: string) => {
        const entry = translations[key]
        if (!entry) return key
        return entry[get().lang] || entry['vi'] || key
      },
    }),
    { name: '123english-lang' }
  )
)
