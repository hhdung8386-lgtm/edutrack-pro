// Hộp thoại xem trước tin NHẮC LỊCH HỌC trước khi copy gửi học viên.
// Chỉ đọc dữ liệu: link sửa trong hộp thoại chỉ dùng cho tin nhắn này, không ghi vào hồ sơ.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Check, Clock, Copy, ExternalLink, Link2, UserRound } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { normalizeClassroomUrl } from '@/lib/adminClassroomLink'
import {
  buildBookingReminderMessage,
  formatReminderDate,
  type ReminderSession,
} from '@/lib/bookingReminder'
import { copyTextToClipboard } from '@/lib/lessonShare'

export type ReminderLinkSource = 'profile' | 'booking' | 'none'

export interface BookingReminderDraft {
  studentId: string
  studentName: string
  studentCode?: string
  date: string
  sessions: ReminderSession[]
  classroomLink: string
  linkSource: ReminderLinkSource
  pilotClassroom: boolean
}

interface BookingReminderDialogProps {
  draft: BookingReminderDraft | null
  onClose: () => void
  onCopied: (draft: BookingReminderDraft) => void
  onCopyFailed: () => void
}

const LINK_SOURCE_BADGE: Record<ReminderLinkSource, { label: string; className: string }> = {
  profile: { label: 'Từ hồ sơ học viên', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  booking: { label: 'Từ ca đặt lịch', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  none: { label: 'Chưa có link', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

const LINK_LINE_PREFIX = 'Link vào lớp: '

function sessionRanges(sessions: ReminderSession[]): string[] {
  return Array.from(new Set([...sessions]
    .sort((a, b) => a.start.localeCompare(b.start, 'en', { numeric: true }))
    .map((s) => (s.end ? `${s.start} - ${s.end}` : s.start))))
}

export function BookingReminderDialog({ draft, ...props }: BookingReminderDialogProps) {
  // Mỗi lần mở là một phiên mới: ô link luôn bắt đầu từ link trong hồ sơ.
  if (!draft) return null
  return <ReminderDialogBody key={`${draft.studentId}|${draft.date}`} draft={draft} {...props} />
}

function ReminderDialogBody({
  draft,
  onClose,
  onCopied,
  onCopyFailed,
}: Omit<BookingReminderDialogProps, 'draft'> & { draft: BookingReminderDraft }) {
  const [linkInput, setLinkInput] = useState(draft.classroomLink)
  const [copying, setCopying] = useState(false)

  const normalizedLink = useMemo(() => normalizeClassroomUrl(linkInput), [linkInput])
  const linkTouched = linkInput.trim() !== draft.classroomLink.trim()
  const linkInvalid = linkInput.trim() !== '' && !normalizedLink

  const message = useMemo(() => {
    return buildBookingReminderMessage({
      studentName: draft.studentName,
      studentCode: draft.studentCode,
      date: draft.date,
      sessions: draft.sessions,
      // Chưa có link hợp lệ thì vẫn cho xem trước, chỗ link hiện "[Link]" để giáo vụ biết cần dán.
      classroomLink: normalizedLink || '[Link]',
    })
  }, [draft, normalizedLink])

  const ranges = sessionRanges(draft.sessions)
  const badge = linkTouched
    ? { label: 'Link nhập tay (chỉ dùng cho tin này)', className: 'bg-violet-50 text-violet-700 border-violet-200' }
    : LINK_SOURCE_BADGE[draft.linkSource]

  const handleCopy = async () => {
    if (!normalizedLink || copying) return
    setCopying(true)
    const copied = await copyTextToClipboard(message)
    setCopying(false)
    if (copied) onCopied(draft)
    else onCopyFailed()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Tin nhắc lịch học"
      size="lg"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {normalizedLink
              ? 'Tin nhắn đã sẵn sàng, bấm copy rồi dán vào Zalo / Messenger.'
              : 'Cần link vào lớp hợp lệ trước khi copy.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 sm:flex-none"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => { void handleCopy() }}
              disabled={!normalizedLink || copying}
              data-modal-initial-focus={normalizedLink ? '' : undefined}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:flex-none"
            >
              <Copy className="h-4 w-4" />
              {copying ? 'Đang copy...' : 'Copy tin nhắn'}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        {/* Học viên + lịch */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900">{draft.studentName || 'Học viên'}</p>
              {draft.studentCode && <p className="font-mono text-xs text-slate-400">{draft.studentCode}</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
              {formatReminderDate(draft.date)}
            </span>
            {ranges.map((range) => (
              <span key={range} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                <Clock className="h-3.5 w-3.5" />
                {range}
              </span>
            ))}
            {ranges.length > 1 && (
              <span className="text-xs text-slate-400">Đã gộp {ranges.length} ca trong ngày</span>
            )}
          </div>
        </div>

        {/* Link vào lớp */}
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="reminder-classroom-link" className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Link2 className="h-4 w-4 text-indigo-500" />
              Link vào lớp
            </label>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              id="reminder-classroom-link"
              type="url"
              inputMode="url"
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
              placeholder="Dán link Google Meet / Zoom của lớp..."
              data-modal-initial-focus={normalizedLink ? undefined : ''}
              className={`min-h-[40px] w-full min-w-0 rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:ring-2 ${
                linkInvalid || !linkInput.trim()
                  ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-100'
                  : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
              }`}
            />
            {normalizedLink && (
              <a
                href={normalizedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                title="Mở thử link ở tab mới"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Mở thử
              </a>
            )}
          </div>
          {linkInvalid && (
            <p className="mt-1.5 text-xs font-medium text-rose-600">Link chưa hợp lệ — cần dạng https://meet.google.com/...</p>
          )}
          {!linkInput.trim() && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Học viên chưa có link lớp. Dán link vào ô trên để gửi ngay, hoặc{' '}
                {draft.studentId ? (
                  <Link to={`/admin/students/${draft.studentId}`} className="font-semibold underline hover:text-amber-900">
                    cập nhật link cố định trong hồ sơ học viên
                  </Link>
                ) : 'cập nhật link cố định trong hồ sơ học viên'}
                {' '}để lần sau tự điền.
              </span>
            </div>
          )}
          {draft.pilotClassroom && (
            <p className="mt-2 text-xs text-slate-500">
              Học viên đang bật phòng 123English — kiểm tra lại link trước khi gửi.
            </p>
          )}
        </div>

        {/* Xem trước tin nhắn */}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-800">Xem trước tin nhắn</p>
          <div className="rounded-2xl bg-gradient-to-b from-sky-50 to-indigo-50/60 p-3 sm:p-4">
            <div className="rounded-2xl rounded-tl-sm border border-sky-100 bg-white px-4 py-3 shadow-sm">
              <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-800">
                {message.split('\n').map((line, index) => {
                  if (index === 0) {
                    return <p key={index} className="font-bold text-indigo-700">{line}</p>
                  }
                  if (line.startsWith(LINK_LINE_PREFIX)) {
                    return (
                      <p key={index} className="my-0.5 rounded-lg bg-indigo-50 px-2 py-1">
                        <span className="font-semibold">{LINK_LINE_PREFIX}</span>
                        {normalizedLink ? (
                          <a href={normalizedLink} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-indigo-600 underline">
                            {normalizedLink}
                          </a>
                        ) : (
                          <span className="font-semibold text-amber-600">[Link]</span>
                        )}
                      </p>
                    )
                  }
                  return <p key={index} className={line ? '' : 'h-3'}>{line}</p>
                })}
              </div>
            </div>
            {normalizedLink && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                <Check className="h-3 w-3 text-emerald-600" />
                Đúng mẫu trung tâm, có link vào lớp
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
