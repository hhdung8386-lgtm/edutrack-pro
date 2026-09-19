import { useEffect, useMemo, useState } from 'react'
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { Download, ExternalLink, Inbox, MessageCircle, Phone, Search, Trash2 } from 'lucide-react'
import { db } from '@/lib/firebase'
import {
  CUSTOMER_LEADS_COLLECTION,
  CUSTOMER_LEAD_LIMITS,
  CUSTOMER_LEAD_SOURCES,
  CUSTOMER_LEAD_STATUSES,
  type CustomerLead,
  type CustomerLeadSource,
  type CustomerLeadStatus,
} from '@/lib/customerLeads'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

const LEAD_LIMIT = 500

const STATUS_META: Record<CustomerLeadStatus, { label: string; className: string }> = {
  new: { label: 'Mới', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  contacted: { label: 'Đã liên hệ', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  converted: { label: 'Đã đăng ký học', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  spam: { label: 'Rác / trùng', className: 'bg-slate-100 text-slate-500 ring-slate-200' },
}

const SOURCE_KEYS = Object.keys(CUSTOMER_LEAD_SOURCES) as CustomerLeadSource[]

function formatTimestamp(value?: { toDate?: () => Date }) {
  const date = value?.toDate?.()
  if (!date) return 'Vừa gửi'
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function sourceLabel(lead: CustomerLead) {
  return CUSTOMER_LEAD_SOURCES[lead.source]?.label ?? lead.sourceLabel ?? lead.source
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(rows: CustomerLead[]) {
  const header = ['Thời gian', 'Trang', 'Họ tên', 'SĐT', 'Đối tượng', 'Nội dung', 'Chia sẻ thêm', 'Trạng thái', 'Ghi chú']
  const lines = rows.map((lead) => [
    formatTimestamp(lead.createdAt), sourceLabel(lead), lead.name, lead.phone, lead.ageGroup,
    lead.subject, lead.message, STATUS_META[lead.status]?.label ?? lead.status, lead.note,
  ].map(csvCell).join(','))
  // BOM để Excel đọc đúng tiếng Việt.
  const blob = new Blob([String.fromCharCode(0xfeff) + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `form-khach-hang-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function LeadCard({ lead, onDelete }: { lead: CustomerLead; onDelete: (lead: CustomerLead) => void }) {
  const user = useAuthStore((state) => state.user)
  const [note, setNote] = useState(lead.note ?? '')
  const [saving, setSaving] = useState(false)
  const status = STATUS_META[lead.status] ?? STATUS_META.new
  const noteChanged = note.trim() !== (lead.note ?? '').trim()

  const save = async (changes: { status?: CustomerLeadStatus; note?: string }) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, CUSTOMER_LEADS_COLLECTION, lead.id), {
        ...changes,
        updatedAt: serverTimestamp(),
        handledBy: user?.uid ?? '',
        handledByName: user?.displayName || user?.email || '',
      })
      toast.success('Đã lưu')
    } catch (error) {
      console.error(error)
      toast.error('Chưa lưu được. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={lead.status === 'new' ? 'border-rose-200' : ''}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${status.className}`}>{status.label}</span>
            <a
              href={lead.sourcePath || CUSTOMER_LEAD_SOURCES[lead.source]?.path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
              title="Mở trang khách đã điền form"
            >
              Trang: {sourceLabel(lead)}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-xs text-slate-500">{formatTimestamp(lead.createdAt)}</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{lead.name}</p>
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold text-white">
              <Phone className="h-4 w-4" />
              {lead.phone}
            </a>
            <a
              href={`https://zalo.me/${lead.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0068FF] px-3 py-1.5 text-sm font-bold text-white"
            >
              <MessageCircle className="h-4 w-4" />
              Zalo
            </a>
          </div>
          <dl className="grid gap-1 text-sm text-slate-600">
            {lead.ageGroup && <div><dt className="inline font-semibold text-slate-800">Đăng ký cho: </dt><dd className="inline">{lead.ageGroup}</dd></div>}
            {lead.subject && <div><dt className="inline font-semibold text-slate-800">Nội dung: </dt><dd className="inline">{lead.subject}</dd></div>}
            {lead.message && <div><dt className="font-semibold text-slate-800">Chia sẻ thêm:</dt><dd className="whitespace-pre-wrap">{lead.message}</dd></div>}
          </dl>
        </div>

        <div className="w-full shrink-0 space-y-2 lg:w-80">
          <select
            value={lead.status}
            disabled={saving}
            onChange={(event) => save({ status: event.target.value as CustomerLeadStatus })}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800"
            aria-label="Trạng thái xử lý"
          >
            {CUSTOMER_LEAD_STATUSES.map((key) => <option key={key} value={key}>{STATUS_META[key].label}</option>)}
          </select>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, CUSTOMER_LEAD_LIMITS.note))}
            rows={3}
            placeholder="Ghi chú tư vấn (đã gọi, hẹn học thử lúc...)"
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-slate-400">{lead.handledByName ? `Xử lý: ${lead.handledByName}` : ''}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDelete(lead)}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                aria-label="Xoá form"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!noteChanged || saving}
                onClick={() => save({ note: note.trim() })}
                className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-40"
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function CustomerLeadsPage() {
  const [leads, setLeads] = useState<CustomerLead[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [source, setSource] = useState<CustomerLeadSource | 'all'>('all')
  const [status, setStatus] = useState<CustomerLeadStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<CustomerLead | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const q = query(collection(db, CUSTOMER_LEADS_COLLECTION), orderBy('createdAt', 'desc'), limit(LEAD_LIMIT))
    return onSnapshot(
      q,
      (snap) => {
        setLeads(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as CustomerLead))
        setLoadError('')
        setLoading(false)
      },
      (error) => {
        console.error(error)
        setLoadError('Không tải được form khách hàng. Kiểm tra quyền truy cập hoặc mạng.')
        setLoading(false)
      },
    )
  }, [])

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const lead of leads) counts[lead.source] = (counts[lead.source] ?? 0) + 1
    return counts
  }, [leads])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    return leads.filter((lead) =>
      (source === 'all' || lead.source === source)
      && (status === 'all' || lead.status === status)
      && (!term
        || lead.name.toLowerCase().includes(term)
        || (digits.length >= 3 && lead.phone.includes(digits))
        || (lead.message ?? '').toLowerCase().includes(term)
        || (lead.note ?? '').toLowerCase().includes(term)),
    )
  }, [leads, search, source, status])

  const newCount = leads.filter((lead) => lead.status === 'new').length

  const confirmDelete = async () => {
    if (!deleting) return
    setWorking(true)
    try {
      await deleteDoc(doc(db, CUSTOMER_LEADS_COLLECTION, deleting.id))
      toast.success('Đã xoá form')
      setDeleting(null)
    } catch (error) {
      console.error(error)
      toast.error('Chưa xoá được. Vui lòng thử lại.')
    } finally {
      setWorking(false)
    }
  }

  const tabClass = (active: boolean) =>
    `h-10 shrink-0 rounded-xl px-4 text-sm font-bold transition ${
      active ? 'bg-slate-950 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-600">Khách hàng</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Form khách đăng ký</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Mọi form khách điền trên trang web (Học thử miễn phí, Liên hệ) đều về đây, kèm tên trang khách đã điền.
            {newCount > 0 && <b className="text-rose-600"> Có {newCount} form mới chưa xử lý.</b>}
          </p>
        </div>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(rows)}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Xuất Excel (CSV)
        </button>
      </div>

      <Card className="space-y-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm tên, số điện thoại, nội dung, ghi chú..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto">
          <button type="button" onClick={() => setSource('all')} className={tabClass(source === 'all')}>
            Tất cả trang <span className="ml-1 opacity-70">{leads.length}</span>
          </button>
          {SOURCE_KEYS.map((key) => (
            <button key={key} type="button" onClick={() => setSource(key)} className={tabClass(source === key)}>
              {CUSTOMER_LEAD_SOURCES[key].label} <span className="ml-1 opacity-70">{sourceCounts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(['all', ...CUSTOMER_LEAD_STATUSES] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold ring-1 transition ${
                status === key ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {key === 'all' ? 'Mọi trạng thái' : STATUS_META[key].label}
            </button>
          ))}
        </div>
      </Card>

      {loadError && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{loadError}</p>}

      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title={leads.length === 0 ? 'Chưa có form nào' : 'Không có form khớp bộ lọc'}
          description="Khi khách điền form trên trang web, thông tin sẽ hiện ở đây ngay lập tức."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((lead) => <LeadCard key={`${lead.id}:${lead.note ?? ''}`} lead={lead} onDelete={setDeleting} />)}
          {leads.length >= LEAD_LIMIT && (
            <p className="text-center text-xs text-slate-400">Đang hiển thị {LEAD_LIMIT} form mới nhất.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Xoá form khách hàng?"
        description={deleting ? `${deleting.name} · ${deleting.phone}` : undefined}
        consequence="Form bị xoá vĩnh viễn. Nếu chỉ là rác/trùng, nên chuyển trạng thái “Rác / trùng” thay vì xoá."
        confirmLabel="Xoá form"
        confirmVariant="danger"
        loading={working}
      />
    </div>
  )
}
