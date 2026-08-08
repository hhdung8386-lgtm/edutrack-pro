import { useState } from 'react'
import {
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  ExternalLink,
  Globe2,
  GraduationCap,
} from 'lucide-react'
import { Subject, Teacher } from '@/types'
import { teacherSubjectLabels } from '@/lib/teacherSubjects'
import { ImageLightbox } from '@/components/shared/ImageLightbox'
import { teacherCountryLabel } from '@/lib/teacherCountries'

const STRENGTH_LABELS: Record<string, string> = {
  pronunciation: 'Phát âm chuẩn',
  patience: 'Kiên nhẫn',
  lesson_plans: 'Có giáo án riêng',
  close_followup: 'Theo sát học viên',
  progress_reports: 'Báo cáo tiến độ định kỳ',
  tools_proficiency: 'Sử dụng Zoom/Meet thành thạo',
}

function countryLabel(country?: string) {
  return teacherCountryLabel(country)
}

function DetailItem({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div>
      <span className="text-xs font-semibold text-slate-500">{label}: </span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  )
}

interface TeacherProfileDetailsProps {
  teacher: Teacher
  subjects: Subject[]
  totalApprovedMinutes?: number
  publicView?: boolean
}

export function TeacherProfileDetails({ teacher, subjects, totalApprovedMinutes, publicView = false }: TeacherProfileDetailsProps) {
  const [certificateImage, setCertificateImage] = useState<{ src: string; alt: string } | null>(null)
  const nickname = teacher.code || teacher.releasedNickname || 'Chưa cấp nickname'
  const subjectLabels = teacherSubjectLabels(teacher, subjects)
  const approvedMinutes = Math.max(0, Number(totalApprovedMinutes ?? teacher.totalApprovedMinutes) || 0)
  const certificates = publicView
    ? (teacher.certificates || []).filter((certificate) => certificate.status === 'approved' && !certificate.voided)
    : teacher.certificates || []
  const legacyCertificates = [
    teacher.ielts && { label: 'IELTS', value: teacher.ielts },
    teacher.toeic && { label: 'TOEIC', value: teacher.toeic },
    teacher.toefl && { label: 'TOEFL', value: teacher.toefl },
    teacher.cefr?.length && { label: 'CEFR', value: teacher.cefr.join(', ') },
    teacher.tesolTefl && { label: 'TESOL / TEFL', value: teacher.tesolTefl },
    teacher.pedagogicalCert && { label: 'Chứng chỉ sư phạm', value: teacher.pedagogicalCert },
    teacher.otherCerts && { label: 'Chứng chỉ khác', value: teacher.otherCerts },
  ].filter((certificate): certificate is { label: string; value: string } => Boolean(certificate))

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {teacher.photoURL ? (
            <img src={teacher.photoURL} alt={nickname} className="h-20 w-20 flex-none rounded-2xl object-cover" />
          ) : (
            <div className="flex h-20 w-20 flex-none items-center justify-center rounded-2xl bg-indigo-50 text-xl font-black text-indigo-700">
              {nickname.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-xl font-black text-emerald-700">{nickname}</h3>
              {!publicView && (
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${teacher.status === 'active' ? 'bg-emerald-50 text-emerald-700' : teacher.status === 'resigned' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                  {teacher.status === 'active' ? 'Đang dạy' : teacher.status === 'resigned' ? 'Nghỉ dạy' : 'Tạm dừng'}
                </span>
              )}
            </div>
            <div className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
              {!publicView && <DetailItem label="Họ tên" value={teacher.name} />}
              <DetailItem label="Level" value={`×${teacher.level || 1}`} />
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                <Globe2 className="h-4 w-4 text-indigo-500" />
                {countryLabel(teacher.country)}
              </div>
              {!publicView && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-violet-700">
                  <BriefcaseBusiness className="h-4 w-4" />
                  {approvedMinutes.toLocaleString('vi-VN')} phút đã dạy
                </div>
              )}
            </div>
            {teacher.bio && <p className="mt-3 text-sm italic leading-6 text-slate-600">“{teacher.bio}”</p>}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
        <h4 className={`flex items-center gap-2 font-black text-indigo-700 ${publicView ? 'text-base' : 'text-sm uppercase tracking-wide'}`}>
          <BookOpen className="h-4 w-4" />
          Môn gia sư dạy
        </h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {subjectLabels.length > 0 ? subjectLabels.map((label) => (
            <span key={label} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">
              {label}
            </span>
          )) : <p className="text-sm font-semibold text-slate-500">Chưa cập nhật môn giảng dạy.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className={`flex items-center gap-2 font-black text-indigo-700 ${publicView ? 'text-base' : 'text-sm uppercase tracking-wide'}`}>
          <GraduationCap className="h-4 w-4" />
          1. Thông tin cá nhân & Trình độ học vấn
        </h4>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!publicView && <DetailItem label="Năm sinh" value={teacher.yob} />}
          <DetailItem label="Tỉnh/Thành phố sinh sống" value={teacher.livingArea} />
          <DetailItem label="Học vị / Học hàm" value={teacher.degreeType} />
          <DetailItem label="Trường ĐH/CĐ" value={teacher.university} />
          <DetailItem label="Chuyên ngành" value={teacher.major} />
          <DetailItem label="Năm tốt nghiệp" value={teacher.gradYear} />
          <DetailItem label="GPA" value={teacher.gpa} />
          {teacher.academicAwards && <div className="sm:col-span-2 lg:col-span-3"><DetailItem label="Thành tích học tập nổi bật" value={teacher.academicAwards} /></div>}
          {teacher.scholarship && <div className="sm:col-span-2 lg:col-span-3"><DetailItem label="Học bổng" value={teacher.scholarship} /></div>}
        </div>
        {(publicView ? teacher.trainedAt123English === true : teacher.trainedAt123English !== false) && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Đã hoàn thành Chương trình Đào tạo Gia sư tại Nội Bộ Trung Tâm (60 giờ)
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className={`font-black text-indigo-700 ${publicView ? 'text-base' : 'text-sm uppercase tracking-wide'}`}>2. Chứng chỉ</h4>
        {certificates.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {certificates.map((certificate, index) => (
              <article key={`${certificate.category}-${certificate.title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-indigo-600">
                      {certificate.category === 'foreign_language' ? 'Năng lực chuyên môn' : certificate.category === 'pedagogical' ? 'Sư phạm' : 'Khác'}
                    </span>
                    <p className="mt-1 text-sm font-black text-slate-800">{certificate.title || 'Chưa đặt tên'}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${certificate.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {certificate.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-xs">
                  <span className="font-semibold text-slate-600">Điểm số: <strong className="text-slate-800">{certificate.score || '—'}</strong></span>
                  {certificate.fileURL && (publicView ? (
                    <button
                      type="button"
                      onClick={() => setCertificateImage({
                        src: certificate.fileURL || '',
                        alt: `Chứng chỉ ${certificate.title || 'của gia sư'}`,
                      })}
                      className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline"
                    >
                      Xem ảnh <Eye className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <a href={certificate.fileURL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline">
                      Xem ảnh <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : legacyCertificates.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-slate-500">Chưa cập nhật chứng chỉ.</p>
        ) : null}
        {legacyCertificates.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {legacyCertificates.map((certificate) => (
              <div key={certificate.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">{certificate.label}</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{certificate.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className={`font-black text-indigo-700 ${publicView ? 'text-base' : 'text-sm uppercase tracking-wide'}`}>3. Kinh nghiệm giảng dạy & Ưu điểm</h4>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Số năm kinh nghiệm" value={teacher.teachingYears !== undefined && teacher.teachingYears !== null ? `${teacher.teachingYears} năm` : null} />
          <DetailItem label="Số học viên đã dạy" value={teacher.studentsTaughtCount !== undefined && teacher.studentsTaughtCount !== null ? `${teacher.studentsTaughtCount} học viên` : null} />
          <DetailItem label="Độ tuổi HS từng dạy" value={teacher.studentAgesTaught} />
          <DetailItem label="Hình thức dạy chính" value={teacher.teachingFormats?.map((format) => format === 'online' ? 'Online' : format === 'offline' ? 'Offline' : format).join(', ')} />
          {teacher.studentResults && <div className="sm:col-span-2 lg:col-span-3"><DetailItem label="Thành tích học viên đạt được" value={teacher.studentResults} /></div>}
        </div>
        {teacher.strengths && teacher.strengths.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500">Ưu điểm nổi bật</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {teacher.strengths.map((strength) => (
                <span key={strength} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                  {STRENGTH_LABELS[strength] || strength}
                </span>
              ))}
            </div>
          </div>
        )}
        {teacher.otherStrengths && <div className="mt-3"><DetailItem label="Ưu điểm khác" value={teacher.otherStrengths} /></div>}
      </section>
      {certificateImage && (
        <ImageLightbox
          src={certificateImage.src}
          alt={certificateImage.alt}
          onClose={() => setCertificateImage(null)}
        />
      )}
    </div>
  )
}
