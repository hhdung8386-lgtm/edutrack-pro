import { useLanguageStore } from '@/stores/languageStore'

/**
 * English versions of the messages the classroom Cloud Functions return (they are
 * written in Vietnamese on the server). Translated on the client only, so no
 * backend change or deploy is needed.
 */
const CLASSROOM_SERVER_MESSAGES_EN: Record<string, string> = {
  'Booking không hợp lệ.': 'The booking is not valid.',
  'Buổi học này đã dùng quyền gia hạn một lần.': 'This lesson has already used its one extension.',
  'Bản ghi không hợp lệ.': 'The recording is not valid.',
  'Bản ghi chưa sẵn sàng hoặc đã hết hạn.': 'The recording is not ready yet or has expired.',
  'Bản ghi vừa hết hạn hoặc đã bị xóa.': 'The recording has just expired or was deleted.',
  'Bản bảng đang lưu không hợp lệ. Đã dừng thao tác để tránh ghi đè dữ liệu.': 'The saved board is not valid. The action was stopped to avoid overwriting data.',
  'Chưa thể bảo đảm mốc đóng phòng mới. Vui lòng thử gia hạn lại.': 'The new closing time could not be secured. Please try extending again.',
  'Chưa thể đồng bộ bảng học.': 'Could not sync the board.',
  'Chưa thể đồng bộ chú thích màn hình.': 'Could not sync the screen annotations.',
  'Chưa tạo được vùng lưu bản ghi. Vui lòng thử lại.': 'Could not create storage for the recording. Please try again.',
  'Chưa thể mở phòng học. Vui lòng thử lại.': 'The classroom could not be opened. Please try again.',
  'Chỉ Admin hệ thống hoặc gia sư được phân công mới được gia hạn lớp.': 'Only a system Admin or the assigned tutor can extend the class.',
  'Chỉ Admin hệ thống hoặc gia sư được phân công mới được tạo link phòng học.': 'Only a system Admin or the assigned tutor can create a classroom link.',
  'Chỉ Admin hệ thống được tạo và quản lý lớp học thử.': 'Only a system Admin can create and manage trial classes.',
  'Chỉ có thể gia hạn sau khi buổi học đã bắt đầu.': 'You can only extend after the lesson has started.',
  'Chỉ gia sư hoặc Admin được bắt đầu chú thích màn hình.': 'Only the tutor or an Admin can start screen annotation.',
  'Chỉ gia sư hoặc Admin được kết thúc chú thích màn hình.': 'Only the tutor or an Admin can end screen annotation.',
  'Chỉ gia sư hoặc Admin được lưu bảng.': 'Only the tutor or an Admin can save the board.',
  'Chỉ gia sư hoặc Admin được lưu chú thích màn hình.': 'Only the tutor or an Admin can save screen annotations.',
  'Chỉ gia sư được phân công hoặc Admin mới có thể tặng quà trong lớp.': 'Only the assigned tutor or an Admin can send gifts in class.',
  'Cần học viên đồng ý ghi hình trước khi bắt đầu.': 'The student must agree to recording before you start.',
  'Cần xác nhận đã tải xong trước khi xóa.': 'Please confirm the download has finished before deleting.',
  'Dữ liệu bảng vượt giới hạn hoặc sai định dạng.': 'The board data is too large or in the wrong format.',
  'Dữ liệu chú thích vượt giới hạn hoặc sai định dạng.': 'The annotation data is too large or in the wrong format.',
  'Dữ liệu chú thích màn hình đang lưu không hợp lệ. Đã dừng thao tác để tránh ghi đè.': 'The saved screen annotations are not valid. The action was stopped to avoid overwriting.',
  'Dữ liệu phòng học thử không hợp lệ.': 'The trial classroom data is not valid.',
  'Dữ liệu thời lượng phòng học không hợp lệ.': 'The classroom duration data is not valid.',
  'Dữ liệu thời lượng phòng học không hợp lệ. Admin cần kiểm tra trước khi gia hạn.': 'The classroom duration data is not valid. An Admin needs to check it before extending.',
  'Dữ liệu thời lượng phòng học không hợp lệ. Admin cần kiểm tra trước khi tiếp tục.': 'The classroom duration data is not valid. An Admin needs to check it before continuing.',
  'Dữ liệu điều khiển buổi học không khớp lịch hiện tại.': 'The lesson control data does not match the current schedule.',
  'Dữ liệu điều khiển buổi học không khớp lịch. Admin cần kiểm tra trước khi tiếp tục.': 'The lesson control data does not match the schedule. An Admin needs to check it before continuing.',
  'Gia sư chỉ được gia hạn buổi học được phân công cho mình.': 'Tutors can only extend lessons assigned to them.',
  'Gia sư chỉ được tạo link cho buổi học được phân công cho mình.': 'Tutors can only create links for lessons assigned to them.',
  'Học viên chưa đồng ý hoặc yêu cầu ghi hình đã hết hạn.': 'The student has not agreed, or the recording request has expired.',
  'Học viên đang bảo lưu, hết hạn hoặc chưa hoạt động.': 'The student’s course is on hold, expired or not active.',
  'Hồ sơ gia sư không hợp lệ.': 'The tutor profile is not valid.',
  'Không thể cấp mã phòng an toàn. Vui lòng thử lại.': 'Could not issue a secure room code. Please try again.',
  'Không tìm thấy buổi học.': 'Lesson not found.',
  'Không tìm thấy hồ sơ gia sư hoặc học viên.': 'Tutor or student record not found.',
  'Không tìm thấy phòng học cần gia hạn.': 'The classroom to extend was not found.',
  'Link học viên không hợp lệ hoặc đã hết hạn.': 'This student link is not valid or has expired.',
  'Link lớp học thử không hợp lệ.': 'This trial class link is not valid.',
  'Link lớp học thử đã hết hạn sau 7 ngày.': 'This trial class link expired after 7 days.',
  'Link lớp học thử đã hết hạn sau 7 ngày. Admin vui lòng tạo phòng mới.': 'This trial class link expired after 7 days. Please ask the Admin to create a new room.',
  'Liên kết phòng học không còn khớp lịch hiện tại.': 'The classroom link no longer matches the current schedule.',
  'Loại quà hoặc mã thao tác không hợp lệ.': 'The gift type or action code is not valid.',
  'Lớp đã kết thúc nên không thể gia hạn.': 'The class has ended, so it cannot be extended.',
  'Mã lớp học thử không hợp lệ.': 'The trial class code is not valid.',
  'Phiên chú thích màn hình không hợp lệ.': 'The screen annotation session is not valid.',
  'Phòng học chưa thể bảo đảm tự đóng theo lịch. Vui lòng thử lại.': 'The classroom could not be set to close on schedule. Please try again.',
  'Phản hồi đồng ý ghi hình không hợp lệ.': 'The recording consent response is not valid.',
  'Quyền pilot hoặc phân công lớp vừa thay đổi. Vui lòng tải lại trước khi gia hạn.': 'Pilot access or the class assignment just changed. Please reload before extending.',
  'Thao tác bảng sai định dạng hoặc vượt giới hạn.': 'The board action is in the wrong format or too large.',
  'Thao tác chú thích sai định dạng hoặc vượt giới hạn.': 'The annotation action is in the wrong format or too large.',
  'Vui lòng đăng nhập bằng tài khoản Admin hoặc gia sư.': 'Please sign in with an Admin or tutor account.',
  'Vui lòng đăng nhập lại bằng tài khoản Admin.': 'Please sign in again with an Admin account.',
  'Vui lòng đăng nhập lại trước khi ghi buổi học.': 'Please sign in again before recording the lesson.',
  'Vui lòng đăng nhập lại.': 'Please sign in again.',
}

const VIETNAMESE_TEXT = /[ạảãàáâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/

/** Message in the current language; unknown Vietnamese server text gets a short English lead-in. */
export function localizeClassroomServerMessage(message: string): string {
  if (useLanguageStore.getState().lang !== 'en') return message
  const known = CLASSROOM_SERVER_MESSAGES_EN[message.trim()]
  if (known) return known
  return VIETNAMESE_TEXT.test(message)
    ? `Something went wrong in the classroom. Please try again or contact the academic office. (${message})`
    : message
}
