import { useEffect, useState } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, Lesson } from '@/types'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { StudentFormModal } from '@/components/students/StudentFormModal'
import { AddSessionsModal } from '@/components/students/AddSessionsModal'
import { ArrowLeft, BookOpen, Copy, ExternalLink } from 'lucide-react'
import { toast } from '@/stores/toastStore'

export function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState<Student | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddSessions, setShowAddSessions] = useState(false)

  useEffect(() => {
    if (!id) return
    getDoc(doc(db, 'students', id)).then((snap) => {
      if (snap.exists()) setStudent({ id: snap.id, ...snap.data() } as Student)
      setLoading(false)
    })

    const q = query(
      collection(db, 'lessons'),
      where('studentId', '==', id)
    )
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
      docs.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
      setLessons(docs)
    })
  }, [id])

  if (loading) return <LoadingSpinner />
  if (!student) return <p className="text-slate-500 text-center py-20">Không tìm thấy học viên</p>

  const usedPct = student.totalSessions > 0
    ? Math.round((student.usedSessions / student.totalSessions) * 100)
    : 0

  const approvedLessons = lessons.filter((l) => l.status === 'approved')
  const pendingLessons = lessons.filter((l) => l.status === 'pending')
  const rejectedLessons = lessons.filter((l) => l.status === 'rejected')

  const sumMinutes = (ls: Lesson[]) => ls.reduce((acc, l) => acc + (l.minutes || 0), 0)
  const approvedMinutes = sumMinutes(approvedLessons)
  const pendingMinutes = sumMinutes(pendingLessons)
  const rejectedMinutes = sumMinutes(rejectedLessons)

  const mps = student.minutesPerSession
  const totalMinutesFund = mps ? student.totalSessions * mps : null
  const remainingMinutes = totalMinutesFund !== null ? totalMinutesFund - approvedMinutes : null

  const trackingUrl = `${window.location.origin}/tracking?student=${student.code}`

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
          <p className="text-sm text-slate-500">Chi tiết học viên</p>
        </div>
      </div>

      {/* Profile card */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-lg font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg">
                {student.code}
              </span>
              <StatusBadge status={student.status} />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm mt-2">
              <div>
                <span className="text-slate-500">Họ tên: </span>
                <span className="text-slate-700 font-medium">{student.name}</span>
              </div>
              <div>
                <span className="text-slate-500">SĐT PH: </span>
                <span className="text-slate-700">{student.parentPhone}</span>
              </div>
              <div>
                <span className="text-slate-500">Môn học: </span>
                <span className="text-slate-700">{student.subjectName || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Sửa</Button>
            <Button size="sm" variant="primary" onClick={() => setShowAddSessions(true)}>+ Thêm buổi</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { navigator.clipboard.writeText(trackingUrl); toast.success('Đã sao chép link tra cứu') }}
            >
              <ExternalLink className="w-4 h-4" />
              Trang tra cứu
            </Button>
          </div>
        </div>
      </Card>

      {/* Session stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <p className="text-3xl font-bold text-slate-700">{student.totalSessions}</p>
          <p className="text-xs text-slate-500 mt-1">Tổng buổi</p>
          {totalMinutesFund !== null && (
            <p className="text-xs text-slate-400 mt-0.5">{totalMinutesFund} phút</p>
          )}
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-bold text-indigo-400">{student.usedSessions}</p>
          <p className="text-xs text-slate-500 mt-1">Đã học</p>
          {approvedMinutes > 0 && (
            <p className="text-xs text-indigo-300 mt-0.5">{approvedMinutes} phút</p>
          )}
        </Card>
        <Card className="text-center">
          <p className={`text-3xl font-bold ${student.remainingSessions === 0 ? 'text-rose-400' : student.remainingSessions <= 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {student.remainingSessions}
          </p>
          <p className="text-xs text-slate-500 mt-1">Còn lại</p>
          {remainingMinutes !== null && (
            <p className={`text-xs mt-0.5 ${remainingMinutes <= 0 ? 'text-rose-400' : 'text-emerald-300'}`}>
              {remainingMinutes} phút
            </p>
          )}
        </Card>
      </div>

      {/* Progress bar */}
      <style>{`.progress-bar-used { width: ${usedPct}%; }`}</style>
      <Card>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-500">Tiến độ học</span>
          <span className="text-slate-600 font-medium">{usedPct}%</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500 progress-bar-used"
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {student.usedSessions} / {student.totalSessions} buổi đã học
          {totalMinutesFund !== null && (
            <span className="ml-2 text-slate-400">({approvedMinutes} / {totalMinutesFund} phút)</span>
          )}
        </p>
      </Card>

      {/* Session breakdown by status */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Phân loại buổi học</h3>
        <div className="divide-y divide-slate-100">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="text-sm text-slate-600">Đã duyệt</span>
            </div>
            <div className="text-sm text-right">
              <span className="font-medium text-slate-700">{approvedLessons.length} buổi</span>
              {approvedMinutes > 0 && (
                <span className="text-slate-400 ml-2">/ {approvedMinutes} phút</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              <span className="text-sm text-slate-600">Chờ duyệt</span>
            </div>
            <div className="text-sm text-right">
              <span className="font-medium text-slate-700">{pendingLessons.length} buổi</span>
              {pendingMinutes > 0 && (
                <span className="text-slate-400 ml-2">/ {pendingMinutes} phút</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
              <span className="text-sm text-slate-600">Từ chối</span>
            </div>
            <div className="text-sm text-right">
              <span className="font-medium text-slate-700">{rejectedLessons.length} buổi</span>
              {rejectedMinutes > 0 && (
                <span className="text-slate-400 ml-2">/ {rejectedMinutes} phút</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Lesson history */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Lịch sử buổi học</h3>
        </div>
        {lessons.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Chưa có buổi học nào</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {['Ngày', 'Giáo viên', 'Phút', 'Nhận xét', 'Lương buổi', 'Trạng thái'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {lessons.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-slate-100/20 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{lesson.date}</td>
                    <td className="px-4 py-3 text-slate-600">{lesson.teacherName}</td>
                    <td className="px-4 py-3 text-slate-600">{lesson.minutes}'</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{lesson.comment || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {lesson.status === 'approved' && lesson.salary
                        ? lesson.salary.toLocaleString('vi-VN') + 'đ'
                        : '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={lesson.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showEdit && <StudentFormModal student={student} onClose={() => setShowEdit(false)} />}
      {showAddSessions && <AddSessionsModal student={student} onClose={() => setShowAddSessions(false)} />}
    </div>
  )
}
