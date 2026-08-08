import { useEffect, useState, useRef } from 'react'
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Teacher, TeacherDirectoryCategory } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { TeacherFormModal } from '@/components/teachers/TeacherFormModal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck, BookOpenCheck, FileWarning, GraduationCap, Plus, Search, Eye, Trash2, ChevronDown, MonitorUp, MapPin, TestTube2, UserX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getTeacherPointsPer25Minutes } from '@/lib/points'
import { DiamondPointsIcon } from '@/components/shared/DiamondPointsIcon'
import { getTeacherCertificateCompliance, missingTeacherFields } from '@/lib/teacherProfile'
import { retireTeacherAccount } from '@/lib/teacherAccount'
import { useAuthStore } from '@/stores/authStore'
import { normalizeTeacherCountryCode, teacherCountryLabel } from '@/lib/teacherCountries'

type ProfileFilter = 'all' | 'certificate_complete' | 'missing_certificate' | 'missing_foreign_language' | 'missing_pedagogical' | 'missing_both' | 'missing_basic_profile'
type TeacherSort = 'newest' | 'minutes_desc' | 'minutes_asc'
interface Branch { id: string; name: string; status: string }
type TeacherDirectoryView = TeacherDirectoryCategory | 'resigned'

async function commitTeacherUpdates(teacherIds: string[], values: Record<string, unknown>) {
  const batchSize = values.isTester === true ? 225 : 450
  for (let index = 0; index < teacherIds.length; index += batchSize) {
    const batch = writeBatch(db)
    teacherIds.slice(index, index + batchSize).forEach((teacherId) => {
      batch.update(doc(db, 'teachers', teacherId), values)
      if (values.isTester === true) {
        batch.set(doc(db, 'publicTeacherProfiles', teacherId), {
          isPublished: false,
          unpublishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }
    })
    await batch.commit()
  }
}

const DIRECTORY_CONFIG = {
  online: {
    title: 'Gia sư online',
    singular: 'gia sư online',
    description: 'Quản lý gia sư dạy trực tuyến và hồ sơ chưa phân loại từ hệ thống cũ.',
    icon: MonitorUp,
  },
  offline: {
    title: 'Gia sư offline',
    singular: 'gia sư offline',
    description: 'Quản lý gia sư có nhận lớp trực tiếp tại trung tâm hoặc theo khu vực.',
    icon: MapPin,
  },
  tester: {
    title: 'Gia sư tester',
    singular: 'tester',
    description: 'Quản lý hồ sơ kiểm thử tách biệt với đội ngũ gia sư đang nhận lớp.',
    icon: TestTube2,
  },
  resigned: {
    title: 'Gia sư nghỉ dạy',
    singular: 'gia sư nghỉ dạy',
    description: 'Lưu hồ sơ và lịch sử của gia sư đã nghỉ dạy; tài khoản đã khóa và nickname đã thu hồi.',
    icon: UserX,
  },
} satisfies Record<TeacherDirectoryView, { title: string; singular: string; description: string; icon: typeof GraduationCap }>

// Quốc gia của gia sư (lấy từ hồ sơ). Hiển thị cờ + tên gọn cho cột "Quốc gia".
const COUNTRY_INFO: Record<string, { flag: string; label: string }> = {
  VN: { flag: '🇻🇳', label: 'Việt Nam' },
  PH: { flag: '🇵🇭', label: 'Philippines' },
  US: { flag: '🇺🇸', label: 'Mỹ' },
  GB: { flag: '🇬🇧', label: 'Anh' },
  AU: { flag: '🇦🇺', label: 'Úc' },
  CA: { flag: '🇨🇦', label: 'Canada' },
  ZA: { flag: '🇿🇦', label: 'Nam Phi' },
  IN: { flag: '🇮🇳', label: 'Ấn Độ' },
  JP: { flag: '🇯🇵', label: 'Nhật Bản' },
  KR: { flag: '🇰🇷', label: 'Hàn Quốc' },
}

function CountryCell({ country }: { country?: string }) {
  const rawCode = (country || '').trim()
  const code = rawCode ? normalizeTeacherCountryCode(rawCode) : ''
  const info = code ? COUNTRY_INFO[code] || { flag: '', label: teacherCountryLabel(code) } : undefined
  if (!info) return <span className="text-slate-400 text-xs italic">Chưa cập nhật</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
      {info.flag && <span className="text-base leading-none">{info.flag}</span>}
      {info.label}
    </span>
  )
}

const STATUS_STYLES: Record<Teacher['status'], { badge: string; dot: string; label: string }> = {
  active: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200', dot: 'bg-emerald-400', label: 'Đang dạy' },
  inactive: { badge: 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200', dot: 'bg-slate-400', label: 'Tạm dừng' },
  resigned: { badge: 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200', dot: 'bg-rose-500', label: 'Nghỉ dạy' },
}

function StatusSelector({ teacher, onRetire }: { teacher: Teacher; onRetire: (teacher: Teacher) => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentStatus = teacher.status

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = async (status: Teacher['status']) => {
    setOpen(false)
    if (status === currentStatus) return
    if (status === 'resigned') {
      onRetire(teacher)
      return
    }
    if (status === 'active' && !(teacher.code || '').trim()) {
      toast.error('Hãy mở Sửa và cấp nickname đăng nhập mới trước khi kích hoạt lại gia sư')
      return
    }
    setSaving(true)
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'teachers', teacher.id), {
        status,
        updatedAt: serverTimestamp(),
      })
      if (status === 'inactive') {
        batch.set(doc(db, 'publicTeacherProfiles', teacher.id), {
          isPublished: false,
          unpublishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }
      await batch.commit()
      toast.success(`Đã chuyển gia sư sang "${STATUS_STYLES[status].label}"`)
    } catch {
      toast.error('Lỗi khi cập nhật trạng thái')
    } finally {
      setSaving(false)
    }
  }

  const style = STATUS_STYLES[currentStatus] || STATUS_STYLES.active

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        disabled={saving}
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${style.badge} ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-label="Đổi trạng thái gia sư"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {style.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[120px]">
          {(['active', 'inactive', 'resigned'] as const).map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); handleSelect(s) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors ${
                currentStatus === s ? 'bg-slate-50' : ''
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${STATUS_STYLES[s].dot}`} />
              <span className={STATUS_STYLES[s].badge.split(' ')[1]}>{STATUS_STYLES[s].label}</span>
              {currentStatus === s && <span className="ml-auto text-emerald-500">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CertificateComplianceCell({ teacher, onEdit, compact = false }: { teacher: Teacher; onEdit: () => void; compact?: boolean }) {
  const compliance = getTeacherCertificateCompliance(teacher)

  return (
    <div className={`flex ${compact ? 'flex-wrap items-center' : 'min-w-[190px] flex-col items-start'} gap-1.5`}>
      <div className="flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ring-1 ${compliance.hasForeignLanguageImage ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>
          {compliance.hasForeignLanguageImage ? <BookOpenCheck className="h-3.5 w-3.5" /> : <FileWarning className="h-3.5 w-3.5" />}
          Năng lực chuyên môn
        </span>
        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ring-1 ${compliance.hasPedagogicalImage ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>
          {compliance.hasPedagogicalImage ? <BookOpenCheck className="h-3.5 w-3.5" /> : <FileWarning className="h-3.5 w-3.5" />}
          Sư phạm
        </span>
      </div>
      {!compliance.isCertificateComplete && (
        <button type="button" onClick={onEdit} className="min-h-8 rounded-lg px-2 text-[11px] font-extrabold text-brand-900 underline decoration-brand-300 underline-offset-2 hover:bg-brand-50 active:scale-[0.98]">
          Bổ sung hồ sơ
        </button>
      )}
    </div>
  )
}

export function TeachersPage({ category = 'online' }: { category?: TeacherDirectoryView }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const directory = DIRECTORY_CONFIG[category]
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [minutesMap, setMinutesMap] = useState<Record<string, number>>({})
  const [search, setSearch] = useState(() => sessionStorage.getItem('teachers_search') || '')
  const [countryFilter, setCountryFilter] = useState<string>(() => sessionStorage.getItem('teachers_countryFilter') || 'all')
  const [statusFilter, setStatusFilter] = useState<string>(() => sessionStorage.getItem('teachers_statusFilter') || 'all')
  const [branchFilter, setBranchFilter] = useState<string>(() => sessionStorage.getItem('teachers_branchFilter') || 'all')
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>(() => (sessionStorage.getItem('teachers_profileFilter') as ProfileFilter) || 'all')
  const [sortBy, setSortBy] = useState<TeacherSort>(() => {
    const stored = sessionStorage.getItem('teachers_sortBy')
    return stored === 'minutes_desc' || stored === 'minutes_asc' ? stored : 'newest'
  })
  const [branches, setBranches] = useState<Branch[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null)
  const [deleteTeacher, setDeleteTeacher] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [retiringTeacher, setRetiringTeacher] = useState<Teacher | null>(null)
  const [retiring, setRetiring] = useState(false)
  const [showBulkRetireConfirm, setShowBulkRetireConfirm] = useState(false)
  const [bulkRetiring, setBulkRetiring] = useState(false)
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([])
  const [bulkPoints, setBulkPoints] = useState(25)
  const [savingPoints, setSavingPoints] = useState(false)
  const [bulkCategories, setBulkCategories] = useState<TeacherDirectoryCategory[]>([])
  const [savingCategories, setSavingCategories] = useState(false)
  const [limitVal, setLimitVal] = useState<number>(() => {
    const stored = sessionStorage.getItem('teachers_limitVal')
    return stored ? Number(stored) : 20
  })

  useEffect(() => {
    if (category === 'resigned' && statusFilter !== 'all') {
      setStatusFilter('all')
    }
  }, [category, statusFilter])

  // Sync filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('teachers_search', search)
    sessionStorage.setItem('teachers_countryFilter', countryFilter)
    sessionStorage.setItem('teachers_statusFilter', statusFilter)
    sessionStorage.setItem('teachers_branchFilter', branchFilter)
    sessionStorage.setItem('teachers_profileFilter', profileFilter)
    sessionStorage.setItem('teachers_sortBy', sortBy)
    sessionStorage.setItem('teachers_limitVal', String(limitVal))
  }, [search, countryFilter, statusFilter, branchFilter, profileFilter, sortBy, limitVal])

  // Sync scroll position to sessionStorage
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem('teachers_scroll', String(window.scrollY))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Restore scroll position once data loading has completed
  useEffect(() => {
    if (!loading && teachers.length > 0) {
      const savedScroll = sessionStorage.getItem('teachers_scroll')
      if (savedScroll) {
        const scrollTimer = setTimeout(() => {
          window.scrollTo(0, Number(savedScroll))
        }, 100)
        return () => clearTimeout(scrollTimer)
      }
    }
  }, [loading, teachers])

  useEffect(() => {
    const q = query(collection(db, 'teachers'))
    setLoading(true)

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Teacher))
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0) || a.name.localeCompare(b.name, 'vi'))
        setTeachers(items)
        setLoading(false)
      },
      (err) => {
        console.error(err)
        setTeachers([])
        toast.error('Không có quyền truy cập danh sách gia sư hoặc lỗi kết nối')
        setLoading(false)
      }
    )

    return () => {
      unsub()
    }
  }, [])

  useEffect(() => {
    if (teachers.length === 0) return
    let active = true

    const teacherIds = teachers.map(t => t.id)
    Promise.all(
      teacherIds.map(tid => 
        getDocs(
          query(
            collection(db, 'lessons'),
            where('teacherId', '==', tid),
            where('status', '==', 'approved')
          )
        ).then(snap => {
          const totalMins = snap.docs.reduce((sum, d) => sum + (Number(d.data().minutes) || 0), 0)
          return [tid, totalMins] as const
        })
      )
    ).then(results => {
      if (!active) return
      const map: Record<string, number> = {}
      results.forEach(([tid, mins]) => {
        map[tid] = mins
      })
      setMinutesMap(map)
    }).catch(err => {
      console.error('Error fetching teacher approved minutes:', err)
    })

    return () => { active = false }
  }, [teachers])

  useEffect(() => {
    getDocs(query(collection(db, 'branches'), where('status', '==', 'active')))
      .then((snap) => {
        setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Branch)))
      })
      .catch((err) => {
        console.error('Error loading branches:', err)
      })
  }, [])

  const matchesDirectory = (teacher: Teacher) => {
    if (category === 'resigned') return teacher.status === 'resigned'
    if (teacher.status === 'resigned') return false
    const formats = teacher.teachingFormats || []
    return category === 'tester'
      ? !!teacher.isTester
      : category === 'offline'
        ? formats.includes('offline')
        : formats.includes('online') || (formats.length === 0 && !teacher.isTester)
  }

  const directoryTeachers = teachers.filter(matchesDirectory)
  const countryOptions = Array.from(new Set(directoryTeachers.map((teacher) => teacher.country ? normalizeTeacherCountryCode(teacher.country) : 'missing')))
    .sort((a, b) => {
      const aLabel = a === 'missing' ? 'Chưa cập nhật' : teacherCountryLabel(a)
      const bLabel = b === 'missing' ? 'Chưa cập nhật' : teacherCountryLabel(b)
      return aLabel.localeCompare(bLabel, 'vi')
    })

  const filtered = directoryTeachers.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.code || t.releasedNickname || '').toLowerCase().includes(search.toLowerCase())
    const teacherCountry = t.country ? normalizeTeacherCountryCode(t.country) : 'missing'
    const matchCountry = countryFilter === 'all' || teacherCountry === countryFilter
    const matchStatus = category === 'resigned' || statusFilter === 'all' || t.status === statusFilter
    const matchBranch = branchFilter === 'all' || t.branchId === branchFilter
    const certificates = getTeacherCertificateCompliance(t)
    const matchProfile = profileFilter === 'all'
      || (profileFilter === 'certificate_complete' && certificates.isCertificateComplete)
      || (profileFilter === 'missing_certificate' && !certificates.isCertificateComplete)
      || (profileFilter === 'missing_foreign_language' && !certificates.hasForeignLanguageImage)
      || (profileFilter === 'missing_pedagogical' && !certificates.hasPedagogicalImage)
      || (profileFilter === 'missing_both' && !certificates.hasForeignLanguageImage && !certificates.hasPedagogicalImage)
      || (profileFilter === 'missing_basic_profile' && missingTeacherFields(t).length > 0)
    return matchSearch && matchCountry && matchStatus && matchBranch && matchProfile
  })

  const getApprovedMinutes = (teacher: Teacher) => (
    minutesMap[teacher.id] ?? (Number((teacher as Teacher & { totalApprovedMinutes?: number }).totalApprovedMinutes) || 0)
  )

  const sortedTeachers = sortBy === 'newest'
    ? filtered
    : [...filtered].sort((a, b) => {
        const minuteDifference = getApprovedMinutes(a) - getApprovedMinutes(b)
        if (minuteDifference !== 0) return sortBy === 'minutes_desc' ? -minuteDifference : minuteDifference
        return a.name.localeCompare(b.name, 'vi')
      })

  const visibleTeachers = limitVal > 0 ? sortedTeachers.slice(0, limitVal) : sortedTeachers

  const profileCounts = directoryTeachers.reduce((counts, teacher) => {
    const compliance = getTeacherCertificateCompliance(teacher)
    if (compliance.isCertificateComplete) counts.complete += 1
    if (!compliance.hasForeignLanguageImage) counts.missingForeign += 1
    if (!compliance.hasPedagogicalImage) counts.missingPedagogical += 1
    if (!compliance.hasForeignLanguageImage && !compliance.hasPedagogicalImage) counts.missingBoth += 1
    return counts
  }, { complete: 0, missingForeign: 0, missingPedagogical: 0, missingBoth: 0 })

  const directoryCounts: Record<TeacherDirectoryView, number> = {
    online: teachers.filter((t) => t.status !== 'resigned' && (t.teachingFormats?.includes('online') || ((t.teachingFormats || []).length === 0 && !t.isTester))).length,
    offline: teachers.filter((t) => t.status !== 'resigned' && t.teachingFormats?.includes('offline')).length,
    tester: teachers.filter((t) => t.status !== 'resigned' && !!t.isTester).length,
    resigned: teachers.filter((t) => t.status === 'resigned').length,
  }

  // Bật/tắt vai trò Tester độc lập với nhóm Online/Offline.
  const toggleTester = async (teacher: Teacher) => {
    const next = !teacher.isTester
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'teachers', teacher.id), {
        isTester: next,
        updatedAt: serverTimestamp(),
      })
      if (next) {
        batch.set(doc(db, 'publicTeacherProfiles', teacher.id), {
          isPublished: false,
          unpublishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }
      await batch.commit()
      setTeachers((prev) => prev.map((t) => (t.id === teacher.id ? { ...t, isTester: next } : t)))
      toast.success(next ? `Đã thêm ${teacher.name} vào nhóm Tester` : `Đã bỏ ${teacher.name} khỏi nhóm Tester`)
    } catch (err: any) {
      toast.error('Không thể chuyển đổi: ' + (err?.message || ''))
    }
  }

  const handleDelete = async () => {
    if (!deleteTeacher) return
    setDeleting(true)
    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'teachers', deleteTeacher.id))
      batch.delete(doc(db, 'publicTeacherProfiles', deleteTeacher.id))
      await batch.commit()
      toast.success('Xóa gia sư thành công')
      setDeleteTeacher(null)
    } catch (err: any) {
      toast.error('Lỗi khi xóa gia sư: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleRetire = async () => {
    if (!retiringTeacher) return
    setRetiring(true)
    try {
      await retireTeacherAccount({
        teacherId: retiringTeacher.id,
        teacherName: retiringTeacher.name,
        nickname: retiringTeacher.code || retiringTeacher.releasedNickname || '',
        adminId: user?.uid,
      })
      toast.success('Đã chuyển sang Nghỉ dạy, khóa đăng nhập và thu hồi nickname')
      setRetiringTeacher(null)
    } catch (error) {
      console.error(error)
      toast.error('Không thể khóa tài khoản gia sư. Dữ liệu chưa bị thay đổi.')
    } finally {
      setRetiring(false)
    }
  }

  const handleTeacherPointsChange = async (teacherId: string, points: number) => {
    const normalizedPoints = Math.max(1, Math.round(Number(points) || 25))
    try {
      await updateDoc(doc(db, 'teachers', teacherId), { pointsPer25Minutes: normalizedPoints })
      toast.success(`Đã cập nhật ${normalizedPoints} kim cương cho mỗi 25 phút`)
    } catch (error) {
      console.error(error)
      toast.error('Không cập nhật được chi phí kim cương')
    }
  }

  const handleBulkPointsUpdate = async () => {
    if (selectedTeacherIds.length === 0) return
    const normalizedPoints = Math.max(1, Math.round(Number(bulkPoints) || 25))
    const selectedCount = selectedTeacherIds.length
    setSavingPoints(true)
    try {
      await commitTeacherUpdates(selectedTeacherIds, { pointsPer25Minutes: normalizedPoints })
      setBulkPoints(normalizedPoints)
      setSelectedTeacherIds([])
      toast.success(`Đã gán ${normalizedPoints} kim cương/25 phút cho ${selectedCount} gia sư`)
    } catch (error) {
      console.error(error)
      toast.error('Không cập nhật được chi phí kim cương hàng loạt')
    } finally {
      setSavingPoints(false)
    }
  }

  const handleBulkCategoryUpdate = async () => {
    if (selectedTeacherIds.length === 0) return
    if (bulkCategories.length === 0) {
      toast.error('Vui lòng chọn ít nhất một nhóm gia sư')
      return
    }

    const selectedCount = selectedTeacherIds.length
    const teachingFormats = bulkCategories.filter((item) => item !== 'tester')
    const isTester = bulkCategories.includes('tester')
    setSavingCategories(true)
    try {
      await commitTeacherUpdates(selectedTeacherIds, { teachingFormats, isTester })
      setSelectedTeacherIds([])
      toast.success(`Đã cập nhật nhóm cho ${selectedCount} gia sư`)
    } catch (error) {
      console.error(error)
      toast.error('Không cập nhật được nhóm gia sư hàng loạt')
    } finally {
      setSavingCategories(false)
    }
  }

  const handleBulkRetire = async () => {
    const selectedTeachers = teachers.filter((teacher) =>
      selectedTeacherIds.includes(teacher.id) && teacher.status !== 'resigned',
    )
    if (selectedTeachers.length === 0) return

    setBulkRetiring(true)
    const failedTeacherIds: string[] = []
    let retiredCount = 0
    for (const teacher of selectedTeachers) {
      try {
        await retireTeacherAccount({
          teacherId: teacher.id,
          teacherName: teacher.name,
          nickname: teacher.code || teacher.releasedNickname || '',
          adminId: user?.uid,
        })
        retiredCount += 1
      } catch (error) {
        console.error(`Unable to retire teacher ${teacher.id}:`, error)
        failedTeacherIds.push(teacher.id)
      }
    }

    setSelectedTeacherIds(failedTeacherIds)
    setShowBulkRetireConfirm(false)
    setBulkRetiring(false)
    if (failedTeacherIds.length > 0) {
      toast.warning(`Đã chuyển ${retiredCount} gia sư; còn ${failedTeacherIds.length} hồ sơ chưa xử lý. Các hồ sơ lỗi vẫn được giữ chọn.`)
    } else {
      toast.success(`Đã chuyển ${retiredCount} gia sư sang Nghỉ dạy, khóa đăng nhập và thu hồi nickname`)
    }
  }

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-800 ring-1 ring-brand-200">
            <directory.icon className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{directory.title}</h1>
            <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">{directory.description}</p>
          </div>
        </div>
        {category !== 'resigned' && (
          <Button onClick={() => setShowAdd(true)} className="shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Thêm {directory.singular}</span>
            <span className="sm:hidden">Thêm mới</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(DIRECTORY_CONFIG) as TeacherDirectoryView[]).map((key) => {
          const item = DIRECTORY_CONFIG[key]
          const ItemIcon = item.icon
          const active = key === category
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(`/admin/teachers/${key}`)}
              className={`flex min-h-[68px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${active ? 'border-brand-300 bg-brand-50 text-slate-950 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50/50'}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-brand-400 text-slate-950' : 'bg-slate-100 text-slate-500'}`}>
                <ItemIcon className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold">{item.title}</span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">{directoryCounts[key]} hồ sơ</span>
              </span>
            </button>
          )
        })}
      </div>

      <section className="rounded-2xl border border-brand-200 bg-white p-4 shadow-sm" aria-labelledby="certificate-audit-title">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="certificate-audit-title" className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <FileWarning className="h-5 w-5 text-brand-700" />
              Kiểm tra ảnh chứng chỉ bắt buộc
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Mỗi gia sư cần ảnh chứng chỉ Năng lực chuyên môn và ảnh chứng chỉ Sư phạm.</p>
          </div>
          {profileFilter !== 'all' && (
            <button type="button" onClick={() => setProfileFilter('all')} className="min-h-9 self-start rounded-xl px-3 text-xs font-bold text-brand-800 hover:bg-brand-50 active:scale-[0.98] sm:self-auto">
              Xóa lọc hồ sơ
            </button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {([
            { key: 'certificate_complete', label: 'Đủ 2 ảnh', count: profileCounts.complete, icon: BadgeCheck, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
            { key: 'missing_foreign_language', label: 'Thiếu năng lực chuyên môn', count: profileCounts.missingForeign, icon: FileWarning, tone: 'border-amber-200 bg-amber-50 text-amber-900' },
            { key: 'missing_pedagogical', label: 'Thiếu Sư phạm', count: profileCounts.missingPedagogical, icon: FileWarning, tone: 'border-orange-200 bg-orange-50 text-orange-900' },
            { key: 'missing_both', label: 'Thiếu cả hai', count: profileCounts.missingBoth, icon: FileWarning, tone: 'border-rose-200 bg-rose-50 text-rose-800' },
          ] as const).map((item) => {
            const Icon = item.icon
            const active = profileFilter === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setProfileFilter(active ? 'all' : item.key)}
                aria-pressed={active}
                className={`flex min-h-[72px] items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.98] ${item.tone} ${active ? 'ring-2 ring-brand-400 ring-offset-1' : 'hover:brightness-[0.98]'}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <strong className="block text-xl font-black tabular-nums">{item.count}</strong>
                  <span className="block text-[11px] font-bold leading-4 sm:text-xs">{item.label}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Input
          placeholder="Tìm theo tên hoặc mã gia sư..."
          leftIcon={<Search className="w-4 h-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full lg:max-w-md"
        />

        <div className="flex gap-3 items-center flex-wrap">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <span className="whitespace-nowrap">Số gia sư</span>
            <select
              value={limitVal}
              onChange={(event) => setLimitVal(Number(event.target.value))}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Chọn số lượng gia sư cần tải"
            >
              {[20, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
              <option value={0}>Tất cả</option>
            </select>
          </label>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as TeacherSort)}
            className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-brand-400"
            aria-label="Sắp xếp gia sư theo tổng phút dạy"
          >
            <option value="newest">Mới tạo gần đây</option>
            <option value="minutes_desc">Dạy nhiều nhất</option>
            <option value="minutes_asc">Dạy ít nhất</option>
          </select>

          {category !== 'resigned' && (
            <div className="flex bg-slate-100/80 p-1 rounded-xl overflow-x-auto hide-scrollbar">
              {['all', 'active', 'inactive'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  {status === 'all' ? 'Tất cả' : status === 'active' ? 'Đang dạy' : 'Tạm dừng'}
                </button>
              ))}
            </div>
          )}

          <select
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-brand-400"
            aria-label="Lọc gia sư theo quốc gia"
          >
            <option value="all">Tất cả quốc gia</option>
            {countryOptions.map((code) => (
              <option key={code} value={code}>
                {code === 'missing' ? 'Chưa cập nhật quốc gia' : teacherCountryLabel(code)}
              </option>
            ))}
          </select>

          {branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
              aria-label="Lọc theo chi nhánh"
            >
              <option value="all">Tất cả chi nhánh</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          )}

          <select
            value={profileFilter}
            onChange={(event) => setProfileFilter(event.target.value as ProfileFilter)}
            className="min-h-[40px] rounded-xl border border-brand-200 bg-brand-50 px-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand-400"
            aria-label="Lọc tình trạng hồ sơ và chứng chỉ"
          >
            <option value="all">Tất cả hồ sơ</option>
            <option value="certificate_complete">Đủ 2 ảnh chứng chỉ</option>
            <option value="missing_certificate">Thiếu ít nhất 1 ảnh chứng chỉ</option>
            <option value="missing_foreign_language">Thiếu ảnh năng lực chuyên môn</option>
            <option value="missing_pedagogical">Thiếu ảnh Sư phạm</option>
            <option value="missing_both">Thiếu cả 2 ảnh</option>
            <option value="missing_basic_profile">Thiếu thông tin hồ sơ cơ bản</option>
          </select>
        </div>
      </div>

      {selectedTeacherIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3">
          <span className="text-sm font-bold text-sky-900">Đã chọn {selectedTeacherIds.length} gia sư</span>
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-sky-200 bg-white p-1" aria-label="Chọn nhóm gia sư cần áp dụng hàng loạt">
            {(['online', 'offline', 'tester'] as TeacherDirectoryCategory[]).map((item) => {
              const checked = bulkCategories.includes(item)
              return (
                <label key={item} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition ${checked ? 'bg-brand-400 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setBulkCategories((current) => event.target.checked
                      ? [...current, item]
                      : current.filter((categoryItem) => categoryItem !== item))}
                    className="h-3.5 w-3.5 rounded border-slate-400 text-amber-500 focus:ring-amber-400"
                  />
                  {item === 'online' ? 'Online' : item === 'offline' ? 'Offline' : 'Tester'}
                </label>
              )
            })}
          </div>
          <Button size="sm" onClick={handleBulkCategoryUpdate} loading={savingCategories} disabled={bulkCategories.length === 0} title="Thay nhóm hiện tại bằng các nhóm đã chọn">
            Cập nhật nhóm
          </Button>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold text-slate-800">
            <input type="number" min="1" step="1" value={bulkPoints} onChange={(event) => setBulkPoints(Number(event.target.value))} className="w-20 bg-transparent outline-none" aria-label="Kim cương học viên cho mỗi 25 phút" />
            <span className="flex items-center gap-1 whitespace-nowrap text-slate-500"><DiamondPointsIcon className="h-4 w-4 text-violet-600" /> / 25 phút</span>
          </label>
          <Button size="sm" onClick={handleBulkPointsUpdate} loading={savingPoints}>Áp dụng kim cương</Button>
          {category !== 'resigned' && (
            <Button size="sm" variant="danger" onClick={() => setShowBulkRetireConfirm(true)}>
              <UserX className="h-4 w-4" />
              Chuyển sang nghỉ dạy
            </Button>
          )}
          <button type="button" onClick={() => setSelectedTeacherIds([])} className="min-h-10 px-3 text-sm font-semibold text-slate-600">Bỏ chọn</button>
        </div>
      )}

      {loading ? (
        <Card padding="none"><TableSkeleton /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="w-8 h-8" />}
          title={`Không tìm thấy ${directory.singular}`}
          action={category === 'resigned' ? undefined : { label: `Thêm ${directory.singular}`, onClick: () => setShowAdd(true) }}
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card padding="none" className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Chọn tất cả gia sư đang hiển thị" checked={visibleTeachers.length > 0 && visibleTeachers.every((item) => selectedTeacherIds.includes(item.id))} onChange={(event) => setSelectedTeacherIds(event.target.checked ? visibleTeachers.map((item) => item.id) : [])} /></th>
                    {['Mã', 'Tên gia sư', 'Ngày tạo', 'Level', 'Kim cương / 25 phút', 'Hồ sơ chứng chỉ', 'Quốc gia', 'Tổng phút', 'Trạng thái', 'Hành động'].map((h) => h === 'Tổng phút' ? (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500"
                        aria-sort={sortBy === 'minutes_desc' ? 'descending' : sortBy === 'minutes_asc' ? 'ascending' : 'none'}
                      >
                        <button
                          type="button"
                          onClick={() => setSortBy((current) => current === 'minutes_desc' ? 'minutes_asc' : 'minutes_desc')}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 font-bold transition hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                          aria-label={sortBy === 'minutes_desc' ? 'Sắp xếp gia sư dạy ít nhất' : 'Sắp xếp gia sư dạy nhiều nhất'}
                          title={sortBy === 'minutes_desc' ? 'Đang xếp dạy nhiều nhất; nhấn để đảo chiều' : sortBy === 'minutes_asc' ? 'Đang xếp dạy ít nhất; nhấn để đảo chiều' : 'Sắp xếp theo tổng phút dạy'}
                        >
                          {h}
                          {sortBy === 'minutes_desc' ? <ArrowDown className="h-3.5 w-3.5" /> : sortBy === 'minutes_asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
                        </button>
                      </th>
                    ) : (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {visibleTeachers.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-slate-100/20 transition-colors">
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`Chọn ${teacher.name}`} checked={selectedTeacherIds.includes(teacher.id)} onChange={(event) => setSelectedTeacherIds((current) => event.target.checked ? [...new Set([...current, teacher.id])] : current.filter((id) => id !== teacher.id))} /></td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          {teacher.code || teacher.releasedNickname || 'Đã thu hồi'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {teacher.photoURL ? (
                            <img src={teacher.photoURL} alt={teacher.name} className="w-8 h-8 aspect-square shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 aspect-square shrink-0 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                              {teacher.name[0]}
                            </div>
                          )}
                          <span className="font-medium text-slate-700">{teacher.name}</span>
                          {teacher.isTester && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Tester</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {teacher.createdAt?.seconds
                          ? new Date(teacher.createdAt.seconds * 1000).toLocaleDateString('vi-VN')
                          : (teacher.createdAt instanceof Date ? teacher.createdAt.toLocaleDateString('vi-VN') : '—')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-600 font-medium">×{teacher.level}</span>
                      </td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <label className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-sky-700">
                          <input
                            key={`${teacher.id}-${getTeacherPointsPer25Minutes(teacher)}`}
                            type="number"
                            min="1"
                            step="1"
                            defaultValue={getTeacherPointsPer25Minutes(teacher)}
                            onBlur={(event) => handleTeacherPointsChange(teacher.id, Number(event.target.value))}
                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                            className="w-14 bg-transparent text-right outline-none"
                            aria-label={`Kim cương học viên cho mỗi 25 phút của ${teacher.name}`}
                          />
                          <DiamondPointsIcon className="h-4 w-4 text-violet-600" />
                        </label>
                      </td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <CertificateComplianceCell teacher={teacher} onEdit={() => setEditTeacher(teacher)} />
                      </td>
                      <td className="px-4 py-3">
                        <CountryCell country={teacher.country} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-violet-600 font-semibold text-sm">
                          {getApprovedMinutes(teacher).toLocaleString('vi-VN')}'
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <StatusSelector teacher={teacher} onRetire={setRetiringTeacher} />
                      </td>
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
                            onClick={() => toggleTester(teacher)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${teacher.isTester ? 'text-emerald-600 hover:bg-emerald-50' : 'text-violet-600 hover:bg-violet-50'}`}
                            title={teacher.isTester ? 'Bỏ khỏi nhóm Tester' : 'Thêm vào nhóm Tester'}
                          >
                            {teacher.isTester ? 'Bỏ Tester' : 'Thêm Tester'}
                          </button>
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
            {visibleTeachers.map((teacher) => (
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
                      <span className="font-mono text-xs text-emerald-400">{teacher.code || teacher.releasedNickname || 'Đã thu hồi'}</span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <StatusSelector teacher={teacher} onRetire={setRetiringTeacher} />
                      </span>
                      {teacher.isTester && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Tester</span>
                      )}
                    </div>
                    <p className="font-semibold text-slate-900">{teacher.name}</p>
                    <div className="mt-1"><CountryCell country={teacher.country} /></div>
                    <div className="mt-2" onClick={(event) => event.stopPropagation()}>
                      <CertificateComplianceCell teacher={teacher} compact onEdit={() => setEditTeacher(teacher)} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Ngày tạo: {teacher.createdAt?.seconds
                        ? new Date(teacher.createdAt.seconds * 1000).toLocaleDateString('vi-VN')
                        : (teacher.createdAt instanceof Date ? teacher.createdAt.toLocaleDateString('vi-VN') : '—')}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Level ×{teacher.level}
                      {getApprovedMinutes(teacher) > 0
                        ? ` · ${getApprovedMinutes(teacher).toLocaleString('vi-VN')}'`
                        : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      <label className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600">
                        <span>Chi phí học viên</span>
                        <input
                          key={`mobile-${teacher.id}-${getTeacherPointsPer25Minutes(teacher)}`}
                          type="number"
                          min="1"
                          step="1"
                          defaultValue={getTeacherPointsPer25Minutes(teacher)}
                          onBlur={(event) => handleTeacherPointsChange(teacher.id, Number(event.target.value))}
                          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                          className="w-12 bg-transparent text-right font-bold text-sky-700 outline-none"
                          aria-label={`Kim cương học viên cho mỗi 25 phút của ${teacher.name}`}
                        />
                        <span className="flex items-center gap-1 text-sky-700"><DiamondPointsIcon className="h-4 w-4 text-violet-600" />/25 phút</span>
                      </label>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleTester(teacher) }}
                      className={`mt-2 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${teacher.isTester ? 'text-emerald-600 bg-emerald-50' : 'text-violet-600 bg-violet-50'}`}
                    >
                      {teacher.isTester ? 'Bỏ khỏi Tester' : 'Thêm vào Tester'}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {limitVal > 0 && visibleTeachers.length < filtered.length && (
            <div className="flex justify-center mt-6">
              <Button variant="outline" onClick={() => setLimitVal((prev) => prev + 20)}>
                Xem thêm
              </Button>
            </div>
          )}
        </>
      )}

      {showAdd && <TeacherFormModal defaultCategory={category === 'resigned' ? 'online' : category} onClose={() => setShowAdd(false)} />}
      {editTeacher && <TeacherFormModal teacher={editTeacher} defaultCategory={category === 'resigned' ? 'online' : category} onClose={() => setEditTeacher(null)} />}
      <ConfirmDialog
        open={!!deleteTeacher}
        onClose={() => setDeleteTeacher(null)}
        onConfirm={handleDelete}
        title="Xóa gia sư"
        description={`Bạn có chắc chắn muốn xóa gia sư ${deleteTeacher?.name}?`}
        consequence="Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan sẽ bị xóa."
        confirmLabel="Xóa"
        confirmVariant="danger"
        loading={deleting}
      />
      <ConfirmDialog
        open={!!retiringTeacher}
        onClose={() => !retiring && setRetiringTeacher(null)}
        onConfirm={handleRetire}
        title="Xác nhận gia sư nghỉ dạy?"
        description={`Hồ sơ và toàn bộ lịch sử của ${retiringTeacher?.name || 'gia sư'} vẫn được giữ nguyên.`}
        consequence="Tài khoản sẽ bị khóa ngay và nickname đăng nhập được thu hồi để có thể cấp cho gia sư khác."
        confirmLabel="Khóa và thu hồi nickname"
        confirmVariant="danger"
        loading={retiring}
      />
      <ConfirmDialog
        open={showBulkRetireConfirm}
        onClose={() => !bulkRetiring && setShowBulkRetireConfirm(false)}
        onConfirm={handleBulkRetire}
        title={`Chuyển ${selectedTeacherIds.length} gia sư sang nghỉ dạy?`}
        description="Hồ sơ, buổi học và dữ liệu đối soát của các gia sư đã chọn vẫn được giữ nguyên."
        consequence="Tài khoản của từng gia sư sẽ bị khóa và nickname đăng nhập được thu hồi. Chỉ tiếp tục khi danh sách đã chọn là chính xác."
        confirmLabel="Khóa và chuyển sang nghỉ dạy"
        confirmVariant="danger"
        loading={bulkRetiring}
      />
    </div>
  )
}
