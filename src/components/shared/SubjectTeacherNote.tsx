import { Info } from 'lucide-react'

/** Chú thích môn học do admin nhập ở danh mục Môn học, hiển thị cho gia sư. */
export function SubjectTeacherNote({
  note,
  lang = 'vi',
  className = '',
}: {
  note?: string
  lang?: string
  className?: string
}) {
  if (!note) return null
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left ${className}`} role="note">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-600">
          {lang === 'vi' ? 'Chú thích môn học' : 'Subject note'}
        </p>
        <p className="mt-0.5 whitespace-pre-line break-words text-[13px] font-semibold leading-5 text-indigo-950">{note}</p>
      </div>
    </div>
  )
}
