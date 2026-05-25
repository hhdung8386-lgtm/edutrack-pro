import { useEffect, useState } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Teacher, Lesson, Student, TeacherAvailability, DayOfWeek } from '@/types'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { TeacherFormModal } from '@/components/teachers/TeacherFormModal'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { ArrowLeft, Calendar, BookOpen, Clock, DollarSign, GraduationCap, Pencil, Search } from 'lucide-react'
import { formatVND, getCurrentMonth } from '@/lib/constants'

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5',
  fri: 'Thứ 6', sat: 'Thứ 7', sun: 'CN'
}

type AttendanceStatus = 'present' | 'with_permission' | 'without_permission'

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Có mặt',
  with_permission: 'Vắng có phép',
  without_permission: 'Vắng không phép',
}

const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  with_permission: 'bg-amber-100 text-amber-700',
  without_permission: 'bg-rose-100 text-rose-700',
}

export function TeacherDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [availability, setAvailability] = useState<TeacherAvailability | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)

  // Lesson history filters
  const [lessonSearch, setLessonSearch] = useState('')
  const [lessonMonth, setLessonMonth] = useState(getCurrentMonth())

  // Attendance status override
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('present')
  const [savingStatus, setSavingStatus] = useState(false)

  useEffect(() => {
    if (!id) return

    getDoc(doc(db, 'teachers', id)).then((snap) => {
      if (snap.exists()) setTeacher({ id: snap.id, ...snap.data() } as Teacher)
      setLoading(false)
    })

    getDoc(doc(db, 'teacherAvailability', id)).then((snap) => {
      if (snap.exists()) setAvailability({ id: snap.id, ...snap.data() } as TeacherAvailability)
    })

    const lessonQ = query(collection(db, 'lessons'), where('teacherId', '==', id))
    const unsubLessons = onSnapshot(lessonQ, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson))
      docs.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
      setLessons(docs)
    })

    const studentQ = query(collection(db, 'students'), where('status', '==', 'active'))
    const unsubStudents = onSnapshot(studentQ, (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)))
    })

    return () => { unsubLessons(); unsubStudents() }
  }, [id])

  const handleSaveAttendanceStatus = async () => {
    if (!editingLesson) return
    setSavingStatus(true)
    try {
      await updateDoc(doc(db, 'lessons', editingLesson.id), {
        attendanceStatus: selectedStatus,
      })
      await addDoc(collection(db, 'adminLogs'), {
        adminId: user?.uid || '',
        action: 'UPDATE_ATTENDANCE_STATUS',
        targetType: 'lesson',
        targetId: editingLesson.id,
        changes: {
          attendanceStatus: {
            from: editingLesson.attendanceStatus || null,
            to: selectedStatus,
          },
        },
        createdAt: serverTimestamp(),
      })
      toast.success('Đã cập nhật tình trạng')
      setEditingLesson(null)
    } catch {
      toast.error('Cập nhật thất bại')
    } finally {
      setSavingStatus(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (!teacher) return <p className="text-slate-500 text-center py-20">Không tìm thấy giáo viên</p>

  const approvedLessons = lessons.filter((l) => l.status === 'approved')
  const totalLessons = approvedLessons.length
  const totalMinutes = approvedLessons.reduce((acc, l) => acc + l.minutes, 0)
  const totalSalary = approvedLessons.reduce((acc, l) => acc + (l.salary || 0), 0)

  const studentIdSet = new Set(lessons.filter(l => l.status !== 'rejected').map(l => l.studentId))
  const activeStudents = students.filter(s => studentIdSet.has(s.id))

  // Filtered lesson history
  const filteredLessons = lessons.filter((l) => {
    const matchMonth = lessonMonth ? l.date.startsWith(lessonMonth) : true
    const matchSearch = lessonSearch.trim()
      ? l.studentName.toLowerCase().includes(lessonSearch.toLowerCase()) ||
        l.studentCode.toLowerCase().includes(lessonSearch.toLowerCase())
      : true
    return matchMonth && matchSearch
  })

  return (
    <div className="space-y-6 pt-2 lg:pt-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors" aria-label="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{teacher.name}</h1>
          <p className="text-sm text-slate-500">Chi tiết giáo viên</p>
        </div>
      </div>

      {/* Profile Card */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {teacher.photoURL ? (
              <img src={teacher.photoURL} alt={teacher.name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 shadow-md" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3BB8EB] to-[#2b8fb8] flex items-center justify-center text-2xl font-bold text-white flex-shrink-0 shadow-md">
                {teacher.name[0]}
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-lg font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                  {teacher.code}
                </span>
                <StatusBadge status={teacher.status} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm mt-2">
                <div>
                  <span className="text-slate-500">Họ tên: </span>
                  <span className="text-slate-800 font-medium">{teacher.name}</span>
                </div>
                <div>
                  <span className="text-slate-500">Môn dạy: </span>
                  <span className="text-slate-800">{(teacher.subjectNames || []).join(', ') || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Level: </span>
                  <span className="text-slate-800 font-semibold">×{teacher.level}</span>
                </div>
                {teacher.bio && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Giới thiệu: </span>
                    <span className="text-slate-600 italic">{teacher.bio}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Sửa</Button>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Buổi đã dạy', value: totalLessons, icon: BookOpen, color: 'text-[#3BB8EB]', bg: 'bg-[#3BB8EB]/10' },
          { label: 'Tổng phút', value: `${totalMinutes}'`, icon: Clock, color: 'text-violet-500', bg: 'bg-violet-50' },
          { label: 'Tổng lương', value: formatVND(totalSalary), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        ].map((s) => (
          <Card key={s.label} className="text-center relative overflow-hidden">
            <div className={`absolute top-3 right-3 w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className={`text-2xl lg:text-3xl font-bold ${s.color} mt-2`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Weekly Availability */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-[#3BB8EB]" />
          <h3 className="text-base font-semibold text-slate-900">Lịch rảnh</h3>
        </div>
        {!availability ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400 italic">Chưa cập nhật</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day) => {
                const slot = availability.slots?.[day]
                const isAvailable = slot?.available
                return (
                  <div
                    key={day}
                    className={`rounded-xl p-3 text-center transition-all border ${
                      isAvailable
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <p className={`text-xs font-bold mb-2 ${isAvailable ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {DAY_LABELS[day]}
                    </p>
                    {isAvailable && slot.timeRanges?.length > 0 ? (
                      <div className="space-y-1">
                        {slot.timeRanges.map((tr, i) => (
                          <span
                            key={i}
                            className="inline-block text-[10px] lg:text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full whitespace-nowrap"
                          >
                            {tr.start}–{tr.end}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-300">—</span>
                    )}
                  </div>
                )
              })}
            </div>
            {availability.note && (
              <p className="text-sm text-slate-500 mt-3 italic border-t border-slate-100 pt-3">
                📝 {availability.note}
              </p>
            )}
          </>
        )}
      </Card>

      {/* Active Classes */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-[#3BB8EB]" />
          <h3 className="text-base font-semibold text-slate-900">Lớp đang dạy</h3>
          <span className="ml-auto text-xs text-slate-400">{activeStudents.length} học viên</span>
        </div>
        {activeStudents.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Chưa có lớp nào</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {['Học viên', 'Mã HV', 'Môn', 'Tổng buổi', 'Đã học', 'Còn lại'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => navigate(`/admin/students/${s.id}`)}>
                    <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{s.code}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.subjectName || '—'}</td>
                    {(() => {
                      const mps = s.minutesPerSession || 50
                      const totalMin = s.totalMinutes ?? s.totalSessions * mps
                      const usedMin = s.usedMinutes ?? s.usedSessions * mps
                      const remainingMin = s.remainingMinutes ?? s.remainingSessions * mps
                      return (
                        <>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{s.totalSessions}</div>
                            <div className="text-[11px] text-slate-400">{totalMin}'</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{s.usedSessions}</div>
                            <div className="text-[11px] text-slate-400">{usedMin}'</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className={`font-semibold ${s.remainingSessions <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}>
                              {s.remainingSessions}
                            </div>
                            <div className={`text-[11px] ${remainingMin <= 0 ? 'text-rose-400' : 'text-slate-400'}`}>{remainingMin}'</div>
                          </td>
                        </>
                      )
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Lesson History */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-violet-500" />
            <h3 className="text-base font-semibold text-slate-900">Lịch sử buổi dạy</h3>
            <span className="ml-auto text-xs text-slate-400">{filteredLessons.length}/{lessons.length} buổi</span>
          </div>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm học viên..."
                value={lessonSearch}
                onChange={(e) => setLessonSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <input
              type="month"
              value={lessonMonth}
              onChange={(e) => setLessonMonth(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            {lessonMonth && (
              <button
                onClick={() => setLessonMonth('')}
                className="px-3 py-2 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Tất cả tháng
              </button>
            )}
          </div>
        </div>

        {filteredLessons.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Không có buổi dạy nào</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {['Ngày', 'Học viên', 'Phút', 'Tình trạng', 'Trạng thái', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLessons.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{l.date}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800 font-medium">{l.studentName}</p>
                      <p className="text-xs text-emerald-600 font-mono">{l.studentCode}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{l.minutes}'</td>
                    <td className="px-4 py-3">
                      {l.attendanceStatus ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ATTENDANCE_STATUS_STYLES[l.attendanceStatus]}`}>
                          {ATTENDANCE_STATUS_LABELS[l.attendanceStatus]}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        title="Sửa tình trạng"
                        onClick={() => {
                          setSelectedStatus(l.attendanceStatus || 'present')
                          setEditingLesson(l)
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-500 hover:bg-violet-50 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Attendance Status Modal */}
      {editingLesson && (
        <Modal
          open
          onClose={() => setEditingLesson(null)}
          title="Sửa tình trạng buổi học"
          footer={
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setEditingLesson(null)}>Hủy</Button>
              <Button variant="primary" onClick={handleSaveAttendanceStatus} loading={savingStatus}>Lưu</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Buổi dạy ngày <span className="font-medium text-slate-700">{editingLesson.date}</span> với học viên{' '}
              <span className="font-medium text-slate-700">{editingLesson.studentName}</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ATTENDANCE_STATUS_LABELS) as [AttendanceStatus, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedStatus(key)}
                  className={`py-3 px-2 rounded-xl text-sm font-semibold transition-all
                    ${selectedStatus === key
                      ? key === 'present'
                        ? 'bg-emerald-500 text-white shadow-md scale-105'
                        : key === 'with_permission'
                        ? 'bg-amber-500 text-white shadow-md scale-105'
                        : 'bg-rose-500 text-white shadow-md scale-105'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {showEdit && <TeacherFormModal teacher={teacher} onClose={() => setShowEdit(false)} />}
    </div>
  )
}
