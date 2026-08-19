import { useEffect, useMemo, useState } from 'react'
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { Search, UsersRound } from 'lucide-react'
import { db, generateUniqueCode } from '@/lib/firebase'
import { bookingConflictMessage, checkBookingCandidates } from '@/lib/bookingConflicts'
import { GROUP_CLASS_MAX_MEMBERS, isGroupClass } from '@/lib/groupClasses'
import type { BookingRequest, GroupClassMember, Student } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/stores/toastStore'

interface GroupClassFormModalProps {
  groupClass?: Student | null
  onClose: () => void
}

export function GroupClassFormModal({ groupClass, onClose }: GroupClassFormModalProps) {
  const [name, setName] = useState(groupClass?.name || '')
  const [classroomURL, setClassroomURL] = useState(groupClass?.classroomURL || '')
  const [code, setCode] = useState(groupClass?.code || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (groupClass || code) return
    generateUniqueCode('groupClass')
      .then(setCode)
      .catch((error) => {
        console.error('Generate group class code failed:', error)
        toast.error('Không thể sinh mã lớp nhóm')
      })
  }, [code, groupClass])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (cleanName.length < 2) {
      toast.error('Tên lớp phải có ít nhất 2 ký tự')
      return
    }
    if (!code) {
      toast.error('Mã lớp chưa sẵn sàng, vui lòng thử lại')
      return
    }

    setSaving(true)
    try {
      if (groupClass) {
        await updateDoc(doc(db, 'students', groupClass.id), {
          name: cleanName,
          classroomURL: classroomURL.trim(),
          updatedAt: serverTimestamp(),
        })
        toast.success('Đã cập nhật lớp nhóm')
      } else {
        const classRef = doc(collection(db, 'students'))
        await setDoc(classRef, {
          recordType: 'group_class',
          code,
          name: cleanName,
          parentPhone: '',
          email: '',
          subjectId: '',
          subjectName: '',
          branchId: '',
          branchName: '',
          learningScheduleType: 'fixed',
          totalSessions: 0,
          usedSessions: 0,
          remainingSessions: 0,
          minutesPerSession: 50,
          totalMinutes: 0,
          usedMinutes: 0,
          remainingMinutes: 0,
          reservedMinutes: 0,
          heldMinutes: 0,
          status: 'inactive',
          subjects: [],
          classroomURL: classroomURL.trim(),
          enrolledStudentIds: [],
          enrolledStudents: [],
          bookingScheduleRevision: 0,
          memberRevision: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        toast.success(`Đã tạo lớp nhóm ${code}`)
      }
      onClose()
    } catch (error) {
      console.error('Save group class failed:', error)
      toast.error('Không thể lưu lớp nhóm. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={groupClass ? 'Chỉnh sửa lớp nhóm' : 'Tạo lớp nhóm'}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button form="group-class-form" type="submit" loading={saving}>
            {groupClass ? 'Lưu thay đổi' : 'Tạo lớp'}
          </Button>
        </div>
      )}
    >
      <form id="group-class-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-6 text-slate-700">
          Mã lớp dùng để xếp lịch giống mã học viên 1 kèm 1. Sau khi tạo, thêm gói môn và enrol các tài khoản học viên vào lớp.
        </div>
        <Input label="Mã lớp nhóm" value={code} readOnly placeholder="Đang tạo mã lớp..." />
        <Input
          label="Tên lớp *"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ví dụ: Kids A - Tối thứ 3"
          autoFocus
        />
        <Input
          label="Link phòng học"
          value={classroomURL}
          onChange={(event) => setClassroomURL(event.target.value)}
          placeholder="https://zoom.us/j/... hoặc link Meet, Teams"
        />
      </form>
    </Modal>
  )
}

interface GroupClassMembersModalProps {
  groupClass: Student
  onClose: () => void
}

export function GroupClassMembersModal({ groupClass, onClose }: GroupClassMembersModalProps) {
  const initialIds = useMemo(() => new Set(groupClass.enrolledStudentIds || []), [groupClass.enrolledStudentIds])
  const [students, setStudents] = useState<Student[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialIds)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      const list = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as Student))
        .filter((student) => !isGroupClass(student))
        .sort((left, right) => left.name.localeCompare(right.name, 'vi'))
      setStudents(list)
      setLoading(false)
    }, (error) => {
      console.error('Load students for group enrolment failed:', error)
      setLoading(false)
      toast.error('Không tải được danh sách học viên')
    })
    return unsubscribe
  }, [])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi')
    if (!keyword) return students
    return students.filter((student) => `${student.code} ${student.name} ${student.email || ''}`.toLocaleLowerCase('vi').includes(keyword))
  }, [search, students])

  const toggleStudent = (studentId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const handleSave = async () => {
    if (selectedIds.size > GROUP_CLASS_MAX_MEMBERS) {
      toast.error(`Mỗi lớp nhóm hỗ trợ tối đa ${GROUP_CLASS_MAX_MEMBERS} học viên`)
      return
    }

    const nextIds = Array.from(selectedIds).sort()
    const previousIds = Array.from(initialIds).sort()
    const addedIds = nextIds.filter((id) => !initialIds.has(id))
    const removedIds = previousIds.filter((id) => !selectedIds.has(id))
    const changedIds = [...addedIds, ...removedIds]
    const studentById = new Map(students.map((student) => [student.id, student]))
    const memberSnapshots: GroupClassMember[] = nextIds.flatMap((studentId) => {
      const student = studentById.get(studentId)
      return student ? [{ studentId, studentCode: student.code, studentName: student.name }] : []
    })

    if (memberSnapshots.length !== nextIds.length) {
      toast.error('Có học viên vừa bị thay đổi hoặc không còn tồn tại. Vui lòng tải lại.')
      return
    }

    setSaving(true)
    try {
      const freshClassSnapshot = await getDocFromServer(doc(db, 'students', groupClass.id))
      if (!freshClassSnapshot.exists()) throw new Error('CLASS_NOT_FOUND')
      const expectedBookingScheduleRevision = Number(freshClassSnapshot.data().bookingScheduleRevision || 0)
      const classBookingsSnapshot = await getDocs(query(
        collection(db, 'bookingRequests'),
        where('studentId', '==', groupClass.id),
      ))
      const activeClassBookings = classBookingsSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as BookingRequest))
        .filter((booking) => ['pending', 'confirmed'].includes(booking.status) && !booking.lessonId)

      if (1 + changedIds.length + activeClassBookings.length > 450) {
        throw new Error('CLASS_UPDATE_TOO_LARGE')
      }

      if (addedIds.length > 0 && activeClassBookings.length > 0) {
        const ignoredBookingIds = activeClassBookings.map((booking) => booking.id)
        const candidates = addedIds.flatMap((studentId) => activeClassBookings.map((booking) => ({
          teacherId: '',
          studentId,
          studentName: studentById.get(studentId)?.name || '',
          studentCode: studentById.get(studentId)?.code || '',
          requestedDate: booking.requestedDate,
          requestedStart: booking.requestedStart,
          requestedEnd: booking.requestedEnd,
          requestedMinutes: booking.requestedMinutes,
        })))
        const conflicts = await checkBookingCandidates(candidates, { ignoreBookingIds: ignoredBookingIds })
        if (conflicts.length > 0) {
          const conflictError = new Error('MEMBER_SCHEDULE_CONFLICT') as Error & { detail?: string }
          conflictError.detail = bookingConflictMessage(conflicts[0])
          throw conflictError
        }
      }

      await runTransaction(db, async (transaction) => {
        const classRef = doc(db, 'students', groupClass.id)
        const changedRefs = changedIds.map((studentId) => doc(db, 'students', studentId))
        const bookingRefs = activeClassBookings.map((booking) => doc(db, 'bookingRequests', booking.id))
        const [classSnapshot, ...otherSnapshots] = await Promise.all([
          transaction.get(classRef),
          ...changedRefs.map((studentRef) => transaction.get(studentRef)),
          ...bookingRefs.map((bookingRef) => transaction.get(bookingRef)),
        ])
        if (!classSnapshot.exists()) throw new Error('CLASS_NOT_FOUND')
        const currentClass = { id: classSnapshot.id, ...classSnapshot.data() } as Student
        const currentIds = [...(currentClass.enrolledStudentIds || [])].sort()
        if (currentIds.join('|') !== previousIds.join('|')) throw new Error('CLASS_MEMBERS_CHANGED')
        if (Number(classSnapshot.data().bookingScheduleRevision || 0) !== expectedBookingScheduleRevision) {
          throw new Error('CLASS_SCHEDULE_CHANGED')
        }

        transaction.update(classRef, {
          enrolledStudentIds: nextIds,
          enrolledStudents: memberSnapshots,
          memberRevision: Number(classSnapshot.data().memberRevision || 0) + 1,
          bookingScheduleRevision: Number(classSnapshot.data().bookingScheduleRevision || 0) + 1,
          updatedAt: serverTimestamp(),
        })

        changedRefs.forEach((studentRef, index) => {
          const studentSnapshot = otherSnapshots[index]
          if (!studentSnapshot?.exists()) throw new Error('STUDENT_NOT_FOUND')
          transaction.update(studentRef, {
            groupClassIds: addedIds.includes(studentRef.id) ? arrayUnion(groupClass.id) : arrayRemove(groupClass.id),
            bookingScheduleRevision: Number(studentSnapshot.data().bookingScheduleRevision || 0) + 1,
            updatedAt: serverTimestamp(),
          })
        })

        const bookingSnapshotOffset = changedRefs.length
        bookingRefs.forEach((bookingRef, index) => {
          const bookingSnapshot = otherSnapshots[bookingSnapshotOffset + index]
          if (!bookingSnapshot?.exists()) return
          const booking = bookingSnapshot.data() as BookingRequest
          if (!['pending', 'confirmed'].includes(booking.status) || booking.lessonId) return
          transaction.update(bookingRef, {
            groupClassMemberIds: nextIds,
            updatedAt: serverTimestamp(),
          })
        })
      })

      toast.success(`Đã cập nhật ${nextIds.length} học viên trong lớp ${groupClass.code}`)
      onClose()
    } catch (error) {
      console.error('Save group class members failed:', error)
      const message = error instanceof Error ? error.message : ''
      if (message === 'CLASS_MEMBERS_CHANGED') toast.warning('Danh sách lớp vừa được người khác cập nhật. Vui lòng đóng và mở lại để tránh ghi đè.')
      else if (message === 'CLASS_SCHEDULE_CHANGED') toast.warning('Lịch lớp vừa được cập nhật. Vui lòng mở lại danh sách enrol để đồng bộ lịch mới nhất.')
      else if (message === 'MEMBER_SCHEDULE_CONFLICT') toast.error((error as Error & { detail?: string }).detail || 'Học viên mới đang có lịch trùng với lớp nhóm.')
      else if (message === 'CLASS_UPDATE_TOO_LARGE') toast.error('Lớp có quá nhiều lịch đang hoạt động để cập nhật an toàn trong một lần. Vui lòng liên hệ kỹ thuật.')
      else toast.error('Không thể cập nhật học viên trong lớp. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Enrol học viên - ${groupClass.code}`}
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">Đã chọn {selectedIds.size}/{GROUP_CLASS_MAX_MEMBERS} học viên</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Hủy</Button>
            <Button loading={saving} onClick={handleSave}>Lưu danh sách</Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
          Học viên được enrol sẽ thấy lịch và nhận xét của lớp nhóm trong tài khoản của mình. Hệ thống chặn enrol nếu lịch hiện tại bị trùng.
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo mã, tên hoặc email học viên..."
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-2" aria-label="Đang tải học viên">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center">
              <UsersRound className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-700">Không tìm thấy học viên phù hợp</p>
            </div>
          ) : filtered.map((student) => {
            const checked = selectedIds.has(student.id)
            return (
              <label key={student.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition active:scale-[0.995] ${checked ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-200'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleStudent(student.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{student.name}</span>
                  <span className="block truncate font-mono text-xs text-slate-500">{student.code}{student.email ? ` - ${student.email}` : ''}</span>
                </span>
                <span className={`text-xs font-bold ${student.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {student.status === 'active' ? 'Đang học' : 'Chưa hoạt động'}
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
