import { useEffect, useState } from 'react'
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Teacher } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { TeacherFormModal } from '@/components/teachers/TeacherFormModal'
import { GraduationCap, Plus, Search, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatVND } from '@/lib/constants'

export function TeachersPage() {
  const navigate = useNavigate()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'teachers'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Teacher)))
      setLoading(false)
    })
  }, [])

  const filtered = teachers.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Giáo viên</h1>
          <p className="text-sm text-slate-500 mt-0.5">{teachers.length} giáo viên</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" />
          Thêm giáo viên
        </Button>
      </div>

      <Input
        placeholder="Tìm theo tên hoặc mã giáo viên..."
        leftIcon={<Search className="w-4 h-4" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <Card padding="none"><TableSkeleton /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="w-8 h-8" />}
          title="Không tìm thấy giáo viên"
          action={{ label: 'Thêm giáo viên', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card padding="none" className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    {['Mã', 'Tên giáo viên', 'Môn dạy', 'Level', 'Trạng thái', 'Hành động'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filtered.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-slate-100/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          {teacher.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {teacher.photoURL ? (
                            <img src={teacher.photoURL} alt={teacher.name} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                              {teacher.name[0]}
                            </div>
                          )}
                          <span className="font-medium text-slate-700">{teacher.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {(teacher.subjectNames || []).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-600 font-medium">×{teacher.level}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={teacher.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/admin/teachers/${teacher.id}`)}
                            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                            aria-label="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <Button size="sm" variant="ghost" onClick={() => setEditTeacher(teacher)}>Sửa</Button>
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
            {filtered.map((teacher) => (
              <Card key={teacher.id} hover onClick={() => navigate(`/admin/teachers/${teacher.id}`)}>
                <div className="flex items-center gap-3">
                  {teacher.photoURL ? (
                    <img src={teacher.photoURL} alt={teacher.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg font-bold text-indigo-400 flex-shrink-0">
                      {teacher.name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-emerald-400">{teacher.code}</span>
                      <StatusBadge status={teacher.status} />
                    </div>
                    <p className="font-semibold text-slate-900">{teacher.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Level ×{teacher.level} · {(teacher.subjectNames || []).join(', ')}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {showAdd && <TeacherFormModal onClose={() => setShowAdd(false)} />}
      {editTeacher && <TeacherFormModal teacher={editTeacher} onClose={() => setEditTeacher(null)} />}
    </div>
  )
}
