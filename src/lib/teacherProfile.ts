import { Teacher } from '@/types'

// Các trường hồ sơ BẮT BUỘC giáo viên phải tự hoàn thiện sau khi đăng nhập
// (không gồm hệ lương: level / đơn giá / teacherGrade — do admin quản lý).
export const REQUIRED_TEACHER_FIELDS: { key: keyof Teacher; label: string; labelEn: string }[] = [
  { key: 'photoURL', label: 'Ảnh đại diện', labelEn: 'Profile photo' },
  { key: 'gender', label: 'Giới tính', labelEn: 'Gender' },
  { key: 'yob', label: 'Năm sinh', labelEn: 'Year of birth' },
  { key: 'livingArea', label: 'Khu vực sinh sống', labelEn: 'Living area' },
  { key: 'degreeType', label: 'Học vị / Học hàm', labelEn: 'Degree' },
  { key: 'university', label: 'Trường ĐH/CĐ', labelEn: 'University' },
  { key: 'major', label: 'Chuyên ngành', labelEn: 'Major' },
  { key: 'teachingYears', label: 'Số năm kinh nghiệm dạy', labelEn: 'Teaching years' },
  { key: 'bankName', label: 'Tên ngân hàng', labelEn: 'Bank name' },
  { key: 'bankAccountNo', label: 'Số tài khoản', labelEn: 'Bank account number' },
  { key: 'bankAccountName', label: 'Tên chủ tài khoản', labelEn: 'Account holder name' },
]

export function missingTeacherFields(t: Partial<Teacher> | null | undefined): (keyof Teacher)[] {
  if (!t) return REQUIRED_TEACHER_FIELDS.map((f) => f.key)
  return REQUIRED_TEACHER_FIELDS
    .filter(({ key }) => {
      const v = t[key]
      if (typeof v === 'number') return !(v > 0)
      return !v || String(v).trim() === ''
    })
    .map((f) => f.key)
}

export function isTeacherProfileComplete(t: Partial<Teacher> | null | undefined): boolean {
  return missingTeacherFields(t).length === 0
}

export type TeacherCertificateCompliance = {
  hasForeignLanguageImage: boolean
  hasPedagogicalImage: boolean
  isCertificateComplete: boolean
  missingCertificateLabels: string[]
}

/**
 * Kiểm tra quy định ảnh chứng chỉ dành cho Admin.
 * Chỉ tính là đã bổ sung khi chứng chỉ đúng nhóm, chưa bị hủy và có fileURL.
 * Các trường IELTS/TOEIC/Sư phạm dạng chữ cũ không thay thế cho ảnh chứng chỉ.
 */
export function getTeacherCertificateCompliance(
  teacher: Partial<Teacher> | null | undefined,
): TeacherCertificateCompliance {
  const certificates = teacher?.certificates || []
  const hasImage = (category: 'foreign_language' | 'pedagogical') => certificates.some((certificate) => (
    certificate.category === category
    && !certificate.voided
    && typeof certificate.fileURL === 'string'
    && certificate.fileURL.trim().length > 0
  ))

  const hasForeignLanguageImage = hasImage('foreign_language')
  const hasPedagogicalImage = hasImage('pedagogical')
  const missingCertificateLabels = [
    ...(!hasForeignLanguageImage ? ['Năng lực chuyên môn'] : []),
    ...(!hasPedagogicalImage ? ['Sư phạm'] : []),
  ]

  return {
    hasForeignLanguageImage,
    hasPedagogicalImage,
    isCertificateComplete: missingCertificateLabels.length === 0,
    missingCertificateLabels,
  }
}
