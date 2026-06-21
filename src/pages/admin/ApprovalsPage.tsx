import { useCallback, useEffect, useState } from 'react'
import {
  collection, query, where, onSnapshot, orderBy,
  runTransaction, doc, serverTimestamp, addDoc, collection as col,
  getCountFromServer, limit,
} from 'firebase/firestore'
import { db, calculateSalary } from '@/lib/firebase'
import { Lesson } from '@/types'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { formatVND } from '@/lib/constants'
import { ClipboardCheck, Image as ImageIcon, X, Search } from 'lucide-react'

const TABS = [
  { key: 'pending', label: 'Chờ duyệt', color: 'text-amber-400' },
  { key: 'approved', label: 'Đã duyệt', color: 'text-emerald-400' },
  { key: 'rejected', label: 'Từ chối', color: 'text-rose-400' },
  { key: 'all', label: 'Tất cả', color: 'text-slate-600' },
]

export function ApprovalsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<string>('pending')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingLesson, setApprovingLesson] = useState<Lesson | null>(null)
  const [rejectingLesson, setRejectingLesson] = useState<Lesson | null>(null)
  const [search, setSearch] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [viewImages, setViewImages] = useState<string[] | null>(null)
  // Independent counters so badges reflect real DB state, not just current tab's loaded set
  const [totalCounts, setTotalCounts] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [limitVal, setLimitVal] = useState(30)

  useEffect(() => {
    setLimitVal(30)
  }, [tab])

  const fetchCounts = async () => {
    try {
      const [approvedSnap, rejectedSnap] = await Promise.all([
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'approved'))),
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'rejected'))),
      ])
      setTotalCounts((prev) => ({
        ...prev,
        approved: approvedSnap.data().count,
        rejected: rejectedSnap.data().count,
      }))
    } catch (err) {
      console.error('[fetch-historical-counts]', err)
    }
  }

  useEffect(() => {
    setLoading(true)
    const constraints =
      tab === 'all'
        ? [orderBy('date', 'desc'), limit(limitVal)]
        : tab === 'pending'
        ? [where('status', '==', 'pending')]
        : [where('status', '==', tab), orderBy('date', 'desc'), limit(limitVal)]

    const q = query(collection(db, 'lessons'), ...constraints)
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
      docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
      setLessons(docs)
      setLoading(false)
    })
  }, [tab, limitVal])
  // Fetch counters on-demand (1 read per query) instead of subscribing to full docs.
  // Refresh after approve/reject so badges stay accurate without hammering Firestore.
  const refreshCounts = useCallback(async () => {
    try {
      const [pSnap, aSnap, rSnap] = await Promise.all([
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'pending'))),
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'approved'))),
        getCountFromServer(query(collection(db, 'lessons'), where('status', '==', 'rejected'))),
      ])
      setTotalCounts({
        pending: pSnap.data().count,
        approved: aSnap.data().count,
        rejected: rSnap.data().count,
      })
    } catch (err) {
      console.error('[approvals-counts]', err)
    }
  }, [])

  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  const filteredLessons = lessons.filter(l =>
    l.studentName.toLowerCase().includes(search.toLowerCase()) ||
    l.teacherName.toLowerCase().includes(search.toLowerCase())
  )

  const pendingCount = totalCounts.pending

  const handleApprove = async () => {
    if (!approvingLesson) return
    setApproving(true)
    try {
      await runTransaction(
        db,
        async (tx) => {
          const lessonRef = doc(db, 'lessons', approvingLesson.id)
          const studentRef = doc(db, 'students', approvingLesson.studentId)

          const [lessonSnap, studentSnap] = await Promise.all([
            tx.get(lessonRef),
            tx.get(studentRef),
          ])

          if (!lessonSnap.exists()) throw new Error('LESSON_NOT_FOUND')
          if (!studentSnap.exists()) throw new Error('STUDENT_NOT_FOUND')

          const lessonNow = lessonSnap.data() as any
          if (lessonNow.status !== 'pending') throw new Error('LESSON_ALREADY_PROCESSED')

          const student = studentSnap.data() as any

          const [teacherSnap, subjectSnap] = await Promise.all([
            tx.get(doc(db, 'teachers', approvingLesson.teacherId)),
            tx.get(doc(db, 'subjects', student.subjectId)),
          ])

          const teacherData = teacherSnap.data()
          const teacherLevel = (approvingLesson.teacherLevel ?? teacherData?.level ?? 1) || 1
          const pricePerMinute = subjectSnap.data()?.pricePerMinute ?? 0
          const subjectId = student.subjectId
          const subjectName = student.subjectName || subjectSnap.data()?.name || ''

          const lessonMinutes = Number(approvingLesson.minutes) || 0
          const salary = calculateSalary(lessonMinutes, pricePerMinute, teacherLevel)
          const month = (approvingLesson.date || '').slice(0, 7)

          const mps = Number(student.minutesPerSession) || 50
          const totalSessionsNum = Number(student.totalSessions) || 0
          const usedSessionsNum = Number(student.usedSessions) || 0
          const remainingSessionsNum = Number(student.remainingSessions ?? (totalSessionsNum - usedSessionsNum)) || 0

          const totalMinutes = Number(student.totalMinutes ?? totalSessionsNum * mps) || 0
          const prevUsedMinutes = Number(student.usedMinutes ?? usedSessionsNum * mps) || 0
          const prevRemainingMinutes = Number(student.remainingMinutes ?? (totalMinutes - prevUsedMinutes)) || 0

          const newUsedMinutes = prevUsedMinutes + lessonMinutes
          const newRemainingMinutes = totalMinutes - newUsedMinutes
          const newRemainingSessions = Math.floor(newRemainingMinutes / mps)
          const newUsedSessionsRaw = newUsedMinutes / mps
          const newUsedSessions =
            Math.abs(newUsedSessionsRaw - Math.round(newUsedSessionsRaw)) < 0.001
              ? Math.round(newUsedSessionsRaw)
              : Math.round(newUsedSessionsRaw * 100) / 100

          tx.update(lessonRef, {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user?.uid ?? '',
            salary,
            teacherLevel,
            pricePerMinute,
            subjectId,
            subjectName,
            sessionsBeforeApproval: remainingSessionsNum,
            sessionsAfterApproval: newRemainingSessions,
            minutesBeforeApproval: prevRemainingMinutes,
            minutesAfterApproval: newRemainingMinutes,
          })

          tx.update(studentRef, {
            usedMinutes: newUsedMinutes,
            remainingMinutes: newRemainingMinutes,
            totalMinutes,
            minutesPerSession: mps,
            usedSessions: newUsedSessions,
            remainingSessions: newRemainingSessions,
            status: newRemainingMinutes <= 0 ? 'expired' : 'active',
            updatedAt: serverTimestamp(),
          })

          const publicLessonRef = doc(db, 'publicLessons', approvingLesson.id)
          tx.set(publicLessonRef, {
            id: approvingLesson.id,
            studentId: approvingLesson.studentId,
            studentCode: approvingLesson.studentCode,
            studentName: approvingLesson.studentName,
            teacherId: approvingLesson.teacherId,
            teacherCode: approvingLesson.teacherCode ?? '',
            teacherName: approvingLesson.teacherName ?? '',
            subjectId,
            subjectName,
            date: approvingLesson.date,
            minutes: lessonMinutes,
            comment: approvingLesson.comment || '',
            homework: approvingLesson.homework || '',
            book: approvingLesson.book || '',
            imageURLs: approvingLesson.imageURLs || [],
            status: 'approved',
            createdAt: approvingLesson.createdAt || serverTimestamp(),
            approvedAt: serverTimestamp(),
          })

          const payrollRef = doc(col(db, 'payroll'))
          tx.set(payrollRef, {
            teacherId: approvingLesson.teacherId,
            teacherName: approvingLesson.teacherName ?? '',
            lessonId: approvingLesson.id,
            amount: salary,
            minutes: lessonMinutes,
            pricePerMinute,
            level: teacherLevel,
            month,
            paid: false,
            createdAt: serverTimestamp(),
          })

          const logRef = doc(col(db, 'adminLogs'))
          tx.set(logRef, {
            adminId: user?.uid ?? '',
            action: 'APPROVE_LESSON',
            targetType: 'lesson',
            targetId: approvingLesson.id,
            changes: {
              status: { from: 'pending', to: 'approved' },
              salary,
              minutesDeducted: lessonMinutes,
              minutesBefore: prevRemainingMinutes,
              minutesAfter: newRemainingMinutes,
            },
            createdAt: serverTimestamp(),
          })
        },
        { maxAttempts: 3 },
      )

      toast.success('Đã duyệt buổi dạy thành công')
      setApprovingLesson(null)
      refreshCounts()
    } catch (err: any) {
      console.error('[approve-lesson]', err)
      const code = err?.code || ''
      const message = err?.message || ''
      if (message === 'LESSON_NOT_FOUND') {
        toast.error('Buổi dạy không tồn tại, có thể đã bị xóa')
      } else if (message === 'STUDENT_NOT_FOUND') {
        toast.error('Học viên không tồn tại')
      } else if (message === 'LESSON_ALREADY_PROCESSED') {
        toast.warning('Buổi dạy đã được xử lý trước đó')
        setApprovingLesson(null)
      } else if (code === 'permission-denied') {
        toast.error('Bạn không có quyền duyệt buổi dạy này')
      } else if (code === 'resource-exhausted' || code === 'unavailable') {
        toast.error('Hệ thống đang bận, vui lòng thử lại sau ít giây')
      } else {
        toast.error(`Duyệt thất bại: ${code || message || 'lỗi không xác định'}`)
      }
    } finally {
      setApproving(false)
      fetchCounts()
    }
  }

  const handleReject = async () => {
    if (!rejectingLesson || !rejectReason.trim()) {
      toast.warning('Vui lòng nhập lý do từ chối')
      return
    }
    setRejecting(true)
    try {
      const lessonRef = doc(db, 'lessons', rejectingLesson.id)
      const { updateDoc } = await import('firebase/firestore')
      await updateDoc(lessonRef, {
        status: 'rejected',
        rejectedReason: rejectReason,
        updatedAt: serverTimestamp(),
      })
      toast.success('Đã từ chối buổi dạy')
      setRejectingLesson(null)
      setRejectReason('')
      refreshCounts()
    } catch {
      toast.error('Có lỗi xảy ra')
    } finally {
      setRejecting(false)
      fetchCounts()
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <h1 className="text-2xl font-bold relative z-10">Duyệt buổi dạy</h1>
        <p className="text-sm text-indigo-100 mt-1 relative z-10">
          {tab === 'pending' && pendingCount > 0 ? `${pendingCount} buổi đang chờ duyệt` : 'Quản lý và duyệt buổi dạy'}
        </p>
        {/* Quick stats */}
        <div className="flex gap-3 mt-4 relative z-10 flex-wrap">
          <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold">
            ⏳ Chờ duyệt: <span className="text-amber-200">{totalCounts.pending}</span>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold">
            ✅ Đã duyệt: <span className="text-emerald-200">{totalCounts.approved}</span>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold">
            ❌ Từ chối: <span className="text-rose-200">{totalCounts.rejected}</span>
          </div>
        </div>
      </div>

      {/* Tabs and Search */}
      <Card className="border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === t.key
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {t.label}
                {t.key === 'pending' && pendingCount > 0 && (
                  <span className="ml-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm học viên / giáo viên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSpinner />
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="w-8 h-8" />}
          title="Không có buổi dạy nào"
          description={tab === 'pending' ? 'Tất cả buổi dạy đã được duyệt' : 'Chưa có dữ liệu'}
        />
      ) : (
        <div className="space-y-4">
          {filteredLessons.map((lesson) => (
            <Card key={lesson.id} className="relative">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">{lesson.date}</span>
                    <StatusBadge status={lesson.status} />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Học viên</p>
                      <p className="text-slate-700 font-medium">{lesson.studentName}</p>
                      <p className="text-xs text-indigo-400 font-mono">{lesson.studentCode}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Giáo viên</p>
                      <p className="text-slate-700">{lesson.teacherName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Môn học</p>
                      <p className="text-slate-700">{lesson.subjectName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Sách học</p>
                      <p className="text-[#3BB8EB] font-bold truncate max-w-[150px]" title={lesson.book || ''}>{lesson.book || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Thời lượng</p>
                      <p className="text-slate-700 font-semibold">{lesson.minutes} phút</p>
                    </div>
                  </div>

                  {lesson.comment && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Nhận xét</p>
                      <p className="text-sm text-slate-600 line-clamp-2">{lesson.comment}</p>
                    </div>
                  )}

                  {lesson.homework && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Bài tập</p>
                      <p className="text-sm text-slate-600 line-clamp-1">{lesson.homework}</p>
                    </div>
                  )}

                  {lesson.imageURLs?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {lesson.imageURLs.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Ảnh ${i + 1}`}
                          className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity border border-slate-300"
                          onClick={() => setViewImages(lesson.imageURLs)}
                        />
                      ))}
                    </div>
                  )}

                  {lesson.status === 'approved' && (
                    <div className="flex gap-4 text-sm pt-1 border-t border-slate-200 flex-wrap">
                      <span className="text-slate-500">
                        Buổi: {lesson.sessionsBeforeApproval} → {lesson.sessionsAfterApproval}
                      </span>
                      {lesson.minutesBeforeApproval != null && lesson.minutesAfterApproval != null && (
                        <span className="text-slate-500">
                          Phút: {lesson.minutesBeforeApproval} → {lesson.minutesAfterApproval}
                          <span className="text-rose-400 ml-1">(-{lesson.minutes})</span>
                        </span>
                      )}
                      <span className="text-emerald-400 font-semibold">
                        Lương: +{formatVND(lesson.salary || 0)}
                      </span>
                    </div>
                  )}

                  {lesson.status === 'rejected' && lesson.rejectedReason && (
                    <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                      Lý do từ chối: {lesson.rejectedReason}
                    </p>
                  )}
                </div>

                {lesson.status === 'pending' && (
                  <div className="flex gap-2 sm:flex-col sm:items-end flex-shrink-0">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setRejectingLesson(lesson)}
                    >
                      Từ chối
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setApprovingLesson(lesson)}
                    >
                      Duyệt buổi dạy
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {tab !== 'pending' && lessons.length >= limitVal && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setLimitVal((prev) => prev + 30)}
                className="w-full bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 py-2.5 rounded-xl font-semibold shadow-sm"
              >
                Xem thêm (+30 buổi)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Approve confirm */}
      {approvingLesson && (
        <ConfirmDialog
          open
          onClose={() => setApprovingLesson(null)}
          onConfirm={handleApprove}
          title="Xác nhận duyệt buổi dạy?"
          confirmLabel="Duyệt buổi dạy"
          loading={approving}
        >
          <div className="bg-white rounded-xl p-4 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Học viên</span>
              <span className="text-slate-700">{approvingLesson.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Thời lượng buổi này</span>
              <span className="text-slate-700 font-medium">{approvingLesson.minutes} phút</span>
            </div>
            {approvingLesson.minutesBeforeApproval != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Phút còn lại</span>
                <span className="text-amber-400 font-medium">
                  {approvingLesson.minutesBeforeApproval} → {approvingLesson.minutesBeforeApproval - approvingLesson.minutes} phút
                </span>
              </div>
            )}
            {approvingLesson.pricePerMinute != null && (
              <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1">
                <span className="text-slate-500">Lương giáo viên</span>
                <span className="text-emerald-500 font-semibold">
                  +{formatVND(
                    calculateSalary(approvingLesson.minutes, approvingLesson.pricePerMinute, approvingLesson.teacherLevel ?? 1)
                  )}
                </span>
              </div>
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Reject modal */}
      {rejectingLesson && (
        <Modal
          open
          onClose={() => setRejectingLesson(null)}
          title="Từ chối buổi dạy"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setRejectingLesson(null)}>Hủy</Button>
              <Button variant="danger" onClick={handleReject} loading={rejecting}>Xác nhận từ chối</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Từ chối buổi của <span className="text-slate-700 font-medium">{rejectingLesson.studentName}</span> với{' '}
              <span className="text-slate-700">{rejectingLesson.teacherName}</span>
            </p>
            <Textarea
              label="Lý do từ chối *"
              placeholder="Nhập lý do từ chối..."
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* Image viewer */}
      {viewImages && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setViewImages(null)}>
          <button className="absolute top-4 right-4 p-2 text-slate-900 bg-white rounded-xl" onClick={() => setViewImages(null)} aria-label="Đóng">
            <X className="w-6 h-6" />
          </button>
          <div className="flex gap-4 overflow-x-auto max-w-full">
            {viewImages.map((url, i) => (
              <img key={i} src={url} alt="" className="max-h-[80vh] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
