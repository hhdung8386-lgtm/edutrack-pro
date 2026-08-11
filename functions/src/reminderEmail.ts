export type ReminderEmailBooking = {
  studentId?: string
  studentCode?: string
  teacherName?: string
  subjectId?: string
  subjectName?: string
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  classroomURL?: string
  note?: string
}

type ReminderEmailSubject = {
  subjectId?: string
  subjectName?: string
  curriculumLink?: string
}

export type ReminderEmailStudent = {
  code?: string
  classroomURL?: string
  subjects?: ReminderEmailSubject[]
  textbookURL?: string
}

const BRAND_LOGO_URL = 'https://www.123english.edu.vn/brand-logo.png'
const PARENT_PORTAL_URL = 'https://www.123english.edu.vn/parent'
const FALLBACK_VALUE = 'Đang cập nhật'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character] ?? character))
}

function formatVietnamDate(dateISO?: string): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return FALLBACK_VALUE
  const [year, month, day] = dateISO.split('-')
  return `${day}/${month}/${year}`
}

function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined

  const trimmed = value.trim()
  const embeddedUrl = trimmed.match(/https?:\/\/[^\s<>"']+/i)?.[0]
  const rawCandidate = embeddedUrl || trimmed
  const candidate = /^https?:\/\//i.test(rawCandidate)
    ? rawCandidate
    : /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(rawCandidate)
      ? `https://${rawCandidate}`
      : undefined
  if (!candidate) return undefined

  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function normalizeSubjectName(value?: string): string {
  return value?.trim().toLocaleLowerCase('vi-VN') || ''
}

function findCurriculumURL(booking: ReminderEmailBooking, student: ReminderEmailStudent): string | undefined {
  const subjectName = normalizeSubjectName(booking.subjectName)
  const subject = student.subjects?.find((item) => Boolean(booking.subjectId) && item.subjectId === booking.subjectId)
    || student.subjects?.find((item) => Boolean(subjectName) && normalizeSubjectName(item.subjectName) === subjectName)
  return safeHttpUrl(subject?.curriculumLink) || safeHttpUrl(student.textbookURL)
}

export function buildReminderEmail(
  booking: ReminderEmailBooking,
  student: ReminderEmailStudent,
  reminderLabel: string,
) {
  const rawStudentCode = booking.studentCode?.trim() || student.code?.trim() || booking.studentId?.trim() || FALLBACK_VALUE
  const rawTeacherName = booking.teacherName?.trim() || FALLBACK_VALUE
  const rawDate = formatVietnamDate(booking.requestedDate)
  const rawStartTime = booking.requestedStart?.trim() || FALLBACK_VALUE
  const studentCode = escapeHtml(rawStudentCode)
  const teacherName = escapeHtml(rawTeacherName)
  const studyDate = escapeHtml(rawDate)
  const startTime = escapeHtml(rawStartTime)
  const timingLabel = escapeHtml(reminderLabel)
  const classroomURL = safeHttpUrl(booking.classroomURL) || safeHttpUrl(student.classroomURL) || safeHttpUrl(booking.note)
  const curriculumURL = findCurriculumURL(booking, student)
  const manageURL = rawStudentCode === FALLBACK_VALUE
    ? PARENT_PORTAL_URL
    : `${PARENT_PORTAL_URL}?code=${encodeURIComponent(rawStudentCode)}`
  const classroomButton = classroomURL
    ? `<a href="${escapeHtml(classroomURL)}" style="display:inline-block;margin:0 8px 10px 0;padding:13px 20px;border-radius:10px;background:#1caee4;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Vào phòng học</a>`
    : ''
  const curriculumButton = curriculumURL
    ? `<a href="${escapeHtml(curriculumURL)}" style="display:inline-block;margin:0 8px 10px 0;padding:13px 20px;border-radius:10px;background:#fff315;color:#14213d;font-size:14px;font-weight:700;text-decoration:none">Xem giáo trình</a>`
    : ''
  const actionText = [
    classroomURL ? `Phòng học: ${classroomURL}` : undefined,
    curriculumURL ? `Giáo trình: ${curriculumURL}` : undefined,
    `Quản lý lịch học: ${manageURL}`,
  ].filter((value): value is string => Boolean(value)).join('\n')

  const text = `[AUTO REMINDER]

Kính gửi Quý Học viên,

123English trân trọng thông báo lịch học sắp tới của Quý Học viên như sau:

Mã học viên: ${rawStudentCode}
Gia sư: ${rawTeacherName}
Ngày học: ${rawDate}
Thời gian: ${rawStartTime}

Quý Học viên vui lòng xem trước nội dung bài học và hoàn thành các bài tập được giao (nếu có) trước khi tham gia lớp để đảm bảo hiệu quả học tập.

Kính chúc Quý Học viên có một buổi học hiệu quả và nhiều tiến bộ.

${actionText}

Trân trọng,
123English
Bộ phận Học vụ

Lưu ý: Trường hợp không thể tham gia buổi học, Quý Học viên vui lòng thông báo cho Trung tâm hoặc thực hiện huỷ trên 123english.edu.vn bằng mã học viên ${rawStudentCode} trước giờ học ít nhất 01 giờ để được bảo lưu buổi học. Buổi học bù cần được sắp xếp trong vòng 07 ngày để đảm bảo tiến độ chương trình.`

  return {
    subject: '[123English] Thông báo nhắc lịch học',
    text,
    html: `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>[123English] Thông báo nhắc lịch học</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f8fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">123English nhắc lịch học ${timingLabel}. Mã học viên: ${studentCode}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f8fb">
      <tr>
        <td align="center" style="padding:28px 12px">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dce8ef;border-radius:18px;overflow:hidden">
            <tr>
              <td align="center" style="padding:26px 24px 22px;background:#fff315;border-bottom:5px solid #1caee4">
                <img src="${BRAND_LOGO_URL}" width="260" alt="123English" style="display:block;width:100%;max-width:260px;height:auto;border:0">
              </td>
            </tr>
            <tr>
              <td style="padding:30px 34px 12px">
                <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#e7f7fd;color:#087da8;font-size:12px;font-weight:700;letter-spacing:.5px">AUTO REMINDER · ${timingLabel}</div>
                <h1 style="margin:18px 0 8px;font-size:24px;line-height:1.3;color:#14213d">Thông báo nhắc lịch học</h1>
                <p style="margin:0 0 20px;color:#526375;font-size:15px;line-height:1.7">Kính gửi Quý Học viên,</p>
                <p style="margin:0 0 22px;color:#26384a;font-size:15px;line-height:1.7">123English trân trọng thông báo lịch học sắp tới của Quý Học viên như sau:</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #dce8ef;border-radius:14px;background:#f9fcfe">
                  <tr>
                    <td style="padding:18px 20px 8px;color:#637689;font-size:13px;width:38%">Mã học viên</td>
                    <td style="padding:18px 20px 8px;color:#14213d;font-size:15px;font-weight:700;font-family:Consolas,monospace">${studentCode}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 20px;color:#637689;font-size:13px">Gia sư</td>
                    <td style="padding:8px 20px;color:#14213d;font-size:15px;font-weight:700">${teacherName}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 20px;color:#637689;font-size:13px">Ngày học</td>
                    <td style="padding:8px 20px;color:#14213d;font-size:15px;font-weight:700">${studyDate}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 20px 18px;color:#637689;font-size:13px">Thời gian</td>
                    <td style="padding:8px 20px 18px;color:#14213d;font-size:15px;font-weight:700">${startTime}</td>
                  </tr>
                </table>

                <p style="margin:24px 0 16px;color:#26384a;font-size:15px;line-height:1.75">Quý Học viên vui lòng xem trước nội dung bài học và hoàn thành các bài tập được giao (nếu có) trước khi tham gia lớp để đảm bảo hiệu quả học tập.</p>
                <p style="margin:0 0 22px;color:#26384a;font-size:15px;line-height:1.75">Kính chúc Quý Học viên có một buổi học hiệu quả và nhiều tiến bộ.</p>

                <div style="margin:0 0 24px">${classroomButton}${curriculumButton}<a href="${escapeHtml(manageURL)}" style="display:inline-block;margin:0 0 10px;padding:13px 20px;border-radius:10px;background:#14213d;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Xem và quản lý lịch học</a></div>

                <p style="margin:0;color:#26384a;font-size:15px;line-height:1.65">Trân trọng,<br><strong>123English</strong><br><em>Bộ phận Học vụ</em></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 30px">
                <div style="padding:18px 20px;border-left:4px solid #f3d20b;border-radius:10px;background:#fffbed;color:#59636e;font-size:13px;font-style:italic;line-height:1.7"><strong style="color:#273444">Lưu ý:</strong> Trường hợp không thể tham gia buổi học, Quý Học viên vui lòng thông báo cho Trung tâm hoặc thực hiện huỷ trên <a href="${escapeHtml(manageURL)}" style="color:#087da8;font-weight:700;text-decoration:underline">123english.edu.vn</a> bằng mã học viên <strong>${studentCode}</strong> trước giờ học ít nhất 01 giờ để được bảo lưu buổi học. Buổi học bù cần được sắp xếp trong vòng 07 ngày để đảm bảo tiến độ chương trình.</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px;background:#14213d;color:#cbd8e4;font-size:12px;line-height:1.6">Email nhắc lịch tự động từ 123English<br><a href="https://www.123english.edu.vn" style="color:#62cdf1;text-decoration:none">www.123english.edu.vn</a></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  }
}
