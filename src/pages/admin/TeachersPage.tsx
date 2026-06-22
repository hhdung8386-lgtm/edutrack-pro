import { useEffect, useState, useRef } from 'react'
import { collection, query, onSnapshot, where, deleteDoc, doc, updateDoc, getDocs, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Teacher } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { TeacherFormModal } from '@/components/teachers/TeacherFormModal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { GraduationCap, Plus, Search, Eye, Trash2, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type TeacherGrade = 'A' | 'B' | 'C' | 'PH' | 'SA'

const GRADE_STYLES: Record<TeacherGrade, { badge: string; dot: string }> = {
  A: { badge: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200', dot: 'bg-amber-400' },
  B: { badge: 'bg-sky-100 text-sky-700 border-sky-300 hover:bg-sky-200', dot: 'bg-sky-400' },
  C: { badge: 'bg-violet-100 text-violet-700 border-violet-300 hover:bg-violet-200', dot: 'bg-violet-400' },
  PH: { badge: 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200', dot: 'bg-rose-400' },
  SA: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200', dot: 'bg-emerald-400' },
}

const FILTER_GRADES: Array<'' | TeacherGrade> = ['', 'A', 'B', 'C', 'PH', 'SA']

function GradeSelector({ teacherId, currentGrade }: { teacherId: string; currentGrade?: TeacherGrade }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = async (grade: TeacherGrade) => {
    setOpen(false)
    if (grade === currentGrade) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'teachers', teacherId), { teacherGrade: grade })
    } catch {
      toast.error('Lỗi khi cập nhật cấp độ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        disabled={saving}
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
          currentGrade
            ? GRADE_STYLES[currentGrade].badge
            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
        } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-label="Chọn cấp độ giáo viên"
      >
        {currentGrade ? (
          <>
            <span className={`w-1.5 h-1.5 rounded-full ${GRADE_STYLES[currentGrade].dot}`} />
            Cấp {currentGrade}
          </>
        ) : (
          'Chọn cấp'
        )}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[110px]">
          {(['A', 'B', 'C', 'PH', 'SA'] as TeacherGrade[]).map((g) => (
            <button
              key={g}
              onClick={() => handleSelect(g)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors ${
                currentGrade === g ? 'bg-slate-50' : ''
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${GRADE_STYLES[g].dot}`} />
              <span className={`${GRADE_STYLES[g].badge.split(' ')[1]}`}>Cấp {g}</span>
              {currentGrade === g && <span className="ml-auto text-emerald-500">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TeachersPage() {
  const navigate = useNavigate()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState<'' | TeacherGrade>('')
  const [showAdd, setShowAdd] = useState(false)
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null)
  const [deleteTeacher, setDeleteTeacher] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Map teacherId -> total approved minutes
  const [minutesMap, setMinutesMap] = useState<Record<string, number>>({})
  const [limitVal, setLimitVal] = useState(20)

  useEffect(() => {
    const q = query(collection(db, 'teachers'), limit(limitVal))
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Teacher))
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0) || a.name.localeCompare(b.name, 'vi'))
        setTeachers(items)
        setLoading(false)
      },
      (err) => {
        console.error('Error loading teachers:', err)
        toast.error('Không có quyền truy cập danh sách giáo viên hoặc lỗi kết nối')
        setLoading(false)
      }
    )
  }, [limitVal])

  // Fetch approved lessons to compute per-teacher total minutes once on mount
  useEffect(() => {
    let active = true
    getDocs(query(collection(db, 'lessons'), where('status', '==', 'approved')))
      .then((snap) => {
        if (!active) return
        const map: Record<string, number> = {}
        snap.docs.forEach((d) => {
          const data = d.data()
          const tid: string = data.teacherId
          const mins: number = Number(data.minutes) || 0
          if (tid) map[tid] = (map[tid] || 0) + mins
        })
        setMinutesMap(map)
      })
      .catch((err: any) => {
        console.error('Error loading approved lessons minutes:', err)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = teachers.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase())
    const matchGrade = gradeFilter ? t.teacherGrade === gradeFilter : true
    return matchSearch && matchGrade
  })

  const handleDelete = async () => {
    if (!deleteTeacher) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'teachers', deleteTeacher.id))
      toast.success('Xóa giáo viên thành công')
      setDeleteTeacher(null)
    } catch (err: any) {
      toast.error('Lỗi khi xóa giáo viên: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

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

      {/* Search + Grade Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Tìm theo tên hoặc mã giáo viên..."
          leftIcon={<Search className="w-4 h-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        {/* Grade filter buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
          {FILTER_GRADES.map((g) => (
            <button
              key={g === '' ? 'all' : g}
              onClick={() => setGradeFilter(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                gradeFilter === g
                  ? g === ''
                    ? 'bg-white text-slate-800 shadow-sm'
                    : `bg-white shadow-sm ${
                        g === 'A'
                          ? 'text-amber-700'
                          : g === 'B'
                          ? 'text-sky-700'
                          : g === 'C'
                          ? 'text-violet-700'
                          : g === 'PH'
                          ? 'text-rose-700'
                          : 'text-emerald-700'
                      }`
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              aria-label={g === '' ? 'Tất cả cấp' : `Lọc cấp ${g}`}
            >
              {g === '' ? 'Tất cả' : `Cấp ${g}`}
            </button>
          ))}
        </div>
      </div>

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
                    {['Mã', 'Tên giáo viên', 'Môn dạy', 'Level', 'Cấp độ', 'Tổng phút', 'Trạng thái', 'Hành động'].map((h) => (
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
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <GradeSelector teacherId={teacher.id} currentGrade={teacher.teacherGrade} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-violet-600 font-semibold text-sm">
                          {(minutesMap[teacher.id] || 0).toLocaleString('vi-VN')}'
                        </span>
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
                          <button
                            onClick={() => setDeleteTeacher(teacher)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            aria-label="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
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
                      {teacher.teacherGrade && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${GRADE_STYLES[teacher.teacherGrade].badge}`}>
                          Cấp {teacher.teacherGrade}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-slate-900">{teacher.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Level ×{teacher.level} · {(teacher.subjectNames || []).join(', ')}
                      {minutesMap[teacher.id] ? ` · ${minutesMap[teacher.id].toLocaleString('vi-VN')}'` : ''}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {teachers.length >= limitVal && (
            <div className="flex justify-center mt-6">
              <Button variant="outline" onClick={() => setLimitVal((prev) => prev + 20)}>
                Xem thêm
              </Button>
            </div>
          )}
        </>
      )}

      {showAdd && <TeacherFormModal onClose={() => setShowAdd(false)} />}
      {editTeacher && <TeacherFormModal teacher={editTeacher} onClose={() => setEditTeacher(null)} />}
      <ConfirmDialog
        open={!!deleteTeacher}
        onClose={() => setDeleteTeacher(null)}
        onConfirm={handleDelete}
        title="Xóa giáo viên"
        description={`Bạn có chắc chắn muốn xóa giáo viên ${deleteTeacher?.name}?`}
        consequence="Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan sẽ bị xóa."
        confirmLabel="Xóa"
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  )
}
