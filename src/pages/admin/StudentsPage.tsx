import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, orderBy, getDocs, getCountFromServer, deleteDoc, doc, limit } from 'firebase/firestore'
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { Users, Plus, Search, Eye, UserX, MoreVertical, Building2, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Branch { id: string; name: string; status: string }

export function StudentsPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => sessionStorage.getItem('students_search') || '')
  const [statusFilter, setStatusFilter] = useState<string>(() => sessionStorage.getItem('students_statusFilter') || 'all')
  const [branchFilter, setBranchFilter] = useState<string>(() => sessionStorage.getItem('students_branchFilter') || 'all')
  const [branches, setBranches] = useState<Branch[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [addSessions, setAddSessions] = useState<Student | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null)
  const [limitVal, setLimitVal] = useState<number>(() => {
    const stored = sessionStorage.getItem('students_limitVal')
    return stored ? Number(stored) : 20
  })
  const [totalStudents, setTotalStudents] = useState<number | null>(null)

  // Sync filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('students_search', search)
    sessionStorage.setItem('students_statusFilter', statusFilter)
    sessionStorage.setItem('students_branchFilter', branchFilter)
    sessionStorage.setItem('students_limitVal', String(limitVal))
  }, [search, statusFilter, branchFilter, limitVal])

  // Sync scroll position to sessionStorage
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem('students_scroll', String(window.scrollY))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Restore scroll position once data loading has completed
  useEffect(() => {
    if (!loading && students.length > 0) {
      const savedScroll = sessionStorage.getItem('students_scroll')
      if (savedScroll) {
        const scrollTimer = setTimeout(() => {
          window.scrollTo(0, Number(savedScroll))
        }, 100)
        return () => clearTimeout(scrollTimer)
      }
    }
  }, [loading, students])

  useEffect(() => {
    setLoading(true)
    const q = limitVal > 0
      ? query(collection(db, 'students'), orderBy('createdAt', 'desc'), limit(limitVal))
      : query(collection(db, 'students'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)))
        setLoading(false)
      },
      (err) => {
        console.error('Error loading students:', err)
        toast.error('Không có quyền truy cập danh sách học viên hoặc lỗi kết nối')
        setLoading(false)
      }
    )
    return unsub
  }, [limitVal])

  useEffect(() => {
    getCountFromServer(collection(db, 'students'))
      .then((snap) => setTotalStudents(snap.data().count))
      .catch((err) => console.error('Error counting students:', err))
  }, [])

  useEffect(() => {
    getDocs(query(collection(db, 'branches'), where('status', '==', 'active')))
      .then((snap) => {
        setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Branch)))
      })
      .catch((err) => {
        console.error('Error loading branches:', err)
      })
  }, [])

  const filtered = students.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' ? s.status !== 'reserved' : s.status === statusFilter
    const matchBranch = branchFilter === 'all' || s.branchId === branchFilter
    return matchSearch && matchStatus && matchBranch
  })

  const handleDelete = async () => {
    if (!deleteStudent) return
    try {
      await deleteDoc(doc(db, 'students', deleteStudent.id))
      setDeleteStudent(null)
    } catch (error) {
      console.error('Error deleting student:', error)
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Học viên</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Đã tải {students.length}{totalStudents !== null ? ` / ${totalStudents}` : ''} học viên
          </p>
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
        <div className="flex gap-3 items-center flex-wrap">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <span className="whitespace-nowrap">Số học viên</span>
            <select
              value={limitVal}
              onChange={(event) => setLimitVal(Number(event.target.value))}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Chọn số lượng học viên cần tải"
            >
              {[20, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
              <option value={0}>Tất cả</option>
            </select>
          </label>
          <div className="flex bg-slate-100/80 p-1 rounded-xl overflow-x-auto hide-scrollbar">
            {['all', 'active', 'inactive', 'expired', 'reserved'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  statusFilter === s
                    ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {s === 'all' ? 'Tất cả' : s === 'active' ? 'Đang học' : s === 'inactive' ? 'Tạm dừng' : s === 'expired' ? 'Hết buổi' : 'Bảo lưu'}
              </button>
            ))}
          </div>
          {branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
              aria-label="Lọc theo chi nhánh"
            >
              <option value="all">Tất cả chi nhánh</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
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
                    {['Mã', 'Tên học viên', 'Ngày tạo', 'Môn học', 'Chi nhánh', 'Buổi còn lại', 'Trạng thái', 'Hành động'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((student) => {
                    const mps = student.minutesPerSession || 50;
                    const totalMins = student.totalMinutes ?? (student.totalSessions * mps);
                    const remainingMins = student.remainingMinutes ?? (student.remainingSessions * mps);
                    const totalSessions25 = Math.floor(totalMins / 25);
                    const remainingSessions25 = Math.floor(remainingMins / 25);

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">
                            {student.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{student.name}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {student.createdAt ? student.createdAt.toDate().toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{student.subjectName || '—'}</td>
                        <td className="px-4 py-3">
                          {student.branchName ? (
                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                              <Building2 className="w-3 h-3" />
                              {student.branchName}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="leading-tight">
                            <div>
                              <span className={`font-semibold ${
                                remainingSessions25 < 0 ? 'text-rose-600' :
                                remainingSessions25 === 0 ? 'text-rose-500' :
                                remainingSessions25 <= 3 ? 'text-amber-500' : 'text-emerald-500'
                              }`}>
                                {remainingSessions25}
                              </span>
                              <span className="text-slate-500 text-xs"> / {totalSessions25} buổi</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              <span className={remainingMins <= 0 ? 'text-rose-300' : ''}>{remainingMins}</span>
                              <span> / {totalMins} phút</span>
                            </div>
                          </div>
                        </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={student.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/admin/students/${student.id}`)}
                            className="p-1.5 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setAddSessions(student)}
                            className="px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors whitespace-nowrap"
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
                          <button
                            onClick={() => setDeleteStudent(student)}
                            className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Xoá học viên"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((student) => {
              const mps = student.minutesPerSession || 50;
              const remainingMins = student.remainingMinutes ?? (student.remainingSessions * mps);
              const remainingSessions25 = Math.floor(remainingMins / 25);

              return (
                <Card key={student.id} hover onClick={() => navigate(`/admin/students/${student.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">
                          {student.code}
                        </span>
                        <StatusBadge status={student.status} />
                      </div>
                      <p className="font-semibold text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {student.subjectName} · {student.createdAt ? student.createdAt.toDate().toLocaleDateString('vi-VN') : '—'}
                      </p>
                      {student.branchName && (
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full mt-1 inline-flex items-center gap-0.5">
                          <Building2 className="w-2.5 h-2.5" />
                          {student.branchName}
                        </span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xl font-bold ${
                        remainingSessions25 < 0 ? 'text-rose-600' :
                        remainingSessions25 === 0 ? 'text-rose-500' :
                        remainingSessions25 <= 3 ? 'text-amber-500' : 'text-emerald-500'
                      }`}>{remainingSessions25}</p>
                      <p className="text-xs text-slate-500">buổi còn</p>
                      <p className={`text-[11px] mt-0.5 ${remainingMins <= 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                        {remainingMins} phút
                      </p>
                    </div>
                  </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                  <Button size="sm" variant="outline" fullWidth onClick={(e) => { e.stopPropagation(); setAddSessions(student) }}>
                    + Thêm buổi
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditStudent(student) }}>
                    Sửa
                  </Button>
                  <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setDeleteStudent(student) }}>
                    Xoá
                  </Button>
                </div>
              </Card>
            );
          })}
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            Đang hiển thị {filtered.length} kết quả trong {students.length} hồ sơ đã tải.
          </p>
        </>
      )}

      {showAdd && <StudentFormModal onClose={() => setShowAdd(false)} />}
      {editStudent && <StudentFormModal student={editStudent} onClose={() => setEditStudent(null)} />}
      {addSessions && <AddSessionsModal student={addSessions} onClose={() => setAddSessions(null)} />}
      {deleteStudent && (
        <ConfirmDialog
          open={true}
          onClose={() => setDeleteStudent(null)}
          onConfirm={handleDelete}
          title="Xoá học viên"
          description={`Bạn có chắc chắn muốn xoá học viên "${deleteStudent.name}"? Hành động này không thể hoàn tác. Các buổi học đã phê duyệt sẽ được giữ lại.`}
          confirmLabel="Xoá"
          confirmVariant="danger"
        />
      )}
    </div>
  )
}
