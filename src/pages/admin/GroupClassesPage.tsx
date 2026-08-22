import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { BookOpen, ExternalLink, MapPin, Pencil, Plus, Search, UserRoundPlus, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/lib/firebase'
import type { Student } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSpinner'
import { GroupClassFormModal, GroupClassMembersModal } from '@/components/students/GroupClassFormModal'
import { toast } from '@/stores/toastStore'
import { isGroupClassInMode, type GroupClassDeliveryMode } from '@/lib/groupClasses'

export function GroupClassesPage({ deliveryMode = 'online' }: { deliveryMode?: GroupClassDeliveryMode }) {
  const navigate = useNavigate()
  const [classes, setClasses] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingClass, setEditingClass] = useState<Student | null>(null)
  const [managingMembers, setManagingMembers] = useState<Student | null>(null)

  useEffect(() => {
    const classesQuery = query(collection(db, 'students'), where('recordType', '==', 'group_class'))
    return onSnapshot(classesQuery, (snapshot) => {
      const list = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as Student))
        .filter((item) => isGroupClassInMode(item, deliveryMode))
        .sort((left, right) => {
          const leftSeconds = Number(left.createdAt?.seconds || 0)
          const rightSeconds = Number(right.createdAt?.seconds || 0)
          return rightSeconds - leftSeconds || left.name.localeCompare(right.name, 'vi')
        })
      setClasses(list)
      setLoading(false)
      setEditingClass((current) => current ? list.find((item) => item.id === current.id) || current : null)
      setManagingMembers((current) => current ? list.find((item) => item.id === current.id) || current : null)
    }, (error) => {
      console.error('Load group classes failed:', error)
      setLoading(false)
      toast.error('Không tải được danh sách lớp nhóm')
    })
  }, [deliveryMode])

  const isOffline = deliveryMode === 'offline'
  const pageTitle = isOffline ? 'Lớp offline' : 'Lớp nhóm'
  const createLabel = isOffline ? 'Tạo lớp offline' : 'Tạo lớp nhóm'

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi')
    if (!keyword) return classes
    return classes.filter((groupClass) => [
      groupClass.code,
      groupClass.name,
      groupClass.offlineLocation || '',
      ...(groupClass.enrolledStudents || []).flatMap((member) => [member.studentCode, member.studentName]),
    ].join(' ').toLocaleLowerCase('vi').includes(keyword))
  }, [classes, search])

  return (
    <div className="space-y-6 pt-2 lg:pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isOffline
              ? 'Quản lý lớp học trực tiếp, địa điểm, học viên enrol, gói môn và quỹ lớp trên cùng một luồng.'
              : 'Tạo mã lớp, enrol nhiều tài khoản học viên và dùng mã lớp để xếp lịch như lớp 1 kèm 1.'}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {createLabel}
        </Button>
      </div>

      <Card className="p-4">
        <label className="relative block max-w-md">
          <span className="sr-only">Tìm {pageTitle.toLocaleLowerCase('vi')}</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Tìm mã lớp, tên lớp${isOffline ? ', địa điểm' : ''} hoặc học viên...`}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </label>
      </Card>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-8 w-8" />}
          title={search ? `Không tìm thấy ${pageTitle.toLocaleLowerCase('vi')}` : `Chưa có ${pageTitle.toLocaleLowerCase('vi')}`}
          description={search ? 'Thử tìm bằng mã lớp, tên lớp, địa điểm hoặc học viên khác.' : 'Tạo mã lớp đầu tiên rồi enrol các tài khoản học viên.'}
          action={!search ? { label: createLabel, onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Mã lớp</th>
                    <th className="px-4 py-3.5">Tên lớp</th>
                    <th className="px-4 py-3.5">Học viên đã enrol</th>
                    <th className="px-4 py-3.5">Gói môn</th>
                    <th className="px-4 py-3.5">Trạng thái</th>
                    <th className="px-5 py-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((groupClass) => (
                    <tr key={groupClass.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-brand-50 px-2.5 py-1 font-mono text-xs font-bold text-brand-800">{groupClass.code}</span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-bold text-slate-900">{groupClass.name}</p>
                        {!isOffline && groupClass.classroomURL && (
                          <a href={groupClass.classroomURL} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline">
                            Mở phòng học <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {isOffline && (
                          <p className="mt-1 inline-flex max-w-[260px] items-start gap-1 text-xs font-semibold text-amber-700">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="line-clamp-2">{groupClass.offlineLocation || 'Chưa cập nhật địa điểm'}</span>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-bold text-slate-800">{groupClass.enrolledStudentIds?.length || 0} học viên</p>
                        <p className="mt-0.5 max-w-[260px] truncate text-xs text-slate-500">
                          {(groupClass.enrolledStudents || []).map((member) => member.studentName).join(', ') || 'Chưa enrol tài khoản nào'}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-700">{groupClass.subjects?.length || 0} gói</p>
                        <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">
                          {(groupClass.subjects || []).map((subject) => subject.subjectName).join(', ') || 'Chưa thêm môn học'}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-lg px-2 py-1 text-xs font-bold ${groupClass.status === 'active' ? 'bg-emerald-50 text-emerald-700' : groupClass.status === 'reserved' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {groupClass.status === 'active' ? 'Đang học' : groupClass.status === 'reserved' ? 'Tạm ngưng' : 'Chưa hoạt động'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setManagingMembers(groupClass)}>
                            <UserRoundPlus className="h-3.5 w-3.5" />Enrol
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/students/${groupClass.id}`)} title="Quản lý gói môn và quỹ lớp">
                            <BookOpen className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingClass(groupClass)} title="Sửa lớp nhóm">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-3 md:hidden">
            {filtered.map((groupClass) => (
              <Card key={groupClass.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="rounded-lg bg-brand-50 px-2 py-1 font-mono text-xs font-bold text-brand-800">{groupClass.code}</span>
                    <h2 className="mt-2 truncate font-bold text-slate-900">{groupClass.name}</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{groupClass.enrolledStudentIds?.length || 0} học viên - {groupClass.subjects?.length || 0} gói môn</p>
                    {isOffline && <p className="mt-2 line-clamp-2 text-xs text-amber-700">{groupClass.offlineLocation || 'Chưa cập nhật địa điểm'}</p>}
                  </div>
                  <UsersRound className="h-6 w-6 shrink-0 text-brand-600" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setManagingMembers(groupClass)}><UserRoundPlus className="h-4 w-4" />Enrol</Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/admin/students/${groupClass.id}`)}><BookOpen className="h-4 w-4" />Quỹ & môn</Button>
                  <Button size="sm" variant="ghost" className="col-span-2" onClick={() => setEditingClass(groupClass)}><Pencil className="h-4 w-4" />Sửa thông tin lớp</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {showCreate && <GroupClassFormModal defaultDeliveryMode={deliveryMode} onClose={() => setShowCreate(false)} />}
      {editingClass && <GroupClassFormModal groupClass={editingClass} defaultDeliveryMode={deliveryMode} onClose={() => setEditingClass(null)} />}
      {managingMembers && <GroupClassMembersModal groupClass={managingMembers} onClose={() => setManagingMembers(null)} />}
    </div>
  )
}
