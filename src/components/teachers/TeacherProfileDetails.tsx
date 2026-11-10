import { useEffect, useState } from 'react'
import { teacherLivingRegionLabel } from '@/lib/teacherLivingRegion'
import {
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  ExternalLink,
  Globe2,
  GraduationCap,
  Volume2,
} from 'lucide-react'
import { Subject, Teacher } from '@/types'
import { teacherSubjectLabels } from '@/lib/teacherSubjects'
import { ImageLightbox } from '@/components/shared/ImageLightbox'
import { teacherCountryLabel } from '@/lib/teacherCountries'
import { offlineTeachingAreaLabels } from '@/lib/offlineTeachingAreas'
import { getTeacherIntroductionAudioURL } from '@/lib/imageUploader'
import { useL } from '@/stores/languageStore'
import { MultilineText } from '@/components/shared/MultilineText'

const STRENGTH_LABELS_EN: Record<string, string> = {
  pronunciation: 'Clear pronunciation',
  patience: 'Patient',
  lesson_plans: 'Prepares own lesson plans',
  close_followup: 'Follows learners closely',
  progress_reports: 'Regular progress reports',
  tools_proficiency: 'Confident with Zoom/Meet',
}

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

function MultilineDetailItem({ label, value }: { label: string; value?: string | null }) {
  if (!value || !String(value).trim()) return null
  return (
    <div>
      <span className="block text-xs font-semibold text-slate-500">{label}:</span>
      <MultilineText text={value} className="text-sm font-semibold leading-6 text-slate-800" />
    </div>
  )
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
  const L = useL()
  const [certificateImage, setCertificateImage] = useState<{ src: string; alt: string } | null>(null)
  const [introAudioURL, setIntroAudioURL] = useState('')
  const nickname = teacher.code || teacher.releasedNickname || L('Chưa cấp nickname', 'No nickname yet')
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
    teacher.pedagogicalCert && { label: L('Chứng chỉ sư phạm', 'Teaching certificate'), value: teacher.pedagogicalCert },
    teacher.otherCerts && { label: L('Chứng chỉ khác', 'Other certificates'), value: teacher.otherCerts },
  ].filter((certificate): certificate is { label: string; value: string } => Boolean(certificate))

  useEffect(() => {
    let active = true
    getTeacherIntroductionAudioURL(teacher.id).then((url) => {
      if (active) setIntroAudioURL(url)
    })
    return () => { active = false }
  }, [teacher.id])

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {teacher.photoURL ? (
            <img src={teacher.photoURL} alt={nickname} className="h-20 w-20 flex-none rounded-2xl object-cover" />
          ) : (
            <div className={`flex h-20 w-20 flex-none items-center justify-center rounded-2xl text-xl font-black ${publicView ? 'bg-amber-50 text-[#B87900]' : 'bg-indigo-50 text-indigo-700'}`}>
              {nickname.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-xl font-black text-emerald-700">{nickname}</h3>
              {!publicView && (
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${teacher.status === 'active' ? 'bg-emerald-50 text-emerald-700' : teacher.status === 'resigned' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                  {teacher.status === 'active' ? L('Đang dạy', 'Teaching') : teacher.status === 'resigned' ? L('Nghỉ dạy', 'Left') : L('Tạm dừng', 'Paused')}
                </span>
              )}
            </div>
            <div className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
              {!publicView && <DetailItem label={L('Họ tên', 'Full name')} value={teacher.name} />}
              <DetailItem label="Level" value={`×${teacher.level || 1}`} />
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                <Globe2 className={`h-4 w-4 ${publicView ? 'text-[#18A9D1]' : 'text-indigo-500'}`} />
                {countryLabel(teacher.country)}
              </div>
              {!publicView && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-violet-700">
                  <BriefcaseBusiness className="h-4 w-4" />
                  {approvedMinutes.toLocaleString(L('vi-VN', 'en-US'))} {L('phút đã dạy', 'minutes taught')}
                </div>
              )}
            </div>
            {teacher.bio && <p className="mt-3 text-sm italic leading-6 text-slate-600">“{teacher.bio}”</p>}
            {introAudioURL && (
              <div className={`mt-4 rounded-xl border p-3 ${publicView ? 'border-amber-100 bg-amber-50/70' : 'border-indigo-100 bg-indigo-50/60'}`}>
                <p className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Volume2 className={`h-4 w-4 ${publicView ? 'text-amber-700' : 'text-indigo-600'}`} />
                  {L('Nghe gia sư giới thiệu', 'Listen to the tutor’s introduction')}
                </p>
                <audio className="mt-2 w-full" controls preload="none" src={introAudioURL}>
                  {L('Trình duyệt của bạn không hỗ trợ phát audio.', 'Your browser does not support audio playback.')}
                </audio>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={`rounded-2xl border p-4 ${publicView ? 'border-[#F1DE98] bg-[#FFF9E8]' : 'border-indigo-100 bg-indigo-50/50'}`}>
        <h4 className={`flex items-center gap-2 font-black ${publicView ? 'text-[#B87900]' : 'text-indigo-700'} ${publicView ? 'text-base' : 'text-sm uppercase tracking-wide'}`}>
          <BookOpen className="h-4 w-4" />
          {L('Môn gia sư dạy', 'Subjects taught')}
        </h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {subjectLabels.length > 0 ? subjectLabels.map((label) => (
            <span key={label} className={`rounded-lg bg-white px-3 py-1.5 text-xs font-bold ring-1 ${publicView ? 'text-[#B87900] ring-[#F1DE98]' : 'text-indigo-700 ring-indigo-100'}`}>
              {label}
            </span>
          )) : <p className="text-sm font-semibold text-slate-500">{L('Chưa cập nhật môn giảng dạy.', 'No subjects added yet.')}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className={`flex items-center gap-2 font-black ${publicView ? 'text-[#B87900]' : 'text-indigo-700'} ${publicView ? 'text-base' : 'text-sm uppercase tracking-wide'}`}>
          <GraduationCap className="h-4 w-4" />
          {L('1. Thông tin cá nhân & Trình độ học vấn', '1. Personal details & Education')}
        </h4>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!publicView && <DetailItem label={L('Năm sinh', 'Year of birth')} value={teacher.yob} />}
          {!publicView && <DetailItem label={L('Khu vực sinh sống', 'Region')} value={teacherLivingRegionLabel(teacher.livingRegion, L('vi', 'en') as 'vi' | 'en')} />}
          <DetailItem label={L('Tỉnh/Thành phố sinh sống', 'City / province')} value={teacher.livingArea} />
          <DetailItem label={L('Học vị / Học hàm', 'Degree')} value={teacher.degreeType} />
          <DetailItem label={L('Trường ĐH/CĐ', 'University / college')} value={teacher.university} />
          <DetailItem label={L('Chuyên ngành', 'Major')} value={teacher.major} />
          <DetailItem label={L('Năm tốt nghiệp', 'Graduation year')} value={teacher.gradYear} />
          <DetailItem label="GPA" value={teacher.gpa} />
          {teacher.academicAwards && <div className="sm:col-span-2 lg:col-span-3"><MultilineDetailItem label={L('Thành tích học tập nổi bật', 'Academic achievements')} value={teacher.academicAwards} /></div>}
          {teacher.scholarship && <div className="sm:col-span-2 lg:col-span-3"><MultilineDetailItem label={L('Học bổng', 'Scholarships')} value={teacher.scholarship} /></div>}
        </div>
        {(publicView ? teacher.trainedAt123English === true : teacher.trainedAt123English !== false) && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {L('Đã hoàn thành Chương trình Đào tạo Gia sư tại Nội Bộ Trung Tâm (60 giờ)', 'Completed the 123English in-house Tutor Training Programme (60 hours)')}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className={`font-black ${publicView ? 'text-[#B87900]' : 'text-indigo-700'} ${publicView ? 'text-base' : 'text-sm uppercase tracking-wide'}`}>{L('2. Chứng chỉ', '2. Certificates')}</h4>
        {certificates.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {certificates.map((certificate, index) => (
              <article key={`${certificate.category}-${certificate.title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-[10px] font-bold uppercase ${publicView ? 'text-[#C28A00]' : 'text-indigo-600'}`}>
                      {certificate.category === 'foreign_language' ? L('Năng lực chuyên môn', 'Language proficiency') : certificate.category === 'pedagogical' ? L('Sư phạm', 'Teaching') : L('Khác', 'Other')}
                    </span>
                    <p className="mt-1 text-sm font-black text-slate-800">{certificate.title || L('Chưa đặt tên', 'Untitled')}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${certificate.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {certificate.status === 'approved' ? L('Đã duyệt', 'Approved') : L('Chờ duyệt', 'Pending')}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-xs">
                  <span className="font-semibold text-slate-600">{L('Điểm số:', 'Score:')} <strong className="text-slate-800">{certificate.score || '—'}</strong></span>
                  {certificate.fileURL && (publicView ? (
                    <button
                      type="button"
                      onClick={() => setCertificateImage({
                        src: certificate.fileURL || '',
                        alt: L(`Chứng chỉ ${certificate.title || 'của gia sư'}`, `Certificate: ${certificate.title || 'tutor certificate'}`),
                      })}
                      className={`inline-flex items-center gap-1 font-bold hover:underline ${publicView ? 'text-[#0B97BF]' : 'text-indigo-600'}`}
                    >
                      {L('Xem ảnh', 'View image')} <Eye className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <a href={certificate.fileURL} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 font-bold hover:underline ${publicView ? 'text-[#0B97BF]' : 'text-indigo-600'}`}>
                      {L('Xem ảnh', 'View image')} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : legacyCertificates.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-slate-500">{L('Chưa cập nhật chứng chỉ.', 'No certificates added yet.')}</p>
        ) : null}
        {legacyCertificates.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {legacyCertificates.map((certificate) => (
              <div key={certificate.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className={`text-[10px] font-bold uppercase tracking-wide ${publicView ? 'text-[#C28A00]' : 'text-indigo-600'}`}>{certificate.label}</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{certificate.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className={`font-black ${publicView ? 'text-[#B87900]' : 'text-indigo-700'} ${publicView ? 'text-base' : 'text-sm uppercase tracking-wide'}`}>{L('3. Kinh nghiệm giảng dạy & Ưu điểm', '3. Teaching experience & Strengths')}</h4>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label={L('Số năm kinh nghiệm', 'Years of experience')} value={teacher.teachingYears !== undefined && teacher.teachingYears !== null ? `${teacher.teachingYears} ${L('năm', 'years')}` : null} />
          <DetailItem label={L('Số học viên đã dạy', 'Learners taught')} value={teacher.studentsTaughtCount !== undefined && teacher.studentsTaughtCount !== null ? `${teacher.studentsTaughtCount} ${L('học viên', 'learners')}` : null} />
          <DetailItem label={L('Độ tuổi HS từng dạy', 'Ages taught')} value={teacher.studentAgesTaught} />
          <DetailItem label={L('Hình thức dạy chính', 'Main teaching format')} value={teacher.teachingFormats?.map((format) => format === 'online' ? 'Online' : format === 'offline' ? 'Offline' : format).join(', ')} />
          {teacher.studentResults && <div className="sm:col-span-2 lg:col-span-3"><MultilineDetailItem label={L('Thành tích học viên đạt được', 'Learner achievements')} value={teacher.studentResults} /></div>}
        </div>
        {teacher.strengths && teacher.strengths.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500">{L('Ưu điểm nổi bật', 'Key strengths')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {teacher.strengths.map((strength) => (
                <span key={strength} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${publicView ? 'bg-[#E9FAFF] text-[#087CAD] ring-[#BDEBF7]' : 'bg-sky-50 text-sky-700 ring-sky-100'}`}>
                  {L(STRENGTH_LABELS[strength], STRENGTH_LABELS_EN[strength]) || strength}
                </span>
              ))}
            </div>
          </div>
        )}
        {teacher.otherStrengths && <div className="mt-3"><DetailItem label={L('Ưu điểm khác', 'Other strengths')} value={teacher.otherStrengths} /></div>}
        {teacher.teachingFormats?.includes('offline') && (
          <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
            <p className="text-xs font-semibold text-slate-600">{L('Khu vực có thể nhận lớp Offline', 'Areas available for in-person classes')}</p>
            {offlineTeachingAreaLabels(teacher.offlineTeachingAreas).length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {offlineTeachingAreaLabels(teacher.offlineTeachingAreas).map((area) => (
                  <span key={area} className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">{area}</span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm italic text-slate-500">{L('Chưa cập nhật khu vực nhận lớp.', 'No areas added yet.')}</p>
            )}
          </div>
        )}
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
