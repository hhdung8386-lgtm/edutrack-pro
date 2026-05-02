import { useEffect, useState } from 'react'
import {
  collection, query, where, onSnapshot, orderBy,
  runTransaction, doc, serverTimestamp, addDoc, collection as col,
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
import { ClipboardCheck, Image as ImageIcon, X } from 'lucide-react'

const TABS = [
  { key: 'pending', label: 'Chờ duyệt', color: 'text-amber-400' },
  { key: 'approved', label: 'Đã duyệt', color: 'text-emerald-400' },
  { key: 'rejected', label: 'Từ chối', color: 'text-rose-400' },
  { key: 'all', label: 'Tất cả', color: 'text-slate-300' },
]

export function ApprovalsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<string>('pending')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingLesson, setApprovingLesson] = useState<Lesson | null>(null)
  const [rejectingLesson, setRejectingLesson] = useState<Lesson | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [viewImages, setViewImages] = useState<string[] | null>(null)

  useEffect(() => {
    setLoading(true)
    const constraints =
      tab === 'all'
        ? []
        : [where('status', '==', tab)]

    const q = query(collection(db, 'lessons'), ...constraints)
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
      docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
      setLessons(docs)
      setLoading(false)
    })
  }, [tab])

  const pendingCount = lessons.filter((l) => l.status === 'pending').length

  const handleApprove = async () => {
    if (!approvingLesson) return
    setApproving(true)
    try {
      await runTransaction(db, async (tx) => {
        const lessonRef = doc(db, 'lessons', approvingLesson.id)
        const studentRef = doc(db, 'students', approvingLesson.studentId)
        const teacherRef = doc(db, 'teachers', approvingLesson.teacherId)
        const subjectRef = doc(db, 'subjects', approvingLesson.subjectId)

        const [studentSnap, teacherSnap, subjectSnap] = await Promise.all([
          tx.get(studentRef), tx.get(teacherRef), tx.get(subjectRef),
        ])

        const student = studentSnap.data()!
        const teacher = teacherSnap.data()!
        const subject = subjectSnap.data()!

        const salary = calculateSalary(approvingLesson.minutes, subject.pricePerMinute, teacher.level)
        const remaining = student.remainingSessions - 1
        const month = approvingLesson.date.slice(0, 7)

        tx.update(lessonRef, {
          status: 'approved',
          approvedAt: serverTimestamp(),
          approvedBy: user?.uid,
          salary,
          sessionsBeforeApproval: student.remainingSessions,
          sessionsAfterApproval: remaining,
        })

        tx.update(studentRef, {
          remainingSessions: remaining,
          usedSessions: (student.usedSessions || 0) + 1,
          status: remaining <= 0 ? 'expired' : 'active',
          updatedAt: serverTimestamp(),
        })

        const payrollRef = doc(col(db, 'payroll'))
        tx.set(payrollRef, {
          teacherId: approvingLesson.teacherId,
          teacherName: approvingLesson.teacherName,
          lessonId: approvingLesson.id,
          amount: salary,
          minutes: approvingLesson.minutes,
          pricePerMinute: subject.pricePerMinute,
          level: teacher.level,
          month,
          paid: false,
          createdAt: serverTimestamp(),
        })

        const logRef = doc(col(db, 'adminLogs'))
        tx.set(logRef, {
          adminId: user?.uid || '',
          action: 'APPROVE_LESSON',
          targetType: 'lesson',
          targetId: approvingLesson.id,
          changes: { status: { from: 'pending', to: 'approved' }, salary },
          createdAt: serverTimestamp(),
        })
      })

      toast.success('Đã duyệt buổi dạy thành công')
      setApprovingLesson(null)
    } catch (err) {
      console.error(err)
      toast.error('Duyệt thất bại, vui lòng thử lại')
    } finally {
      setApproving(false)
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
    } catch {
      toast.error('Có lỗi xảy ra')
    } finally {
      setRejecting(false)
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Duyệt buổi dạy</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {tab === 'pending' && pendingCount > 0 ? `${pendingCount} buổi đang chờ duyệt` : 'Quản lý và duyệt buổi dạy'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
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
          {lessons.map((lesson) => (
            <Card key={lesson.id} className="relative">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-200">{lesson.date}</span>
                    <StatusBadge status={lesson.status} />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Học viên</p>
                      <p className="text-slate-200 font-medium">{lesson.studentName}</p>
                      <p className="text-xs text-indigo-400 font-mono">{lesson.studentCode}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Giáo viên</p>
                      <p className="text-slate-200">{lesson.teacherName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Môn học</p>
                      <p className="text-slate-200">{lesson.subjectName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Thời lượng</p>
                      <p className="text-slate-200 font-semibold">{lesson.minutes} phút</p>
                    </div>
                  </div>

                  {lesson.comment && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Nhận xét</p>
                      <p className="text-sm text-slate-300 line-clamp-2">{lesson.comment}</p>
                    </div>
                  )}

                  {lesson.homework && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Bài tập</p>
                      <p className="text-sm text-slate-300 line-clamp-1">{lesson.homework}</p>
                    </div>
                  )}

                  {lesson.imageURLs?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {lesson.imageURLs.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Ảnh ${i + 1}`}
                          className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity border border-slate-600"
                          onClick={() => setViewImages(lesson.imageURLs)}
                        />
                      ))}
                    </div>
                  )}

                  {lesson.status === 'approved' && (
                    <div className="flex gap-4 text-sm pt-1 border-t border-slate-700">
                      <span className="text-slate-500">
                        Buổi: {lesson.sessionsBeforeApproval} → {lesson.sessionsAfterApproval}
                      </span>
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
          <div className="bg-slate-800 rounded-xl p-4 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Học viên</span>
              <span className="text-slate-200">{approvingLesson.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Buổi còn lại</span>
              <span className="text-amber-400 font-medium">
                {approvingLesson.sessionsBeforeApproval || '?'} → {(approvingLesson.sessionsBeforeApproval || 1) - 1}
              </span>
            </div>
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
            <p className="text-sm text-slate-400">
              Từ chối buổi của <span className="text-slate-200 font-medium">{rejectingLesson.studentName}</span> với{' '}
              <span className="text-slate-200">{rejectingLesson.teacherName}</span>
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
          <button className="absolute top-4 right-4 p-2 text-white bg-slate-800 rounded-xl" onClick={() => setViewImages(null)} aria-label="Đóng">
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
