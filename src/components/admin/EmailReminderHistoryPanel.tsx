import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, Mail, RefreshCw, Search, Send, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { loadEmailReminderHistory, type EmailReminderHistoryItem } from '@/lib/emailReminderHistory'

type StatusFilter = 'all' | 'sent' | 'failed' | 'processing'

const STATUS_META = {
  sent: { label: 'Đã gửi', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  failed: { label: 'Thất bại', icon: XCircle, className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  processing: { label: 'Đang xử lý', icon: Clock3, className: 'bg-amber-50 text-amber-700 ring-amber-200' },
} as const

function reminderLabel(value: string) {
  if (value.includes('12h')) return 'Trước 12 giờ'
  if (value.includes('30m')) return 'Trước 30 phút'
  return value || 'Không xác định'
}

function formatScheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'Chưa có ngày'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatVietnamDateTime(value: string | null) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as keyof typeof STATUS_META]
  if (!meta) return <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{status || 'Không rõ'}</span>
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ring-1 ring-inset ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  )
}

export function EmailReminderHistoryPanel() {
  const [items, setItems] = useState<EmailReminderHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await loadEmailReminderHistory(200))
    } catch (caught) {
      console.error('Failed to load email reminder history:', caught)
      setError('Không tải được lịch sử email. Vui lòng thử lại hoặc đăng nhập lại tài khoản quản trị.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    loadEmailReminderHistory(200)
      .then((history) => {
        if (active) setItems(history)
      })
      .catch((caught) => {
        console.error('Failed to load email reminder history:', caught)
        if (active) setError('Không tải được lịch sử email. Vui lòng thử lại hoặc đăng nhập lại tài khoản quản trị.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filteredItems = useMemo(() => {
    const keyword = normalizeSearch(search)
    return items.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const haystack = normalizeSearch([
        item.studentName,
        item.studentCode,
        item.recipient,
        item.teacherName,
        item.subjectName,
        item.scheduleDate,
        item.scheduleStart,
        item.messageId,
      ].join(' '))
      return matchesStatus && (!keyword || haystack.includes(keyword))
    })
  }, [items, search, statusFilter])

  const sentCount = items.filter((item) => item.status === 'sent').length
  const failedCount = items.filter((item) => item.status === 'failed').length

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
              <Mail className="h-5 w-5 text-sky-600" />
              Lịch sử email nhắc lịch
            </h2>
            <p className="mt-1 text-sm text-slate-500">Mỗi cụm buổi học chỉ gửi tối đa hai lần: trước 12 giờ và trước 30 phút.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700">Đang hiển thị {filteredItems.length}/{items.length}</span>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-700">Đã gửi {sentCount}</span>
            <span className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-700">Thất bại {failedCount}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm tên, mã học viên, email, gia sư..."
            aria-label="Tìm trong lịch sử email"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            aria-label="Lọc trạng thái email"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="sent">Đã gửi</option>
            <option value="failed">Thất bại</option>
            <option value="processing">Đang xử lý</option>
          </select>
          <Button variant="secondary" onClick={() => void reload()} disabled={loading} className="w-full md:w-auto">
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-4 sm:p-6" aria-label="Đang tải lịch sử email">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : error ? (
        <div className="m-4 flex flex-col items-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-10 text-center sm:m-6">
          <AlertCircle className="h-9 w-9 text-rose-500" />
          <p className="mt-3 max-w-lg text-sm font-semibold text-rose-800">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void reload()}>Thử lại</Button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="m-4 flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 px-5 py-12 text-center sm:m-6">
          <Send className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">Không có email phù hợp bộ lọc.</p>
          <p className="mt-1 text-xs text-slate-500">Thử đổi từ khóa hoặc chọn tất cả trạng thái.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Học viên / người nhận</th>
                  <th className="px-5 py-3">Lịch học</th>
                  <th className="px-5 py-3">Lần nhắc</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3">Thời điểm gửi</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{item.studentName || 'Chưa có tên'}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{item.studentCode || 'Chưa có mã'} · {item.recipient || 'Chưa có email'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800">{formatScheduleDate(item.scheduleDate)} · {item.scheduleStart}{item.scheduleEnd ? `–${item.scheduleEnd}` : ''}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.teacherName || 'Chưa có gia sư'} · {item.subjectName || 'Chưa có môn'}</p>
                      {item.bookingCount > 1 && <p className="mt-1 text-[11px] font-semibold text-sky-700">Cụm {item.bookingCount} ca liên tiếp</p>}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{reminderLabel(item.reminderType)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} />
                      {item.failureReason && <p className="mt-1 max-w-xs text-xs text-rose-600">{item.failureReason}</p>}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-600">{formatVietnamDateTime(item.sentAt || item.failedAt || item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 lg:hidden">
            {filteredItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-extrabold text-slate-900">{item.studentName || 'Chưa có tên'}</h3>
                    <p className="mt-0.5 break-all text-xs font-semibold text-slate-500">{item.studentCode || 'Chưa có mã'} · {item.recipient || 'Chưa có email'}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
                  <div><dt className="font-semibold text-slate-400">Lịch học</dt><dd className="mt-0.5 font-bold text-slate-800">{formatScheduleDate(item.scheduleDate)} · {item.scheduleStart}{item.scheduleEnd ? `–${item.scheduleEnd}` : ''}</dd></div>
                  <div><dt className="font-semibold text-slate-400">Lần nhắc</dt><dd className="mt-0.5 font-bold text-slate-800">{reminderLabel(item.reminderType)}</dd></div>
                  <div className="col-span-2"><dt className="font-semibold text-slate-400">Gia sư / môn học</dt><dd className="mt-0.5 font-bold text-slate-800">{item.teacherName || 'Chưa có gia sư'} · {item.subjectName || 'Chưa có môn'}</dd></div>
                  <div className="col-span-2"><dt className="font-semibold text-slate-400">Thời điểm gửi</dt><dd className="mt-0.5 font-bold text-slate-800">{formatVietnamDateTime(item.sentAt || item.failedAt || item.updatedAt)}</dd></div>
                </dl>
                {item.bookingCount > 1 && <p className="mt-3 rounded-lg bg-sky-50 px-2.5 py-2 text-[11px] font-bold text-sky-700">Đã gộp {item.bookingCount} ca liên tiếp thành một buổi nhắc lịch.</p>}
                {item.failureReason && <p className="mt-3 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">{item.failureReason}</p>}
              </article>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
