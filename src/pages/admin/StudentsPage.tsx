import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { StudentFormModal } from '@/components/students/StudentFormModal'
import { AddSessionsModal } from '@/components/students/AddSessionsModal'
import { Users, Plus, Search, Eye, UserX, MoreVertical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function StudentsPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [addSessions, setAddSessions] = useState<Student | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'students'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)))
      setLoading(false)
    })
    return unsub
  }, [])

  const filtered = students.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Học viên</h1>
          <p className="text-sm text-slate-500 mt-0.5">{students.length} học viên tổng cộng</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setShowAdd(true)} className="shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Thêm học viên
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Input
          placeholder="Tìm theo tên hoặc mã học viên..."
          leftIcon={<Search className="w-4 h-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full lg:max-w-md"
        />
        <div className="flex bg-slate-100/80 p-1 rounded-xl overflow-x-auto hide-scrollbar w-full lg:w-auto">
          {['all', 'active', 'inactive', 'expired'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                statusFilter === s
                  ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              {s === 'all' ? 'Tất cả' : s === 'active' ? 'Đang học' : s === 'inactive' ? 'Tạm dừng' : 'Hết buổi'}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Table */}
      {loading ? (
        <Card padding="none"><TableSkeleton /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title="Không tìm thấy học viên"
          description="Thêm học viên mới hoặc thay đổi bộ lọc"
          action={{ label: 'Thêm học viên', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card padding="none" className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    {['Mã', 'Tên học viên', 'SĐT PH', 'Môn học', 'Buổi còn lại', 'Trạng thái', 'Hành động'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filtered.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-100/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                          {student.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{student.name}</td>
                      <td className="px-4 py-3 text-slate-500">{student.parentPhone}</td>
                      <td className="px-4 py-3 text-slate-600">{student.subjectName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${
                          student.remainingSessions === 0 ? 'text-rose-400' :
                          student.remainingSessions <= 3 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {student.remainingSessions}
                        </span>
                        <span className="text-slate-500 text-xs"> / {student.totalSessions}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={student.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/admin/students/${student.id}`)}
                            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setAddSessions(student)}
                            className="px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 rounded-lg border border-emerald-500/20 transition-colors whitespace-nowrap"
                          >
                            + Buổi
                          </button>
                          <button
                            onClick={() => setEditStudent(student)}
                            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label="Sửa học viên"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((student) => (
              <Card key={student.id} hover onClick={() => navigate(`/admin/students/${student.id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                        {student.code}
                      </span>
                      <StatusBadge status={student.status} />
                    </div>
                    <p className="font-semibold text-slate-900">{student.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{student.subjectName} · {student.parentPhone}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xl font-bold ${
                      student.remainingSessions === 0 ? 'text-rose-400' :
                      student.remainingSessions <= 3 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>{student.remainingSessions}</p>
                    <p className="text-xs text-slate-500">buổi còn</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                  <Button size="sm" variant="outline" fullWidth onClick={(e) => { e.stopPropagation(); setAddSessions(student) }}>
                    + Thêm buổi
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditStudent(student) }}>
                    Sửa
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {showAdd && <StudentFormModal onClose={() => setShowAdd(false)} />}
      {editStudent && <StudentFormModal student={editStudent} onClose={() => setEditStudent(null)} />}
      {addSessions && <AddSessionsModal student={addSessions} onClose={() => setAddSessions(null)} />}
    </div>
  )
}
