import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { CalendarClock, CheckCircle2, Clock3, Search, UserRoundCheck, XCircle } from 'lucide-react'
import { db } from '@/lib/firebase'
import { BookingRequest, DayOfWeek } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { useLanguageStore } from '@/stores/languageStore'
import { toast } from '@/stores/toastStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { bookingConflictMessage, checkBookingCandidates } from '@/lib/bookingConflicts'

type TeacherResponseFilter = 'pending' | 'accepted' | 'declined' | 'all'

const DAY_LABELS_VI: Record<DayOfWeek, string> = {
  mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ nhật',
}

const DAY_LABELS_EN: Record<DayOfWeek, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

function responseOf(request: BookingRequest) {
  return request.teacherResponse || 'pending'
}

function createdAtLabel(request: BookingRequest, lang: string) {
  const value = request.createdAt?.toDate?.()
  if (!value) return lang === 'vi' ? 'Chưa có thời gian' : 'Time unavailable'
  return value.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function TeacherBookingRequestsPage() {
  const { teacherId, user } = useAuthStore()
  const { lang } = useLanguageStore()
  const [requests, setRequests] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TeacherResponseFilter>('pending')
  const [search, setSearch] = useState('')
  const [actioningId, setActioningId] = useState<string | null>(null)

  useEffect(() => {
    if (!teacherId) {
      setRequests([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = onSnapshot(
      query(collection(db, 'bookingRequests'), where('teacherId', '==', teacherId)),
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        setRequests(items)
        setLoading(false)
      },
      (error) => {
        console.error('Error loading teacher booking requests:', error)
        toast.error(lang === 'vi' ? 'Không tải được yêu cầu lớp học' : 'Could not load class requests')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [teacherId, lang])

  const counts = useMemo(() => ({
    pending: requests.filter((item) => item.status === 'pending' && responseOf(item) === 'pending').length,
    accepted: requests.filter((item) => responseOf(item) === 'accepted').length,
    declined: requests.filter((item) => responseOf(item) === 'declined').length,
  }), [requests])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return requests.filter((request) => {
      const response = responseOf(request)
      const matchesFilter = filter === 'all'
        || (filter === 'pending' ? request.status === 'pending' && response === 'pending' : response === filter)
      const haystack = [request.studentName, request.studentCode, request.subjectName, request.requestedDate]
        .filter(Boolean).join(' ').toLowerCase()
      return matchesFilter && (!keyword || haystack.includes(keyword))
    })
  }, [requests, filter, search])

  const respond = async (request: BookingRequest, response: 'accepted' | 'declined') => {
    if (!teacherId || request.teacherId !== teacherId || request.status !== 'pending') return
    setActioningId(request.id)
    try {
      if (response === 'accepted') {
        const conflicts = await checkBookingCandidates([{
          id: request.id,
          teacherId: request.teacherId,
          teacherName: request.teacherName,
          studentId: request.studentId,
          studentName: request.studentName,
          requestedDate: request.requestedDate,
          requestedStart: request.requestedStart,
          requestedEnd: request.requestedEnd,
          requestedMinutes: request.requestedMinutes,
        }], {
          ignoreBookingIds: [request.id],
          includePending: false,
        })

        if (conflicts.length > 0) {
          toast.error(bookingConflictMessage(conflicts[0], lang === 'vi' ? 'vi' : 'en'))
          return
        }
      }

      await updateDoc(doc(db, 'bookingRequests', request.id), {
        teacherResponse: response,
        teacherRespondedAt: serverTimestamp(),
        teacherRespondedBy: user?.uid || teacherId,
      })
      toast.success(response === 'accepted'
        ? (lang === 'vi' ? 'Đã xác nhận nhận lớp. Học vụ đã thấy phản hồi.' : 'Class accepted. Academic staff can now see your response.')
        : (lang === 'vi' ? 'Đã gửi phản hồi từ chối đến học vụ.' : 'Decline response sent to academic staff.'))
    } catch (error) {
      console.error('Teacher booking response failed:', error)
      toast.error(lang === 'vi' ? 'Chưa gửi được phản hồi' : 'Could not send your response')
    } finally {
      setActioningId(null)
    }
  }

  const responseLabels = lang === 'vi'
    ? { pending: 'Chờ xác nhận', accepted: 'Đã xác nhận', declined: 'Đã từ chối', all: 'Tất cả' }
    : { pending: 'Awaiting reply', accepted: 'Accepted', declined: 'Declined', all: 'All' }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pt-2 lg:pt-6">
      <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">{lang === 'vi' ? 'Học vụ' : 'Academic requests'}</p>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{lang === 'vi' ? 'Yêu cầu nhận lớp' : 'Class requests'}</h1>
            <p className="mt-1 text-sm text-slate-500">{lang === 'vi' ? 'Xác nhận hoặc từ chối để học vụ xử lý lịch với học viên.' : 'Accept or decline so academic staff can process the student schedule.'}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-center"><p className="text-lg font-black text-amber-700">{counts.pending}</p><p className="text-[10px] font-bold text-amber-700">{responseLabels.pending}</p></div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center"><p className="text-lg font-black text-emerald-700">{counts.accepted}</p><p className="text-[10px] font-bold text-emerald-700">{responseLabels.accepted}</p></div>
            <div className="rounded-xl bg-rose-50 px-3 py-2 text-center"><p className="text-lg font-black text-rose-700">{counts.declined}</p><p className="text-[10px] font-bold text-rose-700">{responseLabels.declined}</p></div>
          </div>
        </div>
      </div>

      <Card className="space-y-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={lang === 'vi' ? 'Tìm học viên, mã học viên, môn học...' : 'Search student, code or subject...'} className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
        </label>
        <div className="flex gap-2 overflow-x-auto">
          {(['pending', 'accepted', 'declined', 'all'] as TeacherResponseFilter[]).map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-bold ${filter === item ? 'bg-brand-400 text-slate-950' : 'bg-slate-100 text-slate-600'}`}>{responseLabels[item]}</button>
          ))}
        </div>
      </Card>

      {loading ? <Card padding="none"><TableSkeleton /></Card> : filtered.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-8 w-8" />} title={lang === 'vi' ? 'Chưa có yêu cầu phù hợp' : 'No matching requests'} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((request) => {
            const response = responseOf(request)
            const canRespond = request.status === 'pending'
            const dayLabel = (lang === 'vi' ? DAY_LABELS_VI : DAY_LABELS_EN)[request.requestedDay]
            return (
              <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${response === 'accepted' ? 'bg-emerald-50 text-emerald-700' : response === 'declined' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                        {responseLabels[response]}
                      </span>
                      <span className="text-xs text-slate-400">{createdAtLabel(request, lang)}</span>
                    </div>
                    <div className="mt-3 flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><UserRoundCheck className="h-5 w-5" /></div>
                      <div>
                        <p className="font-extrabold text-slate-900">{request.studentName}</p>
                        <p className="mt-0.5 font-mono text-xs font-bold text-indigo-500">{request.studentCode}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">{request.subjectName || (lang === 'vi' ? 'Chưa xếp môn học' : 'Subject not assigned')}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-sky-600" />{dayLabel}{request.requestedDate ? ` ${request.requestedDate}` : ''}, {request.requestedStart}-{request.requestedEnd} ({request.requestedMinutes} {lang === 'vi' ? 'phút' : 'min'})</span>
                    </div>
                    {request.note && <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-sm text-slate-700"><strong>{lang === 'vi' ? 'Ghi chú học viên:' : 'Student note:'}</strong> {request.note}</p>}
                    {request.adminNote && <p className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-700"><strong>{lang === 'vi' ? 'Phản hồi học vụ:' : 'Academic note:'}</strong> {request.adminNote}</p>}
                  </div>
                  <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:w-[250px] lg:grid-cols-1">
                    <Button size="sm" onClick={() => respond(request, 'accepted')} loading={actioningId === request.id && response !== 'accepted'} disabled={!canRespond || response === 'accepted'}>
                      <CheckCircle2 className="h-4 w-4" />{lang === 'vi' ? 'Xác nhận nhận lớp' : 'Accept class'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => respond(request, 'declined')} loading={actioningId === request.id && response !== 'declined'} disabled={!canRespond || response === 'declined'}>
                      <XCircle className="h-4 w-4" />{lang === 'vi' ? 'Từ chối' : 'Decline'}
                    </Button>
                    {request.status !== 'pending' && <p className="text-center text-[11px] font-semibold text-slate-500 lg:text-left">{lang === 'vi' ? `Học vụ: ${request.status}` : `Admin: ${request.status}`}</p>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
