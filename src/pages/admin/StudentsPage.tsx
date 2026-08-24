import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, orderBy, getDocs, doc, limit, writeBatch, serverTimestamp } from 'firebase/firestore'
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
import { DeleteStudentDialog } from '@/components/students/DeleteStudentDialog'
import { toast } from '@/stores/toastStore'
import { Users, Plus, Search, Eye, MoreVertical, Trash2, CheckSquare, Copy, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getSessionLevel, SESSION_LEVEL_TEXT_CLASS } from '@/lib/constants'
import { getStudentPackageMinuteSummary } from '@/lib/studentMinutes'
import { isSelectableSubject } from '@/lib/subjectLifecycle'
import { isGroupClass } from '@/lib/groupClasses'
import { parseStoredStudentListLimit, studentListLimitStorageKey } from '@/lib/studentList'
import { deleteStudentSafely } from '@/lib/studentDeletion'
import {
  getDefaultBulkClassification,
  getStudentClassification,
  STUDENT_CLASSIFICATION_OPTIONS,
  type StudentClassification,
  type StudentGroupView,
} from '@/lib/studentClassification'

/**
 * Tổng số buổi (quy đổi 25 phút) CÒN LẠI trong gói, TÍNH CẢ buổi đã đặt lịch.
 * Đây mới là thước đo "sắp hết buổi -> cần nạp thêm".
 * (Không dùng "buổi khả dụng" vì học viên đặt kín lịch sẽ có khả dụng = 0
 *  nhưng quỹ vẫn còn nhiều -> báo nhầm.)
 */
function remainingSessionsOf(s: Student): number {
  const remainingMins = getStudentPackageMinuteSummary(s).remainingMinutes
  return Math.floor(Math.max(0, remainingMins) / 25)
}

/** Đang học nhưng quỹ buổi trong gói đã xuống thấp -> cảnh báo "Sắp hết buổi". */
function isRunningLow(s: Student): boolean {
  return s.status === 'active' && getSessionLevel(remainingSessionsOf(s)) === 'low'
}

interface Branch { id: string; name: string; status: string }

const STUDENT_CODE_PATTERN = /^HS[A-Z0-9]{6}$/

// Trang có 4 chế độ: 'all' (tất cả học viên), 'fixed', 'flexible', 'offline'.
// QUY ƯỚC QUAN TRỌNG: học viên CHƯA phân loại (field trống hoặc 'unclassified')
// được tính là HỌC VIÊN CỐ ĐỊNH mặc định — không cần ghi đè dữ liệu hàng loạt.
const STUDENT_GROUP_META: Record<StudentGroupView, { title: string; emptyTitle: string; emptyDescription: string }> = {
  all: {
    title: 'Tất cả học viên',
    emptyTitle: 'Chưa có học viên',
    emptyDescription: 'Bấm “Thêm học viên” để tạo hồ sơ đầu tiên.',
  },
  fixed: {
    title: 'Học viên cố định',
    emptyTitle: 'Chưa có học viên cố định',
    emptyDescription: 'Học viên mới mặc định thuộc nhóm cố định; chọn “Học viên linh hoạt” trong hồ sơ để chuyển nhóm.',
  },
  flexible: {
    title: 'Học viên linh hoạt',
    emptyTitle: 'Chưa có học viên linh hoạt',
    emptyDescription: 'Chọn “Học viên linh hoạt” trong hồ sơ để đưa học viên vào danh sách này.',
  },
  offline: {
    title: 'Lớp offline',
    emptyTitle: 'Chưa có học viên offline',
    emptyDescription: 'Chọn học viên ở danh sách cố định hoặc linh hoạt rồi chuyển sang “Lớp offline”.',
  },
}

export function StudentsPage({ learningScheduleType = 'all' }: { learningScheduleType?: StudentGroupView }) {
  const navigate = useNavigate()
  const storagePrefix = `students_${learningScheduleType}`
  const limitStorageKey = studentListLimitStorageKey(storagePrefix)
  const pageMeta = STUDENT_GROUP_META[learningScheduleType]
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => sessionStorage.getItem(`${storagePrefix}_search`) || '')
  // Mặc định mở tab "Đang học" — nhóm admin cần nhìn thường xuyên nhất.
  const [statusFilter, setStatusFilter] = useState<string>(() => sessionStorage.getItem(`${storagePrefix}_statusFilter`) || 'active')
  const [branchFilter, setBranchFilter] = useState<string>(() => sessionStorage.getItem(`${storagePrefix}_branchFilter`) || 'all')
  const [subjectFilter, setSubjectFilter] = useState<string>(() => sessionStorage.getItem(`${storagePrefix}_subjectFilter`) || 'all')
  const [sortBy, setSortBy] = useState<string>(() => sessionStorage.getItem(`${storagePrefix}_sortBy`) || 'newest')
  const [branches, setBranches] = useState<Branch[]>([])
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [addSessions, setAddSessions] = useState<Student | null>(null)
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null)
  const [deletingStudent, setDeletingStudent] = useState(false)
  const [exactSearchStudent, setExactSearchStudent] = useState<Student | null>(null)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [bulkScheduleType, setBulkScheduleType] = useState<StudentClassification>(() => getDefaultBulkClassification(learningScheduleType))
  const [bulkUpdating, setBulkUpdating] = useState(false)
  // Mặc định tải TẤT CẢ hồ sơ để không ai tưởng "mất" học viên; admin có thể giảm để nhẹ máy.
  const [limitVal, setLimitVal] = useState<number>(() => {
    return parseStoredStudentListLimit(sessionStorage.getItem(limitStorageKey))
  })

  // Sync filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(`${storagePrefix}_search`, search)
    sessionStorage.setItem(`${storagePrefix}_statusFilter`, statusFilter)
    sessionStorage.setItem(`${storagePrefix}_branchFilter`, branchFilter)
    sessionStorage.setItem(`${storagePrefix}_subjectFilter`, subjectFilter)
    sessionStorage.setItem(`${storagePrefix}_sortBy`, sortBy)
    sessionStorage.setItem(limitStorageKey, String(limitVal))
  }, [search, statusFilter, branchFilter, subjectFilter, sortBy, limitVal, limitStorageKey, storagePrefix])

  // Sync scroll position to sessionStorage
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`${storagePrefix}_scroll`, String(window.scrollY))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [storagePrefix])

  // Restore scroll position once data loading has completed
  useEffect(() => {
    if (!loading && students.length > 0) {
      const savedScroll = sessionStorage.getItem(`${storagePrefix}_scroll`)
      if (savedScroll) {
        const scrollTimer = setTimeout(() => {
          window.scrollTo(0, Number(savedScroll))
        }, 100)
        return () => clearTimeout(scrollTimer)
      }
    }
  }, [loading, students, storagePrefix])

  useEffect(() => {
    setLoading(true)
    const effectiveLimit = limitVal
    // Hai nhóm có field tường minh được lọc ngay trên server để không đọc toàn
    // bộ collection. Nhóm cố định vẫn phải đọc chung để chứa hồ sơ legacy thiếu
    // field; tránh backfill tốn write và tránh làm người dùng tưởng mất hồ sơ.
    const canFilterOnServer = learningScheduleType === 'flexible' || learningScheduleType === 'offline'
    const q = canFilterOnServer
      ? query(collection(db, 'students'), where('learningScheduleType', '==', learningScheduleType))
      : effectiveLimit > 0
        ? query(collection(db, 'students'), orderBy('createdAt', 'desc'), limit(effectiveLimit))
        : query(collection(db, 'students'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const nextStudents = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Student))
          .sort((left, right) => Number(right.createdAt?.seconds || 0) - Number(left.createdAt?.seconds || 0))
        setStudents(canFilterOnServer && effectiveLimit > 0 ? nextStudents.slice(0, effectiveLimit) : nextStudents)
        setLoading(false)
      },
      (err) => {
        console.error('Error loading students:', err)
        toast.error('Không có quyền truy cập danh sách học viên hoặc lỗi kết nối')
        setLoading(false)
      }
    )
    return unsub
  }, [limitVal, learningScheduleType])

  useEffect(() => {
    const normalizedCode = search.trim().toUpperCase()
    if (!STUDENT_CODE_PATTERN.test(normalizedCode)) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      getDocs(query(collection(db, 'students'), where('code', '==', normalizedCode)))
        .then((snapshot) => {
          if (cancelled) return
          const match = snapshot.docs[0]
          setExactSearchStudent(match ? ({ id: match.id, ...match.data() } as Student) : null)
        })
        .catch((error) => {
          if (!cancelled) {
            console.error('Error finding student by exact code:', error)
            setExactSearchStudent(null)
          }
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [search])

  useEffect(() => {
    getDocs(query(collection(db, 'branches'), where('status', '==', 'active')))
      .then((snap) => {
        setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Branch)))
      })
      .catch((err) => {
        console.error('Error loading branches:', err)
      })
  }, [])

  useEffect(() => {
    getDocs(collection(db, 'subjects'))
      .then((snap) => {
        const list = snap.docs
          .map(d => ({
            id: d.id,
            name: (d.data().name as string) || '',
            status: d.data().status as string,
            isDeleted: d.data().isDeleted === true,
          }))
          .filter(s => s.name && isSelectableSubject(s))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        setSubjects(list)
      })
      .catch((err) => {
        console.error('Error loading subjects:', err)
      })
  }, [])

  const normalizedSearch = search.trim().toUpperCase()
  const exactCodeSearch = STUDENT_CODE_PATTERN.test(normalizedSearch)
  const currentExactSearchStudent = exactCodeSearch && exactSearchStudent?.code.toUpperCase() === normalizedSearch
    ? exactSearchStudent
    : null
  const searchableStudents = currentExactSearchStudent && !students.some((student) => student.id === currentExactSearchStudent.id)
    ? [currentExactSearchStudent, ...students]
    : students

  const filtered = searchableStudents.filter((s) => {
    // Hồ sơ lớp nhóm dùng chung collection để tương thích Rules hiện tại nhưng
    // tuyệt đối không được lẫn vào danh sách tài khoản học viên 1 kèm 1.
    if (isGroupClass(s)) return false
    // Chưa phân loại (field trống/'unclassified') được tính là CỐ ĐỊNH.
    const normalizedGroup = getStudentClassification(s)
    const matchScheduleType = learningScheduleType === 'all' || normalizedGroup === learningScheduleType
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.parentPhone || '').toLowerCase().includes(search.toLowerCase())
    // "Tất cả" nghĩa là TẤT CẢ, kể cả hồ sơ bảo lưu — trước đây ẩn bảo lưu khiến
    // tổng số lệch với Dashboard và gây hiểu nhầm là mất dữ liệu.
    // Tab "Hết buổi" gộp luôn học viên SẮP hết buổi (còn <= LOW_SESSION_THRESHOLD)
    // để admin chủ động nhắc phụ huynh nạp thêm trước khi đứt buổi.
    const isExactCodeMatch = exactCodeSearch && s.code.toUpperCase() === normalizedSearch
    const matchStatus = isExactCodeMatch || statusFilter === 'all'
      ? true
      : statusFilter === 'expired'
        ? (s.status === 'expired' || isRunningLow(s))
        : s.status === statusFilter
    const matchBranch = isExactCodeMatch || branchFilter === 'all' || s.branchId === branchFilter
    // Học viên có thể học nhiều gói môn -> khớp gói chính hoặc bất kỳ gói nào
    const matchSubject = isExactCodeMatch || subjectFilter === 'all'
      || s.subjectId === subjectFilter
      || (s.subjects || []).some(sub => sub.subjectId === subjectFilter)
    return matchScheduleType && matchSearch && matchStatus && matchBranch && matchSubject
  })

  // Thống kê theo nhóm đang xem (chưa áp bộ lọc tìm kiếm/trạng thái) để đối chiếu
  // với Dashboard — giúp thấy rõ tổng hồ sơ tách theo từng trạng thái.
  const groupStudents = students.filter((s) => {
    if (isGroupClass(s)) return false
    const normalizedGroup = getStudentClassification(s)
    return learningScheduleType === 'all' || normalizedGroup === learningScheduleType
  })
  const groupBreakdown = {
    total: groupStudents.length,
    active: groupStudents.filter((s) => s.status === 'active').length,
    reserved: groupStudents.filter((s) => s.status === 'reserved').length,
    expired: groupStudents.filter((s) => s.status === 'expired').length,
    inactive: groupStudents.filter((s) => s.status === 'inactive').length,
    runningLow: groupStudents.filter(isRunningLow).length,
  }

  // 'newest' giữ nguyên thứ tự Firestore (createdAt desc)
  const sorted = sortBy === 'name_asc'
    ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    : sortBy === 'name_desc'
      ? [...filtered].sort((a, b) => b.name.localeCompare(a.name, 'vi'))
      : filtered

  const allVisibleSelected = sorted.length > 0 && sorted.every((student) => selectedStudentIds.has(student.id))

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((current) => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const toggleAllVisibleStudents = () => {
    setSelectedStudentIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) sorted.forEach((student) => next.delete(student.id))
      else sorted.forEach((student) => next.add(student.id))
      return next
    })
  }

  const copyStudentEmail = async (student: Student) => {
    const email = student.email?.trim()
    if (!email) {
      setEditStudent(student)
      return
    }

    try {
      let copied = false
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(email)
          copied = true
        } catch {
          // Một số trình duyệt vẫn khai báo Clipboard API nhưng từ chối quyền.
          // Khi đó tiếp tục dùng cơ chế dự phòng bên dưới.
        }
      }

      if (!copied) {
        const textArea = document.createElement('textarea')
        textArea.value = email
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        const copied = document.execCommand('copy')
        textArea.remove()
        if (!copied) throw new Error('Clipboard copy failed')
      }
      toast.success('Đã sao chép email phụ huynh')
    } catch (error) {
      console.error('Error copying student email:', error)
      toast.error('Không thể sao chép email. Vui lòng thử lại.')
    }
  }

  const handleBulkClassification = async () => {
    if (selectedStudentIds.size === 0) return
    setBulkUpdating(true)
    try {
      const ids = students
        .filter((student) => selectedStudentIds.has(student.id))
        .filter((student) => !isGroupClass(student))
        .filter((student) => getStudentClassification(student) !== bulkScheduleType)
        .map((student) => student.id)
      if (ids.length === 0) {
        toast.success('Các học viên đã thuộc đúng nhóm; không phát sinh cập nhật')
        setSelectedStudentIds(new Set())
        return
      }
      for (let offset = 0; offset < ids.length; offset += 450) {
        const batch = writeBatch(db)
        ids.slice(offset, offset + 450).forEach((studentId) => {
          batch.update(doc(db, 'students', studentId), {
            learningScheduleType: bulkScheduleType,
            updatedAt: serverTimestamp(),
          })
        })
        await batch.commit()
      }
      const targetLabel = STUDENT_CLASSIFICATION_OPTIONS.find((option) => option.value === bulkScheduleType)?.label
      toast.success(`Đã chuyển ${ids.length} học viên sang ${targetLabel || 'nhóm đã chọn'}`)
      setSelectedStudentIds(new Set())
    } catch (error) {
      console.error('Error bulk classifying students:', error)
      toast.error('Không thể phân loại hàng loạt. Vui lòng thử lại.')
    } finally {
      setBulkUpdating(false)
    }
  }

  const handleDelete = async (password: string) => {
    if (!deleteStudent) return
    setDeletingStudent(true)
    try {
      const result = await deleteStudentSafely({
        studentId: deleteStudent.id,
        expectedCode: deleteStudent.code,
        password,
      })
      toast.success(result.releasedBookingCount > 0
        ? `Đã sao lưu, xóa học viên và nhả ${result.releasedBookingCount} ca học đang giữ chỗ`
        : 'Đã sao lưu và xóa học viên')
      setDeleteStudent(null)
    } catch (error) {
      console.error('Error deleting student:', error)
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      toast.error(code.includes('permission-denied') ? 'Mật khẩu xóa học viên không đúng hoặc tài khoản không có quyền' : 'Không thể xóa học viên an toàn')
    } finally {
      setDeletingStudent(false)
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pageMeta.title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Đang hiển thị <span className="font-semibold text-slate-700">{filtered.length}</span>
            {filtered.length !== groupBreakdown.total && <> / {groupBreakdown.total}</>} học viên
            {limitVal > 0 && <span className="text-amber-600"> · chỉ hiển thị {limitVal} hồ sơ mới nhất</span>}
          </p>
          {!loading && groupBreakdown.total > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>Tổng hồ sơ: <span className="font-semibold text-slate-700">{groupBreakdown.total}</span></span>
              <span className="text-emerald-600">Đang học: {groupBreakdown.active}</span>
              <span className="text-amber-600">Sắp hết buổi: {groupBreakdown.runningLow}</span>
              <span className="text-sky-600">Bảo lưu: {groupBreakdown.reserved}</span>
              <span className="text-rose-500">Hết buổi: {groupBreakdown.expired}</span>
              <span className="text-slate-500">Tạm dừng: {groupBreakdown.inactive}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setShowAdd(true)} className="shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Thêm học viên
          </Button>
        </div>
      </div>

      {selectedStudentIds.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-900">
            <CheckSquare className="h-5 w-5 text-brand-700" />
            Đã chọn {selectedStudentIds.size} học viên
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <span className="text-xs font-semibold text-slate-600 sm:whitespace-nowrap">Chuyển sang</span>
            <select
              value={bulkScheduleType}
              onChange={(event) => setBulkScheduleType(event.target.value as StudentClassification)}
              className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-brand-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-brand-300 sm:flex-none"
              aria-label="Chọn phân loại học viên"
            >
              {STUDENT_CLASSIFICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <Button onClick={handleBulkClassification} loading={bulkUpdating} className="min-h-[40px]">
              Chuyển đã chọn
            </Button>
            <button
              type="button"
              onClick={() => setSelectedStudentIds(new Set())}
              className="min-h-[40px] rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Input
          placeholder="Tìm theo tên, mã, email hoặc SĐT..."
          leftIcon={<Search className="w-4 h-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full lg:max-w-md"
        />
        <div className="flex gap-3 items-center flex-wrap">
          {<label className="flex items-center gap-2 text-sm font-medium text-slate-600">
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
          </label>}
          <div className="flex bg-slate-100/80 p-1 rounded-xl overflow-x-auto hide-scrollbar">
            {/* Thứ tự ưu tiên: Đang học trước, "Tất cả" đẩy ra sau cùng */}
            {['active', 'inactive', 'expired', 'reserved', 'all'].map((s) => (
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
          {subjects.length > 0 && (
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px] max-w-[220px]"
              aria-label="Lọc theo môn học"
            >
              <option value="all">Tất cả môn học</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
            aria-label="Sắp xếp danh sách"
          >
            <option value="newest">Mới nhất</option>
            <option value="name_asc">Tên A → Z</option>
            <option value="name_desc">Tên Z → A</option>
          </select>
        </div>
      </div>

      {/* Desktop Table */}
      {loading ? (
        <Card padding="none"><TableSkeleton /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title={search || statusFilter !== 'all' || branchFilter !== 'all' || subjectFilter !== 'all' ? 'Không tìm thấy học viên' : pageMeta.emptyTitle}
          description={search || statusFilter !== 'all' || branchFilter !== 'all' || subjectFilter !== 'all' ? 'Thêm học viên mới hoặc thay đổi bộ lọc' : pageMeta.emptyDescription}
          action={{ label: 'Thêm học viên', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card padding="none" className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="w-11 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(element) => { if (element) element.indeterminate = !allVisibleSelected && selectedStudentIds.size > 0 }}
                        onChange={toggleAllVisibleStudents}
                        aria-label="Chọn tất cả học viên đang hiển thị"
                        className="h-4 w-4 accent-brand-600"
                      />
                    </th>
                    {['Mã', 'Tên học viên', 'Email phụ huynh', 'Ngày tạo', 'Buổi khả dụng', 'Trạng thái', 'Hành động'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((student) => {
                    const remainingMins = getStudentPackageMinuteSummary(student).remainingMinutes;
                    const heldMins = student.reservedMinutes ?? student.heldMinutes ?? 0;
                    const availableMins = Math.max(0, remainingMins - heldMins);
                    const availableSessions25 = Math.floor(availableMins / 25);
                    const runningLow = isRunningLow(student);

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(student.id)}
                            onChange={() => toggleStudentSelection(student.id)}
                            aria-label={`Chọn học viên ${student.name}`}
                            className="h-4 w-4 accent-brand-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">
                            {student.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{student.name}</td>
                        <td className="min-w-[250px] px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-4 w-4 flex-none text-slate-400" />
                            <button
                              type="button"
                              onClick={() => setEditStudent(student)}
                              className={`min-h-9 min-w-0 truncate rounded-lg px-2 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                                student.email
                                  ? 'text-indigo-700 hover:bg-indigo-50'
                                  : 'text-amber-700 hover:bg-amber-50'
                              }`}
                              title={student.email ? `Sửa email ${student.email}` : 'Bổ sung email phụ huynh'}
                            >
                              {student.email || 'Bổ sung email'}
                            </button>
                            {student.email && (
                              <button
                                type="button"
                                onClick={() => void copyStudentEmail(student)}
                                className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                title={`Sao chép ${student.email}`}
                                aria-label={`Sao chép email của ${student.name}`}
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {student.createdAt ? student.createdAt.toDate().toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="leading-tight">
                            <div>
                              <span className={`font-semibold ${SESSION_LEVEL_TEXT_CLASS[getSessionLevel(availableSessions25)]}`}>
                                {availableSessions25}
                              </span>
                              <span className="text-slate-500 text-xs"> buổi</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              <span className={availableMins <= 0 ? 'text-rose-300' : ''}>{availableMins}</span>
                              <span> phút</span>
                              {heldMins > 0 && <span className="ml-1">(đã giữ {heldMins}p)</span>}
                            </div>
                          </div>
                        </td>
                      <td className="px-4 py-3">
                        {runningLow
                          ? <span
                              title={`Còn ${remainingSessionsOf(student)} buổi trong gói (gồm cả buổi đã đặt lịch) — nên nhắc phụ huynh nạp thêm`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                              Sắp hết buổi
                            </span>
                          : <StatusBadge status={student.status} />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/admin/students/${student.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Mở chi tiết ở tab mới"
                            aria-label={`Mở chi tiết học viên ${student.name} ở tab mới`}
                          >
                            <Eye className="w-4 h-4" />
                          </a>
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
            {sorted.map((student) => {
              const remainingMins = getStudentPackageMinuteSummary(student).remainingMinutes;
              const heldMins = student.reservedMinutes ?? student.heldMinutes ?? 0;
              const availableMins = Math.max(0, remainingMins - heldMins);
              const availableSessions25 = Math.floor(availableMins / 25);

              return (
                <Card key={student.id} hover onClick={() => navigate(`/admin/students/${student.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(student.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleStudentSelection(student.id)}
                          aria-label={`Chọn học viên ${student.name}`}
                          className="h-4 w-4 accent-brand-600"
                        />
                        <span className="font-mono text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">
                          {student.code}
                        </span>
                        {isRunningLow(student)
                          ? <span
                              title={`Còn ${remainingSessionsOf(student)} buổi trong gói (gồm cả buổi đã đặt lịch) — nên nhắc phụ huynh nạp thêm`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                              Sắp hết buổi
                            </span>
                          : <StatusBadge status={student.status} />}
                      </div>
                      <p className="font-semibold text-slate-900">{student.name}</p>
                      <div className="mt-1 flex min-w-0 items-center gap-1 text-xs">
                        <Mail className="h-3.5 w-3.5 flex-none text-slate-400" />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditStudent(student)
                          }}
                          className={`min-h-11 min-w-0 truncate rounded-lg px-2 text-left font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                            student.email
                              ? 'text-indigo-700 hover:bg-indigo-50'
                              : 'text-amber-700 hover:bg-amber-50'
                          }`}
                        >
                          {student.email || 'Bổ sung email phụ huynh'}
                        </button>
                        {student.email && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void copyStudentEmail(student)
                            }}
                            className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                            title={`Sao chép ${student.email}`}
                            aria-label={`Sao chép email của ${student.name}`}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {student.createdAt ? student.createdAt.toDate().toLocaleDateString('vi-VN') : '—'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xl font-bold ${SESSION_LEVEL_TEXT_CLASS[getSessionLevel(availableSessions25)]}`}>{availableSessions25}</p>
                      <p className="text-xs text-slate-500">buổi khả dụng</p>
                      <p className={`text-[11px] mt-0.5 ${availableMins <= 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                        {availableMins} phút
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

      {showAdd && (
        <StudentFormModal
          defaultLearningScheduleType={learningScheduleType === 'all' ? 'fixed' : learningScheduleType}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editStudent && <StudentFormModal student={editStudent} onClose={() => setEditStudent(null)} />}
      {addSessions && <AddSessionsModal student={addSessions} onClose={() => setAddSessions(null)} />}
      {deleteStudent && (
        <DeleteStudentDialog
          student={deleteStudent}
          loading={deletingStudent}
          onClose={() => setDeleteStudent(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
