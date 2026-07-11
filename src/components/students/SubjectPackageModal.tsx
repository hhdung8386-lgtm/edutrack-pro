import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { doc, updateDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Student, Subject, StudentSubject } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { Check, ChevronDown, Search } from 'lucide-react'

const schema = z.object({
  subjectId: z.string().min(1, 'Chọn môn học'),
  totalMinutes: z.coerce.number().min(1, 'Tối thiểu 1 phút'),
  curriculumLink: z.string().optional(),
  supplementaryCurriculumLink: z.string().optional(),
  timetableNote: z.string().optional(),
  studentRequests: z.array(z.string()).default([]),
  focusSkills: z.array(z.string()).default([]),
})

type FormData = z.infer<typeof schema>

const STUDENT_REQUESTS_OPTIONS = [
  'Nói chậm hơn, to, rõ.',
  'Sử dụng 100% tiếng Anh (chỉ giải thích bằng tiếng Việt khi cần)',
  'Sửa phát âm, ngữ pháp khi nói.',
  'Cho học viên nói nhiều, chủ động khơi gợi.',
  'Giao nhiều bài tập về nhà.',
  'Không giao bài tập về nhà.',
  'Ôn lại bài cũ nhiều hơn.'
]

const FOCUS_SKILLS_OPTIONS = [
  'Nghe',
  'Nói',
  'Đọc',
  'Viết',
  'Ngữ Pháp'
]

interface Props {
  student: Student
  editingSubjectId?: string // If present, edit mode; otherwise, add mode
  onClose: () => void
}

export function SubjectPackageModal({ student, editingSubjectId, onClose }: Props) {
  const [subjectsList, setSubjectsList] = useState<Subject[]>([])
  const [loading, setLoading] = useState(false)
  const [subjectSearch, setSubjectSearch] = useState('')
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false)
  const [selectedRequests, setSelectedRequests] = useState<string[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const soccerRequests = selectedRequests // Alias for cleanliness
  const isEdit = !!editingSubjectId

  // Extract current subjects already set up
  const currentSubjects = useMemo(() => student.subjects || [], [student.subjects])

  // Find the package being edited
  const editingPkg = isEdit
    ? currentSubjects.find(s => s.subjectId === editingSubjectId)
    : null

  useEffect(() => {
    if (editingPkg) {
      setSelectedRequests(editingPkg.studentRequests || [])
      setSelectedSkills(editingPkg.focusSkills || [])
    }
  }, [editingPkg])

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: editingPkg
      ? {
          subjectId: editingPkg.subjectId,
          totalMinutes: editingPkg.totalMinutes,
          curriculumLink: editingPkg.curriculumLink || '',
          supplementaryCurriculumLink: editingPkg.supplementaryCurriculumLink || '',
          timetableNote: editingPkg.timetableNote || '',
          studentRequests: editingPkg.studentRequests || [],
          focusSkills: editingPkg.focusSkills || [],
        }
      : {
          subjectId: '',
          totalMinutes: 500,
          curriculumLink: '',
          supplementaryCurriculumLink: '',
          timetableNote: '',
          studentRequests: [],
          focusSkills: [],
        },
  })

  const watchedTotalMinutes = watch('totalMinutes') || 0
  const watchedMinutesPerSession = 25
  const watchedSubjectId = watch('subjectId')
  const calculatedSessions = Math.round((watchedTotalMinutes / watchedMinutesPerSession) * 100) / 100
  const selectedSubject = subjectsList.find((subject) => subject.id === watchedSubjectId)
  const isTransferringSubject = Boolean(isEdit && editingSubjectId && watchedSubjectId !== editingSubjectId)
  const transferableMinutes = editingPkg?.remainingMinutes || 0
  const transferredSessions = Math.round((transferableMinutes / watchedMinutesPerSession) * 100) / 100
  const filteredSubjects = subjectsList.filter((subject) =>
    subject.name.toLocaleLowerCase('vi').includes(subjectSearch.trim().toLocaleLowerCase('vi')),
  )

  const subjectIdsKey = student.subjects?.map(s => s.subjectId).join(',') || ''

  useEffect(() => {
    // Fetch all active subjects
    getDocs(query(collection(db, 'subjects'), where('status', '==', 'active')))
      .then((snap) => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Subject))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }))
        const existingIds = currentSubjects.map(cs => cs.subjectId)
        setSubjectsList(list.filter(s => s.id === editingSubjectId || !existingIds.includes(s.id)))
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải danh sách môn học')
      })
  }, [isEdit, editingSubjectId, student.id, subjectIdsKey])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const minutesPerSession = 25
      let updatedSubjects: StudentSubject[] = [...currentSubjects]
      const today = new Date()
      const dateString = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

      const adjustBatches = (
        currentBatches: any[] | undefined,
        newTotal: number,
        originalTotal: number
      ) => {
        const rawBatches = (currentBatches && currentBatches.length > 0)
          ? currentBatches
          : [{ id: '1', createdAt: dateString, totalSessions: originalTotal }]

        const delta = newTotal - originalTotal
        if (delta === 0) return rawBatches

        if (delta > 0) {
          return [
            ...rawBatches,
            { id: String(rawBatches.length + 1), createdAt: dateString, totalSessions: delta }
          ]
        } else {
          let toRemove = -delta
          const result = []
          for (let i = rawBatches.length - 1; i >= 0; i--) {
            const batch = rawBatches[i]
            if (toRemove > 0) {
              if (batch.totalSessions > toRemove) {
                result.unshift({ ...batch, totalSessions: batch.totalSessions - toRemove })
                toRemove = 0
              } else {
                toRemove -= batch.totalSessions
              }
            } else {
              result.unshift(batch)
            }
          }
          if (result.length === 0) {
            return [{ id: '1', createdAt: dateString, totalSessions: newTotal }]
          }
          return result.map((b, idx) => ({ ...b, id: String(idx + 1) }))
        }
      }

      if (isEdit && editingPkg) {
        // Edit mode
        const index = updatedSubjects.findIndex(s => s.subjectId === editingSubjectId)
        if (index !== -1) {
          const prevPkg = updatedSubjects[index]
          const selectedSubjectObj = subjectsList.find(s => s.id === data.subjectId)
          const isSubjectChanged = data.subjectId !== editingSubjectId

          if (isSubjectChanged) {
            if (!selectedSubjectObj) throw new Error('Môn học mới không hợp lệ')
            if (updatedSubjects.some((pkg, pkgIndex) => pkgIndex !== index && pkg.subjectId === data.subjectId)) {
              throw new Error('Học viên đã có gói môn học này')
            }

            if (prevPkg.usedMinutes > 0) {
              if (prevPkg.remainingMinutes <= 0) {
                throw new Error('Gói môn cũ không còn phút để chuyển sang môn mới')
              }

              const historicalSessions = prevPkg.usedSessions || Math.round(
                (prevPkg.usedMinutes / (prevPkg.minutesPerSession || 50)) * 100,
              ) / 100
              const newSessions = Math.round((prevPkg.remainingMinutes / minutesPerSession) * 100) / 100

              updatedSubjects[index] = {
                ...prevPkg,
                totalSessions: historicalSessions,
                remainingSessions: 0,
                totalMinutes: prevPkg.usedMinutes,
                remainingMinutes: 0,
                batches: adjustBatches(prevPkg.batches, historicalSessions, prevPkg.totalSessions)
              }
              updatedSubjects.push({
                subjectId: selectedSubjectObj.id,
                subjectName: selectedSubjectObj.name,
                totalSessions: newSessions,
                usedSessions: 0,
                remainingSessions: newSessions,
                minutesPerSession: minutesPerSession,
                totalMinutes: prevPkg.remainingMinutes,
                usedMinutes: 0,
                remainingMinutes: prevPkg.remainingMinutes,
                pricePerMinute: selectedSubjectObj.pricePerMinute || 0,
                pricePerMinuteVN: selectedSubjectObj.pricePerMinuteVN || selectedSubjectObj.pricePerMinute || 0,
                pricePerMinutePH: selectedSubjectObj.pricePerMinutePH || selectedSubjectObj.pricePerMinute || 0,
                pricePerMinuteNative: selectedSubjectObj.pricePerMinuteNative || selectedSubjectObj.pricePerMinute || 0,
                otherCountriesPrices: selectedSubjectObj.otherCountriesPrices || {},
                ...(selectedSubjectObj.countryPrices ? { countryPrices: selectedSubjectObj.countryPrices } : {}),
                currency: selectedSubjectObj.currency || 'VND',
                batches: [{
                  id: '1',
                  createdAt: dateString,
                  totalSessions: newSessions
                }],
                curriculumLink: data.curriculumLink || '',
                supplementaryCurriculumLink: data.supplementaryCurriculumLink || '',
                timetableNote: data.timetableNote || '',
                studentRequests: selectedRequests,
                focusSkills: selectedSkills
              })
            } else {
              const newTotalMinutes = data.totalMinutes
              const calculatedTotalSessions = Math.round(newTotalMinutes / minutesPerSession)
              updatedSubjects[index] = {
                ...prevPkg,
                subjectId: selectedSubjectObj.id,
                subjectName: selectedSubjectObj.name,
                pricePerMinute: selectedSubjectObj.pricePerMinute || 0,
                pricePerMinuteVN: selectedSubjectObj.pricePerMinuteVN || selectedSubjectObj.pricePerMinute || 0,
                pricePerMinutePH: selectedSubjectObj.pricePerMinutePH || selectedSubjectObj.pricePerMinute || 0,
                pricePerMinuteNative: selectedSubjectObj.pricePerMinuteNative || selectedSubjectObj.pricePerMinute || 0,
                otherCountriesPrices: selectedSubjectObj.otherCountriesPrices || {},
                ...(selectedSubjectObj.countryPrices ? { countryPrices: selectedSubjectObj.countryPrices } : {}),
                currency: selectedSubjectObj.currency || 'VND',
                totalSessions: calculatedTotalSessions,
                remainingSessions: calculatedTotalSessions,
                minutesPerSession: minutesPerSession,
                totalMinutes: newTotalMinutes,
                remainingMinutes: newTotalMinutes,
                batches: [{
                   id: '1',
                   createdAt: dateString,
                   totalSessions: calculatedTotalSessions
                 }],
                curriculumLink: data.curriculumLink || '',
                supplementaryCurriculumLink: data.supplementaryCurriculumLink || '',
                timetableNote: data.timetableNote || '',
                studentRequests: selectedRequests,
                focusSkills: selectedSkills
              }
            }

            // Sync future confirmed/pending booking requests to the new subject!
            if (editingSubjectId && data.subjectId !== editingSubjectId && selectedSubjectObj) {
              try {
                const bookingsQuery = query(
                  collection(db, 'bookingRequests'),
                  where('studentId', '==', student.id),
                  where('subjectId', '==', editingSubjectId),
                  where('status', 'in', ['confirmed', 'pending'])
                )
                const bookingsSnap = await getDocs(bookingsQuery)
                const batchPromises = bookingsSnap.docs
                  .filter(doc => !doc.data().lessonId)
                  .map(doc => {
                    return updateDoc(doc.ref, {
                      subjectId: selectedSubjectObj.id,
                      subjectName: selectedSubjectObj.name,
                      updatedAt: serverTimestamp(),
                    })
                  })
                await Promise.all(batchPromises)
              } catch (syncErr) {
                console.error('Failed to sync future bookings to new subject:', syncErr)
              }
            }
          } else {
            const calculatedTotalSessions = Math.round(data.totalMinutes / minutesPerSession)
            const delta = calculatedTotalSessions - prevPkg.totalSessions
            const newRemainingSessions = prevPkg.remainingSessions + delta
            const newTotalMinutes = data.totalMinutes
            const newRemainingMinutes = Math.max(0, newTotalMinutes - prevPkg.usedMinutes)

            updatedSubjects[index] = {
              ...prevPkg,
              totalSessions: calculatedTotalSessions,
              minutesPerSession: minutesPerSession,
              remainingSessions: newRemainingSessions,
              totalMinutes: newTotalMinutes,
              remainingMinutes: newRemainingMinutes,
              batches: adjustBatches(prevPkg.batches, calculatedTotalSessions, prevPkg.totalSessions),
              curriculumLink: data.curriculumLink || '',
              supplementaryCurriculumLink: data.supplementaryCurriculumLink || '',
              timetableNote: data.timetableNote || '',
              studentRequests: selectedRequests,
              focusSkills: selectedSkills
            }
          }
        }
      } else {
        // Add mode
        const selectedSubjectObj = subjectsList.find(s => s.id === data.subjectId)
        if (!selectedSubjectObj) {
          toast.error('Môn học không hợp lệ')
          return
        }

        const calculatedTotalSessions = Math.round(data.totalMinutes / minutesPerSession)
        const newPkg: StudentSubject = {
          subjectId: data.subjectId,
          subjectName: selectedSubjectObj.name,
          totalSessions: calculatedTotalSessions,
          usedSessions: 0,
          remainingSessions: calculatedTotalSessions,
          minutesPerSession: minutesPerSession,
          totalMinutes: data.totalMinutes,
          usedMinutes: 0,
          remainingMinutes: data.totalMinutes,
          pricePerMinute: selectedSubjectObj.pricePerMinute || 0,
          pricePerMinuteVN: selectedSubjectObj.pricePerMinuteVN || selectedSubjectObj.pricePerMinute || 0,
          pricePerMinutePH: selectedSubjectObj.pricePerMinutePH || selectedSubjectObj.pricePerMinute || 0,
          pricePerMinuteNative: selectedSubjectObj.pricePerMinuteNative || selectedSubjectObj.pricePerMinute || 0,
          otherCountriesPrices: selectedSubjectObj.otherCountriesPrices || {},
          ...(selectedSubjectObj.countryPrices ? { countryPrices: selectedSubjectObj.countryPrices } : {}),
          currency: selectedSubjectObj.currency || 'VND',
          batches: [{
            id: '1',
            createdAt: dateString,
            totalSessions: calculatedTotalSessions
          }],
          curriculumLink: data.curriculumLink || '',
          supplementaryCurriculumLink: data.supplementaryCurriculumLink || '',
          timetableNote: data.timetableNote || '',
          studentRequests: selectedRequests,
          focusSkills: selectedSkills
        }

        updatedSubjects.push(newPkg)
      }



      // Recalculate aggregates
      const aggTotalSessions = updatedSubjects.reduce((sum, s) => sum + s.totalSessions, 0)
      const aggUsedSessions = updatedSubjects.reduce((sum, s) => sum + s.usedSessions, 0)
      const aggRemainingSessions = updatedSubjects.reduce((sum, s) => sum + s.remainingSessions, 0)
      const aggTotalMinutes = updatedSubjects.reduce((sum, s) => sum + s.totalMinutes, 0)
      const aggUsedMinutes = updatedSubjects.reduce((sum, s) => sum + s.usedMinutes, 0)
      const aggRemainingMinutes = updatedSubjects.reduce((sum, s) => sum + s.remainingMinutes, 0)

      // Legacy fields point to a package that can still fund upcoming lessons.
      const primarySubject = updatedSubjects.find((pkg) => pkg.remainingMinutes > 0) || updatedSubjects[0] || null

      await updateDoc(doc(db, 'students', student.id), {
        subjects: updatedSubjects,
        totalSessions: aggTotalSessions,
        usedSessions: aggUsedSessions,
        remainingSessions: aggRemainingSessions,
        totalMinutes: aggTotalMinutes,
        usedMinutes: aggUsedMinutes,
        remainingMinutes: aggRemainingMinutes,
        // Legacy fields mapping to primary subject
        subjectId: primarySubject ? primarySubject.subjectId : '',
        subjectName: primarySubject ? primarySubject.subjectName : '',
        minutesPerSession: primarySubject ? primarySubject.minutesPerSession : 25,
        status: aggRemainingMinutes <= 0 ? 'expired' : 'active',
        updatedAt: serverTimestamp(),
      })

      toast.success(isTransferringSubject ? 'Đã chuyển số phút còn lại sang môn mới' : isEdit ? 'Đã cập nhật gói môn học' : 'Đã thêm môn học mới')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Lỗi khi lưu thông tin môn học')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa gói môn học' : 'Thêm môn học mới'}
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Hủy</Button>
          <Button form="subject-pkg-form" type="submit" loading={loading}>
            {isEdit ? 'Lưu thay đổi' : 'Thêm môn học'}
          </Button>
        </div>
      }
    >
      <form id="subject-pkg-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Môn học *</label>
          <div className="relative">
            <input type="hidden" {...register('subjectId')} />
            <button
              type="button"
              onClick={() => setSubjectMenuOpen((open) => !open)}
              className="flex min-h-[46px] w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 text-left text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-indigo-500"
              aria-expanded={subjectMenuOpen}
            >
              <span className={selectedSubject ? 'font-medium' : 'text-slate-500'}>
                {selectedSubject
                  ? selectedSubject.currency === 'USD'
                    ? `${selectedSubject.name} ($${selectedSubject.pricePerMinute}/phút)`
                    : `${selectedSubject.name} (${selectedSubject.pricePerMinute?.toLocaleString('vi-VN')}đ/phút)`
                  : editingPkg?.subjectName || '-- Chọn môn học --'}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${subjectMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {subjectMenuOpen && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 p-2">
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      autoFocus
                      value={subjectSearch}
                      onChange={(event) => setSubjectSearch(event.target.value)}
                      placeholder="Tìm tên môn học..."
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {filteredSubjects.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">Không tìm thấy môn học.</p>
                  ) : filteredSubjects.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => {
                        setValue('subjectId', subject.id, { shouldValidate: true })
                        setSubjectMenuOpen(false)
                        setSubjectSearch('')
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
                    >
                      <span>
                        <span className="block font-medium text-slate-800">{subject.name}</span>
                        <span className="text-xs text-slate-500">
                          {subject.currency === 'USD'
                            ? `$${subject.pricePerMinute}/phút`
                            : `${subject.pricePerMinute?.toLocaleString('vi-VN')}đ/phút`}
                        </span>
                      </span>
                      {watchedSubjectId === subject.id && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {errors.subjectId && <p className="mt-1.5 text-xs text-rose-400">{errors.subjectId.message}</p>}
          {isTransferringSubject && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {editingPkg?.usedMinutes
                ? `Lịch sử đã học vẫn thuộc môn cũ. Hệ thống chỉ chuyển ${transferableMinutes.toLocaleString('vi-VN')} phút còn lại sang môn mới.`
                : 'Gói chưa phát sinh buổi học nên hệ thống sẽ đổi trực tiếp sang môn mới.'}
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-4 bg-slate-50/50">
          <label className="block text-sm font-bold text-slate-700">Kỹ năng trọng tâm (Tick chọn)</label>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {FOCUS_SKILLS_OPTIONS.map((skill) => {
              const checked = selectedSkills.includes(skill)
              return (
                <label key={skill} className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer hover:text-slate-900 select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSkills((prev) => [...prev, skill])
                      } else {
                        setSelectedSkills((prev) => prev.filter((s) => s !== skill))
                      }
                    }}
                    className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{skill}</span>
                </label>
              )
            })}
          </div>
        </div>

        {isTransferringSubject && editingPkg && editingPkg.usedMinutes > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <p className="text-xs font-medium text-slate-500">Quỹ chuyển sang môn mới</p>
            <p className="mt-1 font-semibold text-slate-800">
              {transferableMinutes.toLocaleString('vi-VN')} phút · tương đương {transferredSessions.toLocaleString('vi-VN')} buổi
            </p>
          </div>
        ) : (
          <Input
            label="Tổng số phút *"
            type="number"
            placeholder="500"
            error={errors.totalMinutes?.message}
            {...register('totalMinutes')}
          />
        )}

        <Input
          label="Link giáo trình"
          placeholder="Nhập link giáo trình (không bắt buộc)"
          error={errors.curriculumLink?.message}
          {...register('curriculumLink')}
        />

        <Input
          label="Link giáo trình bổ trợ"
          placeholder="Nhập link giáo trình bổ trợ (không bắt buộc)"
          error={errors.supplementaryCurriculumLink?.message}
          {...register('supplementaryCurriculumLink')}
        />

        {/* Checkbox list of student requests */}
        <div className="space-y-2 rounded-xl border border-slate-200 p-4 bg-slate-50/50">
          <label className="block text-sm font-bold text-slate-700">Yêu cầu từ học viên (Tick chọn)</label>
          <div className="space-y-2">
            {STUDENT_REQUESTS_OPTIONS.map((reqOption) => {
              const checked = selectedRequests.includes(reqOption)
              return (
                <label key={reqOption} className="flex items-start gap-2.5 text-sm text-slate-600 font-medium cursor-pointer hover:text-slate-900 select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRequests((prev) => [...prev, reqOption])
                      } else {
                        setSelectedRequests((prev) => prev.filter((r) => r !== reqOption))
                      }
                    }}
                    className="mt-1 rounded border-slate-350 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{reqOption}</span>
                </label>
              )
            })}
          </div>
        </div>

        <Input
          label="Note chung trên timetable"
          placeholder="Nhập ghi chú chung hiển thị trên timetable (không bắt buộc)"
          error={errors.timetableNote?.message}
          {...register('timetableNote')}
        />
      </form>
    </Modal>
  )
}
