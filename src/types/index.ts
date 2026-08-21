import { Timestamp } from 'firebase/firestore'

export interface TopUpBatch {
  id: string
  createdAt: string // format DD/MM/YYYY
  totalSessions: number
  /** Metadata mới; dữ liệu cũ không có vẫn suy ra từ totalSessions. */
  kind?: 'payment' | 'gift'
  learningMinutes?: number
  diamonds?: number
  content?: string
  paymentDate?: string
  reason?: string
  note?: string
}

export interface CountryPriceInfo {
  price: number
  currency: string
  isDefault?: boolean
}

export interface StudentSubject {
  subjectId: string
  subjectName: string
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  minutesPerSession: number
  totalMinutes: number
  usedMinutes: number
  remainingMinutes: number
  pricePerMinute: number
  pricePerMinuteVN?: number
  pricePerMinutePH?: number
  pricePerMinuteNative?: number
  batches?: TopUpBatch[]
  curriculumLink?: string
  supplementaryCurriculumLink?: string
  timetableNote?: string
  studentRequests?: string[]
  otherCountriesPrices?: Record<string, number>
  countryPrices?: Record<string, CountryPriceInfo>
  currency?: string
  focusSkills?: string[]
}

export interface Student {
  id: string
  code: string
  name: string
  /** Hồ sơ cũ không có field này luôn được hiểu là học viên 1 kèm 1. */
  recordType?: 'individual' | 'group_class'
  /** Danh sách lớp nhóm mà tài khoản học viên đang tham gia. */
  groupClassIds?: string[]
  /** Chỉ dùng trên hồ sơ lớp nhóm được lưu tương thích trong collection students. */
  enrolledStudentIds?: string[]
  enrolledStudents?: GroupClassMember[]
  parentPhone: string
  email?: string
  subjectId: string
  subjectName?: string
  branchId?: string
  branchName?: string
  /** Nhóm vận hành do admin phân loại thủ công; hồ sơ cũ không có field này được hiểu là chưa phân loại. */
  learningScheduleType?: 'unclassified' | 'fixed' | 'flexible'
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  minutesPerSession: number
  totalMinutes?: number
  usedMinutes?: number
  remainingMinutes?: number
  reservedMinutes?: number
  heldMinutes?: number
  /** Buổi học viên tự huỷ đang chờ đặt lại. Còn giá trị = học viên chưa được huỷ buổi tiếp theo. */
  pendingRebookBookingId?: string
  /** Số kim cương đang bị giữ cho nghĩa vụ đặt lại (dùng lại khi đặt buổi mới, không trừ thêm). */
  pendingRebookPoints?: number
  status: 'active' | 'inactive' | 'expired' | 'reserved'
  subjects?: StudentSubject[]
  classroomURL?: string
  /** @deprecated Link sách giờ nằm trong gói môn học (StudentSubject.curriculumLink); field cũ có thể còn tồn tại trong dữ liệu Firestore */
  textbookURL?: string
  rewardPoints?: number
  lifetimeRewardPoints?: number
  monthlyRewardPoints?: number
  /** Giới tính dùng để chọn nhân vật mặc định khi admin tạo hồ sơ. */
  gender?: 'male' | 'female'
  profileAvatarId?: string
  /** Ảnh đại diện do học viên tự tải; nếu trống sẽ dùng profileAvatarId. */
  profilePhotoURL?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface GroupClassMember {
  studentId: string
  studentCode: string
  studentName: string
}

export interface Teacher {
  id: string
  code: string
  name: string
  subjectIds: string[]
  subjectNames?: string[]
  subjectRates?: Record<string, number>
  branchId?: string
  branchName?: string
  level: number
  bio: string
  photoURL: string
  /** Dấu thời gian gia sư đã dùng quyền tự tải ảnh một lần. */
  photoSelfUploadedAt?: Timestamp
  status: 'active' | 'inactive' | 'resigned'
  /** Nickname đã thu hồi khi gia sư nghỉ dạy; chỉ lưu để đối soát lịch sử. */
  releasedNickname?: string
  resignedAt?: Timestamp
  resignedBy?: string
  updatedAt?: Timestamp
  gender?: 'male' | 'female'
  teacherGrade?: 'A' | 'B' | 'C' | 'PH' | 'SA'
  contractAccepted?: boolean
  /** true = chỉ là Tester (ứng tuyển kiểm thử, không phải gia sư dạy thật) */
  isTester?: boolean
  country?: string
  timezoneOffset?: number
  /** Quyền mở trang Điểm danh bù riêng cho gia sư; thiếu field = khóa. */
  attendancePageEnabled?: boolean
  attendancePageUpdatedAt?: Timestamp
  attendancePageUpdatedBy?: string
  pointsPer25Minutes?: number
  bookingPriority?: number
  totalApprovedMinutes?: number
  // Interview fields
  yob?: number
  livingArea?: string
  /** Đã hoàn thành Chương trình Đào tạo Gia sư tại 123English (60 giờ) — admin xác nhận */
  trainedAt123English?: boolean
  degreeType?: string
  university?: string
  major?: string
  gradYear?: string
  gpa?: string
  academicAwards?: string
  scholarship?: string
  ielts?: string
  toeic?: string
  toefl?: string
  cefr?: string[]
  tesolTefl?: string
  pedagogicalCert?: string
  otherCerts?: string
  teachingYears?: number
  studentsTaughtCount?: number
  studentAgesTaught?: string
  teachingFormats?: string[]
  /** Mã các khu vực tại TP.HCM mà gia sư có thể nhận lớp trực tiếp. */
  offlineTeachingAreas?: string[]
  studentResults?: string
  strengths?: string[]
  otherStrengths?: string
  languagesTaught?: string[]
  academicSubjectsTaught?: string[]
  certificates?: TeacherCertificate[]
  bankName?: string
  bankAccountNo?: string
  bankAccountName?: string
  youtubeLink?: string
  createdAt: Timestamp
}

export type TeacherDirectoryCategory = 'online' | 'offline' | 'tester'

export interface TeacherCertificate {
  category: 'foreign_language' | 'pedagogical' | 'other'
  title: string
  description?: string
  score: string
  fileURL?: string
  verified?: boolean
  verifiedBy?: string
  verifiedAt?: Timestamp
  voided?: boolean
  voidedBy?: string
  status: 'approved' | 'pending' | 'rejected'
  createdAt?: Timestamp
}

export interface Subject {
  id: string
  name: string
  pricePerMinute: number
  pricePerMinuteVN?: number
  pricePerMinutePH?: number
  pricePerMinuteNative?: number
  otherCountriesPrices?: Record<string, number>
  countryPrices?: Record<string, CountryPriceInfo>
  status: 'active' | 'inactive'
  createdAt: Timestamp
  currency?: string
  /** Soft delete: giữ document làm tombstone để mọi dữ liệu lịch sử còn đọc được. */
  isDeleted?: boolean
  deletedAt?: Timestamp
  deletedBy?: string
  /** Trạng thái đồng bộ tên sang các snapshot; optional để tương thích môn cũ. */
  nameSyncPending?: boolean
  nameSyncedValue?: string
  nameSyncedAt?: Timestamp
}

// Báo cáo buổi học có cấu trúc (form điểm danh mẫu mới).
// Bài cũ không có các field này -> luôn optional, hiển thị fallback qua `comment`.
export interface LessonReport {
  knowledgeDone: boolean
  knowledgeComment: string
  gamesDone: boolean
  gamesComment: string
  exercisesDone: boolean
  exercisesComment: string
}

/**
 * Phần bắt buộc của buổi VẮNG KHÔNG PHÉP (dặn dò gia sư gửi học viên/phụ huynh).
 * Buổi cũ không có field này -> optional, màn hình cũ vẫn đọc `comment` như trước.
 */
export interface LessonAbsenceReport {
  advice: string
}

/** Một loại bài tập về nhà đã giao (gia sư chọn tối đa 2 loại mỗi buổi). */
export interface LessonHomeworkItem {
  type: 'video' | 'writing' | 'reading' | 'listening' | 'vocabulary'
  content: string
}

export interface Lesson {
  id: string
  studentId: string
  studentCode: string
  studentName: string
  /** Snapshot lớp nhóm tại thời điểm điểm danh; buổi cũ/1 kèm 1 không có. */
  groupClassId?: string
  groupClassCode?: string
  groupClassName?: string
  groupClassMemberIds?: string[]
  teacherId: string
  teacherCode: string
  teacherName: string
  subjectId: string
  subjectName: string
  curriculumLink?: string
  date: string
  /** 0 phút = vắng có phép (vẫn ghi nhận buổi nhưng không tính giờ dạy). */
  minutes: 0 | 25 | 50 | 75 | 100
  comment: string
  /** Chuỗi bài tập về nhà (giữ nguyên cho mọi màn hình & dữ liệu cũ). */
  homework: string
  /** Bản có cấu trúc của bài tập về nhà (buổi cũ không có field này). */
  homeworkItems?: LessonHomeworkItem[]
  book?: string
  pages?: string
  report?: LessonReport | null
  /** Dặn dò bắt buộc khi vắng không phép (buổi cũ / buổi có mặt không có field này). */
  absenceReport?: LessonAbsenceReport | null
  rating?: number | null
  imageURLs: string[]
  /** 'cancelled' = gia sư tự huỷ buổi điểm danh của mình khi CHƯA được duyệt. */
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  attendanceStatus?: 'present' | 'with_permission' | 'without_permission'
  rejectedReason?: string
  cancelledAt?: Timestamp
  cancelledBy?: string
  cancelledReason?: string
  sessionsBeforeApproval: number
  sessionsAfterApproval: number
  minutesBeforeApproval?: number
  minutesAfterApproval?: number
  teacherLevel?: number
  pricePerMinute?: number
  salary?: number
  teacherRate?: number
  approvedAt?: Timestamp
  approvedBy?: string
  bookingRequestId?: string
  /** Các ca được gộp thành một buổi điểm danh (ví dụ 2 ca 25 phút = 1 buổi 50 phút). */
  bookingRequestIds?: string[]
  /**
   * Buổi vắng "ăn theo" ca 25 phút liền trước (id của buổi gốc).
   * Buổi này luôn 0 phút để chỉ tính tiền MỘT lần 25 phút cho cả cụm.
   */
  absenceFollowUpOf?: string
  /** Đã nhả phần phút giữ chỗ của ca đặt lịch tương ứng hay chưa (chống nhả 2 lần). */
  bookingHoldConsumed?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  currency?: string
  points?: number
  pointsPer25Minutes?: number
  /** Dấu vết khi admin mở lại một buổi đã trả lương để kiểm tra. */
  payrollPaidBeforeReopen?: boolean
  payrollPaidAmount?: number
  payrollPaidCurrency?: string
  payrollPaidAt?: Timestamp
  /** Kết quả đối chiếu với lịch đã xếp tại thời điểm gia sư gửi điểm danh. */
  scheduleCheck?: LessonScheduleCheckSnapshot
  /** Số buổi điểm danh của cùng học viên + cùng gia sư trong ngày, tính cả buổi này. */
  sameDayCount?: number
}

/** Ảnh chụp kết quả đối chiếu lịch, lưu kèm buổi dạy để giáo vụ xem lại không tốn truy vấn. */
export interface LessonScheduleCheckSnapshot {
  status: 'matched' | 'mismatch_day' | 'other_teacher' | 'no_booking'
  scheduledDates: string[]
  bookingId?: string
  /** Toàn bộ ca ghép vào một buổi dài (ví dụ 2 ca 25 phút cho buổi 50 phút). */
  bookingIds?: string[]
  bookingStart?: string
  bookingEnd?: string
  minutesMismatch?: number
  otherTeacherNames?: string[]
  checkedAt: string
  windowDays: number
}

export interface Payroll {
  id: string
  teacherId: string
  teacherName: string
  lessonId: string
  /** 'adjustment' = khoản thưởng (amount > 0) hoặc khấu trừ (amount < 0) do admin thêm tay */
  type?: 'adjustment'
  adjustmentNote?: string
  createdBy?: string
  evaluationId?: string
  rewardKind?: 'evaluation_base' | 'student_registration'
  amount: number
  minutes: number
  pricePerMinute: number
  level: number
  month: string
  paid?: boolean
  paidAt?: Timestamp
  voided?: boolean
  voidedAt?: Timestamp
  voidedBy?: string
  createdAt: Timestamp
  currency?: string
}

export interface BookingRequest {
  id: string
  status: 'pending' | 'confirmed' | 'completed' | 'rejected' | 'released'
  teacherId: string
  teacherCode: string
  teacherName: string
  teacherPhotoURL?: string
  studentId: string
  studentCode: string
  studentName: string
  /** Snapshot lớp nhóm tại thời điểm xếp lịch; booking cũ/1 kèm 1 không có. */
  groupClassId?: string
  groupClassCode?: string
  groupClassName?: string
  groupClassMemberIds?: string[]
  subjectId?: string
  subjectName?: string
  requestedDay: DayOfWeek
  requestedDate?: string
  requestedWeekStart?: string
  requestedStart: string
  requestedEnd: string
  requestedMinutes: 25 | 50 | 75 | 100
  availableMinutesAtRequest?: number
  heldMinutesAtRequest?: number
  note?: string
  adminNote?: string
  classroomURL?: string
  curriculumLink?: string
  createdAt: Timestamp
  confirmedAt?: Timestamp
  confirmedBy?: string
  rejectedAt?: Timestamp
  rejectedBy?: string
  releasedAt?: Timestamp
  releasedBy?: string
  lessonId?: string
  completedAt?: Timestamp
  currency?: string
  heldImmediately?: boolean
  requestedPoints?: number
  pointsPer25Minutes?: number
  teacherConfirmationDeadlineAt?: Timestamp
  /** Phản hồi trực tiếp của gia sư trước khi học vụ xử lý yêu cầu. */
  teacherResponse?: 'pending' | 'accepted' | 'declined'
  teacherRespondedAt?: Timestamp
  teacherRespondedBy?: string
  /** Buổi bị học viên tự huỷ nhưng kim cương vẫn được GIỮ, chờ đặt lại (không hoàn về khả dụng). */
  pendingRebook?: boolean
  /** Số kim cương đang giữ cho nghĩa vụ đặt lại của buổi này. */
  rebookHoldPoints?: number
  /** Đã hoàn thành nghĩa vụ: đặt lại bằng buổi mới nào. */
  rebookedAt?: Timestamp
  rebookedByBookingId?: string
}

export interface AdminLog {
  id: string
  adminId: string
  adminName?: string
  action: string
  targetType: string
  targetId: string
  changes: Record<string, unknown>
  createdAt: Timestamp
}

export interface UserDoc {
  uid: string
  email: string
  role: 'admin' | 'teacher' | 'inactive_teacher'
  teacherId?: string
  displayName?: string
  createdAt: Timestamp
}

export interface TimeRange {
  start: string  // e.g. '08:00'
  end: string    // e.g. '12:00'
}

export interface DayAvailability {
  available: boolean
  timeRanges: TimeRange[]
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface TeacherAvailability {
  id: string              // = teacherId
  teacherId: string
  slots: Record<DayOfWeek, DayAvailability>
  weekOverrides?: Record<string, {
    slots: Record<DayOfWeek, DayAvailability>
    note?: string
    updatedAt?: string
  }>
  note: string
  updatedAt: Timestamp
}

export type LessonStatus = 'pending' | 'approved' | 'rejected'
export type StudentStatus = 'active' | 'inactive' | 'expired'
export type TeacherStatus = 'active' | 'inactive' | 'resigned'
export type MinutePreset = 25 | 50 | 75 | 100

export interface SystemNotification {
  id: string
  title: string
  content: string
  color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky'
  iconName: 'Bell' | 'Calendar' | 'ClipboardList' | 'ShieldAlert' | 'Clock' | 'MessageSquare'
  targetType: 'teachers' | 'students' | 'managers'
  targetIds: string[] // Empty means "all" in that targetType
  senderId: string
  senderName: string
  createdAt: Timestamp
  readBy?: string[] // array of user/student/teacher IDs
}

export interface BookingCancellationRequest {
  id: string
  studentId: string
  studentCode: string
  studentName: string
  bookingId: string
  requestedAt: Timestamp
  status: 'pending' | 'approved' | 'rejected'
  rejectedReason?: string
  resolvedAt?: Timestamp
  resolvedBy?: string
}

export type RewardCategory = 'all' | 'study' | 'stationery' | 'supplies' | 'card' | 'other'

export interface RewardGift {
  id: string
  name: string
  category: Exclude<RewardCategory, 'all'>
  points: number
  imageURL?: string
  description?: string
  status: 'active' | 'inactive'
  featured?: boolean
  stock: number
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface RewardRedemption {
  id: string
  studentId: string
  studentCode: string
  studentName: string
  giftId: string
  giftName: string
  points: number
  createdAt: Timestamp
  status: 'pending' | 'approved' | 'fulfilled' | 'rejected' | 'shipped' | 'delivered' | 'cancelled'
  shippingAddress?: string
  notes?: string
  note?: string
  reviewedAt?: Timestamp
  reviewedBy?: string
}

export interface PaymentSettings {
  bankName: string
  accountName: string
  accountNumber: string
  qrImageURL: string
  bankAccountNo?: string
  bankAccountName?: string
  qrTemplate?: string
  contactPhone?: string
  contactZalo?: string
  guideVideoUrl?: string
  transferPrefix?: string
  supportNote?: string
  payrollTaxEnabled?: boolean
  payrollTaxThresholdAmount?: number
  payrollTaxRatePercent?: number
  payrollTaxCurrency?: string
  payrollTaxEffectiveFromMonth?: string
  payrollTaxUpdatedAt?: Timestamp
  payrollTaxUpdatedBy?: string
  updatedAt?: Timestamp
}

export interface TopUpPackage {
  id: string
  name: string
  price: number
  currency: string
  sessions: number
  minutesPerSession: number
  totalMinutes: number
  status: 'active' | 'inactive'
  featured?: boolean
  subjectId: string
  subjectName: string
  validityDays?: number
  description?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface TopUpRequest {
  id: string
  studentId: string
  studentCode: string
  studentName: string
  packageId: string
  packageName: string
  subjectId: string
  subjectName: string
  price: number
  currency: string
  totalMinutes: number
  sessions: number
  transferContent: string
  createdAt?: Timestamp
  status: 'pending' | 'approved' | 'rejected'
  rejectedReason?: string
  reviewedAt?: Timestamp
  reviewedBy?: string
}
